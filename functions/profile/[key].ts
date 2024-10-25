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

export const onRequestGet: PagesFunction<Env, "key"> = async (context) => {
	const { DB } = context.env;

	const { key } = context.params;
	const keyPattern = /^[0-9a-f]{8}$/;
	if (typeof key !== "string" || !keyPattern.test(key)) {
		return new Response(null, { status: 404, statusText: "Not Found" });
	}

	const id = parseInt(key, 16);
	const stmt = DB.prepare("SELECT id, did, handle, display_name, description FROM profiles WHERE id = ?");
	const profile: Profile | null = await stmt.bind(id).first<Profile>();
	return Response.json({ profile });
};
