import logger from "weald";

import React, { useEffect, useState } from "react";

import { Profile } from "./utils.js";

const log = logger("aurora:target");

export const Target: React.FC<{ id: number }> = ({ id }) => {
	const [profile, setProfile] = useState<Profile | null>(null);

	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setProfile(null);
		setError(null);

		const key = id.toString(16).padStart(8, "0");
		log("fetching id %d (%s)", id, key);

		const controller = new AbortController();
		fetch(`https://ndimensional-aurora.pages.dev/profile/${key}`, { signal: controller.signal })
			.then(async (res) => {
				if (res.ok) {
					const profile: Profile = await res.json();
					setProfile(profile);
					setError(null);
				} else {
					const text = await res.text();
					setError(`${res.status} ${text}`);
				}
			})
			.catch((err) => {
				if (err instanceof DOMException && err.name === "AbortError") {
					log("aborted profile request");
				} else {
					console.error(err);
					setError(`${err}`);
				}
			});

		return () => controller.abort();
	}, [id]);

	if (error !== null) {
		return (
			<>
				<div className="corner"></div>
				<div className="header">
					<span className="error">{error}</span>
				</div>
				<div className="profile"></div>
			</>
		);
	} else if (profile === null) {
		return (
			<>
				<div className="corner"></div>
				<div className="header">
					<span className="loading">loading...</span>
				</div>
				<div className="profile"></div>
			</>
		);
	} else {
		const { did, handle, display_name, description } = profile;

		const displayName = display_name ? display_name : (formatHandle(handle) ?? did);
		return (
			<>
				<div className="corner"></div>
				<div className="header">
					<span className="display-name">{displayName}</span>
					<hr />
				</div>
				<div className="profile">
					<div className="handle">
						<a href={`https://bsky.app/profile/${did}`} target="_blank">
							{handle ?? did}
						</a>
					</div>
					<div className="description">
						<p>{description}</p>
					</div>
				</div>
			</>
		);
	}
};

const Profile: React.FC<{}> = (props) => {
	return null;
};

function formatHandle(handle: string | null) {
	if (handle === null || handle === "") {
		return null;
	} else if (handle.endsWith(".bsky.social")) {
		return handle.slice(0, handle.lastIndexOf(".bsky.social"));
	} else {
		return handle;
	}
}
