import { AVATAR_DIMENSIONS } from "./utils.js";

const { width, height } = AVATAR_DIMENSIONS;

export class Cache {
	public static async create() {
		const defaultImage = await createImageBitmap(new ImageData(width, height));
		return new Cache(defaultImage);
	}

	private readonly images = new Map<number, ImageBitmap>();

	private constructor(private readonly defaultImage: ImageBitmap) {
		this.images.set(0, defaultImage);
	}

	public get(idx: number): ImageBitmap | undefined {
		return this.images.get(idx);
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

		const promise = this.fetch(idx).finally(() => this.loading.delete(idx));
		this.loading.set(idx, promise.then());
		return promise.then();
	}

	public async fetch(idx: number): Promise<ImageBitmap> {
		const key = idx.toString(16).padStart(8, "0");
		const res = await fetch(`https://cdn.ndimensional.xyz/2024-02-08/${key}/avatar`, {});
		if (res.ok) {
			const blob = await res.blob();
			const image = await createImageBitmap(blob, { resizeWidth: width, resizeHeight: height });
			this.images.set(idx, image);
			return image;
		} else {
			await res.body?.cancel();
			this.images.set(idx, this.defaultImage);
			return this.defaultImage;
		}
	}
}

export const cache = await Cache.create();
