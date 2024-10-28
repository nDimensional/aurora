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

// @group(0) @binding(1) var<storage, read> nodes: array<vec2f>;
// @group(0) @binding(2) var<storage, read> z: array<f32>;

const avatar_dimensions = vec2f(128, 128);
const texture_dimensions = vec2f(8192, 8192);
const row_count = 64;

@group(1) @binding(0) var ourSampler: sampler;
@group(1) @binding(1) var ourTexture: texture_2d<f32>;
@group(1) @binding(2) var<storage> avatars_x: array<f32>;
@group(1) @binding(3) var<storage> avatars_y: array<f32>;
@group(1) @binding(4) var<storage> avatars_z: array<f32>;
@group(1) @binding(5) var<storage> tiles: array<u32>;

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
    @location(0) @interpolate(flat) center: vec2f,
    @location(1) @interpolate(flat) radius: f32,
    @location(2) @interpolate(flat) tile: u32,
};

@vertex
fn vert_node(
    @builtin(instance_index) index: u32,
    @location(0) v: vec2f,
) -> VSOutput {
    let x = avatars_x[index];
    let y = avatars_y[index];
    let z = avatars_z[index];

    let tile = tiles[index];

    var vsOut: VSOutput;

    // let r = (params.max_radius + z) / params.scale_radius;
    // let r = params.max_radius + z;
    let r = map(z, 1, params.max_z, params.max_radius, params.max_radius / params.scale);

    let c = vec2f(x + params.offset_x, y + params.offset_y);
    vsOut.vertex = grid_space_to_ndc(v * r + c);
    vsOut.center = grid_space_to_clip_space(c);
    vsOut.radius = r * params.scale;
    vsOut.tile = tile;
    return vsOut;
}

const edgeWidth = 2.0;

@fragment
fn frag_node(
    @builtin(position) pixel: vec4f,
    @location(0) @interpolate(flat) center: vec2f,
    @location(1) @interpolate(flat) radius: f32,
    @location(2) @interpolate(flat) tile: u32
) -> @location(0) vec4f {
    let r = vec2f(radius, radius);
    let origin = center - r;
    let p  = (pixel.xy - origin) / (2 * r);

    let offset = vec2f(f32(tile % row_count), f32(tile / row_count));
    let s = textureSample(ourTexture, ourSampler, (offset + p) * avatar_dimensions / texture_dimensions);
    let dist = distance(pixel.xy, center);
    let alpha = 1.0 - smoothstep(radius - edgeWidth, radius, dist);
    return vec4f(s.rgb, s.a * alpha);
}

fn map(value: f32, fromLow: f32, fromHigh: f32, toLow: f32, toHigh: f32) -> f32 {
    return toLow + (value - fromLow) * (toHigh - toLow) / (fromHigh - fromLow);
}
