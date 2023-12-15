declare global {
  var api: API;
  var boop: (api: API) => void;
  var attraction: number;
  var repulsion: number;
  var temperature: number;
  var setAttraction: (api: API, value: number) => void;
  var setRepulsion: (api: API, value: number) => void;
  var setTemperature: (api: API, value: number) => void;
}

export declare class API {}
