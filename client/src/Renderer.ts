import renderShader from "../shaders/render.wgsl?raw";
import avatarShader from "../shaders/avatar.wgsl?raw";

import { cache } from "./Cache.js";
import { AVATAR_DIMENSIONS, COL_COUNT, ROW_COUNT, TEXTURE_DIMENSIONS, assert } from "./utils.js";
import { Store } from "./Store.js";

const params = new Float32Array([
	0, // width
	0, // height
	0, // offset_x
	0, // offset_y
	1, // scale
]);

export class Renderer {
	public static async create(
		canvas: HTMLCanvasElement,
		nodeCount: number,
		nodes: Iterable<{ idx: number; x: number; y: number; z: number }>
	) {
		const adapter = await navigator.gpu.requestAdapter();
		assert(adapter !== null);

		const device = await adapter.requestDevice();
		assert(device !== null);

		const context = canvas.getContext("webgpu");
		assert(context !== null);

		// const devicePixelRatio = window.devicePixelRatio;
		// canvas.width = canvas.clientWidth * devicePixelRatio;
		// canvas.height = canvas.clientHeight * devicePixelRatio;

		const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
		context.configure({
			device,
			format: presentationFormat,
			alphaMode: "premultiplied",
		});

		return new Renderer(context, device, presentationFormat, nodeCount, nodes);
	}

	private static squareIndexBufferData = new Uint16Array([0, 1, 2, 2, 0, 3]);
	private static squareVertexBufferData = new Float32Array([-1.0, 1.0, 1.0, 1.0, 1.0, -1.0, -1.0, -1.0]);

	vertexBuffer: GPUBuffer;
	indexBuffer: GPUBuffer;
	paramBuffer: GPUBuffer;

	avatarBuffer: GPUBuffer;
	tileBuffer: GPUBuffer;
	texture: GPUTexture;
	sampler: GPUSampler;

	nodePipeline: GPURenderPipeline;
	nodeBindGroup: GPUBindGroup;

	avatarPipeline: GPURenderPipeline;
	avatarBindGroup: GPUBindGroup;
	avatarCount: number = 0;

	constructor(
		readonly context: GPUCanvasContext,
		readonly device: GPUDevice,
		readonly presentationFormat: GPUTextureFormat,
		readonly nodeCount: number,
		nodes: Iterable<{ idx: number; x: number; y: number; z: number }>
	) {
		// initialize param buffer
		const paramBufferSize = params.length * 4;
		this.paramBuffer = device.createBuffer({
			label: "paramBuffer",
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			size: paramBufferSize,
		});

		// initialize avatar buffer
		const avatarBufferSize = ROW_COUNT * COL_COUNT * 4;
		this.avatarBuffer = device.createBuffer({
			label: "avatarBuffer",
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
			for (const { idx, x, y, z } of nodes) {
				const i = idx - 1;
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

		this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

		const avatarBindGroupLayout = device.createBindGroupLayout({
			label: "avatarBindGroupLayout",
			entries: [
				{ binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
				{ binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
				{ binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
				{ binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
			],
		});

		this.avatarBindGroup = device.createBindGroup({
			label: "avatarBindGroup",
			layout: avatarBindGroupLayout,
			entries: [
				{ binding: 0, resource: this.sampler },
				{ binding: 1, resource: this.texture.createView() },
				{ binding: 2, resource: { buffer: this.avatarBuffer } },
				{ binding: 3, resource: { buffer: this.tileBuffer } },
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

		console.log("Initialized Renderer");

		const defaultImage = cache.get(0)!;
		this.device.queue.copyExternalImageToTexture(
			{ source: defaultImage },
			{ texture: this.texture, origin: [0, 0] },
			{ width: defaultImage.width, height: defaultImage.height }
		);
	}

	private areaCacheBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaCache = new Uint32Array(this.areaCacheBuffer);
	private areaCacheLength = 0;

	/** tile-to-idx */
	private tileOccupancy = new Uint32Array(ROW_COUNT * COL_COUNT);

	/** avatar-to-tile */
	private tiles = new Uint32Array(ROW_COUNT * COL_COUNT);

	/** idx-to-tile */
	private tileMap = new Map<number, number>([[0, 0]]);

	private recycling: number[] = Array.from({ length: ROW_COUNT * COL_COUNT }, (_, index) => index);

	private copyTile(tile: number, image: ImageBitmap) {
		const x = tile % ROW_COUNT;
		const y = Math.floor(tile / ROW_COUNT);

		this.device.queue.copyExternalImageToTexture(
			{ source: image },
			{ texture: this.texture, origin: [x * AVATAR_DIMENSIONS.width, y * AVATAR_DIMENSIONS.height] },
			{ width: image.width, height: image.height }
		);
	}

	private addAvatar(idx: number) {
		const oldTile = this.tileMap.get(idx);
		if (oldTile !== undefined) {
			this.tileMap.set(idx, oldTile);
			return;
		}

		const image = cache.get(idx);
		if (image !== undefined) {
			const tile = this.recycling.pop();
			if (tile === undefined) {
				throw new Error("texture atlas overflow");
			}

			this.copyTile(tile, image);
			this.tileMap.set(idx, tile);
			return;
		}

		// Fetch the image
		cache.fetch(idx).then((image) => {
			if (this.tileMap.get(idx) === 0) {
				const tile = this.recycling.pop();
				if (tile === undefined) {
					throw new Error("texture atlas overflow");
				}

				this.copyTile(tile, image);
				this.tileMap.set(idx, tile);
			}
		});

		this.tileMap.set(idx, 0);
	}

	private removeAvatar(idx: number) {
		this.recycling.push(idx);
	}

	public setAvatars(area: Uint32Array) {
		let i = 0;
		let j = 0;
		while (i < this.areaCacheLength && j < area.length) {
			if (this.areaCache[i] < area[j]) {
				this.removeAvatar(this.areaCache[i]);
				i++;
			} else if (this.areaCache[i] > area[j]) {
				this.addAvatar(area[j]);
				j++;
			} else {
				i++;
				j++;
			}
		}

		while (i < this.areaCacheLength) {
			this.removeAvatar(this.areaCache[i]);
			i++;
		}

		while (j < area.length) {
			this.addAvatar(area[j]);
			j++;
		}

		this.areaCache.set(area);
		this.areaCacheLength = area.length;

		for (const [avatar, idx] of area.entries()) {
			this.tiles[avatar] = this.tileMap.get(idx)!;
		}

		// for (let i = 0; i < area.length; i++) {
		// 	const idx = area[i];
		// 	this.tiles[i] = i;
		// 	const image = cache.get(idx) ?? cache.get(0)!;
		// 	this.copyTile(i, image);
		// }

		this.avatarCount = area.length;
		this.device.queue.writeBuffer(this.avatarBuffer, 0, area);
		this.device.queue.writeBuffer(this.tileBuffer, 0, this.tiles);
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
	}

	public render() {
		this.device.queue.writeBuffer(this.paramBuffer, 0, params);
		const commandEncoder = this.device.createCommandEncoder();
		const textureView = this.context.getCurrentTexture().createView();

		const passEncoder = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: textureView,
					// clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
					clearValue: { r: 0.4, g: 0.4, b: 0.4, a: 1.0 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});

		// console.log("drawing", this.nodeCount, "nodes");
		passEncoder.setPipeline(this.nodePipeline);
		passEncoder.setBindGroup(0, this.nodeBindGroup);
		passEncoder.setVertexBuffer(0, this.vertexBuffer);
		passEncoder.setIndexBuffer(this.indexBuffer, "uint16");
		passEncoder.drawIndexed(Renderer.squareIndexBufferData.length, this.nodeCount);

		if (this.avatarCount > 0) {
			passEncoder.setPipeline(this.avatarPipeline);
			passEncoder.setBindGroup(0, this.nodeBindGroup);
			passEncoder.setBindGroup(1, this.avatarBindGroup);
			passEncoder.setVertexBuffer(0, this.vertexBuffer);
			passEncoder.setIndexBuffer(this.indexBuffer, "uint16");
			passEncoder.drawIndexed(Renderer.squareIndexBufferData.length, this.avatarCount);
		}

		passEncoder.end();

		this.device.queue.submit([commandEncoder.finish()]);
	}
}
