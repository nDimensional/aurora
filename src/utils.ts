import { Hsluv } from "hsluv";

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
export const MAX_ZOOM = 14400;

export const minRadius = 64;

export const P = 6;

export function getRadius(scale: number) {
	return minRadius / Math.pow(scale, 1 / 2.5);
}

const hsluv = new Hsluv();

export const convert = (h: number, s: number, l: number) => {
	hsluv.hsluv_h = h;
	hsluv.hsluv_s = s;
	hsluv.hsluv_l = l;
	hsluv.hsluvToRgb();
	return [hsluv.rgb_r, hsluv.rgb_g, hsluv.rgb_b];
};
