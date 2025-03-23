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

export class Store {
	public static snapshot = "2025-02-21-1e5";
	public static xURL = "http://localhost:3000/1e5/positions_x.buffer";
	public static yURL = "http://localhost:3000/1e5/positions_y.buffer";
	public static colorsURL = "http://localhost:3000/1e5/colors.buffer";

	// public static snapshot = "2025-02-21";
	// public static xURL = "http://slacker:3001/2025-02-21/positions_x.buffer";
	// public static yURL = "http://slacker:3001/2025-02-21/positions_y.buffer";
	// public static colorsURL = "http://slacker:3001/2025-02-21/colors.buffer";

	// public static snapshot = "2025-03-12-1e3";
	// public static xURL = "http://localhost:3000/1e3/positions_x.buffer";
	// public static yURL = "http://localhost:3000/1e3/positions_y.buffer";
	// public static colorsURL = "http://localhost:3000/1e3/colors.buffer";

	public static async create(onProgress?: (count: number, total: number) => void): Promise<Store> {
		const xHandle = await Store.getFile(Store.xURL, "positions_x.buffer");
		const yHandle = await Store.getFile(Store.yURL, "positions_y.buffer");
		const colorsHandle = await Store.getFile(Store.colorsURL, "colors.buffer");

		const xFile = await xHandle.getFile();
		const yFile = await yHandle.getFile();

		const xBuffer = await xFile.arrayBuffer();
		const yBuffer = await yFile.arrayBuffer();

		const colorsFile = await colorsHandle.getFile();
		const colorsBuffer = await colorsFile.arrayBuffer();

		return new Store(xBuffer, yBuffer, colorsBuffer);
	}

	private static async getFile(
		url: string,
		filename: string,
		onProgress?: (count: number, total: number) => void,
	): Promise<FileSystemFileHandle> {
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

	public readonly nodeCount: number;

	private constructor(
		public readonly xBuffer: ArrayBuffer,
		public readonly yBuffer: ArrayBuffer,
		public readonly colorsBuffer: ArrayBuffer,
	) {
		console.log("Initialized Store");
		assert(xBuffer.byteLength === colorsBuffer.byteLength);
		assert(yBuffer.byteLength === colorsBuffer.byteLength);
		this.nodeCount = colorsBuffer.byteLength / 4;
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
