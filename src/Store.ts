import initModule, { Database, PreparedStatement } from "@sqlite.org/sqlite-wasm";

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
	public static snapshot = "2024-11-07";
	public static graphURL = "https://cdn.ndimensional.xyz/2024-11-07/users.sqlite.gz";
	public static positionsURL = "https://cdn.ndimensional.xyz/2024-11-07/positions.buffer.gz";
	public static colorsURL = "https://cdn.ndimensional.xyz/2024-11-07/colors.buffer.gz";

	public static async create(onProgress?: (count: number, total: number) => void): Promise<Store> {
		const positionsHandle = await Store.getFile(Store.positionsURL, "positions.buffer");
		const colorsHandle = await Store.getFile(Store.colorsURL, "colors.buffer");
		const databaseHandle = await Store.getFile(Store.graphURL, "atlas.sqlite", onProgress);
		const db = await Store.getDatabase(databaseHandle);

		const positionsFile = await positionsHandle.getFile();
		const positionsBuffer = await positionsFile.arrayBuffer();

		const colorsFile = await colorsHandle.getFile();
		const colorsBuffer = await colorsFile.arrayBuffer();

		return new Store(db, positionsBuffer, colorsBuffer);
	}

	private static async getDatabase(fileHandle: FileSystemFileHandle): Promise<Database> {
		const sqlite3 = await initModule();

		const file = await fileHandle.getFile();
		const arrayBuffer = await file.arrayBuffer();
		const array = new Uint8Array(arrayBuffer);

		/**
		 * From https://www.sqlite.org/c3ref/deserialize.html:
		 * > The deserialized database should not be in WAL mode. If the database is in WAL mode,
		 * > then any attempt to use the database file will result in an SQLITE_CANTOPEN error.
		 * > The application can set the file format version numbers (bytes 18 and 19) of the input
		 * > database P to 0x01 prior to invoking sqlite3_deserialize(D,S,P,N,M,F) to force the
		 * > database file into rollback mode and work around this limitation.
		 */
		// const array = new Uint8Array(arrayBuffer);
		array[18] = 0x01;
		array[19] = 0x01;

		// assuming arrayBuffer contains the result of the above operation...
		const p = sqlite3.wasm.allocFromTypedArray(array);
		const db = new sqlite3.oo1.DB();
		const rc = sqlite3.capi.sqlite3_deserialize(
			db.pointer!,
			"main",
			p,
			array.length,
			array.length,
			sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_READONLY,
		);

		db.checkRc(rc);

		return db;
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
			const snapshotFile = await snapshotDirectory.getFileHandle(filename, {
				create: false,
			});
			console.log(`found existing file at ${path}`);
			return snapshotFile;
		} catch (err) {
			if (err instanceof DOMException && err.name === "NotFoundError") {
				const snapshotFile = await snapshotDirectory.getFileHandle(filename, {
					create: true,
				});
				const writeStream = await snapshotFile.createWritable({
					keepExistingData: false,
				});

				console.log(`fetching ${url} > ${path}`);

				const res = await fetch(url);
				assert(res.ok && res.body !== null);

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

				console.log(`wrote file to ${path}`);
				return snapshotFile;
			} else {
				throw err;
			}
		}
	}

	public readonly nodeCount: number;

	private selectUser: PreparedStatement;

	private selectArea: PreparedStatement;
	private queryArea: PreparedStatement;

	private constructor(
		readonly db: Database,
		public readonly positionsBuffer: ArrayBuffer,
		public readonly colorsBuffer: ArrayBuffer,
	) {
		console.log("Initialized Store");

		{
			const selectCount = db.prepare("SELECT count(*) FROM users");
			assert(selectCount.step());
			this.nodeCount = selectCount.getInt(0) ?? 0;
			selectCount.finalize();
		}

		this.selectUser = db.prepare("SELECT users.minX, users.minY FROM users WHERE id = $id");
		this.selectArea = db.prepare(`
  		SELECT id, minX, minY
      FROM users
      WHERE (($minX <= minX AND maxX <= $maxX)
        AND ($minY <= minY AND maxY <= $maxY))
      LIMIT $limit
		`);

		this.queryArea = db.prepare(`
  		SELECT id, minX, minY
  		FROM users
  		WHERE ((($x - $r) <= minX AND maxX <= ($x + $r))
  		  AND (($y - $r) <= minY AND maxY <= ($y + $r)))
		`);
	}

	public close() {
		this.selectUser.finalize();
		this.selectArea.finalize();
		this.queryArea.finalize();
		this.db.close();
	}

	public locate(id: number): { x: number; y: number } {
		try {
			this.selectUser.bind({ $id: id });
			assert(this.selectUser.step(), "node not found");
			const x = this.selectUser.getInt(0)!;
			const y = this.selectUser.getInt(1)!;
			return { x, y };
		} finally {
			this.selectUser.reset();
		}
	}

	public query(x: number, y: number, scale: number): { id: number; x: number; y: number } | null {
		const r = getRadius(scale);

		let target: { id: number; x: number; y: number; dist: number } | null = null;
		this.queryArea.bind({ $x: x, $y: y, $r: r });
		try {
			while (this.queryArea.step()) {
				const id = this.queryArea.getInt(0)!;
				const nodeX = this.queryArea.getFloat(1)!;
				const nodeY = this.queryArea.getFloat(2)!;
				const dx = x - nodeX;
				const dy = y - nodeY;
				const dist = Math.sqrt(dx * dx + dy * dy);

				if (target === null || dist < target.dist) {
					target = { id, x: nodeX, y: nodeY, dist };
				}
			}

			if (target !== null) {
				return { id: target.id, x: target.x, y: target.y };
			}

			return null;
		} finally {
			this.queryArea.reset();
		}
	}

	public static areaLimit = ROW_COUNT * COL_COUNT - 1;
	private areaIdArrayBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaXArrayBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaYArrayBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaIdArray = new Uint32Array(this.areaIdArrayBuffer);
	private areaXArray = new Float32Array(this.areaXArrayBuffer);
	private areaYArray = new Float32Array(this.areaYArrayBuffer);

	public getArea(minX: number, maxX: number, minY: number, maxY: number): Area {
		this.selectArea.bind({
			$minX: minX,
			$maxX: maxX,
			$minY: minY,
			$maxY: maxY,
			$limit: Store.areaLimit,
		});

		try {
			const avatars: { id: number; x: number; y: number }[] = [];
			while (this.selectArea.step()) {
				avatars.push({
					id: this.selectArea.getInt(0)!,
					x: this.selectArea.getFloat(1)!,
					y: this.selectArea.getFloat(2)!,
				});
			}

			avatars.sort((a, b) => (a.id < b.id ? -1 : 1));

			for (const [i, { id, x, y }] of avatars.entries()) {
				this.areaIdArray[i] = id;
				this.areaXArray[i] = x;
				this.areaYArray[i] = y;
			}

			return {
				id: this.areaIdArray.subarray(0, avatars.length),
				x: this.areaXArray.subarray(0, avatars.length),
				y: this.areaYArray.subarray(0, avatars.length),
			};
		} finally {
			this.selectArea.reset();
		}
	}
}
