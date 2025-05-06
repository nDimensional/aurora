import React from "react";

import ReactDOM from "react-dom/client";

import "../styles.css";

import { App } from "./App.js";
import { assert } from "./utils.js";

(window as any).clear = () => navigator.storage.getDirectory().then((root) => (root as any).remove());

const root = document.getElementById("root");
assert(root !== null, "missing #root element");

ReactDOM.createRoot(root).render(<App />);
