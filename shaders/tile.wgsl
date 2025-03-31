struct Params {
    width: f32,
    height: f32,
    offset_x: f32,
    offset_y: f32,
    scale: f32,
    radius: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(1) @binding(0) var<storage, read> positions: array<vec2<f32>>;
@group(1) @binding(1) var<storage, read> sizes: array<f32>;
@group(1) @binding(2) var<storage, read> colors: array<vec4<f32>>;

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
    @location(2) border: f32,
    @location(3) color: vec4f,
}

const border_thickness = 200.0;

@vertex
fn vert_tile(
    @builtin(instance_index) i: u32,
    @location(0) v: vec2f,
) -> VSOutput {
    var vsOut: VSOutput;

    let offset = vec2f(params.offset_x, params.offset_y);

    let r = sizes[i] / 2;
    let c = positions[i] + offset;
    vsOut.vertex = grid_space_to_ndc(v * r + c);
    vsOut.center = grid_space_to_clip_space(c);
    vsOut.radius = r * params.scale;
    vsOut.border = vsOut.radius - max(border_thickness * params.scale, 2);
    vsOut.color = colors[i];
    return vsOut;
}

@fragment
fn frag_tile(
    @builtin(position) pixel: vec4f,
    @location(0) center: vec2f,
    @location(1) radius: f32,
    @location(2) border: f32,
    @location(3) color: vec4f,
) -> @location(0) vec4f {
    let distance = abs(pixel.xy - center);
    if (all(distance <= vec2f(border))) {
        discard;
    }
    return color;
}
