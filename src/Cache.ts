import PQueue from "p-queue";

import { AVATAR_DIMENSIONS, COL_COUNT, ROW_COUNT } from "./utils.js";

const { width, height } = AVATAR_DIMENSIONS;

const getKey = (id: number) => id.toString(16).padStart(8, "0");
const getImageURL = (id: number) => `https://cdn.ndimensional.xyz/avatar_thumbnail/${getKey(id)}`;

export class Cache {
	public static MAX_QUEUE_SIZE = ROW_COUNT * COL_COUNT;
	public static async create() {
		const defaultImage = await createImageBitmap(new ImageData(width, height));
		return new Cache(defaultImage);
	}

	private readonly images = new Map<number, ImageBitmap>();
	private readonly loading = new Map<number, { controller: AbortController; promise: Promise<ImageBitmap> }>();
	// private readonly pending = new Map<number, AbortController>();
	private readonly queue = new PQueue({ concurrency: 50 });

	private constructor(private readonly defaultImage: ImageBitmap) {
		this.images.set(0, defaultImage);
	}

	public get(id: number): ImageBitmap | undefined {
		return this.images.get(id);
	}

	public has(id: number): boolean {
		return this.images.has(id);
	}

	public cancel(id: number) {
		this.loading.get(id)?.controller.abort();
	}

	public queueSize() {
		return this.queue.size + this.queue.pending;
	}

	public async fetch(id: number): Promise<ImageBitmap> {
		if (this.loading.has(id)) {
			return this.loading.get(id)!.promise;
		}

		if (this.queue.size + this.queue.pending > Cache.MAX_QUEUE_SIZE) {
			return Promise.reject(new Error("OVERFLOW"));
		}

		const controller = new AbortController();
		const promise = this.#fetch(id, controller.signal);
		this.loading.set(id, { promise, controller });
		promise.finally(() => void this.loading.delete(id));
		return promise;
	}

	async #fetch(id: number, signal: AbortSignal): Promise<ImageBitmap> {
		const image = await this.queue.add(async () => {
			if (signal.aborted) {
				return;
			}

			try {
				const url = getImageURL(id);
				const res = await fetch(url, { signal });
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
			} catch (err) {
				return;
			}
		});

		return image ?? this.defaultImage;
	}
}
