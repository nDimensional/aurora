const std = @import("std");

const forces = @import("forces.zig");
const Quadtree = @This();

pub const Quadrant = enum { sw, nw, se, ne };

pub const Area = packed struct {
    s: f32 = 0,
    c: @Vector(2, f32) = .{ 0, 0 },

    pub fn locate(area: Area, point: @Vector(2, f32)) Quadrant {
        const q = point < area.c;

        if (q[0]) {
            if (q[1]) {
                return .sw;
            } else {
                return .nw;
            }
        } else {
            if (q[1]) {
                return .se;
            } else {
                return .ne;
            }
        }
    }

    pub fn divide(area: Area, quadrant: Quadrant) Area {
        const s = area.s / 2;
        const delta: @Vector(2, f32) = switch (quadrant) {
            .sw => .{ -s, -s },
            .nw => .{ -s, s },
            .se => .{ s, -s },
            .ne => .{ s, s },
        };

        return .{ .s = s, .c = area.c + delta };
    }
};

pub const Node = packed struct {
    pub const NULL = std.math.maxInt(u32);

    idx: u32 = 0,
    center: @Vector(2, f32) = .{ 0, 0 },
    mass: f32 = 0,
    sw: u32 = NULL,
    nw: u32 = NULL,
    se: u32 = NULL,
    ne: u32 = NULL,

    pub fn update(node: *Node, point: @Vector(2, f32), mass: f32) void {
        const node_mass: @Vector(2, f32) = @splat(node.mass);
        const point_mass: @Vector(2, f32) = @splat(mass);
        const total_mass: @Vector(2, f32) = @splat(node.mass + mass);
        node.center = (node.center * node_mass + point * point_mass) / total_mass;
        node.mass = node.mass + mass;
    }

    pub fn getQuadrant(node: Node, quadrant: Quadrant) u32 {
        return switch (quadrant) {
            .sw => node.sw,
            .nw => node.nw,
            .se => node.se,
            .ne => node.ne,
        };
    }

    pub fn setQuadrant(node: *Node, quadrant: Quadrant, index: u32) void {
        switch (quadrant) {
            .sw => node.sw = index,
            .nw => node.nw = index,
            .se => node.se = index,
            .ne => node.ne = index,
        }
    }
};

area: Area,
nodes: std.ArrayList(Node),

pub fn init(allocator: std.mem.Allocator, s: f32) Quadtree {
    return .{ .nodes = std.ArrayList(Node).init(allocator), .area = .{ .s = s } };
}

pub fn deinit(self: *Quadtree) void {
    self.nodes.deinit();
}

pub fn reset(self: *Quadtree, s: f32) void {
    self.area = .{ .s = s };
    self.nodes.clearRetainingCapacity();
}

pub fn insert(self: *Quadtree, idx: u32, position: @Vector(2, f32), mass: f32) !void {
    std.debug.assert(idx > 0);
    if (self.nodes.items.len == 0) {
        try self.nodes.append(Node{ .idx = idx, .center = position, .mass = mass });
    } else {
        try self.insertNode(0, self.area, idx, position, mass);
    }
}

fn insertNode(self: *Quadtree, node_id: u32, area: Area, idx: u32, position: @Vector(2, f32), mass: f32) !void {
    if (node_id >= self.nodes.items.len) {
        @panic("index out of range");
    }

    if (self.nodes.items[node_id].idx != 0) {
        const index: u32 = @intCast(self.nodes.items.len);
        try self.nodes.append(self.nodes.items[node_id]);

        self.nodes.items[node_id].idx = 0;
        self.nodes.items[node_id].setQuadrant(area.locate(self.nodes.items[node_id].center), index);
    }

    self.nodes.items[node_id].update(position, mass);

    const quadrant = area.locate(position);
    const child = self.nodes.items[node_id].getQuadrant(quadrant);
    if (child != Node.NULL) {
        try self.insertNode(child, area.divide(quadrant), idx, position, mass);
    } else {
        const index: u32 = @intCast(self.nodes.items.len);
        try self.nodes.append(.{ .idx = idx, .center = position, .mass = mass });
        self.nodes.items[node_id].setQuadrant(quadrant, index);
    }
}

pub fn getForce(self: *Quadtree, repulsion: f32, p: @Vector(2, f32), mass: f32) @Vector(2, f32) {
    return self.getForceNode(repulsion, 0, self.area.s, p, mass);
}

const threshold = 0.5;

fn getForceNode(self: *Quadtree, repulsion: f32, node_id: u32, s: f32, p: @Vector(2, f32), mass: f32) @Vector(2, f32) {
    if (node_id >= self.nodes.items.len) {
        @panic("index out of range");
    }

    const node = self.nodes.items[node_id];

    if (node.idx != 0) {
        return forces.getRepulsion(repulsion, p, mass, node.center, node.mass);
    } else {
        const delta = node.center - p;
        const norm = @reduce(.Add, delta * delta);
        const d = std.math.sqrt(norm);
        if (s / d < threshold) {
            return forces.getRepulsion(repulsion, p, mass, node.center, node.mass);
        } else {
            var f = @Vector(2, f32){ 0, 0 };
            if (node.sw != Node.NULL) f += self.getForceNode(repulsion, node.sw, s / 2, p, mass);
            if (node.nw != Node.NULL) f += self.getForceNode(repulsion, node.nw, s / 2, p, mass);
            if (node.se != Node.NULL) f += self.getForceNode(repulsion, node.se, s / 2, p, mass);
            if (node.ne != Node.NULL) f += self.getForceNode(repulsion, node.ne, s / 2, p, mass);

            return f;
        }
    }
}

pub fn print(self: *Quadtree, log: std.fs.File.Writer) !void {
    try self.printNode(log, 0, 1);
}

fn printNode(self: *Quadtree, log: std.fs.File.Writer, node_id: u32, depth: usize) !void {
    //

    if (node_id >= self.nodes.items.len) {
        @panic("index out of range");
    }

    const node = self.nodes.items[node_id];

    if (node.idx == 0) {
        try log.print("node_id {d}\n", .{node_id});
        if (node.sw != Node.NULL) {
            try log.writeByteNTimes(' ', depth * 2);
            try log.print("sw: ", .{});
            try self.printNode(log, node.sw, depth + 1);
        }
        if (node.nw != Node.NULL) {
            try log.writeByteNTimes(' ', depth * 2);
            try log.print("nw: ", .{});
            try self.printNode(log, node.nw, depth + 1);
        }
        if (node.se != Node.NULL) {
            try log.writeByteNTimes(' ', depth * 2);
            try log.print("se: ", .{});
            try self.printNode(log, node.se, depth + 1);
        }
        if (node.ne != Node.NULL) {
            try log.writeByteNTimes(' ', depth * 2);
            try log.print("ne: ", .{});
            try self.printNode(log, node.ne, depth + 1);
        }
    } else {
        try log.print("idx #{d}\n", .{node.idx});
    }
}
