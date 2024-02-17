import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import searchImageURL from "../search.svg?url";

import { Store } from "./Store.js";

export interface SearchProps {
	onLocate: (idx: number) => void;
}

export const Search: React.FC<SearchProps> = (props) => {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [hasFocus, setHasFocus] = useState(false);
	const [visible, setVisible] = useState(true);

	const initialRenderRef = useRef(true);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "f") {
				if ((event.ctrlKey && !event.metaKey) || (event.metaKey && !event.ctrlKey)) {
					event.preventDefault();
					setVisible(true);
					inputRef.current?.focus();
				}
			}

			if (event.key === "Escape") {
				setVisible((visible) => !visible);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	useLayoutEffect(() => {
		if (initialRenderRef.current) {
			initialRenderRef.current = false;
		} else if (visible) {
			inputRef.current?.focus();
		}
	}, [visible]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (inputRef.current === null) {
				return;
			}

			if (event.key === "Enter") {
				const { value } = inputRef.current;
				const q = value.startsWith("@") ? value.slice(1) : value;
				Store.search(q).then((idx) => {
					if (idx === null) {
						alert("profile not found");
					} else {
						props.onLocate(idx);
					}
				});
			}
		},
		[props.onLocate]
	);

	const [value, setValue] = useState("");

	const visibility = visible ? "visible" : "hidden";
	return (
		<div id="search" style={hasFocus ? { visibility, opacity: 1 } : { visibility }}>
			<input
				type="text"
				ref={inputRef}
				value={value}
				placeholder="handle or DID"
				onChange={(event) => setValue(event.target.value)}
				onFocus={() => setHasFocus(true)}
				onBlur={() => setHasFocus(false)}
				onKeyDown={handleKeyDown}
			/>
			<img src={searchImageURL} width="20" height="20" />
		</div>
	);
};
