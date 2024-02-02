struct Params {
  unit: f32,
  width: f32,
  height: f32,
  offset_x: f32,
  offset_y: f32,
  mouse_x: f32,
  mouse_y: f32,
  scale: f32,
};

const node_radius = 3;

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> nodes: array<vec2f>;
@group(0) @binding(2) var<storage, read> z: array<f32>;

// "grid space"
// centered at origin for now

fn clip_space_to_ndc(v: vec2f) -> vec2f {
  let x = v.x * params.unit / params.width;
  let y = v.y * params.unit / params.height;
  return vec2f(2 * x - 1, 1 - 2 * y);
}

fn grid_space_to_ndc(v: vec2f) -> vec4f {
  let x = v.x * params.scale * params.unit * 2 / params.width;
  let y = v.y * params.scale * params.unit * 2 / params.height;
  return vec4f(x, y, 0, 1);
}

fn grid_space_to_clip_space(v: vec2f) -> vec2f {
  let p = grid_space_to_ndc(v).xy;
  return vec2f(params.width * (p.x + 1) / 2, params.height * (1 - p.y) / 2);
  // let x = v.x * params.scale * params.unit;
  // let y = v.y * params.scale * params.unit;
  // return vec2f(x - (params.width / 2), (params.height / 2) - y);
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
  
  // let node_count = arrayLength(&nodes);
  // if (i == node_count) {
  //   let mouse = vec2f(params.mouse_x, params.mouse_y) * 2 / params.unit;
  //   vsOut.position = vec4f(clip_space_to_ndc(v * node_radius + mouse), 0, 1);
  // } else {
    let r = (node_radius + z[i]);//  / sqrt(sqrt(sqrt(params.scale)));
    let offset = vec2f(params.offset_x, params.offset_y);
    vsOut.vertex = grid_space_to_ndc(v * r + nodes[i] + offset);

    // let center = nodes[i] / (params.scale * params.unit);
    // vsOut.center = vec2f(center.x - (params.width / 2), params.height / 2 - center.y);
    vsOut.center = grid_space_to_clip_space(nodes[i] + offset);
    vsOut.radius = r * params.unit * params.scale;
  // }

  return vsOut;
}

@fragment
fn frag_node(
  @builtin(position) pixel: vec4f,
  @location(0) center: vec2f,
  @location(1) radius: f32,
) -> @location(0) vec4f {
  let dist = distance(pixel.xy, center);
  let edgeWidth = 2.0; // Width of the anti-aliasing edge, adjust as needed

  // Compute how far we are from the edge, normalized to the range [0, 1]
  // using smoothstep to create a smooth transition
  let alpha = 1.0 - smoothstep(radius - edgeWidth, radius, dist);

  // Use alpha to blend between transparent outside and solid color inside
  return vec4f(0, 0, 0, alpha);

  // if (distance(pixel.xy, center) < radius) {
  //   return vec4f(0, 0, 0, 1);
  // } else {
  //   return vec4f(1, 1, 1, 0);
  // }
}
