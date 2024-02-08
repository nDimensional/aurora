import initModule, { Sqlite3Static, Database, PreparedStatement } from "@sqlite.org/sqlite-wasm";

import sqlWasmURL from "../sql-wasm-f32.wasm?url";
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

	public nodeCount = 100;
	// public nodeCount = 100000;
	// public nodeCount = 1595050;

	select: PreparedStatement;
	selectArea: PreparedStatement;
	constructor(readonly sqlite3: Sqlite3Static, readonly db: Database) {
		console.log("Initialized Store");
		this.select = db.prepare("SELECT minX as x, minY as y, minZ as z FROM atlas");
		this.selectArea = db.prepare(
			`SELECT idx FROM atlas WHERE (
				minX >= $minX AND maxX <= $maxX AND minY >= $minY AND maxY <= $maxY AND minZ >= $minZ
			) LIMIT $limit`
		);
	}

	public close() {
		this.select.finalize();
		this.selectArea.finalize();
		this.db.close();
	}

	public *nodes(): Iterable<{ x: number; y: number; z: number }> {
		try {
			while (this.select.step()) {
				const x = this.select.get(0) as number;
				const y = this.select.get(1) as number;
				const z = this.select.get(2) as number;
				yield { x, y, z };
				// yield this.select.getAsObject() as { x: number; y: number; z: number };
			}
		} finally {
			this.select.reset();
		}
	}

	public *getArea(
		minX: number,
		maxX: number,
		minY: number,
		maxY: number,
		minZ: number,
		limit: number
	): Iterable<number> {
		this.selectArea.bind({
			$minX: minX,
			$maxX: maxX,
			$minY: minY,
			$maxY: maxY,
			$minZ: minZ,
			$limit: limit,
		});

		try {
			while (this.selectArea.step()) {
				yield this.selectArea.get(0) as number;
			}
		} finally {
			this.selectArea.reset();
		}
	}
}
