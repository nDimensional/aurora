import assert from "node:assert";
import { setTimeout } from "node:timers/promises";

import Database from "better-sqlite3";
import api from "@atproto/api";
const { BskyAgent } = api;

const agent = new BskyAgent({ service: "https://bsky.social" });

await agent
	.login({ identifier: "syntacrobat.xyz", password: "wrlh-dc55-4w46-6gzv" })
	.then((res) => assert(res.success, "res.success"));

const graph = new Database("/Users/joel/Projects/cloud-atlas/graph.sqlite", { readonly: true });
const db = new Database("data/graph-100.sqlite", {});

const selectDID = graph.prepare("SELECT did FROM users WHERE id = :id");
const updateNode = db.prepare("UPDATE nodes SET did = :did, avatar = :avatar WHERE id = :id");
const selectAvatar = db.prepare("SELECT avatar FROM nodes WHERE idx = :idx");

for (const { id, idx } of db.prepare("SELECT id, idx FROM nodes ORDER BY idx ASC").all()) {
	const { did } = selectDID.get({ id });
	console.log(id, idx, did);

	const { avatar } = selectAvatar.get({ idx });
	if (avatar === null) {
		try {
			const res = await agent.getProfile({ actor: did });
			assert(res.success);
			console.log(res.data.avatar);
			updateNode.run({ id, did, avatar: res.data.avatar });
		} catch (err) {
			console.error(err);
		}

		await setTimeout(1000);
	}
}
