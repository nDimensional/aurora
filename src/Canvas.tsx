import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { Renderer } from "./Renderer.js";
import { emptyArea, Store } from "./Store.js";
import { Profile, assert, getScale, MIN_ZOOM, MAX_ZOOM } from "./utils.js";
import { Target } from "./Target.js";
import { Search } from "./Search.js";

const devicePixelRatio = window.devicePixelRatio;
console.log("devicePixelRatio", devicePixelRatio);

export const initialZoom = 2000;

export interface CanvasProps {
	initialOffsetX?: number;
	initialOffsetY?: number;
	initialZoom?: number;
}

export const Canvas: React.FC<CanvasProps> = (props) => {
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
	const offsetXRef = useRef<number>(props.initialOffsetX ?? 0);
	const offsetYRef = useRef<number>(props.initialOffsetY ?? 0);
	const zoomRef = useRef<number>(props.initialZoom ?? initialZoom);

	const [status, setStatus] = useState<string | null>(null);
	const [progress, setProgress] = useState<number>(0);
	const [error, setError] = useState<any>(null);

	const [isDragging, setIsDragging] = useState(false);
	const isDraggingRef = useRef<null | number>(null);

	const [target, setTarget] = useState<{ id: number; x: number; y: number } | null>(null);
	const targetOffset = useMemo(() => {
		if (target === null) {
			return null;
		} else {
			const scale = getScale(zoomRef.current);
			const clientX = ((target.x + offsetXRef.current) * scale) / devicePixelRatio + widthRef.current / 2;
			const clientY = heightRef.current / 2 - ((target.y + offsetYRef.current) * scale) / devicePixelRatio;
			return { clientX, clientY };
		}
	}, [target]);

	const refresh = useDebouncedCallback(
		() => {
			if (storeRef.current === null) {
				return;
			}

			const z = Math.round(zoomRef.current);
			const x = Math.round(offsetXRef.current);
			const y = Math.round(offsetYRef.current);
			window.location.replace(`#${x},${y},${z}`);

			if (zoomRef.current > 400) {
				rendererRef.current?.setAvatars(emptyArea, refresh);
				return;
			}

			const scale = getScale(zoomRef.current);

			const w = devicePixelRatio * widthRef.current;
			const h = devicePixelRatio * heightRef.current;

			const maxX = w / 2 / scale - offsetXRef.current;
			const minX = -w / 2 / scale - offsetXRef.current;
			const maxY = h / 2 / scale - offsetYRef.current;
			const minY = -h / 2 / scale - offsetYRef.current;

			storeRef.current.getArea(minX, maxX, minY, maxY).then((area) => {
				rendererRef.current?.setAvatars(area, refresh);
			});
		},
		1000,
		{ leading: true, trailing: true, maxWait: 500 },
	);

	const init = useCallback(async (canvas: HTMLCanvasElement, width: number, height: number) => {
		setStatus("loading graph");
		setProgress(0);
		const store = await Store.create((count, total) => setProgress(Math.round((100 * count) / total)));

		setProgress(0);
		setStatus("copying GPU buffers");
		const renderer = await Renderer.create(store, canvas, (count, total) =>
			setProgress(Math.round((100 * count) / total)),
		);

		renderer.setSize(width * devicePixelRatio, height * devicePixelRatio);
		renderer.setOffset(offsetXRef.current, offsetYRef.current);
		renderer.setScale(getScale(zoomRef.current));

		storeRef.current = store;
		rendererRef.current = renderer;
		refresh();
		setStatus(null);
	}, []);

	const handleWheel = useCallback((event: WheelEvent) => {
		event.preventDefault();

		// console.log("wheel event", event);
		const delta = event.ctrlKey ? event.deltaY * 10 : event.deltaY;
		let zoom = zoomRef.current + delta;
		zoom = Math.max(zoom, MIN_ZOOM);
		zoom = Math.min(zoom, MAX_ZOOM);
		if (zoom !== zoomRef.current && rendererRef.current !== null) {
			setTarget(null);
			const oldScale = getScale(zoomRef.current);
			const newScale = getScale(zoom);
			zoomRef.current = zoom;
			rendererRef.current.setScale(newScale);

			const px = event.clientX - widthRef.current / 2;
			const py = heightRef.current / 2 - event.clientY;
			const oldX = px / oldScale;
			const oldY = py / oldScale;
			const newX = px / newScale;
			const newY = py / newScale;
			offsetXRef.current += devicePixelRatio * (newX - oldX);
			offsetYRef.current += devicePixelRatio * (newY - oldY);
			rendererRef.current.setOffset(offsetXRef.current, offsetYRef.current);
			refresh();
		}
	}, []);

	useEffect(() => {
		if (canvasRef.current === null || containerRef.current === null) {
			return;
		}

		canvasRef.current.addEventListener("wheel", handleWheel, { passive: false });

		const w = containerRef.current.clientWidth;
		const h = containerRef.current.clientHeight;
		setWidth(w);
		widthRef.current = w;
		setHeight(h);
		heightRef.current = h;

		init(canvasRef.current, w, h).catch((err) => {
			console.trace(err);
			setError(err + "\n" + err.stack);
		});

		new ResizeObserver((entries) => {
			const entry = entries.find((entry) => entry.target === containerRef.current);
			if (entry === undefined) {
				return;
			}

			assert(entry !== undefined);

			const { width, height } = entry.contentRect;

			setTarget(null);
			setWidth(width);
			widthRef.current = width;

			setHeight(height);
			heightRef.current = height;

			if (rendererRef.current !== null) {
				rendererRef.current.setSize(width * devicePixelRatio, height * devicePixelRatio);
				refresh();
			}
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
		mouseXRef.current = event.clientX;
		mouseYRef.current = event.clientY;
	}, []);

	const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
		mouseXRef.current = event.clientX;
		mouseYRef.current = event.clientY;

		if (isDraggingRef.current !== null) {
			isDraggingRef.current += 1;
			const scale = getScale(zoomRef.current);
			offsetXRef.current += (event.movementX * devicePixelRatio) / scale;
			offsetYRef.current -= (event.movementY * devicePixelRatio) / scale;
			rendererRef.current?.setOffset(offsetXRef.current, offsetYRef.current);
			refresh();
		}
	}, []);

	const handleMouseLeave = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
		mouseXRef.current = null;
		mouseYRef.current = null;
		isDraggingRef.current = null;
		setIsDragging(false);
	}, []);

	const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
		setIsDragging(true);
		setTarget(null);
		isDraggingRef.current = 0;
	}, []);

	const handleMouseUp = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
		if (isDraggingRef.current !== null && isDraggingRef.current <= 1 && storeRef.current !== null) {
			const scale = getScale(zoomRef.current);
			const x = (devicePixelRatio * (event.clientX - widthRef.current / 2)) / scale - offsetXRef.current;
			const y = (devicePixelRatio * (heightRef.current / 2 - event.clientY)) / scale - offsetYRef.current;
			storeRef.current.query(x, y, scale).then((target) => {
				console.log(x, y, target);
				setTarget(target);
			});
		}

		isDraggingRef.current = null;
		setIsDragging(false);
	}, []);

	const handleLocate = useCallback(({ id }: Profile) => {
		if (storeRef.current === null || rendererRef.current == null) {
			return;
		}

		try {
			const { x, y } = storeRef.current.locate(id);
			offsetXRef.current = -x;
			offsetYRef.current = -y;
			rendererRef.current.setOffset(offsetXRef.current, offsetYRef.current);
			zoomRef.current = MIN_ZOOM;
			rendererRef.current.setScale(getScale(zoomRef.current));
			refresh();
			setTarget({ id, x, y });
		} catch (err) {
			alert("user not found");
		}
	}, []);

	if (error !== null) {
		return (
			<div id="error">
				<pre>
					<code>{error.toString()}</code>
				</pre>
			</div>
		);
	}

	return (
		<>
			<Search onLocate={handleLocate} />
			<div id="container" ref={containerRef}>
				{status && (
					<div id="status">
						<div>
							<div>{status}</div>
							<div id="progress">
								<progress value={progress} max={100}></progress>
							</div>
						</div>
					</div>
				)}
				{target && targetOffset && (
					<div id="target" style={{ left: targetOffset.clientX, top: targetOffset.clientY, width: 360 }}>
						<Target id={target.id} />
					</div>
				)}
				<canvas
					style={{ cursor: isDragging ? "grabbing" : "grab" }}
					ref={canvasRef}
					width={width * devicePixelRatio}
					height={height * devicePixelRatio}
					onMouseEnter={handleMouseEnter}
					onMouseMove={handleMouseMove}
					onMouseLeave={handleMouseLeave}
					onMouseDown={handleMouseDown}
					onMouseUp={handleMouseUp}
				></canvas>
			</div>
		</>
	);
};
