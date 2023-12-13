import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";

const main = document.querySelector("main");
if (main === null) {
  throw new Error("missing main element");
}

createRoot(main).render(<App />);
