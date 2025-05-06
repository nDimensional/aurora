import { createContext } from "react";

export const FullscreenContext = createContext({
	fullscreen: false,
	setFullscreen: (fullscreen: boolean) => {},
});
