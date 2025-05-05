export type Profile = {
	id: number;
	did: string;
	handle: string | null;
	display_name: string | null;
	description: string | null;
};

export function assert(condition: boolean, message = "assert failed", props?: any): asserts condition {
	if (!condition) {
		console.error(message, props);
		throw new Error(message);
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

// add elements with CacheMap.set(key, value) and they'll
// get shifted out in the order they were added.
export class CacheMap<K, V> extends Map<K, V> {
	#expiration = new Map<K, number>();

	constructor(
		public readonly capacity: number,
		public readonly ttl = Infinity,
	) {
		super();
	}

	set(key: K, value: V) {
		super.set(key, value);

		if (this.size > this.capacity) {
			for (const evict of this.keys()) {
				if (this.size > this.capacity) {
					super.delete(evict);
					this.#expiration.delete(evict);
				} else {
					break;
				}
			}
		}

		this.#expiration.set(key, performance.now() + this.ttl);
		return this;
	}

	delete(key: K) {
		this.#expiration.delete(key);
		return super.delete(key);
	}

	get(key: K) {
		const result = super.get(key);
		if (result === undefined) {
			return undefined;
		}

		const expiration = this.#expiration.get(key) ?? 0;
		if (expiration < performance.now()) {
			this.delete(key);
			return undefined;
		}

		return result;
	}
}
