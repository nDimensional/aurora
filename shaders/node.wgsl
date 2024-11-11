struct Params {
    width: f32,
    height: f32,
    offset_x: f32,
    offset_y: f32,
    scale: f32,
    radius: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> nodes: array<vec2f>;
@group(0) @binding(2) var<storage, read> colors: array<u32>;

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
    @location(2) color: vec4f,
}

@vertex
fn vert_node(
    @builtin(instance_index) i: u32,
    @location(0) v: vec2f,
) -> VSOutput {
    var vsOut: VSOutput;

    let r = params.radius;
    let c = nodes[i] + vec2f(params.offset_x, params.offset_y);
    vsOut.vertex = grid_space_to_ndc(v * r + c);
    vsOut.center = grid_space_to_clip_space(c);
    vsOut.radius = r * params.scale;

    vsOut.color = unpack_rgba8unorm(colors[i]);

    return vsOut;
}

fn unpack_rgba8unorm(packed: u32) -> vec4f {
    return vec4f(
        f32(packed & 0xFF) / 255.0,
        f32((packed >> 8) & 0xFF) / 255.0,
        f32((packed >> 16) & 0xFF) / 255.0,
        f32((packed >> 24) & 0xFF) / 255.0,
    );
}

const edgeWidth = 2.0;

@fragment
fn frag_node(
    @builtin(position) pixel: vec4f,
    @location(0) center: vec2f,
    @location(1) radius: f32,
    @location(2) color: vec4f,
) -> @location(0) vec4f {
    let dist = distance(pixel.xy, center);
    let alpha = 1.0 - smoothstep(radius - edgeWidth, radius, dist);

    return vec4f(color.xyz, alpha);
}
