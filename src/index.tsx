import React from "react";

import ReactDOM from "react-dom/client";

import "../styles.css";

import { App } from "./App.js";
import { assert } from "./utils.js";

(window as any).clear = async () => {
	const root = await navigator.storage.getDirectory();
	for await (const key of root.keys()) {
		root.removeEntry(key, { recursive: true });
	}
};

const root = document.getElementById("root");
assert(root !== null, "missing #root element");

ReactDOM.createRoot(root).render(<App />);
