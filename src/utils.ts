export type Profile = {
	id: number;
	did: string;
	handle: string | null;
	display_name: string | null;
	description: string | null;
};

export function assert(condition: boolean, message?: string): asserts condition {
	if (!condition) {
		throw new Error(message ?? "assert failed");
	}
}

export const TEXTURE_DIMENSIONS = { width: 8192, height: 8192 };
export const AVATAR_DIMENSIONS = { width: 128, height: 128 };
export const ROW_COUNT = Math.floor(TEXTURE_DIMENSIONS.width / AVATAR_DIMENSIONS.width);
export const COL_COUNT = Math.floor(TEXTURE_DIMENSIONS.height / AVATAR_DIMENSIONS.height);

export const map = (value: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number): number => {
	return toLow + ((value - fromLow) * (toHigh - toLow)) / (fromHigh - fromLow);
};

const F = 256;
const G = 32;
export function getScale(zoom: number) {
	const x = Math.pow(zoom + 1, 2) / F + G;
	return F / x;
}

export const MIN_ZOOM = Math.sqrt(F * (F - G)) - 1;
export const MAX_ZOOM = 9600;

const A = 16;
const B = 1;
const C = 4;
const D = 2;

// export const scaleZ = (z: number) => Math.log10(z / A + 1) / B + D;
// export const scaleZInv = (z: number) => A * (Math.pow(10, B * (z - D)) - 1);
export const scaleZ = (z: number) => Math.pow(z / A + 1, 1 / C) / B + D;
export const scaleZInv = (z: number) => A * (Math.pow(B * (z - D), C) - 1);

export const maxRadius = 64;
const minRadius = 8;

export const L = 8;
export function getMinZ(scale: number, maxZ: number) {
	if (scale >= 1) {
		return 0;
	}

	const minZ = map(minRadius / scale, maxRadius, maxRadius / scale, 1, L * maxZ);
	return scaleZInv(Math.max(minZ, 1));
}

export function getRadius(z: number, scale: number, maxZ: number) {
	return map(z, 1, L * maxZ, maxRadius, maxRadius / scale);
}
