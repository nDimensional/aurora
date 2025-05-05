import React, { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { Canvas } from "./Canvas.js";
import { Landing } from "./Landing.js";
import { Feed } from "./Feed.js";
import { View } from "./View.js";

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

	const refreshFeed = useDebouncedCallback(
		(view: View) => {
			const query = Object.entries(view)
				.map((entry) => entry.join("="))
				.join("&");

			fetch(`http://localhost:8000/api/query?${query}&count=10`)
				.then((res) => res.json())
				.then((uris: string[]) => setFeedURIs(uris));
		},
		1000,
		{ leading: false, trailing: true, maxWait: 1000 },
	);

	if (hash === "") {
		return <Landing />;
	} else {
		const [x, y, zoom] = hash.split(",").map((f) => parseInt(f));
		return (
			<>
				<Feed uris={feedURIs} />
				<Canvas initialOffsetX={x} initialOffsetY={y} initialZoom={zoom} refreshFeed={refreshFeed} />
			</>
		);
	}
};
