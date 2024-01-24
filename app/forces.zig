const std = @import("std");

/// Get the force exerted on A by B
pub fn getRepulsion(repulsion: f32, a: @Vector(2, f32), a_mass: f32, b: @Vector(2, f32), b_mass: f32) @Vector(2, f32) {
    const delta = b - a;

    const norm = @reduce(.Add, delta * delta);
    if (norm == 0) {
        return .{ 0, 0 };
    }

    const dist = std.math.sqrt(norm);

    const f = -repulsion * a_mass * b_mass / (norm * dist);
    return delta * @as(@Vector(2, f32), @splat(f));
}
