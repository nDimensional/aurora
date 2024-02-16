import React, { useCallback, useEffect, useState } from "react";

import { Canvas } from "./Canvas.js";
import { Landing } from "./Landing.js";
import { Search } from "./Search.js";

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

	if (hash === "graph") {
		return <Canvas />;
	} else {
		return <Landing />;
	}
};
