import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./api.js";

console.log("typeof x:", JSON.stringify(typeof window.x));
console.log("typeof y:", JSON.stringify(typeof window.y));
console.log("WOWJFKDLSJFKDLS");

// // const { nodes, edges } = window;
// // console.log(nodes);
// // console.log(edges);

// const main = document.querySelector("main");

// if (main === null) {
// 	throw new Error("missing main element");
// }

// createRoot(main).render(<App />);

// // const canvas = document.querySelector("canvas");
// // if (canvas === null) {
// //   throw new Error("missing canvas element");
// // }

// // canvas.addEventListener("click", () => boop(api));

// // function animate() {
// //   // Code for updating the animation goes here
// //   render(canvas!);
// //   requestAnimationFrame(animate); // Request the next frame
// // }

// // requestAnimationFrame(animate); // Start the animation loop
