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

export const map = (a: number, b: number, c: number, d: number, x: number) => ((d - c) * (x - a)) / (b - a) + c;

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 4800;

export function getScale(zoom: number) {
	return 256 / ((Math.pow(zoom + 1, 2) - 1) / 256 + 256);
}

export const minRadius = 20;

export function getMinZ(scale: number) {
	if (scale > 1) {
		return 0;
	}

	const mass = minRadius / Math.sqrt(scale) - minRadius;
	return Math.pow(mass / 2, 2);
}

export function getRadius(z: number, scale: number) {
	return (minRadius + z) / getScaleRadius(scale);
}

export function getScaleRadius(scale: number) {
	// return 1;
	return Math.pow(scale, 1 / 2.5);
}
