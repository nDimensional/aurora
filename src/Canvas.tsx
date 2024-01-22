import React, { useRef, useEffect, useCallback, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { render } from "./render.js";
import "./api.js";

function getScale(zoom: number) {
	return 0.001 * (400 - zoom) + 1.001;
}

export const Canvas: React.FC<{}> = ({}) => {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	const ids = useRef(Uint32Array.from([]));

	const [offsetX, setOffsetX] = useState(0);
	const [offsetY, setOffsetY] = useState(0);
	const [zoom, setZoom] = useState(0);

	const offsetXRef = useRef(offsetX);
	const offsetYRef = useRef(offsetY);
	const zoomRef = useRef(zoom);
	const framerateRef = useRef<HTMLElement | null>(null);

	// const scale = getScale(zoomRef.current);
	// const right = 360 / scale - offsetX;
	// const left = -360 / scale - offsetX;
	// const top = 360 / scale + offsetY;
	// const bottom = -360 / scale + offsetY;
	// console.log(`range: [${right}, ${left}], [${top}, ${bottom}]`);
	// // console.log(`offsetX: ${offsetX}, offsetY: ${offsetY}, scale: ${getScale(zoom)}`);

	useEffect(() => {
		if (canvasRef.current === null) {
			return;
		}

		// canvasRef.current.addEventListener("click", () => boop(api));

		// const start = performance.now();

		function animate() {
			if (canvasRef.current === null) {
				return;
			}

			// const delay = performance.mark()

			const scale = getScale(zoomRef.current);
			render(canvasRef.current, offsetXRef.current, offsetYRef.current, scale, ids.current);
			requestAnimationFrame(animate);
		}

		requestAnimationFrame(animate);
	}, []);

	const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
		const delta = 10 * (1 / getScale(zoomRef.current));
		if (event.key === "ArrowUp") {
			offsetYRef.current += delta;
			setOffsetY(offsetYRef.current);
		} else if (event.key === "ArrowDown") {
			offsetYRef.current -= delta;
			setOffsetY(offsetYRef.current);
		} else if (event.key === "ArrowRight") {
			offsetXRef.current -= delta;
			setOffsetX(offsetXRef.current);
		} else if (event.key === "ArrowLeft") {
			offsetXRef.current += delta;
			setOffsetX(offsetXRef.current);
		}
	}, []);
	4;

	const handleScroll = useCallback((event: React.WheelEvent<HTMLCanvasElement>) => {
		zoomRef.current += event.deltaY;
		zoomRef.current = Math.max(zoomRef.current, 0);
		zoomRef.current = Math.min(zoomRef.current, 1300);

		setZoom(zoomRef.current);
	}, []);

	const anchor = useRef<{ x: number; offsetX: number; y: number; offsetY: number } | null>(null);

	const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
		anchor.current = {
			x: event.clientX - offsetX,
			offsetX: offsetXRef.current,
			y: event.clientY - offsetY,
			offsetY: offsetYRef.current,
		};
	}, []);

	const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
		if (anchor.current === null) {
			return;
		}

		const scale = getScale(zoomRef.current);

		const x = event.clientX - offsetX;
		const y = event.clientY - offsetY;
		const dx = x - anchor.current.x;
		const dy = y - anchor.current.y;
		offsetXRef.current = anchor.current.offsetX + dx / scale;
		offsetYRef.current = anchor.current.offsetY + dy / scale;
	}, []);

	const handleMouseUp = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
		anchor.current = null;
		setOffsetX(offsetXRef.current);
		setOffsetY(offsetYRef.current);
	}, []);

	const handleClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
		// const scale = getScale(zoomRef.current);
		// const right = 360 / scale - offsetXRef.current;
		// const left = -360 / scale - offsetXRef.current;
		// const top = 360 / scale + offsetYRef.current;
		// const bottom = -360 / scale + offsetYRef.current;
		// const result = window.refresh(window.api, left, right, bottom, top);
		// console.log(`result!: ${result}`);
	}, []);

	const refreshIds = useDebouncedCallback(
		(area: { minX: number; maxX: number; minY: number; maxY: number }) => {
			ids.current = window.refresh(window.api, area.minX, area.maxX, area.minY, area.maxY);
			console.log(`refresh ${ids.current.length}`);
		},
		100,
		{ leading: true, maxWait: 200 }
	);

	useEffect(() => {
		const scale = getScale(zoom);
		const right = 360 / scale - offsetX;
		const left = -360 / scale - offsetX;
		const top = 360 / scale - offsetY;
		const bottom = -360 / scale - offsetY;
		refreshIds({ minX: left, maxX: right, minY: bottom, maxY: top });
		// ids.current = window.refresh(window.api, left, right, bottom, top);
		// console.log(`refresh ${ids.current.length}`);
	}, [zoom, offsetX, offsetY]);

	return (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<canvas
				autoFocus
				tabIndex={1}
				width={720}
				height={720}
				ref={canvasRef}
				onKeyDown={handleKeyDown}
				onWheel={handleScroll}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onClick={handleClick}
			></canvas>
			<code>
				{offsetX.toFixed(0)}, {offsetY.toFixed(0)}, {zoom}
			</code>
			<code ref={framerateRef}></code>
		</div>
	);
};
