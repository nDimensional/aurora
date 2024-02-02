import React, { useCallback, useEffect, useRef, useState } from "react";
import { Renderer } from "./Renderer.js";
import { assert } from "./utils.js";
import { Store } from "./Store.js";

const devicePixelRatio = window.devicePixelRatio;
console.log("devicePixelRatio", devicePixelRatio);

const MIN_ZOOM = 0;
const MAX_ZOOM = 2500;

const map = (a: number, b: number, c: number, d: number, x: number) => ((d - c) * (x - a)) / (b - a) + c;

function getScale(zoom: number) {
	return map(1.6931471805599454, 7.824046010856292, 1, 0.003, Math.log(zoom + 2 * Math.E));
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

	const init = useCallback(async (canvas: HTMLCanvasElement) => {
		const store = await Store.create();
		const renderer = await Renderer.create(canvas, store.nodeCount, store.nodes());
		storeRef.current = store;
		rendererRef.current = renderer;
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
			offsetYRef.current -= event.movementY / scale;
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
		zoomRef.current += event.deltaY;
		zoomRef.current = Math.max(zoomRef.current, MIN_ZOOM);
		zoomRef.current = Math.min(zoomRef.current, MAX_ZOOM);
	}, []);

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
