import React, { useEffect, useState } from "react";
import { Store } from "./Store.js";

export const Target: React.FC<{ id: number }> = ({ id }) => {
	const [profile, setProfile] = useState<{
		did: string;
		handle: string;
		displayName: string | null;
		description: string | null;
	} | null>(null);

	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const key = id.toString(16).padStart(8, "0");
		const controller = new AbortController();

		// fetch(`${Store.hostURL}/${Store.snapshot}/${key}/profile`, { signal: controller.signal }).then((res) => {
		// 	if (res.ok) {
		// 		res.json().then((profile) => setProfile(profile));
		// 	} else if (res.status === 404) {
		// 		res.body?.cancel();
		// 		setError("profile not found");
		// 	} else {
		// 		res.text().then(setError);
		// 	}
		// });

		return () => controller.abort();
	}, [id]);

	if (error !== null) {
		return <code>{error}</code>;
	} else if (profile === null) {
		return <code>loading...</code>;
	} else {
		const { did, handle, displayName, description } = profile;
		return (
			<div>
				{displayName && (
					<>
						<div className="display-name">{displayName}</div>
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
