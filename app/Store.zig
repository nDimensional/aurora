const std = @import("std");

const sqlite = @import("sqlite");
const c = @import("c.zig");

const Store = @This();

pub const Node = packed struct { x: f32 = 0, y: f32 = 0 };
pub const Edge = packed struct { sourcex: u32, targetx: u32 };

db: sqlite.Db = undefined,
arena: std.heap.ArenaAllocator = undefined,
nodes: []Node = undefined,
edges: []Edge = undefined,

pub fn init(store: *Store, path: [:0]const u8) !void {
    store.arena = std.heap.ArenaAllocator.init(std.heap.c_allocator);
    store.db = try sqlite.Db.init(.{
        .mode = sqlite.Db.Mode{ .File = path },
        .open_flags = .{ .write = false, .create = false },
    });

    const allocator = store.arena.allocator();

    {
        var get_edges = try store.db.prepare("SELECT sourcex, targetx FROM edges");
        defer get_edges.deinit();
        store.edges = try get_edges.all(Edge, allocator, .{}, .{});
        std.log.info("edges.len: {d}", .{store.edges.len});
    }

    {
        var get_nodes = try store.db.prepare("SELECT x, y FROM nodes");
        defer get_nodes.deinit();
        store.nodes = try get_nodes.all(Node, allocator, .{}, .{});
        std.log.info("nodes.len: {d}", .{store.nodes.len});
    }
}

pub fn deinit(store: *Store) void {
    store.arena.deinit();
    store.db.deinit();
}
