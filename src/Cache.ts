import { AVATAR_DIMENSIONS } from "./utils.js";

const { width, height } = AVATAR_DIMENSIONS;

const getKey = (id: number) => id.toString(16).padStart(8, "0");
const getImageURL = (id: number) => `https://cdn.ndimensional.xyz/avatar_thumbnail/${getKey(id)}`;

export class Cache {
	public static async create() {
		const defaultImage = await createImageBitmap(new ImageData(width, height));
		return new Cache(defaultImage);
	}

	private readonly images = new Map<number, ImageBitmap>();

	private constructor(private readonly defaultImage: ImageBitmap) {
		this.images.set(0, defaultImage);
	}

	public get(id: number): ImageBitmap | undefined {
		return this.images.get(id);
	}

	public has(id: number): boolean {
		return this.images.has(id);
	}

	private loading = new Map<number, Promise<ImageBitmap>>();

	public async fetch(id: number): Promise<ImageBitmap> {
		if (this.loading.has(id)) {
			return this.loading.get(id)!;
		} else {
			const p = this.#fetch(id);
			this.loading.set(id, p);
			p.finally(() => void this.loading.delete(id));
			return p;
		}
	}

	async #fetch(id: number): Promise<ImageBitmap> {
		const url = getImageURL(id);
		const res = await fetch(url, {});
		if (res.ok) {
			const blob = await res.blob();
			const image = await createImageBitmap(blob, { resizeWidth: width, resizeHeight: height });
			this.images.set(id, image);
			return image;
		} else {
			await res.body?.cancel();
			this.images.set(id, this.defaultImage);
			return this.defaultImage;
		}
	}
}
