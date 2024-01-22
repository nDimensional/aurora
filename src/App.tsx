import React, { useCallback, useState } from "react";

import { Canvas } from "./Canvas.js";
import { map } from "./utils.js";
import "./api.js";

const ranges = {
	attraction: [0.0001, 0.01],
	repulsion: [1, 100],
	temperature: [0.00001, 0.1],
} as const;

const scale = {
	attraction: {
		to: (value: number) => map(0, 100, ...ranges.attraction, value),
		from: (value: number) => map(...ranges.attraction, 0, 100, value),
	},
	repulsion: {
		to: (value: number) => map(0, 100, ...ranges.repulsion, value),
		from: (value: number) => map(...ranges.repulsion, 0, 100, value),
	},
	temperature: {
		to: (value: number) => map(0, 100, ...ranges.temperature, value),
		from: (value: number) => map(...ranges.temperature, 0, 100, value),
	},
};

export const App: React.FC<{}> = ({}) => {
	const handleSave = useCallback(() => {
		window.save(api);
	}, []);

	const handleTick = useCallback(() => {
		window.tick(api);
	}, []);

	const [attraction, setAttractionScale] = useState(scale.attraction.from(window.attraction));

	const [repulsion, setRepulsionScale] = useState(scale.repulsion.from(window.repulsion));

	const [temperature, setTemperatureScale] = useState(scale.temperature.from(window.temperature));

	const handleAttractionChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		const attraction = event.target.valueAsNumber;
		setAttractionScale(attraction);
		window.setAttraction(api, scale.attraction.to(attraction));
	}, []);

	const handleRepulsionChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		const repulsion = event.target.valueAsNumber;
		setRepulsionScale(repulsion);
		window.setRepulsion(api, scale.repulsion.to(repulsion));
	}, []);

	const handleTemperatureChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		const temperature = event.target.valueAsNumber;
		setTemperatureScale(temperature);
		window.setTemperature(api, scale.temperature.to(temperature));
	}, []);

	return (
		<div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
			<div style={{ display: "flex", flexDirection: "column", alignItems: "end" }}>
				<div>
					<label>Attraction: </label>
					<input type="range" min="0" max="100" step="1" value={attraction} onChange={handleAttractionChange} />
				</div>
				<code>{scale.attraction.to(attraction).toPrecision(4)}</code>
				<div>
					<label>Repulsion: </label>
					<input type="range" min="0" max="100" step="1" value={repulsion} onChange={handleRepulsionChange} />
				</div>
				<code>{scale.repulsion.to(repulsion).toPrecision(4)}</code>
				<div>
					<label>Temperature: </label>
					<input type="range" min="0" max="100" step="1" value={temperature} onChange={handleTemperatureChange} />
				</div>
				<code>{scale.attraction.to(temperature).toPrecision(4)}</code>
				<div style={{ marginTop: "1em", display: "flex", gap: "1em" }}>
					<button onClick={handleTick}>Tick</button>
					<button onClick={handleSave}>Save</button>
				</div>
			</div>
			<Canvas />
		</div>
	);
};
