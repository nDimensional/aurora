import { View } from "./View.js";

export interface Tile {
	id: string;
	total: number;
	count: number;
	level: number;
	area: { s: number; x: number; y: number };
	nodes: string;
	atlas?: string;
	index?: string;
	ne?: Tile | null;
	nw?: Tile | null;
	sw?: Tile | null;
	se?: Tile | null;
}

export function getTilesInView(tile: Tile, view: View, s: number, result: Tile[] = []): Tile[] {
	if (intersect(tile, view)) {
		if (tile.atlas !== undefined) {
			result.push(tile);
		} else if (tile.area.s <= s) {
			result.push(tile);
		} else {
			if (tile.ne) getTilesInView(tile.ne, view, s, result);
			if (tile.nw) getTilesInView(tile.nw, view, s, result);
			if (tile.sw) getTilesInView(tile.sw, view, s, result);
			if (tile.se) getTilesInView(tile.se, view, s, result);
		}
	}

	return result;
}

function intersect(tile: Tile, { minX, maxX, minY, maxY }: View): boolean {
	const { s, x, y } = tile.area;
	const s2 = s / 2;
	if (x + s2 < minX || maxX < x - s2) return false;
	if (y + s2 < minY || maxY < y - s2) return false;
	return true;
}

export function getDensityLevels(tile: Tile, densityLevels: number[] = []): number[] {
	const density = tile.count / tile.total;
	densityLevels[tile.level] = Math.min(densityLevels[tile.level] ?? 1.0, density);

	if (tile.ne) getDensityLevels(tile.ne, densityLevels);
	if (tile.nw) getDensityLevels(tile.nw, densityLevels);
	if (tile.sw) getDensityLevels(tile.sw, densityLevels);
	if (tile.se) getDensityLevels(tile.se, densityLevels);

	return densityLevels;
}
