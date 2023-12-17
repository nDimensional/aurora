const std = @import("std");

const sqlite = @import("sqlite");

const Context = @import("JavaScriptCore/Context.zig");

const c = @import("c.zig");
const utils = @import("utils.zig");
const getString = utils.getString;

const Store = @This();

arena: std.heap.ArenaAllocator = undefined,
prng: std.rand.Xoshiro256 = std.rand.Xoshiro256.init(0),
db: sqlite.Db = undefined,

node_count: usize = 0,
edge_count: usize = 0,

source: []u32 = undefined,
target: []u32 = undefined,
x: []f32 = undefined,
y: []f32 = undefined,
dx: []f32 = undefined,
dy: []f32 = undefined,
outgoing_degree: []u32 = undefined,
incoming_degree: []u32 = undefined,

attraction: f32 = 0.005,
repulsion: f32 = 50.0,
temperature: f32 = 0.1,

pub fn init(path: [:0]const u8) !Store {
    var store = Store{};
    store.arena = std.heap.ArenaAllocator.init(std.heap.c_allocator);
    store.db = try sqlite.Db.init(.{
        .mode = sqlite.Db.Mode{ .File = path },
        .open_flags = .{ .write = false, .create = false },
    });

    const allocator = store.arena.allocator();

    store.source = try store.selectAll(u32, "SELECT sourcex FROM edges", allocator);
    store.target = try store.selectAll(u32, "SELECT targetx FROM edges", allocator);
    store.x = try store.selectAll(f32, "SELECT x FROM nodes", allocator);
    store.y = try store.selectAll(f32, "SELECT y FROM nodes", allocator);
    store.dx = try allocator.alloc(f32, store.x.len);
    store.dy = try allocator.alloc(f32, store.y.len);
    store.incoming_degree = try store.selectAll(u32, "SELECT incoming_degree FROM nodes", allocator);
    store.outgoing_degree = try store.selectAll(u32, "SELECT outgoing_degree FROM nodes", allocator);

    store.node_count = @max(store.x.len, store.y.len);
    store.edge_count = @max(store.source.len, store.source.len);

    var random = store.prng.random();
    for (0..store.node_count) |i| {
        store.x[i] = @floatFromInt(random.uintLessThan(u32, 720));
        store.y[i] = @floatFromInt(random.uintLessThan(u32, 720));
        store.dx[i] = 0;
        store.dy[i] = 0;
    }

    return store;
}

pub fn deinit(self: *Store) void {
    self.arena.deinit();
    self.db.deinit();
}

pub fn inject(self: *Store, ctx: Context) !void {
    const global = ctx.getGlobal();

    ctx.setProperty(global, "source", try ctx.makeTypedArray(u32, self.source));
    ctx.setProperty(global, "target", try ctx.makeTypedArray(u32, self.target));
    ctx.setProperty(global, "x", try ctx.makeTypedArray(f32, self.x));
    ctx.setProperty(global, "y", try ctx.makeTypedArray(f32, self.y));
    ctx.setProperty(global, "dx", try ctx.makeTypedArray(f32, self.dx));
    ctx.setProperty(global, "dy", try ctx.makeTypedArray(f32, self.dy));
    ctx.setProperty(global, "incoming_degree", try ctx.makeTypedArray(u32, self.incoming_degree));
    ctx.setProperty(global, "outgoing_degree", try ctx.makeTypedArray(u32, self.outgoing_degree));

    ctx.setProperty(global, "attraction", ctx.makeNumber(self.attraction));
    ctx.setProperty(global, "repulsion", ctx.makeNumber(self.repulsion));
    ctx.setProperty(global, "temperature", ctx.makeNumber(self.temperature));
}

pub fn tick(self: *Store) !void {
    for (0..self.edge_count) |i| {
        const s = self.source[i] - 1;
        const t = self.target[i] - 1;

        const dx = self.x[t] - self.x[s];
        self.dx[s] += dx * self.attraction;
        self.dx[t] -= dx * self.attraction;

        const dy = self.y[t] - self.y[s];
        self.dy[s] += dy * self.attraction;
        self.dy[t] -= dy * self.attraction;
    }

    for (0..self.node_count) |i| {
        const i_mass: f32 = @floatFromInt(self.incoming_degree[i]);
        for (0..self.node_count) |j| {
            if (i == j) {
                continue;
            }

            const j_mass: f32 = @floatFromInt(self.incoming_degree[j]);

            const dx = self.x[j] - self.x[i];
            const dy = self.y[j] - self.y[i];
            const norm = (dx * dx) + (dy * dy);
            if (norm == 0) {
                continue;
            }

            const dist = std.math.sqrt(norm);
            const f = self.repulsion * i_mass * j_mass / (norm * dist);
            self.dx[i] -= f * dx;
            self.dy[i] -= f * dy;
        }
    }

    for (0..self.node_count) |i| {
        self.x[i] += self.dx[i] * self.temperature;
        if (self.x[i] < 0) self.x[i] = 0;
        if (self.x[i] > 720) self.x[i] = 720;

        self.y[i] += self.dy[i] * self.temperature;
        if (self.y[i] < 0) self.y[i] = 0;
        if (self.y[i] > 720) self.y[i] = 720;

        self.dx[i] = 0;
        self.dy[i] = 0;
    }
}

fn selectAll(self: *Store, comptime T: type, comptime sql: []const u8, allocator: std.mem.Allocator) ![]T {
    var statement = try self.db.prepare(sql);
    defer statement.deinit();
    return try statement.all(T, allocator, .{}, .{});
}
