import { defineConfig } from "vite";

export default defineConfig({
	server: {
		hmr: true,
		// headers: {
		// 	"Cross-Origin-Opener-Policy": "same-origin",
		// 	"Cross-Origin-Embedder-Policy": "require-corp",
		// },
	},
});
