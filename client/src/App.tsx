import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { Renderer } from "./Renderer.js";
import { assert, fetchAvatar } from "./utils.js";
import { Store } from "./Store.js";

const devicePixelRatio = window.devicePixelRatio;
console.log("devicePixelRatio", devicePixelRatio);

const MIN_ZOOM = 0;
const MAX_ZOOM = 2500;

const map = (a: number, b: number, c: number, d: number, x: number) => ((d - c) * (x - a)) / (b - a) + c;

function getScale(zoom: number) {
	// return 1 / Math.(zoom + 1);
	return map(1.6931471805599454, 7.824046010856292, 1, 0.003, Math.log(zoom + 2 * Math.E));
}

export const App: React.FC<{}> = ({}) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const rendererRef = useRef<Renderer | null>(null);
	const storeRef = useRef<Store | null>(null);
	const avatars = useMemo(() => new Map<number, ImageBitmap>(), []);

	const [width, setWidth] = useState(600);
	const [height, setHeight] = useState(400);
	const widthRef = useRef<number>(width);
	const heightRef = useRef<number>(height);
	const mouseXRef = useRef<number | null>(null);
	const mouseYRef = useRef<number | null>(null);
	const offsetXRef = useRef<number>(0);
	const offsetYRef = useRef<number>(0);
	const zoomRef = useRef<number>(0);

	const [isDragging, setIsDragging] = useState(false);
	const isDraggingRef = useRef(isDragging);

	const repaintAvatars = useDebouncedCallback(
		(avatars: Map<number, ImageBitmap>) => {
			if (rendererRef.current === null) {
				return;
			}

			rendererRef.current.setAvatars(avatars);
		},
		500,
		{ leading: true, maxWait: 500 }
	);

	const refreshIds = useDebouncedCallback(
		() => {
			if (storeRef.current === null) {
				return;
			}

			const scale = getScale(zoomRef.current);

			const w = widthRef.current / 2;
			const h = heightRef.current / 2;

			const maxX = w / scale - offsetXRef.current;
			const minX = -w / scale - offsetXRef.current;
			const maxY = h / scale - offsetYRef.current;
			const minY = -h / scale - offsetYRef.current;
			// const minZ = getMinZ(scale);
			const minZ = 0;

			const nodes: number[] = [];
			for (const idx of storeRef.current.getArea(minX, maxX, minY, maxY, minZ, 4096)) {
				nodes.push(idx);
			}

			console.log(nodes);
		},
		500,
		{ leading: true, maxWait: 500 }
	);

	const init = useCallback(async (canvas: HTMLCanvasElement) => {
		const store = await Store.create();
		const renderer = await Renderer.create(canvas, store.nodeCount, store.nodes());
		// const avatars = new Map<number, ImageBitmap>();
		// for (const idx of [5, 1, 4, 2, 80, 81]) {
		// 	const { did, avatar } = await fetchAvatar(idx);
		// 	if (avatar) {
		// 		avatars.set(idx, avatar);
		// 	}
		// }

		renderer.setAvatars(avatars);
		// renderer.setAvatars(new Map([[idx, avatar]]));
		// const idx = 5;

		storeRef.current = store;
		rendererRef.current = renderer;
		refreshIds();
	}, []);

	useEffect(() => {
		if (canvasRef.current === null || containerRef.current === null) {
			return;
		}

		init(canvasRef.current);

		new ResizeObserver((entries) => {
			const entry = entries.find((entry) => entry.target === containerRef.current);
			assert(entry !== undefined);

			const { width, height } = entry.contentRect;

			setWidth(width);
			widthRef.current = width;
			setHeight(height);
			heightRef.current = height;
			refreshIds();
		}).observe(containerRef.current);

		const frame = () => {
			if (rendererRef.current !== null) {
				rendererRef.current.render(
					widthRef.current,
					heightRef.current,
					offsetXRef.current,
					offsetYRef.current,
					mouseXRef.current,
					mouseYRef.current,
					getScale(zoomRef.current)
				);
			}

			requestAnimationFrame(frame);
		};

		requestAnimationFrame(frame);
		return () => {
			rendererRef.current = null;
		};
	}, []);

	const handleMouseEnter = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
		mouseXRef.current = event.clientX - canvasRef.current!.offsetTop;
		mouseYRef.current = event.clientY - canvasRef.current!.offsetLeft;
	}, []);

	const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
		mouseXRef.current = event.clientX - canvasRef.current!.offsetTop;
		mouseYRef.current = event.clientY - canvasRef.current!.offsetLeft;

		if (isDraggingRef.current) {
			const scale = getScale(zoomRef.current);
			offsetXRef.current += event.movementX / scale;
			offsetYRef.current += event.movementY / scale;
			refreshIds();
		}
	}, []);

	const handleMouseLeave = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
		mouseXRef.current = null;
		mouseYRef.current = null;
		isDraggingRef.current = false;
		setIsDragging(isDraggingRef.current);
	}, []);

	const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
		isDraggingRef.current = true;
		setIsDragging(isDraggingRef.current);
	}, []);

	const handleMouseUp = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
		isDraggingRef.current = false;
		setIsDragging(isDraggingRef.current);
	}, []);

	const handleWheel = useCallback((event: React.WheelEvent<HTMLCanvasElement>) => {
		let zoom = zoomRef.current + event.deltaY;
		zoom = Math.max(zoom, MIN_ZOOM);
		zoom = Math.min(zoom, MAX_ZOOM);
		if (zoom !== zoomRef.current) {
			zoomRef.current = zoom;
			refreshIds();
		}
	}, []);

	// canvas.width = canvas.clientWidth * devicePixelRatio;
	// canvas.height = canvas.clientHeight * devicePixelRatio;

	return (
		<div id="container" ref={containerRef}>
			<canvas
				style={{ cursor: isDragging ? "grabbing" : "grab" }}
				ref={canvasRef}
				width={width}
				height={height}
				onMouseEnter={handleMouseEnter}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
				onMouseDown={handleMouseDown}
				onMouseUp={handleMouseUp}
				onWheel={handleWheel}
			></canvas>
		</div>
	);
};
