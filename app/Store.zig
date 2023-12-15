const std = @import("std");

const sqlite = @import("sqlite");

const Context = @import("JavaScriptCore/Context.zig");

const c = @import("c.zig");
const utils = @import("utils.zig");
const getString = utils.getString;

const Store = @This();

pub const Node = packed struct { x: f32 = 0, y: f32 = 0, dx: f32 = 0, dy: f32 = 0 };
pub const Edge = packed struct { sourcex: u32, targetx: u32 };

arena: std.heap.ArenaAllocator = undefined,
db: sqlite.Db = undefined,
nodes: []Node = undefined,
edges: []Edge = undefined,
prng: std.rand.Xoshiro256 = std.rand.Xoshiro256.init(0),

attraction: f32 = 0.0007,
repulsion: f32 = 1000.0,
temperature: f32 = 0.1,

pub fn init(path: [:0]const u8) !Store {
    var store = Store{};
    store.arena = std.heap.ArenaAllocator.init(std.heap.c_allocator);
    store.db = try sqlite.Db.init(.{
        .mode = sqlite.Db.Mode{ .File = path },
        .open_flags = .{ .write = false, .create = false },
    });

    const allocator = store.arena.allocator();

    var get_edges = try store.db.prepare("SELECT sourcex, targetx FROM edges");
    defer get_edges.deinit();
    store.edges = try get_edges.all(Edge, allocator, .{}, .{});
    std.log.info("edges.len: {d}", .{store.edges.len});

    var get_nodes = try store.db.prepare("SELECT x, y, dx, dy FROM nodes");
    defer get_nodes.deinit();
    store.nodes = try get_nodes.all(Node, allocator, .{}, .{});
    std.log.info("nodes.len: {d}", .{store.nodes.len});

    var random = store.prng.random();
    for (store.nodes) |*node| {
        node.x = @floatFromInt(random.uintLessThan(u32, 720));
        node.y = @floatFromInt(random.uintLessThan(u32, 720));
    }

    return store;
}

pub fn deinit(self: *Store) void {
    self.arena.deinit();
    self.db.deinit();
}

pub fn inject(self: *Store, ctx: *Context) !void {
    var exception: c.JSValueRef = null;

    const nodes = c.JSObjectMakeTypedArrayWithBytesNoCopy(
        ctx.ref,
        c.kJSTypedArrayTypeFloat32Array,
        self.nodes.ptr,
        self.nodes.len * @sizeOf(Node),
        null,
        null,
        &exception,
    );

    if (nodes == null) {
        std.log.err("error creating nodes array", .{});
        return error.Exception;
    }

    const edges = c.JSObjectMakeTypedArrayWithBytesNoCopy(
        ctx.ref,
        c.kJSTypedArrayTypeUint32Array,
        self.edges.ptr,
        self.edges.len * @sizeOf(Edge),
        null,
        null,
        &exception,
    );

    if (edges == null) {
        std.log.err("error creating edges array", .{});
        return error.Exception;
    }

    const global = ctx.getGlobal();
    ctx.setProperty(global, "nodes", nodes);
    ctx.setProperty(global, "edges", edges);
    ctx.setProperty(global, "attraction", ctx.makeNumber(self.attraction));
    ctx.setProperty(global, "repulsion", ctx.makeNumber(self.repulsion));
    ctx.setProperty(global, "temperature", ctx.makeNumber(self.temperature));
}

pub fn tick(self: *Store) !void {
    for (self.edges) |edge| {
        const source = &self.nodes[edge.sourcex - 1];
        const target = &self.nodes[edge.targetx - 1];

        const dx = target.x - source.x;
        source.dx += dx * self.attraction;
        target.dx -= dx * self.attraction;

        const dy = target.y - source.y;
        source.dy += dy * self.attraction;
        target.dy -= dy * self.attraction;
    }

    for (self.nodes, 0..) |a, i| {
        for (self.nodes, 0..) |b, j| {
            if (i == j) {
                continue;
            }

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const norm = (dx * dx) + (dy * dy);
            if (norm == 0) {
                continue;
            }

            const dist = std.math.sqrt(norm);

            self.nodes[i].dx -= (self.repulsion * dx) / (norm * dist);
            self.nodes[i].dy -= (self.repulsion * dy) / (norm * dist);
        }
    }

    for (self.nodes) |*node| {
        node.x += node.dx * self.temperature;
        if (node.x < 0) node.x = 0;
        if (node.x > 720) node.x = 720;

        node.y += node.dy * self.temperature;
        if (node.y < 0) node.y = 0;
        if (node.y > 720) node.y = 720;

        node.dx = 0;
        node.dy = 0;
    }
}
