import React, { useRef, useEffect, useCallback, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { getMinZ, render } from "./render.js";
import "./api.js";

const MIN_ZOOM = 0;
// const MAX_ZOOM = 2000;
const MAX_ZOOM = 4000;

function getScale(zoom: number) {
	// // { (0, 1) (1000, 0.4) (2000, 0.1) }
	// return 0.00000015 * Math.pow(zoom, 2) - 0.00075 * zoom + 1;

	// { (0, 1) (2000, 0.1) (4000, 0.01) }
	return 0.00000010125 * Math.pow(zoom, 2) - 0.0006525 * zoom + 1;
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

	useEffect(() => {
		if (canvasRef.current === null) {
			return;
		}

		function animate() {
			if (canvasRef.current === null) {
				return;
			}

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
		zoomRef.current = Math.max(zoomRef.current, MIN_ZOOM);
		zoomRef.current = Math.min(zoomRef.current, MAX_ZOOM);
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

	const handleClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {}, []);

	const refreshIds = useDebouncedCallback(
		(area: { minX: number; maxX: number; minY: number; maxY: number; minZ: number }) => {
			ids.current = window.refresh(window.api, area.minX, area.maxX, area.minY, area.maxY, area.minZ);
		},
		100,
		{ leading: true, maxWait: 200 }
	);

	useEffect(() => {
		const scale = getScale(zoom);
		const maxX = 360 / scale - offsetX;
		const minX = -360 / scale - offsetX;
		const maxY = 360 / scale - offsetY;
		const minY = -360 / scale - offsetY;
		const minZ = getMinZ(scale);
		refreshIds({ minX, maxX, minY, maxY, minZ });
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
