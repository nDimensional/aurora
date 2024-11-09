import React, { useEffect, useState } from "react";

import { Profile } from "./utils.js";

export const Target: React.FC<{ id: number }> = ({ id }) => {
	const [profile, setProfile] = useState<Profile | null>(null);

	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const key = id.toString(16).padStart(8, "0");
		console.log("fetching id", id, key);

		const controller = new AbortController();
		fetch(`https://ndimensional-aurora.pages.dev/profile/${key}`, { signal: controller.signal })
			.then(async (res) => {
				if (res.ok) {
					const profile: Profile = await res.json();
					setProfile(profile);
				} else {
					const text = await res.text();
					setError(`${res.status} ${text}`);
				}
			})
			.catch((err) => {
				if (err instanceof DOMException && err.name === "AbortError") {
					console.log("aborted profile request");
				} else {
					console.error(err);
					setError(`${err}`);
				}
			});

		return () => controller.abort();
	}, [id]);

	if (error !== null) {
		return <code>{error}</code>;
	} else if (profile === null) {
		return <code>loading...</code>;
	} else {
		const { did, handle, display_name, description } = profile;
		return (
			<div>
				{display_name && (
					<>
						<div className="display-name">{display_name}</div>
						<hr />
					</>
				)}
				<div className="handle">@{handle}</div>
				<div className="description">
					<p>{description}</p>
				</div>
				<div>
					<a href={`https://bsky.app/profile/${did}`} target="_blank">
						open profile ➡
					</a>
				</div>
			</div>
		);
	}
};
