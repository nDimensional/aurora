import React, { useMemo } from "react";

export const Landing: React.FC<{}> = ({}) => {
	const supportsWebGPU = useMemo(() => navigator.gpu !== undefined, []);
	const supportsOPFS = useMemo(
		() => navigator.storage !== undefined && navigator.storage.getDirectory !== undefined,
		[]
	);

	return (
		<div id="panel">
			<div style={{ maxWidth: 400 }}>
				<div>welcome to Aurora!</div>
				<hr />
				<p>
					Aurora is a visualization of the social network <a href="https://bsky.app">BlueSky</a> as of 2024-02-09.
				</p>
				<p>
					Aurora requires OPFS and WebGPU, which are very new web APIs. This means Aurora can only be viewed on the
					desktop in Chrome/Chromium for now.
				</p>
				<hr />
				{supportsWebGPU === false ? (
					<div>
						Your browser doesn't support WebGPU yet. Try switching to Chrome or{" "}
						<a href="https://www.chromium.org/getting-involved/download-chromium/">downloading Chromium</a>.
					</div>
				) : supportsOPFS === false ? (
					<div>Your browser doesn't support the OPFS API. Try checking for browser updates!</div>
				) : (
					<>
						<p>Aurora will:</p>
						<ul>
							<li>
								download and cache a 191 MB SQLite database (you can clear this anytime through your browser settings)
							</li>
							<li>render a graph of 2.4 million nodes, which might be slow and consume lots of power</li>
						</ul>
						<hr />
						<div>
							sound good? <a href="#graph">load the graph</a>!
						</div>
					</>
				)}
			</div>
		</div>
	);
};
