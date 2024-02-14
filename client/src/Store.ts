import initModule, { Sqlite3Static, Database, PreparedStatement } from "@sqlite.org/sqlite-wasm";

import { COL_COUNT, ROW_COUNT, assert, getRadius } from "./utils.js";

export class Store {
	public static hostURL = "https://cdn.ndimensional.xyz";
	// public static snapshot = "2024-02-08";
	public static snapshot = "2024-02-09";

	public static async create(): Promise<Store> {
		const sqlite3 = await initModule();

		const fileHandle = await Store.getSnapshot();
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
			sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_READONLY
		);

		db.checkRc(rc);

		return new Store(sqlite3, db);
	}

	private static async getSnapshot(): Promise<FileSystemFileHandle> {
		const rootDirectory = await navigator.storage.getDirectory();
		const snapshotDirectory = await rootDirectory.getDirectoryHandle(Store.snapshot, { create: true });
		try {
			const snapshotFile = await snapshotDirectory.getFileHandle("atlas.sqlite", { create: false });
			console.log("found existing file in storage...");
			return snapshotFile;
		} catch (err) {
			console.log({ err });
			if (err instanceof DOMException && err.name === "NotFoundError") {
				console.log("creating file handle...");
				const snapshotFile = await snapshotDirectory.getFileHandle("atlas.sqlite", { create: true });
				const writeStream = await snapshotFile.createWritable({ keepExistingData: false });
				const res = await fetch(`${Store.hostURL}/${Store.snapshot}/atlas.sqlite.gz`);
				assert(res.ok && res.body !== null);

				console.log("streaming response to file...");
				if (res.headers.get("Content-Encoding") === "gzip") {
					await res.body.pipeTo(writeStream);
				} else if (res.headers.get("Content-Type") === "application/x-gzip") {
					const decompress = new DecompressionStream("gzip");
					await res.body.pipeThrough(decompress).pipeTo(writeStream);
				} else {
					throw new Error("unrecognized response stream");
				}

				console.log("done!");
				return snapshotFile;
			} else {
				throw err;
			}
		}
	}

	public nodeCount: number;
	public maxZ: number;

	private select: PreparedStatement;
	private selectArea: PreparedStatement;
	private queryArea: PreparedStatement;

	private constructor(readonly sqlite3: Sqlite3Static, readonly db: Database) {
		console.log("Initialized Store");

		{
			const selectCount = db.prepare("SELECT count(*) FROM atlas");
			assert(selectCount.step());
			this.nodeCount = selectCount.getInt(0) ?? 0;
			selectCount.finalize();
		}

		{
			const selectMaxZ = db.prepare("SELECT maxZ FROM atlas ORDER BY maxZ DESC LIMIT 1");
			assert(selectMaxZ.step());
			this.maxZ = selectMaxZ.getInt(0) ?? 0;
			selectMaxZ.finalize();

			console.log("maxZ:", this.maxZ);
		}

		this.select = db.prepare("SELECT idx, minX, minY, minZ FROM atlas LIMIT $limit");
		this.selectArea = db.prepare(
			`SELECT idx FROM atlas WHERE (
				($minX <= minX AND maxX <= $maxX) AND
				($minY <= minY AND maxY <= $maxY) AND
				($minZ <= minZ)
			) LIMIT $limit`
		);

		this.queryArea = db.prepare(`SELECT idx, minX, minY, minZ FROM atlas WHERE (
			(($x - $r) <= minX AND maxX <= ($x + $r)) AND
			(($y - $r) <= minY AND maxY <= ($y + $r))
		)`);
	}

	public close() {
		this.select.finalize();
		this.selectArea.finalize();
		this.queryArea.finalize();
		this.db.close();
	}

	public *nodes(): Iterable<{ idx: number; x: number; y: number; z: number }> {
		const scale = 1;
		try {
			this.select.bind({ $limit: this.nodeCount });
			while (this.select.step()) {
				const idx = this.select.getInt(0)!;
				const x = this.select.getInt(1)! * scale;
				const y = this.select.getInt(2)! * scale;
				const z = this.select.getInt(3)!;
				yield { idx, x, y, z: Math.sqrt(z) };
			}
		} finally {
			this.select.reset();
		}
	}

	public query(x: number, y: number, scale: number): { idx: number; x: number; y: number } | null {
		const maxR = getRadius(Math.sqrt(this.maxZ), scale);

		let target: { idx: number; x: number; y: number; dist: number } | null = null;

		this.queryArea.bind({ $x: x, $y: y, $r: maxR });
		try {
			while (this.queryArea.step()) {
				const idx = this.queryArea.getInt(0)!;
				const nodeX = this.queryArea.getInt(1)!;
				const nodeY = this.queryArea.getInt(2)!;
				const nodeZ = this.queryArea.getInt(3)!;
				const dx = x - nodeX;
				const dy = y - nodeY;
				const dist = Math.sqrt(dx * dx + dy * dy);

				const r = getRadius(Math.sqrt(nodeZ), scale);

				if (dist < r) {
					if (target === null || dist < target.dist) {
						target = { idx, x: nodeX, y: nodeY, dist };
					}
				}
			}

			if (target !== null) {
				return { idx: target.idx, x: target.x, y: target.y };
			} else {
				return null;
			}
		} finally {
			this.queryArea.reset();
		}
	}

	public static areaLimit = ROW_COUNT * COL_COUNT - 1;
	private areaArrayBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaArray = new Uint32Array(this.areaArrayBuffer);

	public getArea(minX: number, maxX: number, minY: number, maxY: number, minZ: number): Uint32Array {
		// console.log({ minX, maxX, minY, maxY, minZ });

		this.selectArea.bind({
			$minX: minX,
			$maxX: maxX,
			$minY: minY,
			$maxY: maxY,
			$minZ: minZ,
			$limit: Store.areaLimit,
		});

		try {
			let n = 0;
			while (this.selectArea.step()) {
				const idx = this.selectArea.getInt(0)!;
				this.areaArray[n++] = idx;
			}

			return this.areaArray.subarray(0, n).sort();
		} finally {
			this.selectArea.reset();
		}
	}
}
