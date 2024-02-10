import initModule, { Sqlite3Static, Database, PreparedStatement } from "@sqlite.org/sqlite-wasm";

import graphURL from "../../data/graph-100.sqlite?url";
// import graphURL from "../../graph-100000.sqlite?url";
// import graphURL from "../../graph.sqlite?url";

export class Store {
	public static async create(): Promise<Store> {
		const sqlite3 = await initModule();

		const arrayBuffer = await fetch(graphURL)
			.then((res) => res.blob())
			.then((blob) => blob.arrayBuffer());
		// .then((buffer) => new sqlite.Database(new Uint8Array(buffer)));

		/**
		 * From https://www.sqlite.org/c3ref/deserialize.html:
		 * > The deserialized database should not be in WAL mode. If the database is in WAL mode,
		 * > then any attempt to use the database file will result in an SQLITE_CANTOPEN error.
		 * > The application can set the file format version numbers (bytes 18 and 19) of the input
		 * > database P to 0x01 prior to invoking sqlite3_deserialize(D,S,P,N,M,F) to force the
		 * > database file into rollback mode and work around this limitation.
		 */
		const array = new Uint8Array(arrayBuffer);
		array[18] = 0x01;
		array[19] = 0x01;

		// assuming arrayBuffer contains the result of the above operation...
		const p = sqlite3.wasm.allocFromTypedArray(array);
		const db = new sqlite3.oo1.DB();
		const rc = sqlite3.capi.sqlite3_deserialize(
			db.pointer!,
			"main",
			p,
			arrayBuffer.byteLength,
			arrayBuffer.byteLength,
			sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_READONLY
		);

		db.checkRc(rc);

		return new Store(sqlite3, db);
	}

	public nodeCount: number;

	private select: PreparedStatement;
	private selectArea: PreparedStatement;
	private queryArea: PreparedStatement;

	private constructor(readonly sqlite3: Sqlite3Static, readonly db: Database) {
		console.log("Initialized Store");

		const count = db.prepare("SELECT count(*) FROM atlas");
		if (count.step()) {
			this.nodeCount = count.getInt(0) ?? 0;
		} else {
			throw Error("FJDKLSFJSDK");
		}
		count.finalize();

		this.select = db.prepare("SELECT idx, minX, minY, minZ FROM atlas LIMIT $limit");
		this.selectArea = db.prepare(
			`SELECT idx FROM atlas WHERE (
				($minX <= minX AND maxX <= $maxX) AND
				($minY <= minY AND maxY <= $maxY) AND
				($minZ <= minZ)
			) LIMIT $limit`
		);

		this.queryArea =
			db.prepare(`SELECT nodes.did, atlas.minX, atlas.minY FROM nodes INNER JOIN atlas ON nodes.idx = atlas.idx WHERE (
			(($x - $r) <= minX AND maxX <= ($x + $r)) AND
			(($y - $r) <= minY AND maxY <= ($y + $r))
		)`);
	}

	public close() {
		this.select.finalize();
		this.selectArea.finalize();
		this.db.close();
	}

	public *nodes(): Iterable<{ idx: number; x: number; y: number; z: number }> {
		try {
			this.select.bind({ $limit: this.nodeCount });
			while (this.select.step()) {
				const idx = this.select.getInt(0)!;
				const x = this.select.getInt(1)!;
				const y = this.select.getInt(2)!;
				const z = this.select.getInt(3)!;
				yield { idx, x, y, z: Math.sqrt(z) };
			}
		} finally {
			this.select.reset();
		}
	}

	public query(x: number, y: number, r: number): string | null {
		let min: { did: string; dist2: number } | null = null;

		this.queryArea.bind({ $x: x, $y: y, $r: r });
		try {
			while (this.queryArea.step()) {
				const did = this.queryArea.getString(0)!;
				const dx = x - this.queryArea.getInt(1)!;
				const dy = y - this.queryArea.getInt(2)!;
				const d = dx * dx + dy * dy;
				if (min === null || d < min.dist2) {
					min = { did, dist2: d };
				}
			}

			return min?.did ?? null;
		} finally {
			this.queryArea.reset();
		}
	}

	public static areaLimit = 4096;
	private areaArrayBuffer = new ArrayBuffer(4 * Store.areaLimit);
	private areaArray = new Uint32Array(this.areaArrayBuffer);

	public getArea(minX: number, maxX: number, minY: number, maxY: number, minZ: number): Uint32Array {
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

export class PingPongBuffer {
	#buffer: ArrayBuffer;
	#arrays: [Uint32Array, Uint32Array];
	#active: number = 0;

	constructor(public readonly length: number) {
		this.#buffer = new ArrayBuffer(4 * length * 2);
		this.#arrays = [new Uint32Array(this.#buffer, 0, length), new Uint32Array(this.#buffer, 4 * length, length)];
	}

	public get active(): Uint32Array {
		return this.#arrays[this.#active];
	}

	public swap() {
		this.#active = (this.#active + 1) % 2;
	}
}
