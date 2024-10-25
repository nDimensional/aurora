interface Env {
	DB: D1Database;
}

type Profile = {
	id: number;
	did: string;
	handle: string | null;
	display_name: string | null;
	description: string | null;
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
	const { DB } = context.env;

	const url = new URL(context.request.url);
	const query: Record<string, string | undefined> = Object.fromEntries(
		url.search
			.slice(1)
			.split("&")
			.map((entry) => entry.split("=")),
	);

	if (query.q === undefined) {
		return new Response("Not Found", { status: 404 });
	}

	let handle = query.q;
	if (handle.startsWith("@")) handle = handle.slice(1);
	if (!handle.includes(".")) handle = `${handle}.bsky.social`;

	if (handle.startsWith("did:")) {
		const stmt = DB.prepare("SELECT id, did, handle, display_name, description FROM profiles WHERE did = ?");
		const profile: Profile | null = await stmt.bind(handle).first<Profile>();
		if (profile === null) {
			return new Response("Not Found", { status: 404 });
		} else {
			return Response.json(profile);
		}
	} else {
		const stmt = DB.prepare("SELECT id, did, handle, display_name, description FROM profiles WHERE handle = ?");
		const profile: Profile | null = await stmt.bind(handle).first<Profile>();
		if (profile === null) {
			return new Response("Not Found", { status: 404 });
		} else {
			return Response.json(profile);
		}
	}
};
