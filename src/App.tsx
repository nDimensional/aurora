import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import chevronRightURL from "../icons/chevron-right.svg?url";
import chevronLeftURL from "../icons/chevron-left.svg?url";

import { Canvas } from "./Canvas.js";
import { Landing } from "./Landing.js";
import { Feed } from "./Feed.js";
import { View } from "./View.js";
import { FullscreenContext } from "./FullscreenContext.js";
import { useStateRef } from "./hooks.js";

export const App: React.FC<{}> = ({}) => {
	const [hash, setHash] = useState(window.location.hash.slice(1));

	useEffect(() => {
		const handleHashChange = (event: HashChangeEvent) => {
			const url = new URL(event.newURL);
			setHash(url.hash.slice(1));
		};

		window.addEventListener("hashchange", handleHashChange);
		return () => window.removeEventListener("hashchange", handleHashChange);
	}, []);

	const [feedURIs, setFeedURIs] = useState<string[]>([]);

	const [showFeed, setShowFeed, showFeedRef] = useStateRef(false);

	const viewRef = useRef<View>({ minX: 0, maxX: 0, minY: 0, maxY: 0 });

	const refreshFeed = useCallback(() => {
		const query = Object.entries(viewRef.current)
			.map((entry) => entry.join("="))
			.join("&");

		console.log("FETCHING");

		fetch(`http://localhost:8000/api/query?${query}&count=10`)
			.then((res) => res.json())
			.then((uris: string[]) => setFeedURIs(uris));
	}, []);

	const refreshFeedDebounced = useDebouncedCallback(refreshFeed, 1000, {
		leading: false,
		trailing: true,
		maxWait: 1000,
	});

	const handleViewChange = useCallback((view: View) => {
		viewRef.current = view;
		if (showFeedRef.current) {
			refreshFeedDebounced();
		}
	}, []);

	const handleFeedToggle = useCallback(() => {
		setShowFeed((prev) => !prev);
		if (!showFeedRef.current) {
			refreshFeed();
		}
	}, []);

	const [fullscreen, setFullscreen] = useState(false);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setFullscreen((fullscreen) => !fullscreen);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	if (hash === "") {
		return <Landing />;
	} else {
		const [x, y, zoom] = hash.split(",").map((f) => parseInt(f));
		return (
			<FullscreenContext.Provider value={{ fullscreen, setFullscreen }}>
				<div
					id="feed-toggle"
					style={{ left: showFeed ? 320 : 0, visibility: fullscreen ? "hidden" : "visible" }}
					onClick={handleFeedToggle}
				>
					<img src={showFeed ? chevronLeftURL : chevronRightURL} width="20" height="20" />
				</div>
				{showFeed && <Feed uris={feedURIs} />}
				<Canvas initialOffsetX={x} initialOffsetY={y} initialZoom={zoom} onViewChange={handleViewChange} />
			</FullscreenContext.Provider>
		);
	}
};
