import renderShader from "../shaders/render.wgsl?raw";
import avatarShader from "../shaders/avatar.wgsl?raw";

// import imageURL from "../f-texture.png?url";
// import imageURL from "../bafkreibween37i64csnqgu325llyzg4mio633yc2i5gzpf3vffpaxaycym.jpeg?url";

import { AVATAR_DIMENSIONS, COL_COUNT, ROW_COUNT, TEXTURE_DIMENSIONS, assert } from "./utils.js";

const params = new Float32Array([
	0, // width
	0, // height
	0, // offset_x
	0, // offset_y
	0, // mouse_x
	0, // mouse_y
	1, // scale
]);

export class Renderer {
	public static async create(
		canvas: HTMLCanvasElement,
		nodeCount: number,
		nodes: Iterable<{ x: number; y: number; z: number }>
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
		readonly nodes: Iterable<{ x: number; y: number; z: number }> // readonly images: ImageBitmap[]
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
			let i = 0;
			for (const { x, y, z } of nodes) {
				console.log(x, y, z);
				nodeArray[2 * i] = x;
				nodeArray[2 * i + 1] = y;
				zArray[i] = Math.sqrt(z);
				i++;
			}

			console.log("added %d nodes to buffer", i);

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
			format: "rgba8unorm",
			size: [TEXTURE_DIMENSIONS.width, TEXTURE_DIMENSIONS.height],
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
		});

		this.sampler = device.createSampler();

		const avatarBindGroupLayout = device.createBindGroupLayout({
			label: "avatarBindGroupLayout",
			entries: [
				{ binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
				{ binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
				{ binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
			],
		});

		this.avatarBindGroup = device.createBindGroup({
			label: "avatarBindGroup",
			layout: avatarBindGroupLayout,
			entries: [
				{ binding: 0, resource: this.sampler },
				{ binding: 1, resource: this.texture.createView() },
				{ binding: 2, resource: { buffer: this.avatarBuffer } },
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
	}

	public setAvatars(avatars: Map<number, ImageBitmap>) {
		const indices = Array.from(avatars.keys());
		for (const [i, idx] of indices.entries()) {
			const image = avatars.get(idx)!;

			const x = i % ROW_COUNT;
			const y = Math.floor(i / ROW_COUNT);
			// const u = (x * AVATAR_DIMENSIONS.width) / TEXTURE_DIMENSIONS.width;
			// const v = (y * AVATAR_DIMENSIONS.height) / TEXTURE_DIMENSIONS.height;
			// const [u, v] = [0, 0];
			console.log({ x, y });
			const [u, v] = [x, y];
			this.device.queue.copyExternalImageToTexture(
				{ source: image },
				{ texture: this.texture, origin: [u * AVATAR_DIMENSIONS.width, v * AVATAR_DIMENSIONS.height] },
				{ width: image.width, height: image.height }
			);
		}

		this.avatarCount = avatars.size;
		this.device.queue.writeBuffer(this.avatarBuffer, 0, new Uint32Array(indices));
	}

	// public setAvatar(idx: number, image: ImageBitmap) {
	// 	// if (this.avatarMap.has(idx)) {
	// 	// 	return;
	// 	// }

	// 	// this.avatarMap.set(idx, image);

	// 	this.device.queue.writeBuffer(this.avatarBuffer, 0, new Uint32Array([idx - 1]));

	// 	this.device.queue.copyExternalImageToTexture(
	// 		{ source: image },
	// 		{ texture: this.texture },
	// 		{ width: image.width, height: image.height }
	// 	);
	// }

	public render(
		width: number,
		height: number,
		offsetX: number,
		offsetY: number,
		mouseX: number | null,
		mouseY: number | null,
		scale: number
	) {
		params[0] = width;
		params[1] = height;
		params[2] = offsetX;
		params[3] = offsetY;
		params[4] = (mouseX ?? 0) / 2;
		params[5] = (mouseY ?? 0) / 2;
		params[6] = scale;
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

		passEncoder.setPipeline(this.nodePipeline);
		passEncoder.setBindGroup(0, this.nodeBindGroup);
		passEncoder.setVertexBuffer(0, this.vertexBuffer);
		passEncoder.setIndexBuffer(this.indexBuffer, "uint16");
		passEncoder.drawIndexed(Renderer.squareIndexBufferData.length, this.nodeCount);

		passEncoder.setPipeline(this.avatarPipeline);
		passEncoder.setBindGroup(0, this.nodeBindGroup);
		passEncoder.setBindGroup(1, this.avatarBindGroup);
		passEncoder.setVertexBuffer(0, this.vertexBuffer);
		passEncoder.setIndexBuffer(this.indexBuffer, "uint16");
		passEncoder.drawIndexed(Renderer.squareIndexBufferData.length, this.avatarCount);

		passEncoder.end();

		this.device.queue.submit([commandEncoder.finish()]);
	}
}
