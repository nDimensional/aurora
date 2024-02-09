import { AVATAR_DIMENSIONS } from "./utils.js";

const { width, height } = AVATAR_DIMENSIONS;

export class Cache {
	public static async create() {
		const defaultImage = await createImageBitmap(new ImageData(width, height));
		return new Cache(defaultImage);
	}

	private readonly images = new Map<number, ImageBitmap>();

	private constructor(private readonly defaultImage: ImageBitmap) {}

	public get(idx: number): ImageBitmap {
		return this.images.get(idx) ?? this.defaultImage;
	}

	public has(idx: number): boolean {
		return this.images.has(idx);
	}

	private loading = new Map<number, Promise<void>>();

	public load(idx: number): Promise<void> | undefined {
		if (this.images.has(idx)) {
			return;
		} else if (this.loading.has(idx)) {
			return this.loading.get(idx);
		}

		const promise = this.fetchImage(idx).finally(() => this.loading.delete(idx));
		this.loading.set(idx, promise);
		return promise;
	}

	private async fetchImage(idx: number): Promise<void> {
		const key = idx.toString(16).padStart(8, "0");
		const res = await fetch(`https://cdn.ndimensional.xyz/2024-02-08/${key}/avatar`, {});
		if (res.ok) {
			const blob = await res.blob();
			const image = await createImageBitmap(blob, { resizeWidth: width, resizeHeight: height });
			this.images.set(idx, image);
		} else {
			await res.body?.cancel();

			this.images.set(idx, this.defaultImage);
		}
	}
}

export const cache = await Cache.create();
