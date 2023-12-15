declare global {
  var nodes: Float32Array;
  var edges: Uint32Array;
}

const r = 3;

export function render(canvas: HTMLCanvasElement) {
  const node_count = nodes.length / 4;
  const edge_count = edges.length / 4;

  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("failed to get drawing context");
  }

  ctx.clearRect(0, 0, 720, 720);

  ctx.strokeStyle = "#444444";
  for (let i = 0; i < edge_count; i++) {
    const source = edges[2 * i] - 1;
    const target = edges[2 * i + 1] - 1;

    const source_x = nodes[4 * source];
    const source_y = nodes[4 * source + 1];
    const target_x = nodes[4 * target];
    const target_y = nodes[4 * target + 1];

    ctx.beginPath();
    ctx.moveTo(source_x, source_y);
    ctx.lineTo(target_x, target_y);
    ctx.stroke();
  }

  for (let i = 0; i < node_count; i++) {
    const x = nodes[4 * i];
    const y = nodes[4 * i + 1];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.closePath();
  }
}
