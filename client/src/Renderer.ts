import renderShader from "../shaders/render.wgsl?raw";

import { assert } from "./utils.js";

const squareIndexBufferData = new Uint16Array([0, 1, 2, 2, 0, 3]);
const squareVertexBufferData = new Float32Array([-1.0, 1.0, 1.0, 1.0, 1.0, -1.0, -1.0, -1.0]);

export const unit = 5;
const params = new Float32Array([
	unit, // unit
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

	vertexBuffer: GPUBuffer;
	indexBuffer: GPUBuffer;
	paramBuffer: GPUBuffer;

	pipeline: GPURenderPipeline;
	bindGroup: GPUBindGroup;

	constructor(
		readonly context: GPUCanvasContext,
		readonly device: GPUDevice,
		readonly presentationFormat: GPUTextureFormat,
		readonly nodeCount: number,
		readonly nodes: Iterable<{ x: number; y: number; z: number }>
	) {
		const zBufferSize = nodeCount * 4;
		const zBuffer = this.device.createBuffer({
			label: "zBuffer",
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
			size: zBufferSize,
			mappedAtCreation: true,
		});

		// initialize node buffer
		const nodeBufferSize = nodeCount * 2 * 4;
		const nodeBuffer = this.device.createBuffer({
			label: "nodeBuffer",
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
			size: nodeBufferSize,
			mappedAtCreation: true,
		});

		{
			const zMap = zBuffer.getMappedRange(0, zBufferSize);
			const zArray = new Float32Array(zMap, 0, nodeCount);

			const nodeMap = nodeBuffer.getMappedRange(0, nodeBufferSize);
			const nodeArray = new Float32Array(nodeMap, 0, nodeCount * 2);
			let i = 0;
			for (const { x, y, z } of nodes) {
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
		const vertexBufferSize = squareVertexBufferData.length * 4;
		const vertexBuffer = device.createBuffer({
			label: "vertexBuffer",
			usage: GPUBufferUsage.VERTEX,
			mappedAtCreation: true,
			size: vertexBufferSize,
		});

		{
			const map = vertexBuffer.getMappedRange(0, vertexBufferSize);
			new Float32Array(map, 0, squareVertexBufferData.length).set(squareVertexBufferData);
			vertexBuffer.unmap();
		}

		// initialize index buffer
		const indexBufferSize = squareIndexBufferData.length * 2;
		const indexBuffer = device.createBuffer({
			label: "indexBuffer",
			usage: GPUBufferUsage.INDEX,
			mappedAtCreation: true,
			size: indexBufferSize,
		});

		{
			const map = indexBuffer.getMappedRange(0, indexBufferSize);
			new Uint16Array(map, 0, squareIndexBufferData.length).set(squareIndexBufferData);
			indexBuffer.unmap();
		}

		// initialize param buffer
		const paramBufferSize = params.length * 4;
		const paramBuffer = device.createBuffer({
			label: "paramBuffer",
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			size: paramBufferSize,
		});

		const bindGroupLayout = device.createBindGroupLayout({
			label: "bindGroupLayout",
			entries: [
				{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
				{ binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
				{ binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
			],
		});

		const bindGroup = device.createBindGroup({
			label: "bindGroup",
			layout: bindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: paramBuffer } },
				{ binding: 1, resource: { buffer: nodeBuffer } },
				{ binding: 2, resource: { buffer: zBuffer } },
			],
		});

		const renderShaderModule = device.createShaderModule({
			label: "renderShaderModule",
			code: renderShader,
		});

		const pipelineLayout = device.createPipelineLayout({
			label: "pipelineLayout",
			bindGroupLayouts: [bindGroupLayout],
		});

		const pipeline = device.createRenderPipeline({
			label: "pipeline",
			layout: pipelineLayout,
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

		this.indexBuffer = indexBuffer;
		this.vertexBuffer = vertexBuffer;
		this.paramBuffer = paramBuffer;

		this.bindGroup = bindGroup;
		this.pipeline = pipeline;

		console.log("Initialized Renderer");
	}

	public render(
		width: number,
		height: number,
		offsetX: number,
		offsetY: number,
		mouseX: number | null,
		mouseY: number | null,
		scale: number
	) {
		params[1] = width;
		params[2] = height;
		params[3] = offsetX / unit;
		params[4] = offsetY / unit;
		params[5] = (mouseX ?? 0) / 2;
		params[6] = (mouseY ?? 0) / 2;
		params[7] = scale;
		this.device.queue.writeBuffer(this.paramBuffer, 0, params);

		const commandEncoder = this.device.createCommandEncoder();
		const textureView = this.context.getCurrentTexture().createView();

		const passEncoder = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: textureView,
					clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});

		passEncoder.setPipeline(this.pipeline);
		passEncoder.setBindGroup(0, this.bindGroup);
		passEncoder.setVertexBuffer(0, this.vertexBuffer);
		passEncoder.setIndexBuffer(this.indexBuffer, "uint16");

		// if (mouseX !== null && mouseY !== null) {
		// 	passEncoder.drawIndexed(squareIndexBufferData.length, this.nodeCount + 1);
		// } else {
		passEncoder.drawIndexed(squareIndexBufferData.length, this.nodeCount);
		// }

		passEncoder.end();
		this.device.queue.submit([commandEncoder.finish()]);
	}
}
