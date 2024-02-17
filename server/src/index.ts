import fs from "node:fs";
import assert from "node:assert";
import stream from "node:stream";
import http from "node:http";
import express from "express";
import Database from "better-sqlite3";
import { StatusCodes } from "http-status-codes";
import stoppable from "stoppable";

const { HOST, PORT, DATABASE, SNAPSHOT } = process.env;
const path = DATABASE ?? "nodes.sqlite";
const host = HOST ?? "https://cdn.ndimensional.xyz";

if (fs.existsSync(path)) {
	console.log("database exists");
} else {
	const url = `${host}/${SNAPSHOT}/nodes.sqlite.gz`;
	console.log("downloading database from", url);

	const res = await fetch(url);
	assert(res.ok);
	assert(res.body !== null);

	const writer = fs.createWriteStream(path);
	if (res.headers.get("content-type") === "application/x-gzip") {
		const decompress = new DecompressionStream("gzip");
		await res.body.pipeThrough(decompress).pipeTo(stream.Writable.toWeb(writer));
	} else {
		await res.body.pipeTo(stream.Writable.toWeb(writer));
	}

	console.log("wrote database to", path);
}

const db = new Database(path, { readonly: true });
const selectDID = db.prepare("SELECT idx FROM nodes WHERE did = :did");
const selectHandle = db.prepare("SELECT idx FROM nodes WHERE handle = :handle");

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.status(StatusCodes.OK).end());

app.get("/:snapshot/profile", (req, res) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Method", "GET");

	if (req.params.snapshot !== "2024-02-09") {
		return res.status(StatusCodes.NOT_FOUND).end();
	}

	console.log("GET", req.url);

	if (typeof req.query.q !== "string") {
		return res.status(StatusCodes.BAD_REQUEST).end();
	}

	const q = decodeURIComponent(req.query.q);
	if (q.startsWith("did:plc:") || q.startsWith("did:web:")) {
		const { idx }: { idx?: number } = selectDID.get({ did: q }) ?? {};
		if (idx !== undefined) {
			return res.json({ idx });
		} else {
			return res.status(StatusCodes.NOT_FOUND).end();
		}
	} else {
		const { idx }: { idx?: number } = selectHandle.get({ handle: q }) ?? {};
		if (idx !== undefined) {
			return res.json({ idx });
		} else {
			return res.status(StatusCodes.NOT_FOUND).end();
		}
	}
});

const port = parseInt(PORT ?? "8000");
stoppable(http.createServer(app)).listen(port, () => console.log(`listening on http://localhost:${port}`));
