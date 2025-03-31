import { getDensityLevels, Tile } from "./Tile.js";
import { COL_COUNT, ROW_COUNT, assert, getRadius } from "./utils.js";

export type Area = {
	id: Uint32Array;
	x: Float32Array;
	y: Float32Array;
};

export const emptyArea: Area = {
	id: new Uint32Array([]),
	x: new Float32Array([]),
	y: new Float32Array([]),
};

export type ProgressCallback = (count: number, total: number) => void;

export class Store {
	public static snapshot = "2025-02-21";
	public static baseURL = "http://slacker:3001/2025-02-21";

	public static capacity = 80 * 4096;

	public static async create(onProgress?: ProgressCallback): Promise<Store> {
		const tileIndexBuffer = await Store.getFile("tiles/index.json");
		const tileIndex = JSON.parse(new TextDecoder().decode(new Uint8Array(tileIndexBuffer)));
		const nodeBuffer = await Store.getFile("tiles/tile-0-root-nodes");
		return new Store(nodeBuffer, tileIndex);
	}

	public static async getFile(filename: string, onProgress?: ProgressCallback) {
		const handle = await Store.getFileHandle(filename, onProgress);
		const file = await handle.getFile();
		return await file.arrayBuffer();
	}

	private static async getFileHandle(
		filename: string,
		onProgress?: (count: number, total: number) => void,
	): Promise<FileSystemFileHandle> {
		const url = `${Store.baseURL}/${filename}`;
		filename = filename.split("/").join("-");
		const path = `${Store.snapshot}/${filename}`;

		const rootDirectory = await navigator.storage.getDirectory();
		const snapshotDirectory = await rootDirectory.getDirectoryHandle(Store.snapshot, { create: true });
		try {
			const snapshotFile = await snapshotDirectory.getFileHandle(filename, { create: false });
			console.log(`found existing file at ${path}`);
			return snapshotFile;
		} catch (err) {
			if (err instanceof DOMException && err.name === "NotFoundError") {
				const snapshotFile = await snapshotDirectory.getFileHandle(filename, { create: true });
				if (snapshotFile.createWritable === undefined) {
					throw new Error(
						"FileSystemFileHandle.createWritable not implemented - your browser doesn't support the entire OPFS API :(",
					);
				}

				try {
					console.log(`fetching ${url} > ${path}`);
					await Store.fetch(url, snapshotFile, onProgress);
					console.log(`wrote file to ${path}`);
					return snapshotFile;
				} catch (err) {
					await snapshotDirectory.removeEntry(filename);
					throw err;
				}
			} else {
				throw err;
			}
		}
	}

	private static async fetch(
		url: string,
		file: FileSystemFileHandle,
		onProgress?: (count: number, total: number) => void,
	) {
		const writeStream = await file.createWritable({ keepExistingData: false });

		const res = await fetch(url);
		assert(res.ok && res.body !== null, "Failed to fetch file from CDN");

		// Get the total size if available
		const contentLength = res.headers.get("Content-Length");
		const total = contentLength ? parseInt(contentLength, 10) : null;

		const transforms: GenericTransformStream[] = [];

		if (onProgress !== undefined) {
			let loaded = 0;
			const progressTransform = new TransformStream({
				transform(chunk, controller) {
					controller.enqueue(chunk);
					if (total !== null) {
						loaded += chunk.length;
						onProgress?.(loaded, total);
					}
				},
			});

			transforms.push(progressTransform);
		}

		if (res.headers.get("Content-Type") === "application/x-gzip") {
			const decompressTransform = new DecompressionStream("gzip");
			transforms.push(decompressTransform);
		}

		await transforms.reduce((stream, transform) => stream.pipeThrough(transform), res.body).pipeTo(writeStream);
	}

	// public readonly nodeCount: number;

	public readonly densityLevels: number[];

	private constructor(
		public readonly nodeBuffer: ArrayBuffer,
		public readonly rootTile: Tile,
	) {
		console.log("Initialized Store");
		console.log(rootTile);

		this.densityLevels = getDensityLevels(rootTile);
		console.log("density levels", this.densityLevels);
	}

	public close() {}

	public locate(id: number): { x: number; y: number } {
		throw new Error("not implemented");
	}

	public async query(
		x: number,
		y: number,
		scale: number,
		signal?: AbortSignal,
	): Promise<{ id: number; x: number; y: number } | null> {
		const r = getRadius(scale);
		const query = Object.entries({ x, y, r })
			.map((entry) => entry.join("="))
			.join("&");

		const res = await fetch(`http://slacker:3000/api/${Store.snapshot}/radius?${query}`, { signal });
		const result: { id: number; x: number; y: number } | null = await res.json();
		return result;
	}

	public static areaLimit = ROW_COUNT * COL_COUNT - 1;

	public async getArea(minX: number, maxX: number, minY: number, maxY: number, signal?: AbortSignal): Promise<Area> {
		const query = Object.entries({ minX, maxX, minY, maxY })
			.map((entry) => entry.join("="))
			.join("&");

		const res = await fetch(`http://slacker:3000/api/${Store.snapshot}/area?${query}`, { signal });
		const result: [id: number, x: number, y: number][] = await res.json();

		const area: Area = {
			id: new Uint32Array(result.length),
			x: new Float32Array(result.length),
			y: new Float32Array(result.length),
		};

		for (const [i, [id, x, y]] of result.entries()) {
			area.id[i] = id;
			area.x[i] = x;
			area.y[i] = y;
		}

		return area;
	}
}
