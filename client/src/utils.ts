export function assert(condition: boolean, message?: string): asserts condition {
	if (!condition) {
		throw new Error(message ?? "assert failed");
	}
}

export const TEXTURE_DIMENSIONS = { width: 8192, height: 8192 };
export const AVATAR_DIMENSIONS = { width: 128, height: 128 };
export const ROW_COUNT = Math.floor(TEXTURE_DIMENSIONS.width / AVATAR_DIMENSIONS.width);
export const COL_COUNT = Math.floor(TEXTURE_DIMENSIONS.height / AVATAR_DIMENSIONS.height);

const linkHeaderPattern = /^<(did:.*)>; rel="self"$/;

export async function fetchAvatar(idx: number): Promise<{ did?: string; avatar?: ImageBitmap }> {
	const res = await fetch(`http://localhost:3000/${idx}`, {});
	const link = res.headers.get("Link");
	if (link === null) {
		return {};
	}

	const [_, did = null] = linkHeaderPattern.exec(link) ?? [];
	if (did === null) {
		return {};
	}

	if (res.ok) {
		const avatar = await res
			.blob()
			.then((blob) =>
				createImageBitmap(blob, { resizeWidth: AVATAR_DIMENSIONS.width, resizeHeight: AVATAR_DIMENSIONS.height })
			);
		return { did, avatar };
	} else {
		return { did };
	}
}

export const map = (a: number, b: number, c: number, d: number, x: number) => ((d - c) * (x - a)) / (b - a) + c;

// const minRadius = 1;
const minRadius = 3;

export function getMinZ(scale: number) {
	const mass = map(3, 50, 0, 80, minRadius / scale);
	if (mass < 0) {
		return 0;
	} else {
		return Math.pow(mass, 2);
	}
}
