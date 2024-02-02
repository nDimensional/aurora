import initSqlJs, { SqlJsStatic, Database, Statement } from "sql.js";

import sqlWasmURL from "../sql-wasm.wasm?url";
import graphURL from "../../graph-100000.sqlite?url";

export class Store {
	public static async create(): Promise<Store> {
		const sqlite = await initSqlJs({
			locateFile: (file) => {
				if (file === "sql-wasm.wasm") {
					return sqlWasmURL;
				} else {
					throw new Error("not found");
				}
			},
		});

		const db = await fetch(graphURL)
			.then((res) => res.blob())
			.then((blob) => blob.arrayBuffer())
			.then((buffer) => new sqlite.Database(new Uint8Array(buffer)));

		return new Store(sqlite, db);
	}

	public nodeCount = 100000;

	select: Statement;
	constructor(readonly sqlite: SqlJsStatic, readonly db: Database) {
		console.log("Initialized Store");
		this.select = db.prepare("SELECT minX as x, minY as y, minZ as z FROM atlas");
	}

	public close() {
		this.select.free();
		this.db.close();
	}

	public *nodes(): Iterable<{ x: number; y: number; z: number }> {
		try {
			while (this.select.step()) {
				yield this.select.getAsObject() as { x: number; y: number; z: number };
			}
		} finally {
			this.select.reset();
		}
	}
}
