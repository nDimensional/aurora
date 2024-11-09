import React, { useEffect, useState } from "react";

import { Canvas } from "./Canvas.js";
import { Landing } from "./Landing.js";

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

	if (hash === "") {
		return <Landing />;
	} else {
		const [x, y, zoom] = hash.split(",").map((f) => parseInt(f));
		return <Canvas initialOffsetX={x} initialOffsetY={y} initialZoom={zoom} />;
	}
};
