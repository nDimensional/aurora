import "./api.js";

import { map } from "./utils.js";

function project(coordinate: number, offset: number, scale: number): number {
	return (coordinate + offset) * scale + 360;
}

const minRadius = 1;

export const getMinZ = (scale: number) => map(1, 10, 0, 80, minRadius / scale);

function getRadius(scale: number, z: number) {
	return scale * map(0, 80, 1, 10, z);
}

export function render(canvas: HTMLCanvasElement, offsetX: number, offsetY: number, scale: number, ids: Uint32Array) {
	const ctx = canvas.getContext("2d");
	if (ctx === null) {
		throw new Error("failed to get drawing context");
	}

	ctx.clearRect(0, 0, 720, 720);
	// ctx.strokeStyle = "#888888";
	// for (let i = 0; i < edge_count; i++) {
	// 	const s = source[i] - 1;
	// 	const t = target[i] - 1;

	// 	const source_x = project(window.x[s], offsetX, scale);
	// 	const source_y = project(window.y[s], offsetY, scale);

	// 	const target_x = project(window.x[t], offsetX, scale);
	// 	const target_y = project(window.y[t], offsetY, scale);

	// 	ctx.beginPath();
	// 	ctx.moveTo(source_x, source_y);
	// 	ctx.lineTo(target_x, target_y);
	// 	ctx.stroke();
	// }

	ctx.fillStyle = "#222222";
	let n = 0;
	for (const idx of ids) {
		const i = idx - 1;
		const r = getRadius(scale, window.incoming_degree[i]);

		const node_x = project(window.x[i], offsetX, scale);
		const node_y = project(window.y[i], offsetY, scale);
		ctx.beginPath();
		ctx.arc(node_x, node_y, Math.round(r), 0, 2 * Math.PI);
		ctx.fill();
		ctx.closePath();
		n += 1;
	}
}
