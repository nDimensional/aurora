import http from "node:http";
import stream from "node:stream";
import Database from "better-sqlite3";

const db = new Database("data/graph-100.sqlite", { readonly: true });
const select = db.prepare("SELECT did, avatar FROM nodes WHERE idx = :idx");

const port = process.env.PORT ?? "3000";

const server = http.createServer(async (req, res) => {
	const idx = parseInt(req.url.slice(1));
	const { did = null, avatar = null } = select.get({ idx }) ?? {};
	console.log("GET", idx, did, avatar);

	if (did === null) {
		return res.writeHead(404, "Not Found").end();
	} else if (avatar === null) {
		return res.writeHead(404, "Not Found", { link: `<${did}>; rel="self"` }).end();
	} else {
		try {
			const response = await fetch(avatar);
			if (response.ok) {
				res.writeHead(200, {
					"access-control-allow-origin": "*",
					"access-control-expose-headers": "Link",
					"content-type": response.headers.get("content-type"),
					"content-disposition": response.headers.get("content-disposition"),
					"content-length": response.headers.get("content-length"),
					"cache-control": response.headers.get("cache-control"),
					Expires: response.headers.get("expires"),
					Link: `<${did}>; rel="self"`,
				});

				stream.Readable.from(response.body).pipe(res);
			} else {
				const err = await response.text();
				return res.writeHead(502).end(err);
			}
		} catch (err) {
			console.error(err);
			return res.writeHead(500).end();
		}
	}
});

server.listen(parseInt(port), () => {
	console.log(`listening on http://localhost:${port}`);
});
