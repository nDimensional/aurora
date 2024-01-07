const std = @import("std");

const sqlite = @import("sqlite");

const Context = @import("JavaScriptCore/Context.zig");

const c = @import("c.zig");
const utils = @import("utils.zig");
const getString = utils.getString;

const allocator = std.heap.c_allocator;

const Store = @This();

// arena: std.heap.ArenaAllocator = undefined,
prng: std.rand.Xoshiro256 = std.rand.Xoshiro256.init(0),
db: sqlite.Database = undefined,

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
temperature: f32 = 0.005,

pub fn init(path: [*:0]const u8) !Store {
    var store = Store{};
    // store.arena = std.heap.ArenaAllocator.init(std.heap.c_allocator);
    store.db = try sqlite.Database.openZ(path, .{});

    // const allocator = store.arena.allocator();

    // {
    //     const nodes = try store.selectAll(u32, "SELECT id FROM atlas WHERE minX > 200 and maxX < 300 and minY > 500 and maxY < 600", allocator);
    //     defer allocator.free(nodes);

    //     std.log.info("GOT NODES: {any}", .{nodes});
    // }

    {
        const Edge = struct { sourcex: u32, targetx: u32 };
        const q = try sqlite.Query(struct {}, Edge).init(store.db, "SELECT sourcex, targetx FROM edges");
        defer q.deinit();

        var source = std.ArrayList(u32).init(allocator);
        defer source.deinit();

        var target = std.ArrayList(u32).init(allocator);
        defer target.deinit();

        try q.bind(.{});
        while (try q.step()) |edge| {
            try source.append(edge.sourcex);
            try target.append(edge.targetx);
        }

        store.source = try source.toOwnedSlice();
        store.target = try target.toOwnedSlice();

        std.log.info("store.source.len: {d}", .{store.source.len});
        std.log.info("store.target.len: {d}", .{store.target.len});
    }

    {
        const Node = struct { x: f32, y: f32, incoming_degree: u32, outgoing_degree: u32 };
        const q = try sqlite.Query(struct {}, Node).init(store.db,
            \\ SELECT x, y, incoming_degree, outgoing_degree FROM nodes
        );
        defer q.deinit();

        var x = std.ArrayList(f32).init(allocator);
        defer x.deinit();

        var y = std.ArrayList(f32).init(allocator);
        defer y.deinit();

        var incoming_degree = std.ArrayList(u32).init(allocator);
        defer incoming_degree.deinit();

        var outgoing_degree = std.ArrayList(u32).init(allocator);
        defer outgoing_degree.deinit();

        try q.bind(.{});
        while (try q.step()) |node| {
            try x.append(node.x);
            try y.append(node.y);
            try incoming_degree.append(node.incoming_degree);
            try outgoing_degree.append(node.outgoing_degree);
        }

        store.x = try x.toOwnedSlice();
        store.y = try y.toOwnedSlice();
        store.incoming_degree = try incoming_degree.toOwnedSlice();
        store.outgoing_degree = try outgoing_degree.toOwnedSlice();

        std.log.info("store.x.len: {d}", .{store.x.len});
        std.log.info("store.y.len: {d}", .{store.y.len});
        std.log.info("store.incoming_degree.len: {d}", .{store.incoming_degree.len});
        std.log.info("store.outgoing_degree.len: {d} ", .{store.outgoing_degree.len});
    }

    // store.source = try store.selectAll(u32, "SELECT sourcex FROM edges", allocator);
    // store.target = try store.selectAll(u32, "SELECT targetx FROM edges", allocator);
    // store.x = try store.selectAll(f32, "SELECT x FROM nodes", allocator);
    // store.y = try store.selectAll(f32, "SELECT y FROM nodes", allocator);
    // store.incoming_degree = try store.selectAll(u32, "SELECT incoming_degree FROM nodes", allocator);
    // store.outgoing_degree = try store.selectAll(u32, "SELECT outgoing_degree FROM nodes", allocator);

    store.dx = try allocator.alloc(f32, store.x.len);
    store.dy = try allocator.alloc(f32, store.y.len);

    store.node_count = @max(store.x.len, store.y.len);
    store.edge_count = @max(store.source.len, store.source.len);

    for (0..store.node_count) |i| {
        store.dx[i] = 0;
        store.dy[i] = 0;
    }

    return store;
}

fn randomize(self: *Store) void {
    var random = self.prng.random();
    for (0..self.node_count) |i| {
        self.x[i] = @floatFromInt(random.uintLessThan(u32, 720));
        self.x[i] -= 360;
        self.y[i] = @floatFromInt(random.uintLessThan(u32, 720));
        self.y[i] -= 360;
    }
}

pub fn deinit(self: *Store) void {
    self.arena.deinit();
    self.db.close() catch |err| @panic(@errorName(err));
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
        // if (self.x[i] < -360) self.x[i] = -360;
        // if (self.x[i] > 360) self.x[i] = 360;

        self.y[i] += self.dy[i] * self.temperature;
        // if (self.y[i] < -360) self.y[i] = -360;
        // if (self.y[i] > 360) self.y[i] = 360;

        self.dx[i] = 0;
        self.dy[i] = 0;
    }
}

pub fn save(self: *Store) !void {
    const update = try sqlite.Method(struct { x: f32, y: f32, idx: u32 }).init(self.db,
        \\ UPDATE nodes SET x = :x, y = :y WHERE idx = :idx
    );

    defer update.deinit();

    // var statement = try self.db.prepare("UPDATE nodes SET x = ?{f32}, y = ?{f32} WHERE idx = ?{u32}");
    // defer statement.deinit();

    for (0..self.node_count) |i| {
        try update.exec(.{ .x = self.x[i], .y = self.y[i], .idx = @as(u32, @intCast(i + 1)) });
        // try update.exec(.{}, .{ self.x[i], self.y[i], @as(u32, @intCast(i + 1)) });
        // update.reset();
    }
}

// fn selectAll(self: *Store, comptime T: type, comptime sql: []const u8, allocator: std.mem.Allocator) ![]T {
//     var statement = try self.db.prepare(sql);
//     defer statement.deinit();
//     return try statement.all(T, allocator, .{}, .{});
// }
