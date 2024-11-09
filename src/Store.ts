import initModule, { Sqlite3Static, Database, PreparedStatement } from "@sqlite.org/sqlite-wasm";

import { COL_COUNT, ROW_COUNT, assert, getDisplayRadius, getRadius, minRadius } from "./utils.js";

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
	public static graphURL = "https://cdn.ndimensional.xyz/2024-11-07/atlas.sqlite.gz";

	public static async create(onProgress?: (count: number, total: number) => void): Promise<Store> {
		const sqlite3 = await initModule();

		const fileHandle = await Store.getSnapshot(onProgress);
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

		return new Store(sqlite3, db);
	}

	private static async getSnapshot(onProgress?: (count: number, total: number) => void): Promise<FileSystemFileHandle> {
		const filename = "atlas.sqlite";
		const path = `${Store.snapshot}/${filename}`;

		const rootDirectory = await navigator.storage.getDirectory();
		const snapshotDirectory = await rootDirectory.getDirectoryHandle(Store.snapshot, { create: true });
		try {
			const snapshotFile = await snapshotDirectory.getFileHandle(filename, { create: false });
			console.log(`found existing database at ${path}`);
			return snapshotFile;
		} catch (err) {
			if (err instanceof DOMException && err.name === "NotFoundError") {
				const snapshotFile = await snapshotDirectory.getFileHandle(filename, { create: true });
				const writeStream = await snapshotFile.createWritable({ keepExistingData: false });

				// const graphURL = `${Store.hostURL}/${Store.databaseKey}`;
				console.log(`fetching ${Store.graphURL}`);

				const res = await fetch(Store.graphURL);
				assert(res.ok && res.body !== null);

				// Get the total size if available
				const contentLength = res.headers.get("Content-Length");
				const total = contentLength ? parseInt(contentLength, 10) : null;

				const progressStream = new TransformStream({
					transform(chunk, controller) {
						controller.enqueue(chunk);
						if (total !== null) {
							loaded += chunk.length;
							onProgress?.(loaded, total);
						}
					},
				});

				let loaded = 0;

				if (res.headers.get("Content-Type") === "application/x-gzip") {
					const decompress = new DecompressionStream("gzip");
					await res.body.pipeThrough(progressStream).pipeThrough(decompress).pipeTo(writeStream);
				} else {
					await res.body.pipeThrough(progressStream).pipeTo(writeStream);
				}

				console.log(`wrote database to ${path}`);
				return snapshotFile;
			} else {
				throw err;
			}
		}
	}

	public nodeCount: number;
	public maxMass: number = 0;

	private selectAll: PreparedStatement;
	private selectUser: PreparedStatement;
	private selectNode: PreparedStatement;
	private selectArea: PreparedStatement;
	private queryArea: PreparedStatement;

	private constructor(
		readonly sqlite3: Sqlite3Static,
		readonly db: Database,
	) {
		console.log("Initialized Store");

		{
			const selectCount = db.prepare("SELECT count(*) FROM users");
			assert(selectCount.step());
			this.nodeCount = selectCount.getInt(0) ?? 0;
			selectCount.finalize();
		}

		{
			const getMaxMass = db.prepare("SELECT max(mass) FROM nodes");
			assert(getMaxMass.step());
			this.maxMass = getMaxMass.getInt(0) ?? 0;
			getMaxMass.finalize();
		}

		this.selectAll = db.prepare(`
		  SELECT nodes.id, nodes.mass, nodes.color, users.minX, users.minY
			FROM users JOIN nodes ON users.id = nodes.id LIMIT $limit
		`);

		this.selectNode = db.prepare("SELECT nodes.mass, nodes.color FROM nodes WHERE id = $id");
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
		this.selectAll.finalize();
		this.selectUser.finalize();
		this.selectArea.finalize();
		this.queryArea.finalize();
		this.db.close();
	}

	public get(id: number): { x: number; y: number; mass: number; color: number } {
		return { ...this.locate(id), ...this.#getNode(id) };
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

	#getNode(id: number): { mass: number; color: number } {
		try {
			this.selectNode.bind({ $id: id });
			assert(this.selectNode.step(), "node not found");
			const mass = this.selectNode.getInt(0)!;
			const color = this.selectNode.getInt(1)!;
			return { mass, color };
		} finally {
			this.selectNode.reset();
		}
	}

	public *nodes(): Generator<{ id: number; mass: number; color: number; x: number; y: number }> {
		try {
			this.selectAll.bind({ $limit: this.nodeCount });
			while (this.selectAll.step()) {
				const id = this.selectAll.getInt(0)!;
				const mass = this.selectAll.getInt(1)!;
				const color = this.selectAll.getInt(2)!;
				const x = this.selectAll.getFloat(3)!;
				const y = this.selectAll.getFloat(4)!;
				yield { id, x, y, color, mass };
			}
		} finally {
			this.selectAll.reset();
		}
	}

	public query(x: number, y: number, scale: number): { id: number; x: number; y: number } | null {
		const displayRadius = getDisplayRadius(scale);

		let target: { id: number; x: number; y: number; dist: number } | null = null;
		this.queryArea.bind({ $x: x, $y: y, $r: displayRadius });
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
				const { mass, color: label } = this.#getNode(target.id);
				console.log({ id: target.id, mass, label, x: target.x, y: target.y });
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
