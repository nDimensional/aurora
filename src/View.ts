export type View = { minX: number; maxX: number; minY: number; maxY: number };

export const contains = (view: View, node: { x: number; y: number }) =>
	node.x >= view.minX && node.x <= view.maxX && node.y >= view.minY && node.y <= view.maxY;
