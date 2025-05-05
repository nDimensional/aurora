import logger from "weald";

import avatarShader from "../../shaders/avatar.wgsl?raw";

import { Cache } from "../Cache.js";
import { AVATAR_DIMENSIONS, COL_COUNT, ROW_COUNT, TEXTURE_DIMENSIONS, assert } from "../utils.js";
import { Store, Area } from "../Store.js";
import { SquareRenderer } from "./SquareRenderer.js";

const log = logger("aurora:render:avatar");

export class AvatarRenderer extends SquareRenderer {
	avatarXBuffer: GPUBuffer;
	avatarYBuffer: GPUBuffer;

	tileBuffer: GPUBuffer;
	texture: GPUTexture;
	sampler: GPUSampler;

	avatarPipeline: GPURenderPipeline;
	avatarBindGroup: GPUBindGroup;
	avatarCount: number = 0;

	constructor(
		readonly device: GPUDevice,
		readonly presentationFormat: GPUTextureFormat,
		readonly paramBindGroupLayout: GPUBindGroupLayout,
		readonly paramBindGroup: GPUBindGroup,
		readonly store: Store,
		readonly cache: Cache,
	) {
		super(device);

		// initialize avatar buffers
		const avatarBufferSize = ROW_COUNT * COL_COUNT * 4;
		this.avatarXBuffer = device.createBuffer({
			label: "avatarXBuffer",
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			size: avatarBufferSize,
		});

		this.avatarYBuffer = device.createBuffer({
			label: "avatarYBuffer",
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			size: avatarBufferSize,
		});

		// initialize tile buffer
		const tileBufferSize = ROW_COUNT * COL_COUNT * 4;
		this.tileBuffer = device.createBuffer({
			label: "tileBuffer",
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			size: tileBufferSize,
		});

		this.texture = device.createTexture({
			label: "texture",
			format: "rgba8unorm",
			size: [TEXTURE_DIMENSIONS.width, TEXTURE_DIMENSIONS.height],
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
		});

		this.sampler = device.createSampler({});

		const avatarBindGroupLayout = device.createBindGroupLayout({
			label: "avatarBindGroupLayout",
			entries: [
				{ binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
				{ binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
				{ binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
				{ binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
				{ binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
			],
		});

		this.avatarBindGroup = device.createBindGroup({
			label: "avatarBindGroup",
			layout: avatarBindGroupLayout,
			entries: [
				{ binding: 0, resource: this.sampler },
				{ binding: 1, resource: this.texture.createView() },
				{ binding: 2, resource: { buffer: this.avatarXBuffer } },
				{ binding: 3, resource: { buffer: this.avatarYBuffer } },
				{ binding: 4, resource: { buffer: this.tileBuffer } },
			],
		});

		const avatarShaderModule = device.createShaderModule({ label: "avatarShaderModule", code: avatarShader });

		this.avatarPipeline = device.createRenderPipeline({
			label: "avatarPipeline",
			layout: device.createPipelineLayout({
				label: "avatarPipelineLayout",
				bindGroupLayouts: [paramBindGroupLayout, avatarBindGroupLayout],
			}),
			vertex: {
				module: avatarShaderModule,
				entryPoint: "vert_node",
				buffers: [
					{
						arrayStride: 2 * 4,
						stepMode: "vertex",
						attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
					},
				],
			},
			fragment: {
				module: avatarShaderModule,
				entryPoint: "frag_node",
				targets: [
					{
						format: presentationFormat,
						blend: {
							color: {
								srcFactor: "src-alpha",
								dstFactor: "one-minus-src-alpha",
								operation: "add",
							},
							alpha: {
								srcFactor: "src-alpha",
								dstFactor: "one-minus-src-alpha",
								operation: "add",
							},
						},
					},
				],
			},
		});

		const defaultImage = cache.get(0)!;
		this.copyTile(0, defaultImage);
	}

	public render(passEncoder: GPURenderPassEncoder) {
		if (this.avatarCount > 0) {
			passEncoder.setPipeline(this.avatarPipeline);
			passEncoder.setBindGroup(0, this.paramBindGroup);
			passEncoder.setBindGroup(1, this.avatarBindGroup);
			passEncoder.setVertexBuffer(0, this.vertexBuffer);
			passEncoder.setIndexBuffer(this.indexBuffer, "uint16");
			passEncoder.drawIndexed(SquareRenderer.indexBufferData.length, this.avatarCount);
		}
	}

	private areaIdCacheBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaXCacheBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaYCacheBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private area = {
		id: new Uint32Array(this.areaIdCacheBuffer),
		x: new Float32Array(this.areaXCacheBuffer),
		y: new Float32Array(this.areaYCacheBuffer),
	};

	/** avatar-to-tile (avatar is an index into this array) */
	private cells = new Uint32Array(ROW_COUNT * COL_COUNT);

	/** id-to-tile */
	private tileMap = new Map<number, number>([[0, 0]]);

	/** tiles */
	private recycling = new Set<number>(Array.from({ length: ROW_COUNT * COL_COUNT - 1 }, (_, index) => index + 1));
	private recycle(): number | null {
		for (const tile of this.recycling) {
			return tile;
		}

		return null;
	}

	/** area is a sorted array of node ids */
	public setAvatars(area: Area, refresh?: () => void) {
		let i = 0;
		let j = 0;
		while (i < this.avatarCount && j < area.length) {
			if (this.area.id[i] < area[j].id) {
				this.removeAvatar(this.area.id[i]);
				i++;
			} else if (this.area.id[i] > area[j].id) {
				this.addAvatar(area[j].id, refresh);
				j++;
			} else {
				i++;
				j++;
			}
		}

		while (i < this.avatarCount) {
			this.removeAvatar(this.area.id[i]);
			i++;
		}

		while (j < area.length) {
			this.addAvatar(area[j].id, refresh);
			j++;
		}

		this.avatarCount = area.length;

		for (const [avatar, body] of area.entries()) {
			const tile = this.tileMap.get(body.id);
			assert(tile !== undefined, "internal error - expected tile !== undefined");
			this.cells[avatar] = tile;

			this.area.id[avatar] = body.id;
			this.area.x[avatar] = body.x;
			this.area.y[avatar] = body.y;
		}

		this.device.queue.writeBuffer(this.avatarXBuffer, 0, this.area.x.subarray(0, area.length));
		this.device.queue.writeBuffer(this.avatarYBuffer, 0, this.area.y.subarray(0, area.length));
		this.device.queue.writeBuffer(this.tileBuffer, 0, this.cells.subarray(0, area.length));
	}

	private addAvatar(id: number, refresh?: () => void) {
		const oldTile = this.tileMap.get(id);
		if (oldTile !== undefined) {
			this.recycling.delete(oldTile);
			this.tileMap.set(id, oldTile);
			return;
		}

		const image = this.cache.get(id);
		if (image !== undefined) {
			const tile = this.recycle();
			if (tile === null) {
				log("texture atlas full, ignoring %d", id);
			} else {
				this.recycling.delete(tile);
				this.tileMap.set(id, tile);
				this.copyTile(tile, image);
			}
			return;
		}

		// Skip if we're overloaded
		if (this.cache.queueSize() > Cache.MAX_QUEUE_SIZE) {
			return;
		}

		// Fetch the image
		this.tileMap.set(id, 0);
		this.cache.fetch(id).then(
			(image) => {
				if (this.tileMap.get(id) !== 0) {
					return;
				}

				const tile = this.recycle();
				if (tile === null) {
					return;
				}

				this.recycling.delete(tile);
				this.tileMap.set(id, tile);
				this.copyTile(tile, image);
				refresh?.();
			},
			(err) => console.error(err),
		);
	}

	private removeAvatar(id: number) {
		const tile = this.tileMap.get(id);
		if (tile !== undefined && tile !== 0) {
			this.recycling.add(tile);
		} else {
			this.cache.cancel(id);
		}
	}

	private copyTile(tile: number, image: ImageBitmap) {
		const x = tile % ROW_COUNT;
		const y = Math.floor(tile / ROW_COUNT);

		this.device.queue.copyExternalImageToTexture(
			{ source: image },
			{ texture: this.texture, origin: [x * AVATAR_DIMENSIONS.width, y * AVATAR_DIMENSIONS.height] },
			{ width: image.width, height: image.height },
		);
	}
}
