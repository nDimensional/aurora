import initModule, { Sqlite3Static, Database, PreparedStatement } from "@sqlite.org/sqlite-wasm";

import { COL_COUNT, ROW_COUNT, assert, getRadius, scaleZ, scaleZInv } from "./utils.js";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export type Area = {
	id: Uint32Array;
	x: Float32Array;
	y: Float32Array;
	z: Float32Array;
};

export const emptyArea: Area = {
	id: new Uint32Array([]),
	x: new Float32Array([]),
	y: new Float32Array([]),
	z: new Float32Array([]),
};

export class Store {
	public static hostURL = "https://cdn.ndimensional.xyz";
	public static snapshot = "2024-09-09-1e6";
	// public static databaseKey = "atlas.sqlite.gz";
	public static databaseKey = "atlas-2024-09-09-1e6.sqlite.gz";

	// public static hostURL = "";
	// public static snapshot = "2024-09-09";
	// public static snapshot = "2024-09-09-1e6";

	// public static apiURL = "https://aurora-server-spring-hill-5575.fly.dev";
	// public static apiURL = "http://localhost:8000";

	public static async create(): Promise<Store> {
		const sqlite3 = await initModule();

		const fileHandle = await Store.getSnapshot();
		const file = await fileHandle.getFile();
		const arrayBuffer = await file.arrayBuffer();
		const array = new Uint8Array(arrayBuffer);

		console.log("got database hash", bytesToHex(sha256(array)));

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

	private static async getSnapshot(): Promise<FileSystemFileHandle> {
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

				const graphURL = `${Store.hostURL}/${Store.databaseKey}`;
				console.log(`fetching ${graphURL}`);

				const res = await fetch(graphURL);
				assert(res.ok && res.body !== null);
				if (res.headers.get("Content-Type") === "application/x-gzip") {
					const decompress = new DecompressionStream("gzip");
					await res.body.pipeThrough(decompress).pipeTo(writeStream);
				} else {
					await res.body.pipeTo(writeStream);
				}

				console.log(`wrote database to ${path}`);
				return snapshotFile;
			} else {
				throw err;
			}
		}
	}

	public nodeCount: number;
	public maxZ: number;

	private select: PreparedStatement;
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
			const selectMaxZ = db.prepare("SELECT maxZ FROM users ORDER BY maxZ DESC LIMIT 1");
			assert(selectMaxZ.step());
			this.maxZ = selectMaxZ.getInt(0) ?? 0;
			selectMaxZ.finalize();

			console.log("maxZ:", this.maxZ, scaleZ(this.maxZ));
		}

		this.select = db.prepare("SELECT id, minX, minY, minZ FROM users LIMIT $limit");
		this.selectNode = db.prepare("SELECT minX, minY, minZ FROM users WHERE id = $id");
		this.selectArea = db.prepare(
			`SELECT id, minX, minY, minZ FROM users WHERE (
				($minX <= minX AND maxX <= $maxX) AND
				($minY <= minY AND maxY <= $maxY) AND
				($minZ <= minZ)
			) LIMIT $limit`,
		);

		this.queryArea = db.prepare(`SELECT id, minX, minY, minZ FROM users WHERE (
			(($x - $r) <= minX AND maxX <= ($x + $r)) AND
			(($y - $r) <= minY AND maxY <= ($y + $r))
		)`);
	}

	public close() {
		this.select.finalize();
		this.selectNode.finalize();
		this.selectArea.finalize();
		this.queryArea.finalize();
		this.db.close();
	}

	public get(id: number): { x: number; y: number; z: number } {
		try {
			this.selectNode.bind({ $id: id });
			assert(this.selectNode.step(), "node not found");
			const x = this.selectNode.getInt(0)!;
			const y = this.selectNode.getInt(1)!;
			const z = this.selectNode.getInt(2)!;
			return { x, y, z: scaleZ(z) };
		} finally {
			this.selectNode.reset();
		}
	}

	public *nodes(): Generator<{ id: number; x: number; y: number; z: number }> {
		try {
			this.select.bind({ $limit: this.nodeCount });
			while (this.select.step()) {
				const id = this.select.getInt(0)!;
				const x = this.select.getInt(1)!;
				const y = this.select.getInt(2)!;
				const z = this.select.getInt(3)!;
				yield { id, x, y, z: scaleZ(z) };
			}
		} finally {
			this.select.reset();
		}
	}

	public query(x: number, y: number, scale: number): { id: number; x: number; y: number } | null {
		console.log("query", x, y, scale);
		console.log(this.maxZ, scaleZ(this.maxZ), getRadius(scaleZ(this.maxZ), scale, scaleZ(this.maxZ)));
		const maxR = getRadius(scaleZ(this.maxZ), scale, scaleZ(this.maxZ));

		let target: { id: number; x: number; y: number; dist: number } | null = null;
		console.log("querying", { $x: x, $y: y, $r: maxR });
		this.queryArea.bind({ $x: x, $y: y, $r: maxR });
		try {
			while (this.queryArea.step()) {
				const id = this.queryArea.getInt(0)!;
				const nodeX = this.queryArea.getInt(1)!;
				const nodeY = this.queryArea.getInt(2)!;
				const nodeZ = this.queryArea.getInt(3)!;
				const dx = x - nodeX;
				const dy = y - nodeY;
				const dist = Math.sqrt(dx * dx + dy * dy);

				const r = getRadius(scaleZ(nodeZ), scale, scaleZ(this.maxZ));

				if (dist < r) {
					if (target === null || dist < target.dist) {
						target = { id, x: nodeX, y: nodeY, dist };
					}
				}
			}

			if (target !== null) {
				return { id: target.id, x: target.x, y: target.y };
			} else {
				return null;
			}
		} finally {
			this.queryArea.reset();
		}
	}

	public static areaLimit = ROW_COUNT * COL_COUNT - 1;
	private areaIdArrayBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaXArrayBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaYArrayBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaZArrayBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaIdArray = new Uint32Array(this.areaIdArrayBuffer);
	private areaXArray = new Float32Array(this.areaXArrayBuffer);
	private areaYArray = new Float32Array(this.areaYArrayBuffer);
	private areaZArray = new Float32Array(this.areaZArrayBuffer);

	public getArea(minX: number, maxX: number, minY: number, maxY: number, minZ: number): Area {
		this.selectArea.bind({
			$minX: minX,
			$maxX: maxX,
			$minY: minY,
			$maxY: maxY,
			$minZ: minZ,
			$limit: Store.areaLimit,
		});

		try {
			const avatars: { id: number; x: number; y: number; z: number }[] = [];
			while (this.selectArea.step()) {
				avatars.push({
					id: this.selectArea.getInt(0)!,
					x: this.selectArea.getFloat(1)!,
					y: this.selectArea.getFloat(2)!,
					z: this.selectArea.getFloat(3)!,
				});
			}

			avatars.sort((a, b) => (a.id < b.id ? -1 : 1));

			for (const [i, { id, x, y, z }] of avatars.entries()) {
				this.areaIdArray[i] = id;
				this.areaXArray[i] = x;
				this.areaYArray[i] = y;
				this.areaZArray[i] = scaleZ(z);
			}

			return {
				id: this.areaIdArray.subarray(0, avatars.length),
				x: this.areaXArray.subarray(0, avatars.length),
				y: this.areaYArray.subarray(0, avatars.length),
				z: this.areaZArray.subarray(0, avatars.length),
			};
		} finally {
			this.selectArea.reset();
		}
	}
}
