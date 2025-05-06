import { Tile } from "./Tile.js";
import { View, viewContains } from "./View.js";

export type Target = { id: number; x: number; y: number; distance: number };

enum Quadrant {
	ne = 0,
	nw = 1,
	sw = 2,
	se = 3,
}

// We can pack both nodes and leaves into 12 bytes total,
// while still distinguishing between them.
//
// All values are big-endian.
//
// Intermediate nodes hold up to four links
// [ ne: u24, nw: u24, sw: u24, se: u24 ]
// and use 0 for empty slots.
// these values are "idx" indices into the node array.
//
// Leaf nodes have [ id: u31, x: f32, y: f32 ]
// The node id has the highest bit set to 1 to pad to a u32.
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
	public static stride = 12;

	public readonly view: DataView;
	public readonly area: Area;

	public constructor(
		public readonly tile: Tile,
		public readonly buffer: ArrayBuffer,
	) {
		this.area = new Area(tile.area.s / 2, tile.area.x, tile.area.y);
		this.view = new DataView(buffer);
	}

	public *getBodies(
		view: View = { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity },
	): IterableIterator<{ id: number; x: number; y: number }> {
		yield* this.#getBodies(this.area, 0, view);
	}

	*#getBodies(area: Area, idx: number, view: View): IterableIterator<{ id: number; x: number; y: number }> {
		const node = this.#parseNode(idx);
		if (Array.isArray(node)) {
			const [ne, nw, sw, se] = node;
			if (ne !== 0) yield* this.#getBodies(area.divide(Quadrant.ne), ne, view);
			if (nw !== 0) yield* this.#getBodies(area.divide(Quadrant.nw), nw, view);
			if (sw !== 0) yield* this.#getBodies(area.divide(Quadrant.sw), sw, view);
			if (se !== 0) yield* this.#getBodies(area.divide(Quadrant.se), se, view);
		} else {
			if (viewContains(view, node)) {
				yield node;
			}
		}
	}

	public getNearestBody(x: number, y: number): Target {
		const target = { id: 0, x: 0, y: 0, distance: Infinity };
		this.#getNearestBody(target, this.area, 0, x, y);
		target.distance = Math.sqrt(target.distance);
		return target;
	}

	#getNearestBody(target: Target, area: Area, idx: number, x: number, y: number) {
		const node = this.#parseNode(idx);
		if (Array.isArray(node)) {
			const [ne, nw, sw, se] = node;
			if (ne !== 0) this.#getNearestBody(target, area.divide(Quadrant.ne), ne, x, y);
			if (nw !== 0) this.#getNearestBody(target, area.divide(Quadrant.nw), nw, x, y);
			if (sw !== 0) this.#getNearestBody(target, area.divide(Quadrant.sw), sw, x, y);
			if (se !== 0) this.#getNearestBody(target, area.divide(Quadrant.se), se, x, y);
		} else {
			const dist2 = Math.pow(node.x - x, 2) + Math.pow(node.y - y, 2);
			if (dist2 < target.distance) {
				target.id = node.id;
				target.x = node.x;
				target.y = node.y;
				target.distance = dist2;
			}
		}
	}

	#parseNode(idx: number): { id: number; x: number; y: number } | [ne: number, nw: number, sw: number, se: number] {
		const offset = idx * Atlas.stride;

		if ((this.view.getUint8(offset) & 0x80) !== 0) {
			const id = this.view.getUint32(offset, false) & 0x7fffffff;
			const x = this.view.getFloat32(offset + 4, false);
			const y = this.view.getFloat32(offset + 8, false);
			return { id, x, y };
		} else {
			const node: [number, number, number, number] = [0, 0, 0, 0];
			for (let i = 0; i < 4; i++) {
				const a = this.view.getUint8(offset + i * 3);
				const b = this.view.getUint8(offset + i * 3 + 1);
				const c = this.view.getUint8(offset + i * 3 + 2);
				node[i] = (a << 16) | (b << 8) | c;
			}
			return node;
		}
	}
}
