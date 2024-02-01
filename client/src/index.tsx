import React from "react";

import ReactDOM from "react-dom/client";

// if (import.meta.hot) import.meta.hot.accept(() => import.meta.hot?.invalidate());

import "../styles.css";

import { App } from "./App.js";

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);
