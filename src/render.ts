import { map } from "./utils.js";

declare global {
  var x: Float32Array;
  var y: Float32Array;
  var dx: Float32Array;
  var dy: Float32Array;
  var incoming_degree: Uint32Array;
  var outgoing_degree: Uint32Array;
  var source: Uint32Array;
  var target: Uint32Array;
}

export function render(canvas: HTMLCanvasElement) {
  const node_count = x.length;
  const edge_count = source.length;

  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("failed to get drawing context");
  }

  ctx.clearRect(0, 0, 720, 720);

  ctx.strokeStyle = "#888888";
  for (let i = 0; i < edge_count; i++) {
    const s = source[i] - 1;
    const t = target[i] - 1;

    ctx.beginPath();
    ctx.moveTo(x[s], y[s]);
    ctx.lineTo(x[t], y[t]);
    ctx.stroke();
  }

  ctx.fillStyle = "#222222";
  for (let i = 0; i < node_count; i++) {
    const r = map(0, 80, 1, 10, incoming_degree[i]);
    ctx.beginPath();
    ctx.arc(x[i], y[i], Math.round(r), 0, 2 * Math.PI);
    ctx.fill();
    ctx.closePath();
  }
}
