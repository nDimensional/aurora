import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import searchImageURL from "../search.svg?url";

import { Profile } from "./utils.js";

async function search(q: string): Promise<Profile | null> {
	const res = await fetch(`https://ndimensional-aurora.pages.dev/search?q=${encodeURIComponent(q)}`);
	if (res.ok) {
		return await res.json();
	} else if (res.status === 404) {
		alert("profile not found");
		return null;
	} else {
		alert(`profile lookup failed (${res.status} ${res.statusText})`);
		return null;
	}
}

export interface SearchProps {
	onLocate: (profile: Profile) => void;
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
					inputRef.current?.select();
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
				search(q).then((profile) => {
					if (profile !== null) {
						props.onLocate(profile);
					}
				});
			}
		},
		[props.onLocate],
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
