import { Cache } from "../Cache.js";
import { assert, getRadius } from "../utils.js";
import { Store, Area } from "../Store.js";
import { Tile, View } from "../Tile.js";

import { NodeRenderer } from "./NodeRenderer.js";
import { AvatarRenderer } from "./AvatarRenderer.js";
import { TileRenderer } from "./TileRenderer.js";

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

		(window as any).device = device;

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
		// await renderer.load(onProgress);
		(window as any).renderer = renderer;
		return renderer;
	}

	paramBuffer: GPUBuffer;
	paramBindGroup: GPUBindGroup;

	tileRenderer: TileRenderer;
	nodeRenderer: NodeRenderer;
	avatarRenderer: AvatarRenderer;

	readonly params = new Float32Array([
		0, // 0: width
		0, // 1: height
		0, // 2: offset_x
		0, // 3: offset_y
		1, // 4: scale
		0, // 5: node_radius
	]);

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

		const paramBindGroupLayout = device.createBindGroupLayout({
			label: "paramBindGroupLayout",
			entries: [
				{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
			],
		});

		this.paramBindGroup = device.createBindGroup({
			label: "paramBindGroup",
			layout: paramBindGroupLayout,
			entries: [{ binding: 0, resource: { buffer: this.paramBuffer } }],
		});

		this.nodeRenderer = new NodeRenderer(device, presentationFormat, paramBindGroupLayout, this.paramBindGroup, store);
		this.tileRenderer = new TileRenderer(device, presentationFormat, paramBindGroupLayout, this.paramBindGroup, store);
		this.avatarRenderer = new AvatarRenderer(
			device,
			presentationFormat,
			paramBindGroupLayout,
			this.paramBindGroup,
			store,
			cache,
		);

		console.log("initialized renderers");
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
	}

	public render() {
		this.device.queue.writeBuffer(this.paramBuffer, 0, this.params);

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

		this.tileRenderer.render(passEncoder);
		this.nodeRenderer.render(passEncoder);
		this.avatarRenderer.render(passEncoder);
		passEncoder.end();

		this.device.queue.submit([commandEncoder.finish()]);
	}

	/** area is a sorted array of node ids */
	public setAvatars(area: Area, refresh?: () => void) {
		this.avatarRenderer.setAvatars(area, refresh);
	}

	public setTiles(tiles: Tile[], unit: number, refresh?: () => void) {
		this.nodeRenderer.setTiles(tiles, unit, refresh);

		tiles.filter((tile) => tile.atlas !== undefined);
	}
}
