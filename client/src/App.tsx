import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { Renderer } from "./Renderer.js";
import { Store } from "./Store.js";
import { cache } from "./Cache.js";
import { assert, getMinZ } from "./utils.js";

const devicePixelRatio = window.devicePixelRatio;
console.log("devicePixelRatio", devicePixelRatio);

const MIN_ZOOM = 0;
// const MAX_ZOOM = 2500;
const MAX_ZOOM = 2500;

function getScale(zoom: number) {
	return 256 / (zoom + 128);
}

export const App: React.FC<{}> = ({}) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const rendererRef = useRef<Renderer | null>(null);
	const storeRef = useRef<Store | null>(null);

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

	const refreshIds = useDebouncedCallback(
		() => {
			if (storeRef.current === null) {
				return;
			}

			const store = storeRef.current;

			const scale = getScale(zoomRef.current);

			const w = widthRef.current / 2;
			const h = heightRef.current / 2;

			const maxX = w / scale - offsetXRef.current;
			const minX = -w / scale - offsetXRef.current;
			const maxY = h / scale - offsetYRef.current;
			const minY = -h / scale - offsetYRef.current;
			const minZ = getMinZ(scale);
			// const minZ = 0;

			const area = store.getArea(minX, maxX, minY, maxY, minZ);
			rendererRef.current?.setAvatars(area);

			for (const idx of area) {
				if (!cache.has(idx)) {
					Promise.resolve(cache.load(idx)).then(() => refreshIds());
				}
			}
		},
		500,
		{ leading: true, maxWait: 500 }
	);

	const init = useCallback(async (canvas: HTMLCanvasElement) => {
		const store = await Store.create();
		const nodes = [...store.nodes()];
		const renderer = await Renderer.create(canvas, store.nodeCount, nodes);
		renderer.setSize(widthRef.current, heightRef.current);
		renderer.setOffset(offsetXRef.current, offsetYRef.current);
		renderer.setScale(getScale(zoomRef.current));

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

			rendererRef.current?.setSize(width, height);
			refreshIds();
		}).observe(containerRef.current);

		const frame = () => {
			if (canvasRef.current === null) {
				return;
			}
			rendererRef.current?.render();
			requestAnimationFrame(frame);
		};

		requestAnimationFrame(frame);

		return () => {
			canvasRef.current = null;
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
			offsetYRef.current -= event.movementY / scale;
			rendererRef.current?.setOffset(offsetXRef.current, offsetYRef.current);
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

		const scale = getScale(zoomRef.current);
		const x = (mouseXRef.current! - widthRef.current / 2) / scale - offsetXRef.current;
		const y = (heightRef.current / 2 - mouseYRef.current!) / scale - offsetYRef.current;
		console.log(x, y);
		console.log(storeRef.current?.query(x, y, 20));
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
			rendererRef.current?.setScale(getScale(zoomRef.current));
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
