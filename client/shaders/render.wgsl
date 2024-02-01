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

const node_radius = sqrt(2);

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> nodes: array<vec2f>;

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

@vertex
fn vert_node(
  @builtin(instance_index) i: u32,
  @location(0) v: vec2f,
) -> @builtin(position) vec4f {
  let node_count = arrayLength(&nodes);
  if (i == node_count) {
    let mouse = vec2f(params.mouse_x, params.mouse_y) * 2 / params.unit;
    return vec4f(clip_space_to_ndc(v * node_radius + mouse), 0, 1);
  } else {
    // let node = nodes[i];
    return grid_space_to_ndc(node_radius * v + nodes[i] + vec2f(params.offset_x, params.offset_y));
  }
}

@fragment
fn frag_node() -> @location(0) vec4f {
  return vec4f(1, 1, 1, 1);
}
