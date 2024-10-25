import renderShader from "../shaders/render.wgsl?raw";
import avatarShader from "../shaders/avatar.wgsl?raw";

import { Cache } from "./Cache.js";
import {
	AVATAR_DIMENSIONS,
	COL_COUNT,
	ROW_COUNT,
	TEXTURE_DIMENSIONS,
	assert,
	getScaleRadius,
	minRadius,
} from "./utils.js";
import { Store, Area } from "./Store.js";

const params = new Float32Array([
	0, // width
	0, // height
	0, // offset_x
	0, // offset_y
	1, // scale
	minRadius, // min_radius
	1, // scale_radius
]);

export class Renderer {
	public static async create(
		canvas: HTMLCanvasElement,
		nodeCount: number,
		nodes: Iterable<{ id: number; x: number; y: number; z: number }>,
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
		return new Renderer(cache, context, device, presentationFormat, nodeCount, nodes);
	}

	private static squareIndexBufferData = new Uint16Array([0, 1, 2, 2, 0, 3]);
	private static squareVertexBufferData = new Float32Array([-1.0, 1.0, 1.0, 1.0, 1.0, -1.0, -1.0, -1.0]);

	vertexBuffer: GPUBuffer;
	indexBuffer: GPUBuffer;
	paramBuffer: GPUBuffer;

	// avatarBuffer: GPUBuffer;
	avatarXBuffer: GPUBuffer;
	avatarYBuffer: GPUBuffer;
	avatarZBuffer: GPUBuffer;

	tileBuffer: GPUBuffer;
	texture: GPUTexture;
	sampler: GPUSampler;

	nodePipeline: GPURenderPipeline;
	nodeBindGroup: GPUBindGroup;

	avatarPipeline: GPURenderPipeline;
	avatarBindGroup: GPUBindGroup;
	avatarCount: number = 0;

	constructor(
		readonly cache: Cache,
		// readonly canvas: HTMLCanvasElement,
		readonly context: GPUCanvasContext,
		readonly device: GPUDevice,
		readonly presentationFormat: GPUTextureFormat,
		readonly nodeCount: number,
		nodes: Iterable<{ id: number; x: number; y: number; z: number }>,
	) {
		// initialize param buffer
		const paramBufferSize = params.length * 4;
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

		this.avatarZBuffer = device.createBuffer({
			label: "avatarZBuffer",
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
		const nodeBufferSize = nodeCount * 2 * 4;
		const nodeBuffer = this.device.createBuffer({
			label: "nodeBuffer",
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
			size: nodeBufferSize,
			mappedAtCreation: true,
		});

		const zBufferSize = nodeCount * 4;
		const zBuffer = this.device.createBuffer({
			label: "zBuffer",
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
			size: zBufferSize,
			mappedAtCreation: true,
		});

		{
			const zMap = zBuffer.getMappedRange(0, zBufferSize);
			const zArray = new Float32Array(zMap, 0, nodeCount);

			const nodeMap = nodeBuffer.getMappedRange(0, nodeBufferSize);
			const nodeArray = new Float32Array(nodeMap, 0, nodeCount * 2);
			let n = 0;
			for (const { id, x, y, z } of nodes) {
				const i = n++;
				nodeArray[2 * i] = x;
				nodeArray[2 * i + 1] = y;
				zArray[i] = z;
			}

			nodeBuffer.unmap();
			zBuffer.unmap();
		}

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
				{ binding: 1, resource: { buffer: nodeBuffer } },
				{ binding: 2, resource: { buffer: zBuffer } },
			],
		});

		const renderShaderModule = device.createShaderModule({ label: "renderShaderModule", code: renderShader });

		this.nodePipeline = device.createRenderPipeline({
			label: "pipeline",
			layout: device.createPipelineLayout({
				label: "pipelineLayout",
				bindGroupLayouts: [nodeBindGroupLayout],
			}),
			vertex: {
				module: renderShaderModule,
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
				module: renderShaderModule,
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
			// mipLevelCount: getMipLevelCount(TEXTURE_DIMENSIONS.width, TEXTURE_DIMENSIONS.height),
			size: [TEXTURE_DIMENSIONS.width, TEXTURE_DIMENSIONS.height],
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
		});

		// this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
		this.sampler = device.createSampler({});

		const avatarBindGroupLayout = device.createBindGroupLayout({
			label: "avatarBindGroupLayout",
			entries: [
				{ binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
				{ binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
				{ binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
				{ binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
				{ binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
				{ binding: 5, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
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
				{ binding: 4, resource: { buffer: this.avatarZBuffer } },
				{ binding: 5, resource: { buffer: this.tileBuffer } },
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

	private areaIdCacheBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaXCacheBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaYCacheBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaZCacheBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private area: Area = {
		id: new Uint32Array(this.areaIdCacheBuffer),
		x: new Float32Array(this.areaXCacheBuffer),
		y: new Float32Array(this.areaYCacheBuffer),
		z: new Float32Array(this.areaZCacheBuffer),
	};

	/** avatar-to-tile (avatar is an index into this array) */
	private tiles = new Uint32Array(ROW_COUNT * COL_COUNT);

	/** id-to-tile */
	private tileMap = new Map<number, number>([[0, 0]]);

	/** tiles */
	private recycling = new Set<number>(Array.from({ length: ROW_COUNT * COL_COUNT - 1 }, (_, index) => index + 1));
	private recycle(): number {
		for (const tile of this.recycling) {
			return tile;
		}

		throw new Error("texture atlas overflow");
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

		// this.device.queue.writeBuffer(this.avatarBuffer, 0, area.id);
		this.device.queue.writeBuffer(this.avatarXBuffer, 0, area.x);
		this.device.queue.writeBuffer(this.avatarYBuffer, 0, area.y);
		this.device.queue.writeBuffer(this.avatarZBuffer, 0, area.z);
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
			this.recycling.delete(tile);
			this.tileMap.set(id, tile);
			this.copyTile(tile, image);
			return;
		}

		// Fetch the image
		this.tileMap.set(id, 0);
		this.cache.fetch(id).then((image) => {
			if (this.tileMap.get(id) === 0) {
				const tile = this.recycle();
				this.recycling.delete(tile);
				this.tileMap.set(id, tile);
				this.copyTile(tile, image);
				refresh?.();
			}
		});
	}

	private removeAvatar(id: number) {
		const tile = this.tileMap.get(id);
		if (tile !== undefined && tile !== 0) {
			this.recycling.add(tile);
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
		params[0] = width;
		params[1] = height;
	}

	public setOffset(offsetX: number, offsetY: number) {
		params[2] = offsetX;
		params[3] = offsetY;
	}

	public setScale(scale: number) {
		params[4] = scale;
		params[6] = getScaleRadius(scale);
	}

	public render() {
		this.device.queue.writeBuffer(this.paramBuffer, 0, params);

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
		passEncoder.drawIndexed(Renderer.squareIndexBufferData.length, this.nodeCount);
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
