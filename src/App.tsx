import React, { useEffect, useRef, useState } from "react";

import { render } from "./render.js";

// [a, b] -> [c, d]
const map = (a: number, b: number, c: number, d: number, x: number) =>
  ((d - c) * (x - a)) / (b - a) + c;

const scale = {
  attraction: {
    to: (value: number) => map(0, 100, 0.00001, 0.01, value),
    from: (value: number) => map(0.00001, 0.01, 0, 100, value),
  },
  repulsion: {
    to: (value: number) => map(0, 100, 100, 10000, value),
    from: (value: number) => map(100, 10000, 0, 100, value),
  },
  temperature: {
    to: (value: number) => map(0, 100, 0.01, 1, value),
    from: (value: number) => map(0.01, 1, 0, 100, value),
  },
};

export const App: React.FC<{}> = ({}) => {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (ref.current !== null) {
      ref.current.addEventListener("click", () => boop(api));

      function animate() {
        render(ref.current!);
        requestAnimationFrame(animate);
      }

      render(ref.current);
      requestAnimationFrame(animate);
    }
  }, []);

  const [attraction, setAttractionScale] = useState(
    scale.attraction.from(window.attraction)
  );

  const [repulsion, setRepulsionScale] = useState(
    scale.repulsion.from(window.repulsion)
  );

  const [temperature, setTemperatureScale] = useState(
    scale.temperature.from(window.temperature)
  );

  return (
    <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
      <div
        style={{ display: "flex", flexDirection: "column", alignItems: "end" }}
      >
        <div>
          <label style={{ flex: 1 }}>Attraction: </label>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={attraction}
            onChange={(e) => {
              const attraction = e.target.valueAsNumber;
              setAttractionScale(attraction);
              window.setAttraction(api, scale.attraction.to(attraction));
            }}
          />
        </div>
        <code>{scale.attraction.to(attraction).toPrecision(4)}</code>
        <div>
          <label>Repulsion: </label>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={repulsion}
            onChange={(e) => {
              const repulsion = e.target.valueAsNumber;
              setRepulsionScale(repulsion);
              window.setRepulsion(api, scale.repulsion.to(repulsion));
            }}
          />
        </div>
        <code>{scale.repulsion.to(repulsion).toPrecision(4)}</code>
        <div>
          <label>Temperature: </label>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={temperature}
            onChange={(e) => {
              const temperature = e.target.valueAsNumber;
              setTemperatureScale(temperature);
              window.setTemperature(api, scale.temperature.to(temperature));
            }}
          />
        </div>
        <code>{scale.attraction.to(temperature).toPrecision(4)}</code>
      </div>
      <canvas
        width={720}
        height={720}
        ref={ref}
        style={{ border: "solid black" }}
      ></canvas>
    </div>
  );
};
