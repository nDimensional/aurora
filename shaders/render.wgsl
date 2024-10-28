struct Params {
  width: f32,
  height: f32,
  offset_x: f32,
  offset_y: f32,
  scale: f32,
  max_radius: f32,
  max_z: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> nodes: array<vec2f>;
@group(0) @binding(2) var<storage, read> z: array<f32>;

fn grid_space_to_ndc(v: vec2f) -> vec4f {
  let x = v.x * params.scale * 2 / params.width;
  let y = v.y * params.scale * 2 / params.height;
  return vec4f(x, y, 0, 1);
}

fn grid_space_to_clip_space(v: vec2f) -> vec2f {
  let x = (v.x * params.scale) + (params.width / 2);
  let y = (params.height / 2) - (v.y * params.scale);

  return vec2f(x, y);
}

struct VSOutput {
  @builtin(position) vertex: vec4f,
  @location(0) center: vec2f,
  @location(1) radius: f32,
}

@vertex
fn vert_node(
  @builtin(instance_index) i: u32,
  @location(0) v: vec2f,
) -> VSOutput {
  var vsOut: VSOutput;

  // let r = (params.max_radius + z[i]) / params.scale_radius;
  // let r = params.max_radius + z[i];
  let r = map(z[i], 1, params.max_z, params.max_radius, params.max_radius / params.scale);

  let c = nodes[i] + vec2f(params.offset_x, params.offset_y);
  vsOut.vertex = grid_space_to_ndc(v * r + c);
  vsOut.center = grid_space_to_clip_space(c);
  vsOut.radius = r * params.scale;

  return vsOut;
}

const edgeWidth = 2.0;

@fragment
fn frag_node(
  @builtin(position) pixel: vec4f,
  @location(0) center: vec2f,
  @location(1) radius: f32,
) -> @location(0) vec4f {
  let dist = distance(pixel.xy, center);
  let alpha = 1.0 - smoothstep(radius - edgeWidth, radius, dist);
  return vec4f(0.1, 0.1, 0.1, alpha);
}

fn map(value: f32, fromLow: f32, fromHigh: f32, toLow: f32, toHigh: f32) -> f32 {
    return toLow + (value - fromLow) * (toHigh - toLow) / (fromHigh - fromLow);
}
