const std = @import("std");

const sqlite = @import("sqlite");

const Context = @import("JavaScriptCore/Context.zig");

const c = @import("c.zig");
const utils = @import("utils.zig");
const getString = utils.getString;

const Store = @This();

pub const AreaParams = struct { minX: f32, maxX: f32, minY: f32, maxY: f32 };
pub const AreaResult = struct { idx: u32 };

pub const Count = struct { count: usize };

allocator: std.mem.Allocator,
prng: std.rand.Xoshiro256 = std.rand.Xoshiro256.init(0),
db: sqlite.Database,

select_ids: sqlite.Statement(AreaParams, AreaResult),
ids: std.ArrayList(u32),

node_count: usize = 0,
edge_count: usize = 0,

source: []u32 = undefined,
target: []u32 = undefined,
x: []f32 = undefined,
y: []f32 = undefined,
dx: []f32 = undefined,
dy: []f32 = undefined,
incoming_degree: []f32 = undefined,

attraction: f32 = 0.005,
repulsion: f32 = 50.0,
temperature: f32 = 0.005,

pub fn init(allocator: std.mem.Allocator, path: [*:0]const u8) !Store {
    const db = try sqlite.Database.init(.{ .path = path });
    const select_ids = try db.prepare(AreaParams, AreaResult,
        \\ SELECT idx FROM atlas WHERE :minX <= minX AND maxX <= :maxX AND :minY < minY AND maxY <= :maxY
    );

    var store = Store{
        .allocator = allocator,
        .db = db,

        .select_ids = select_ids,
        .ids = std.ArrayList(u32).init(allocator),
    };

    {
        const count_edges = try store.db.prepare(struct {}, Count, "SELECT count(*) as count FROM edges");
        defer count_edges.deinit();

        try count_edges.bind(.{});
        if (try count_edges.step()) |result| {
            store.edge_count = result.count;
        }
    }

    store.source = try allocator.alloc(u32, store.edge_count);
    store.target = try allocator.alloc(u32, store.edge_count);

    {
        const Edge = struct { source: u32, target: u32 };
        const select_edges = try store.db.prepare(struct {}, Edge, "SELECT source, target FROM edges");
        defer select_edges.deinit();

        try select_edges.bind(.{});
        defer select_edges.reset();

        var i: usize = 0;
        while (try select_edges.step()) |edge| : (i += 1) {
            store.source[i] = edge.source;
            store.target[i] = edge.target;
        }
    }

    {
        const count_nodes = try store.db.prepare(struct {}, Count, "SELECT count(*) as count FROM nodes");
        defer count_nodes.deinit();

        try count_nodes.bind(.{});
        defer count_nodes.reset();

        if (try count_nodes.step()) |result| {
            store.node_count = result.count;
        }
    }

    store.x = try allocator.alloc(f32, store.node_count);
    store.y = try allocator.alloc(f32, store.node_count);
    store.incoming_degree = try allocator.alloc(f32, store.node_count);

    {
        const Node = struct { idx: u32, x: f32, y: f32, incoming_degree: f32 };
        const select_nodes = try store.db.prepare(struct {}, Node,
            \\ SELECT idx, minX AS x, minY AS y, minZ AS incoming_degree FROM atlas
        );
        defer select_nodes.deinit();

        var incoming_degree = std.ArrayList(f32).init(allocator);
        defer incoming_degree.deinit();

        try select_nodes.bind(.{});
        defer select_nodes.reset();
        while (try select_nodes.step()) |node| {
            const i = node.idx - 1;
            store.x[i] = node.x;
            store.y[i] = node.y;
            store.incoming_degree[i] = node.incoming_degree;
        }
    }

    store.dx = try allocator.alloc(f32, store.node_count);
    store.dy = try allocator.alloc(f32, store.node_count);
    for (0..store.node_count) |i| {
        store.dx[i] = 0;
        store.dy[i] = 0;
    }

    // store.randomize();

    return store;
}

pub fn deinit(self: *Store) void {
    self.select_ids.deinit();
    self.db.deinit();

    self.ids.deinit();

    self.allocator.free(self.source);
    self.allocator.free(self.target);
    self.allocator.free(self.x);
    self.allocator.free(self.y);
    self.allocator.free(self.incoming_degree);
    self.allocator.free(self.dx);
    self.allocator.free(self.dy);
}

pub fn inject(self: *Store, ctx: Context) !void {
    const global = ctx.getGlobal();

    ctx.setProperty(global, "source", try ctx.makeTypedArray(u32, self.source));
    ctx.setProperty(global, "target", try ctx.makeTypedArray(u32, self.target));
    ctx.setProperty(global, "x", try ctx.makeTypedArray(f32, self.x));
    ctx.setProperty(global, "y", try ctx.makeTypedArray(f32, self.y));
    ctx.setProperty(global, "dx", try ctx.makeTypedArray(f32, self.dx));
    ctx.setProperty(global, "dy", try ctx.makeTypedArray(f32, self.dy));
    ctx.setProperty(global, "incoming_degree", try ctx.makeTypedArray(f32, self.incoming_degree));

    ctx.setProperty(global, "attraction", ctx.makeNumber(self.attraction));
    ctx.setProperty(global, "repulsion", ctx.makeNumber(self.repulsion));
    ctx.setProperty(global, "temperature", ctx.makeNumber(self.temperature));
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

pub fn boop(self: *Store) void {
    var random = self.prng.random();
    for (0..self.node_count) |i| {
        const r = random.float(f32) * std.math.tau;
        self.dx[i] = 100 * std.math.cos(r);
        self.dy[i] = 100 * std.math.sin(r);
    }
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
        const i_mass = self.incoming_degree[i];
        for (0..self.node_count) |j| {
            if (i == j) {
                continue;
            }

            const j_mass = self.incoming_degree[j];

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
    const Node = struct { x: f32, y: f32, idx: u32 };
    const update = try self.db.prepare(Node, void, "UPDATE atlas SET minX = :x, maxX = :x, minY = :y, maxY = :y WHERE idx = :idx");
    defer update.deinit();

    for (0..self.node_count) |i| {
        const idx: u32 = @intCast(i + 1);
        try update.exec(.{ .x = self.x[i], .y = self.y[i], .idx = idx });
    }
}

pub fn count(self: *Store, area: AreaParams) !void {
    self.ids.shrinkRetainingCapacity(0);

    try self.select_ids.bind(area);
    defer self.select_ids.reset();

    while (try self.select_ids.step()) |node| {
        try self.ids.append(node.idx);
    }

    std.log.info("there are {d} nodes in the area", .{self.ids.items.len});
}
