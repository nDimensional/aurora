import { Tile } from "./Tile.js";
import { View, contains } from "./View.js";

export type Target = { id: number; x: number; y: number; distance: number };

enum Quadrant {
	ne = 0,
	nw = 1,
	sw = 2,
	se = 3,
}

// We can pack both nodes and leaves into 16 bytes total,
// while still distinguishing between them.
//
// All values are little-endian.
//
// Intermediate nodes hold up to four links
// [ ne: u32, nw: u32, sw: u32, se: u32 ]
// and use NULL for empty slots.
// these values are "idx" indices into the node array.
//
// Leaf nodes have [ id: u32, x: f32, y: f32, 0: u32 ]
// The last slot node.se = 0 distinguishes leaves from nodes,
// since nodes can never link to index zero.
// the id value here is NOT an index into the array;
// it is an external opaque identifier.

class Area {
	public constructor(
		readonly r: number, // radius of the square
		readonly x: number, // center-x of the square
		readonly y: number, // center-y of the square
	) {}

	public getMinDist2(x: number, y: number): number {
		const dx = Math.max(Math.abs(x - this.x) - this.r, 0);
		const dy = Math.max(Math.abs(y - this.y) - this.r, 0);
		return dx * dx + dy * dy;
	}

	public divide(quadrant: Quadrant): Area {
		const halfR = this.r / 2;
		if (quadrant === Quadrant.ne) {
			return new Area(halfR, this.x + halfR, this.y + halfR);
		} else if (quadrant === Quadrant.nw) {
			return new Area(halfR, this.x - halfR, this.y + halfR);
		} else if (quadrant === Quadrant.sw) {
			return new Area(halfR, this.x - halfR, this.y - halfR);
		} else if (quadrant === Quadrant.se) {
			return new Area(halfR, this.x + halfR, this.y - halfR);
		} else {
			throw new Error("invalid quadrant");
		}
	}

	public contains(x: number, y: number): boolean {
		const minX = this.x - this.r;
		const maxX = this.x + this.r;
		const minY = this.y - this.r;
		const maxY = this.y + this.r;
		if (x < minX || maxX < x) return false;
		if (y < minY || maxY < y) return false;
		return true;
	}

	public intersectArea(other: Area): boolean {
		const l = this.r + other.r;
		const dx = Math.abs(this.x - other.x);
		const dy = Math.abs(this.y - other.y);
		return dx < l && dy < l;
	}

	public intersectView(other: View): boolean {
		const minX = this.x - this.r;
		const maxX = this.x + this.r;
		const minY = this.y - this.r;
		const maxY = this.y + this.r;
		if (maxX < other.minX || other.maxX < minX) return false;
		if (maxY < other.minY || other.maxY < minY) return false;
		return true;
	}
}

export class Atlas {
	public static NULL = 0xffffffff;
	public static stride = 16;

	public readonly view: DataView;
	public readonly area: Area;

	public constructor(
		public readonly tile: Tile,
		public readonly atlasBuffer: ArrayBuffer,
	) {
		this.area = new Area(tile.area.s / 2, tile.area.x, tile.area.y);
		this.view = new DataView(atlasBuffer);
	}

	public *getBodies(
		view: View = { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity },
	): IterableIterator<{ id: number; x: number; y: number }> {
		yield* this.#getBodies(this.area, 0, view);
	}

	*#getBodies(area: Area, idx: number, view: View): IterableIterator<{ id: number; x: number; y: number }> {
		// Check if this is a leaf node (se quadrant is 0)
		if (this.#getQuadrant(idx, Quadrant.se) === 0) {
			const offset = idx * Atlas.stride;
			const node = {
				id: this.#getQuadrant(idx, Quadrant.ne),
				x: this.view.getFloat32(offset + 4, true),
				y: this.view.getFloat32(offset + 8, true),
			};

			// Check if the body is within the search box
			if (contains(view, node)) {
				yield node;
			}
		} else if (area.intersectView(view)) {
			// Recursively search children
			const ne = this.#getQuadrant(idx, Quadrant.ne);
			const nw = this.#getQuadrant(idx, Quadrant.nw);
			const sw = this.#getQuadrant(idx, Quadrant.sw);
			const se = this.#getQuadrant(idx, Quadrant.se);

			if (ne !== Atlas.NULL) yield* this.#getBodies(area.divide(Quadrant.ne), ne, view);
			if (nw !== Atlas.NULL) yield* this.#getBodies(area.divide(Quadrant.nw), nw, view);
			if (sw !== Atlas.NULL) yield* this.#getBodies(area.divide(Quadrant.sw), sw, view);
			if (se !== Atlas.NULL) yield* this.#getBodies(area.divide(Quadrant.se), se, view);
		}
	}

	public getNearestBody(x: number, y: number): Target {
		const target = { id: Atlas.NULL, x: 0, y: 0, distance: Infinity };
		this.#getNearestBody(target, this.area, 0, x, y);
		target.distance = Math.sqrt(target.distance);
		return target;
	}

	#getNearestBody(target: Target, area: Area, idx: number, x: number, y: number) {
		if (this.#getQuadrant(idx, Quadrant.se) === 0) {
			const offset = idx * Atlas.stride;
			const nodeX = this.view.getFloat32(offset + 4, true);
			const nodeY = this.view.getFloat32(offset + 8, true);
			const dist2 = Math.pow(nodeX - x, 2) + Math.pow(nodeY - y, 2);
			if (dist2 < target.distance) {
				target.id = this.#getQuadrant(idx, Quadrant.ne);
				target.x = nodeX;
				target.y = nodeY;
				target.distance = dist2;
			}
		} else if (area.getMinDist2(x, y) < target.distance) {
			const ne = this.#getQuadrant(idx, Quadrant.ne);
			const nw = this.#getQuadrant(idx, Quadrant.nw);
			const sw = this.#getQuadrant(idx, Quadrant.sw);
			const se = this.#getQuadrant(idx, Quadrant.se);

			if (ne !== Atlas.NULL) this.#getNearestBody(target, area.divide(Quadrant.ne), ne, x, y);
			if (nw !== Atlas.NULL) this.#getNearestBody(target, area.divide(Quadrant.nw), nw, x, y);
			if (sw !== Atlas.NULL) this.#getNearestBody(target, area.divide(Quadrant.sw), sw, x, y);
			if (se !== Atlas.NULL) this.#getNearestBody(target, area.divide(Quadrant.se), se, x, y);
		}
	}

	#getQuadrant(idx: number, quadrant: Quadrant): number {
		const offset = idx * Atlas.stride;
		switch (quadrant) {
			case Quadrant.ne:
				return this.view.getUint32(offset + 0x00, true);
			case Quadrant.nw:
				return this.view.getUint32(offset + 0x04, true);
			case Quadrant.sw:
				return this.view.getUint32(offset + 0x08, true);
			case Quadrant.se:
				return this.view.getUint32(offset + 0x0c, true);
			default:
				throw new Error("invalid quadrant");
		}
	}
}
