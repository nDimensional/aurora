import React from "react";

import ReactDOM from "react-dom/client";

import "../styles.css";

import { App } from "./App.js";

(window as any).clear = () => navigator.storage.getDirectory().then((root) => (root as any).remove());

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);
