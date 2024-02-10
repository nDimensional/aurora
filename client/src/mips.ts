export function getMipLevelCount(...sizes: number[]) {
	const maxSize = Math.max(...sizes);
	return (1 + Math.log2(maxSize)) | 0;
}

export interface MipData {
	data: Uint8Array;
	width: number;
	height: number;
}

export function generateMips(src: Uint8Array, srcWidth: number): MipData[] {
	const srcHeight = src.length / 4 / srcWidth;

	// populate with first mip level (base level)
	let mip = { data: src, width: srcWidth, height: srcHeight };
	const mips = [mip];

	while (mip.width > 1 || mip.height > 1) {
		mip = createNextMipLevelRgba8Unorm(mip);
		mips.push(mip);
	}

	return mips;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: Uint8Array, b: Uint8Array, t: number) => a.map((v, i) => lerp(v, b[i], t));
const bilinearFilter = (tl: Uint8Array, tr: Uint8Array, bl: Uint8Array, br: Uint8Array, t1: number, t2: number) => {
	const t = mix(tl, tr, t1);
	const b = mix(bl, br, t1);
	return mix(t, b, t2);
};

function createNextMipLevelRgba8Unorm({ data: src, width: srcWidth, height: srcHeight }: MipData) {
	// compute the size of the next mip
	const dstWidth = Math.max(1, (srcWidth / 2) | 0);
	const dstHeight = Math.max(1, (srcHeight / 2) | 0);
	const dst = new Uint8Array(dstWidth * dstHeight * 4);

	const getSrcPixel = (x: number, y: number) => {
		const offset = (y * srcWidth + x) * 4;
		return src.subarray(offset, offset + 4);
	};

	for (let y = 0; y < dstHeight; ++y) {
		for (let x = 0; x < dstWidth; ++x) {
			// compute texcoord of the center of the destination texel
			const u = (x + 0.5) / dstWidth;
			const v = (y + 0.5) / dstHeight;

			// compute the same texcoord in the source - 0.5 a pixel
			const au = u * srcWidth - 0.5;
			const av = v * srcHeight - 0.5;

			// compute the src top left texel coord (not texcoord)
			const tx = au | 0;
			const ty = av | 0;

			// compute the mix amounts between pixels
			const t1 = au % 1;
			const t2 = av % 1;

			// get the 4 pixels
			const tl = getSrcPixel(tx, ty);
			const tr = getSrcPixel(tx + 1, ty);
			const bl = getSrcPixel(tx, ty + 1);
			const br = getSrcPixel(tx + 1, ty + 1);

			// copy the "sampled" result into the dest.
			const dstOffset = (y * dstWidth + x) * 4;
			dst.set(bilinearFilter(tl, tr, bl, br, t1, t2), dstOffset);
		}
	}
	return { data: dst, width: dstWidth, height: dstHeight };
}
