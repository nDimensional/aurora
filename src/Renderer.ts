import nodeShader from "../shaders/node.wgsl?raw";
import avatarShader from "../shaders/avatar.wgsl?raw";

import { Cache } from "./Cache.js";
import { AVATAR_DIMENSIONS, COL_COUNT, ROW_COUNT, TEXTURE_DIMENSIONS, assert, convert, getRadius } from "./utils.js";
import { Store, Area } from "./Store.js";

export class Renderer {
	public static async create(
		store: Store,
		canvas: HTMLCanvasElement,
		onProgress?: (count: number, total: number) => void,
	) {
		const adapter = await navigator.gpu.requestAdapter();
		assert(adapter !== null);

		const device = await adapter.requestDevice();
		assert(device !== null);

		const context = canvas.getContext("webgpu");
		assert(context !== null);

		const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
		context.configure({
			device,
			format: presentationFormat,
			alphaMode: "premultiplied",
		});

		const cache = await Cache.create();
		const renderer = new Renderer(store, cache, context, device, presentationFormat);
		await renderer.load(onProgress);
		return renderer;
	}

	private static squareIndexBufferData = new Uint16Array([0, 1, 2, 2, 0, 3]);

	// prettier-ignore
	private static squareVertexBufferData = new Float32Array([
	  [-1.0,  1.0],
		[ 1.0,  1.0],
		[ 1.0, -1.0],
		[-1.0, -1.0],
	].flat());

	vertexBuffer: GPUBuffer;
	indexBuffer: GPUBuffer;
	paramBuffer: GPUBuffer;

	colorBuffer: GPUBuffer;
	colorBufferSize: number;

	positionBuffer: GPUBuffer;
	positionBufferSize: number;

	avatarXBuffer: GPUBuffer;
	avatarYBuffer: GPUBuffer;

	tileBuffer: GPUBuffer;
	texture: GPUTexture;
	sampler: GPUSampler;

	nodePipeline: GPURenderPipeline;
	nodeBindGroup: GPUBindGroup;

	avatarPipeline: GPURenderPipeline;
	avatarBindGroup: GPUBindGroup;
	avatarCount: number = 0;

	readonly params = new Float32Array([
		0, // 0: width
		0, // 1: height
		0, // 2: offset_x
		0, // 3: offset_y
		1, // 4: scale
		0, // 5: radius
	]);

	readonly divisor = new Uint32Array([1]);

	constructor(
		readonly store: Store,
		readonly cache: Cache,
		readonly context: GPUCanvasContext,
		readonly device: GPUDevice,
		readonly presentationFormat: GPUTextureFormat,
	) {
		// initialize param buffer
		const paramBufferSize = this.params.length * 4 + 4;
		this.paramBuffer = device.createBuffer({
			label: "paramBuffer",
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			size: paramBufferSize,
		});

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

		// initialize node buffer
		this.positionBufferSize = store.nodeCount * 2 * 4;
		console.log("store.positionBufferSize:", this.positionBufferSize);
		this.positionBuffer = this.device.createBuffer({
			label: "positionBuffer",
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
			size: this.positionBufferSize,
			mappedAtCreation: true,
		});

		this.colorBufferSize = store.nodeCount * 4;
		console.log("store.colorBufferSize:", this.colorBufferSize);
		this.colorBuffer = this.device.createBuffer({
			label: "colorBuffer",
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
			size: this.colorBufferSize,
			mappedAtCreation: true,
		});

		// initialize vertex buffer
		const vertexBufferSize = Renderer.squareVertexBufferData.length * 4;
		this.vertexBuffer = device.createBuffer({
			label: "vertexBuffer",
			usage: GPUBufferUsage.VERTEX,
			mappedAtCreation: true,
			size: vertexBufferSize,
		});

		{
			const map = this.vertexBuffer.getMappedRange(0, vertexBufferSize);
			new Float32Array(map, 0, Renderer.squareVertexBufferData.length).set(Renderer.squareVertexBufferData);
			this.vertexBuffer.unmap();
		}

		// initialize index buffer
		const indexBufferSize = Renderer.squareIndexBufferData.length * 2;
		this.indexBuffer = device.createBuffer({
			label: "indexBuffer",
			usage: GPUBufferUsage.INDEX,
			mappedAtCreation: true,
			size: indexBufferSize,
		});

		{
			const map = this.indexBuffer.getMappedRange(0, indexBufferSize);
			new Uint16Array(map, 0, Renderer.squareIndexBufferData.length).set(Renderer.squareIndexBufferData);
			this.indexBuffer.unmap();
		}

		const nodeBindGroupLayout = device.createBindGroupLayout({
			label: "nodeBindGroupLayout",
			entries: [
				{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
				{ binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
				{ binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
			],
		});

		this.nodeBindGroup = device.createBindGroup({
			label: "nodeBindGroup",
			layout: nodeBindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: this.paramBuffer } },
				{ binding: 1, resource: { buffer: this.positionBuffer } },
				{ binding: 2, resource: { buffer: this.colorBuffer } },
			],
		});

		const nodeShaderModule = device.createShaderModule({ label: "nodeShaderModule", code: nodeShader });

		this.nodePipeline = device.createRenderPipeline({
			label: "pipeline",
			layout: device.createPipelineLayout({
				label: "pipelineLayout",
				bindGroupLayouts: [nodeBindGroupLayout],
			}),
			vertex: {
				module: nodeShaderModule,
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
				module: nodeShaderModule,
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
				bindGroupLayouts: [nodeBindGroupLayout, avatarBindGroupLayout],
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

		console.log("Initialized Renderer");
	}

	private async load(onProgress?: (count: number, total: number) => void) {
		const colorMap = this.colorBuffer.getMappedRange(0, this.colorBufferSize);
		assert(
			colorMap.byteLength === this.store.colorsBuffer.byteLength,
			"expected colorMap.byteLength === this.store.colorsBuffer.byteLength",
			{
				expected: this.store.colorsBuffer.byteLength,
				actual: colorMap.byteLength,
				colorBufferSize: this.colorBufferSize,
			},
		);
		new Uint8Array(colorMap).set(new Uint8Array(this.store.colorsBuffer));

		const positionMap = this.positionBuffer.getMappedRange(0, this.positionBufferSize);
		assert(
			positionMap.byteLength === this.store.positionsBuffer.byteLength,
			"expected positionMap.byteLength === this.store.positionsBuffer.byteLength",
		);

		new Uint8Array(positionMap).set(new Uint8Array(this.store.positionsBuffer));
		this.positionBuffer.unmap();
		this.colorBuffer.unmap();
	}

	private areaIdCacheBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaXCacheBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaYCacheBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private area: Area = {
		id: new Uint32Array(this.areaIdCacheBuffer),
		x: new Float32Array(this.areaXCacheBuffer),
		y: new Float32Array(this.areaYCacheBuffer),
	};

	/** avatar-to-tile (avatar is an index into this array) */
	private tiles = new Uint32Array(ROW_COUNT * COL_COUNT);

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
		while (i < this.avatarCount && j < area.id.length) {
			if (this.area.id[i] < area.id[j]) {
				this.removeAvatar(this.area.id[i]);
				i++;
			} else if (this.area.id[i] > area.id[j]) {
				this.addAvatar(area.id[j], refresh);
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

		while (j < area.id.length) {
			this.addAvatar(area.id[j], refresh);
			j++;
		}

		for (const [avatar, id] of area.id.entries()) {
			this.tiles[avatar] = this.tileMap.get(id)!;
		}

		this.area.id.set(area.id);
		this.avatarCount = area.id.length;

		this.device.queue.writeBuffer(this.avatarXBuffer, 0, area.x);
		this.device.queue.writeBuffer(this.avatarYBuffer, 0, area.y);
		this.device.queue.writeBuffer(this.tileBuffer, 0, this.tiles);
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
				console.log("texture atlas full, ignoring", id);
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

	public setSize(width: number, height: number) {
		this.params[0] = width;
		this.params[1] = height;
	}

	public setOffset(offsetX: number, offsetY: number) {
		this.params[2] = offsetX;
		this.params[3] = offsetY;
	}

	public setScale(scale: number) {
		this.params[4] = scale;
		this.params[5] = getRadius(scale);

		if (scale < 1) {
			const log2 = Math.log2(scale);
			const a = Math.round(Math.sqrt(Math.log2(-log2 + 1)));
			if (-log2 < 6.5) {
				this.divisor[0] = 1;
			} else if (-log2 < 8.5) {
				this.divisor[0] = 2;
			} else {
				this.divisor[0] = 4;
			}
		} else {
			this.divisor[0] = 1;
		}
	}

	public render() {
		this.device.queue.writeBuffer(this.paramBuffer, 0, this.params);
		this.device.queue.writeBuffer(this.paramBuffer, this.params.byteLength, this.divisor);

		const commandEncoder = this.device.createCommandEncoder();
		const textureView = this.context.getCurrentTexture().createView();
		const passEncoder = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: textureView,
					clearValue: { r: 0.05, g: 0.05, b: 0.05, a: 1.0 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});

		this.renderNodes(passEncoder);
		this.renderAvatars(passEncoder);
		passEncoder.end();

		this.device.queue.submit([commandEncoder.finish()]);
	}

	private renderNodes(passEncoder: GPURenderPassEncoder) {
		passEncoder.setPipeline(this.nodePipeline);
		passEncoder.setBindGroup(0, this.nodeBindGroup);
		passEncoder.setVertexBuffer(0, this.vertexBuffer);
		passEncoder.setIndexBuffer(this.indexBuffer, "uint16");
		passEncoder.drawIndexed(Renderer.squareIndexBufferData.length, Math.floor(this.store.nodeCount / this.divisor[0]));
	}

	private renderAvatars(passEncoder: GPURenderPassEncoder) {
		if (this.avatarCount > 0) {
			passEncoder.setPipeline(this.avatarPipeline);
			passEncoder.setBindGroup(0, this.nodeBindGroup);
			passEncoder.setBindGroup(1, this.avatarBindGroup);
			passEncoder.setVertexBuffer(0, this.vertexBuffer);
			passEncoder.setIndexBuffer(this.indexBuffer, "uint16");
			passEncoder.drawIndexed(Renderer.squareIndexBufferData.length, this.avatarCount);
		}
	}
}
