declare global {
	var api: API;
	var boop: (api: API) => void;
	var tick: (api: API) => void;
	var save: (api: API) => void;
	var attraction: number;
	var repulsion: number;
	var temperature: number;
	var setAttraction: (api: API, value: number) => void;
	var setRepulsion: (api: API, value: number) => void;
	var setTemperature: (api: API, value: number) => void;

	var x: Float32Array;
	var y: Float32Array;
	var dx: Float32Array;
	var dy: Float32Array;
	var incoming_degree: Uint32Array;
	var outgoing_degree: Uint32Array;
	var source: Uint32Array;
	var target: Uint32Array;
}

export declare class API {}
