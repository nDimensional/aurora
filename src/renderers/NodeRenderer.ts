import nodeShader from "../../shaders/node.wgsl?raw";

import { Store } from "../Store.js";
import { getTileView, Tile, View } from "../Tile.js";
import { assert, P } from "../utils.js";
import { SquareRenderer } from "./SquareRenderer.js";

export const stride = 12;
export const slotCount = 9;

export class NodeRenderer extends SquareRenderer {
	nodePipeline: GPURenderPipeline;
	nodeBindGroups: GPUBindGroup[];
	nodeBuffers: GPUBuffer[];
	nodeCounts: number[];

	/** slot-to-tile array */
	slots = new Array<Tile | null>(slotCount).fill(null);

	/** tile-to-slot index */
	tiles = new Map<Tile, { slot: number | null; density: number }>();

	constructor(
		readonly device: GPUDevice,
		readonly presentationFormat: GPUTextureFormat,
		readonly paramBindGroupLayout: GPUBindGroupLayout,
		readonly paramBindGroup: GPUBindGroup,
		readonly store: Store,
	) {
		super(device);

		const nodeBindGroupLayout = device.createBindGroupLayout({
			label: "nodeBindGroupLayout",
			entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } }],
		});

		this.nodeBuffers = new Array(slotCount);
		this.nodeBindGroups = new Array(slotCount);
		this.nodeCounts = new Array(slotCount).fill(0);
		for (let i = 0; i < slotCount; i++) {
			this.nodeBuffers[i] = this.device.createBuffer({
				label: `nodeBuffer-${i}`,
				size: Store.capacity * stride,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
				mappedAtCreation: false,
			});

			this.nodeBindGroups[i] = device.createBindGroup({
				label: "nodeBindGroup",
				layout: nodeBindGroupLayout,
				entries: [{ binding: 0, resource: { buffer: this.nodeBuffers[i] } }],
			});
		}

		const nodeShaderModule = device.createShaderModule({ label: "nodeShaderModule", code: nodeShader });

		this.nodePipeline = device.createRenderPipeline({
			label: "nodePipeline",
			layout: device.createPipelineLayout({
				label: "nodePipelineLayout",
				bindGroupLayouts: [paramBindGroupLayout, nodeBindGroupLayout],
			}),
			vertex: {
				module: nodeShaderModule,
				entryPoint: "vert_node",
				buffers: [SquareRenderer.vertexBufferLayout],
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
	}

	public render(passEncoder: GPURenderPassEncoder) {
		passEncoder.setPipeline(this.nodePipeline);
		passEncoder.setIndexBuffer(this.indexBuffer, "uint16");
		passEncoder.setVertexBuffer(0, this.vertexBuffer);
		passEncoder.setBindGroup(0, this.paramBindGroup);

		for (const [tile, { slot, density }] of this.tiles) {
			if (slot !== null) {
				assert(this.slots[slot] === tile);
				const nodeCount = Math.round(tile.total * density);
				assert(nodeCount <= tile.count);
				passEncoder.setBindGroup(1, this.nodeBindGroups[slot]);
				passEncoder.drawIndexed(SquareRenderer.indexBufferData.length, nodeCount);
			}
		}
	}

	private recycling = new Set<number>(Array.from({ length: 9 }, (_, index) => index));

	private recycle(): number | null {
		for (const tile of this.recycling) {
			return tile;
		}

		return null;
	}

	public setView(view: View, unit: number, refresh?: () => void) {
		const s = Math.pow(2, unit);
		const tiles = getTileView(this.store.rootTile, view, s);

		const densityLevel = Math.round(Math.log2(this.store.rootTile.area.s) - unit);
		const density = this.store.densityLevels[densityLevel] ?? 1.0;

		for (const [tile, { slot }] of this.tiles) {
			if (!tiles.includes(tile)) {
				this.tiles.delete(tile);
				if (slot !== null) {
					this.recycling.add(slot);
				}
			}
		}

		for (const tile of tiles) {
			const slot = this.slots.indexOf(tile);
			if (slot === -1) {
				this.addTile(tile, density, refresh);
			} else {
				this.tiles.set(tile, { slot, density });
				this.recycling.delete(slot);
			}
		}
	}

	#cache = new Map<Tile, ArrayBuffer>();

	private async getTile(tile: Tile): Promise<ArrayBuffer> {
		let nodeBuffer = this.#cache.get(tile);
		if (nodeBuffer === undefined) {
			const file = await Store.getFile(`tiles/${tile.nodes}`);
			console.log("retrieved tile", tile, file.size);
			nodeBuffer = await file.arrayBuffer();
			console.log(tile.id, tile.count, nodeBuffer.byteLength);
			assert(nodeBuffer.byteLength === stride * tile.count);
			this.#cache.set(tile, nodeBuffer);
		}

		return nodeBuffer;
	}

	private async addTile(tile: Tile, density: number, refresh?: () => void) {
		console.log("loading tile", tile.id);
		this.tiles.set(tile, { density, slot: null });
		this.getTile(tile).then(
			(nodeBuffer) => {
				const entry = this.tiles.get(tile);
				if (entry === undefined || entry.slot !== null) {
					return;
				}

				const slot = this.recycle();
				if (slot === null) {
					return;
				}

				if (this.slots[slot] !== null) {
					assert(!this.tiles.has(this.slots[slot]), "recycled active tile");
				}

				console.log("copying", tile.id, "to", slot);
				this.recycling.delete(slot);
				entry.slot = slot;
				this.slots[slot] = tile;
				this.copyTile(slot, nodeBuffer);
				refresh?.();
			},
			(err) => {
				console.error(err);
				this.tiles.delete(tile);
			},
		);
	}

	private copyTile(slot: number, nodeBuffer: ArrayBuffer) {
		const source = new Uint8Array(nodeBuffer);
		const target = this.nodeBuffers[slot];
		assert(source.byteLength === (this.slots[slot]?.count ?? 0) * stride);
		this.device.queue.writeBuffer(target, 0, source, 0, source.byteLength);
	}
}
