import logger from "weald";

import { Tile, getDensityLevels } from "./Tile.js";
import { View } from "./View.js";
import { Atlas, Target } from "./Atlas.js";
import { COL_COUNT, ROW_COUNT, assert, getRadius } from "./utils.js";

export type Area = { id: number; x: number; y: number }[];

export const emptyArea: Area = [];

export type ProgressCallback = (count: number, total: number) => void;

const log = logger("aurora:store");

export class Store {
	// public static apiURL = "http://localhost:8000";
	public static apiURL = "https://cloud-atlas-server.fly.dev";

	// public static snapshot = "2025-02-21";
	// public static baseURL = "http://slacker:3001/2025-02-21/tiles";
	// public static capacity = 80 * 4096;

	// public static snapshot = "2025-02-21-1e5";
	// public static baseURL = "/1e5";
	// public static capacity = 10000;

	public static snapshot = "2025-02-21";
	public static baseURL = "https://cdn.ndimensional.xyz/2025-02-21";
	public static capacity = 80 * 4096;

	public static async create(onProgress?: ProgressCallback): Promise<Store> {
		const tileIndex = await Store.getFile("index.json")
			.then((file) => file.text())
			.then((text) => JSON.parse(text));

		return new Store(tileIndex);
	}

	private static inflight = new Map<string, Promise<File>>();

	public static async getFile(filename: string, onProgress?: (count: number, total: number) => void): Promise<File> {
		const url = `${Store.baseURL}/${filename}`;
		const path = `${Store.snapshot}/${filename}`;

		if (Store.inflight.has(path)) {
			return Store.inflight.get(path)!;
		}

		const rootDirectory = await navigator.storage.getDirectory();
		const snapshotDirectory = await rootDirectory.getDirectoryHandle(Store.snapshot, { create: true });
		try {
			const snapshotFile = await snapshotDirectory.getFileHandle(filename, { create: false });
			log("found existing file at %s", path);
			return await snapshotFile.getFile();
		} catch (err) {
			if (err instanceof DOMException && err.name === "NotFoundError") {
				const snapshotFile = await snapshotDirectory.getFileHandle(filename, { create: true });
				if (snapshotFile.createWritable === undefined) {
					throw new Error(
						"FileSystemFileHandle.createWritable not implemented - your browser doesn't support the entire OPFS API :(",
					);
				}

				log("fetching %s > %s", url, path);
				const request = Store.fetch(url, snapshotFile, onProgress);
				Store.inflight.set(path, request);

				try {
					return await request;
				} catch (err) {
					await snapshotDirectory.removeEntry(filename);
					throw err;
				} finally {
					Store.inflight.delete(path);
				}
			} else {
				throw err;
			}
		}
	}

	private static async fetch(
		url: string,
		fileHandle: FileSystemFileHandle,
		onProgress?: (count: number, total: number) => void,
	): Promise<File> {
		const writeStream = await fileHandle.createWritable({ keepExistingData: false });

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
						onProgress(loaded, total);
					}
				},
			});

			transforms.push(progressTransform);
		}

		if (res.headers.get("Content-Type") === "application/x-gzip") {
			const decompressTransform = new DecompressionStream("gzip");
			transforms.push(decompressTransform);
		}

		const chunks: Uint8Array[] = [];
		const sinkTransform = new TransformStream({
			transform(chunk, controller) {
				controller.enqueue(chunk);
				chunks.push(chunk);
			},
		});
		transforms.push(sinkTransform);

		await transforms.reduce((stream, transform) => stream.pipeThrough(transform), res.body).pipeTo(writeStream);
		log("wrote file to %s", fileHandle.name);
		return new File(chunks, fileHandle.name);
	}

	public readonly densityLevels: number[];

	private constructor(public readonly rootTile: Tile) {
		log("Initialized Store");
		log(rootTile);

		this.densityLevels = getDensityLevels(rootTile);
		log("density levels: %o", this.densityLevels);
	}

	public close() {}

	public async locate(id: number): Promise<{ x: number; y: number }> {
		const key = id.toString(16).padStart(8, "0");
		const res = await fetch(`${Store.apiURL}/api/locate/${key}`);
		assert(res.ok, "failed to fetch route /api/locate/${key}");
		return await res.json();
	}

	public async query(tiles: Tile[], x: number, y: number, scale: number, signal?: AbortSignal): Promise<Target | null> {
		const r = getRadius(scale);
		const leafTiles = tiles.filter((tile) => tile.atlas !== undefined);
		let result: Target | null = null;
		await Promise.all(
			leafTiles.map((tile) =>
				Store.getAtlas(tile).then(
					(atlas) => {
						const target = atlas.getNearestBody(x, y);
						if (target.distance < (result?.distance ?? r)) {
							result = target;
						}
					},
					(err) => log("failed to fetch atlas: %O", err),
				),
			),
		);

		return result;
	}

	public async query2(
		tiles: Tile[],
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
		if (result === null || Math.sqrt(Math.pow(result.x - x, 2) + Math.pow(result.y - y, 2)) > r) {
			return null;
		} else {
			return result;
		}
	}

	public static areaLimit = ROW_COUNT * COL_COUNT - 1;

	public static atlasCache = new Map<string, Atlas>();

	public static async getAtlas(tile: Tile): Promise<Atlas> {
		assert(tile.atlas !== undefined, "internal error - expected tile.atlas !== undefined");
		// assert(tile.index !== undefined, "internal error - expected tile.index !== undefined");
		let atlas = Store.atlasCache.get(tile.atlas);
		if (atlas === undefined) {
			const atlasBuffer = await Store.getFile(tile.atlas).then((file) => file.arrayBuffer());
			// const [atlasBuffer, indexBuffer] = await Promise.all([
			// 	Store.getFile(tile.atlas).then((file) => file.arrayBuffer()),
			// 	Store.getFile(tile.index).then((file) => file.arrayBuffer()),
			// ]);

			atlas = new Atlas(tile, atlasBuffer);
			// atlas = new Atlas(tile, atlasBuffer, indexBuffer);
			Store.atlasCache.set(tile.atlas, atlas);
		}

		return atlas;
	}

	public static areaBuffer = new ArrayBuffer(Store.areaLimit * 3 * 4);
	public static areaView = new DataView(Store.areaBuffer);

	public async getArea(view: View, tiles: Tile[], signal?: AbortSignal): Promise<Area> {
		const leafTiles = tiles.filter((tile) => tile.atlas !== undefined);
		const bodies: { id: number; x: number; y: number }[] = [];
		await Promise.all(
			leafTiles.map((tile) =>
				Store.getAtlas(tile).then(
					(atlas) => {
						for (const body of atlas.getBodies(view)) {
							if (bodies.length >= Store.areaLimit) {
								break;
							}

							bodies.push(body);
						}
					},
					(err) => log("failed to fetch atlas: %O", err),
				),
			),
		);

		bodies.sort((a, b) => (a.id < b.id ? -1 : b.id < a.id ? 1 : 0));
		return bodies;
	}

	// public async getArea2(view: View, tiles: Tile[], signal?: AbortSignal): Promise<Area> {
	// 	const atlasIds: string[] = [];
	// 	for (const tile of tiles) {
	// 		if (tile.atlas !== undefined) {
	// 			atlasIds.push(tile.atlas);
	// 		}
	// 	}
	// 	Promise.all(atlasIds.map((atlas) => Store.getFile(atlas))).then((files) => {
	// 		files;
	// 	});
	// 	const query = Object.entries(view)
	// 		.map((entry) => entry.join("="))
	// 		.join("&");
	// 	const res = await fetch(`http://slacker:3000/api/${Store.snapshot}/area?${query}`, { signal });
	// 	const result: [id: number, x: number, y: number][] = await res.json();
	// 	const bodies = result.map(([id, x, y]) => ({ id, x, y }));
	// 	bodies.sort((a, b) => (a.id < b.id ? -1 : b.id < a.id ? 1 : 0));
	// 	return bodies;
	// }
}
