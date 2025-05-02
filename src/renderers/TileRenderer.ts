import { Hsluv } from "hsluv";

import tileShader from "../../shaders/tile.wgsl?raw";

import { Store } from "../Store.js";
import { Tile } from "../Tile.js";
import { SquareRenderer } from "./SquareRenderer.js";

interface QuadTreeCell {
	x: number;
	y: number;
	size: number;
	level?: number;
}

function buildCellArray(tile: Tile, cells: QuadTreeCell[] = []) {
	cells.push({ size: tile.area.s, x: tile.area.x, y: tile.area.y, level: tile.level });
	if (tile.ne) buildCellArray(tile.ne, cells);
	if (tile.nw) buildCellArray(tile.nw, cells);
	if (tile.sw) buildCellArray(tile.sw, cells);
	if (tile.se) buildCellArray(tile.se, cells);
	return cells;
}

const hsluv = new Hsluv();

const convert = (h: number, s: number, l: number): [r: number, g: number, b: number] => {
	hsluv.hsluv_h = h;
	hsluv.hsluv_s = s;
	hsluv.hsluv_l = l;
	hsluv.hsluvToRgb();
	return [hsluv.rgb_r, hsluv.rgb_g, hsluv.rgb_b];
};

export class TileRenderer extends SquareRenderer {
	bindGroup: GPUBindGroup;
	pipeline: GPURenderPipeline;
	cells: QuadTreeCell[];

	constructor(
		readonly device: GPUDevice,
		readonly presentationFormat: GPUTextureFormat,
		readonly paramBindGroupLayout: GPUBindGroupLayout,
		readonly paramBindGroup: GPUBindGroup,
		readonly store: Store,
	) {
		super(device);
		this.cells = buildCellArray(store.rootTile);

		const positions = new Float32Array(this.cells.flatMap((cell) => [cell.x, cell.y]));
		const sizes = new Float32Array(this.cells.map((cell) => cell.size));
		const colors = new Float32Array(
			this.cells.flatMap(() => {
				const hue = Math.random() * 360;
				const [r, g, b] = convert(hue, 90, 30);
				return [r, g, b, 1.0];
			}),
		);

		const positionBuffer = this.createStorageBuffer("tilePositionBuffer", positions.byteLength, positions);
		const sizeBuffer = this.createStorageBuffer("tileSizeBuffer", sizes.byteLength, sizes);
		const colorBuffer = this.createStorageBuffer("tileColorBuffer", colors.byteLength, colors);

		const tileBindGroupLayout = device.createBindGroupLayout({
			label: "tileBindGroupLayout",
			entries: [
				{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
				{ binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
				{ binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
			],
		});

		this.bindGroup = device.createBindGroup({
			label: "tileBindGroup",
			layout: tileBindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: positionBuffer } },
				{ binding: 1, resource: { buffer: sizeBuffer } },
				{ binding: 2, resource: { buffer: colorBuffer } },
			],
		});

		const tileShaderModule = device.createShaderModule({ code: tileShader });
		this.pipeline = device.createRenderPipeline({
			label: "tilePipeline",
			layout: device.createPipelineLayout({
				label: "tilePipelineLayout",
				bindGroupLayouts: [paramBindGroupLayout, tileBindGroupLayout],
			}),
			vertex: {
				module: tileShaderModule,
				entryPoint: "vert_tile",
				buffers: [SquareRenderer.vertexBufferLayout],
			},
			fragment: {
				module: tileShaderModule,
				entryPoint: "frag_tile",
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
								srcFactor: "one",
								dstFactor: "zero",
								operation: "add",
							},
						},
					},
				],
			},
		});
	}

	public render(passEncoder: GPURenderPassEncoder) {
		passEncoder.setPipeline(this.pipeline);
		passEncoder.setBindGroup(0, this.paramBindGroup);
		passEncoder.setBindGroup(1, this.bindGroup);
		passEncoder.setVertexBuffer(0, this.vertexBuffer);
		passEncoder.setIndexBuffer(this.indexBuffer, "uint16");
		passEncoder.drawIndexed(SquareRenderer.indexBufferData.length, this.cells.length);
	}
}
