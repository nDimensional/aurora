const std = @import("std");

const sqlite = @import("sqlite");

const Context = @import("JavaScriptCore/Context.zig");

const Quadtree = @import("Quadtree.zig");

const forces = @import("forces.zig");
const c = @import("c.zig");

const Store = @This();

pub const AreaParams = struct { minX: f32, maxX: f32, minY: f32, maxY: f32, minZ: f32 };
pub const AreaResult = struct { idx: u32 };

const BoundingBoxParams = struct {};
const BoundingBoxResult = struct { bound: f32 = 0 };

pub const Count = struct { count: usize };

allocator: std.mem.Allocator,
prng: std.rand.Xoshiro256 = std.rand.Xoshiro256.init(0),
db: sqlite.Database,

select_min_x: sqlite.Statement(BoundingBoxParams, BoundingBoxResult),
select_max_x: sqlite.Statement(BoundingBoxParams, BoundingBoxResult),
select_min_y: sqlite.Statement(BoundingBoxParams, BoundingBoxResult),
select_max_y: sqlite.Statement(BoundingBoxParams, BoundingBoxResult),
select_ids: sqlite.Statement(AreaParams, AreaResult),
ids: std.ArrayList(u32),

node_count: usize = 0,
edge_count: usize = 0,

source: []u32 = undefined,
target: []u32 = undefined,
x: []f32 = undefined,
y: []f32 = undefined,
incoming_degree: []f32 = undefined,
force: []@Vector(2, f32) = undefined,

quadtree: Quadtree,

attraction: f32 = 0.005,
repulsion: f32 = 50.0,
temperature: f32 = 0.005,

pub fn init(allocator: std.mem.Allocator, path: [*:0]const u8) !Store {
    const db = try sqlite.Database.init(.{ .path = path });

    const select_min_x = try db.prepare(BoundingBoxParams, BoundingBoxResult, "SELECT minX as bound FROM atlas ORDER BY minX ASC LIMIT 1");
    const select_max_x = try db.prepare(BoundingBoxParams, BoundingBoxResult, "SELECT maxX as bound FROM atlas ORDER BY maxX DESC LIMIT 1");
    const select_min_y = try db.prepare(BoundingBoxParams, BoundingBoxResult, "SELECT minY as bound FROM atlas ORDER BY minY ASC LIMIT 1");
    const select_max_y = try db.prepare(BoundingBoxParams, BoundingBoxResult, "SELECT maxY as bound FROM atlas ORDER BY maxY DESC LIMIT 1");

    const select_ids = try db.prepare(AreaParams, AreaResult,
        \\ SELECT idx FROM atlas WHERE :minX <= minX AND maxX <= :maxX AND :minY <= minY AND maxY <= :maxY AND :minZ <= minZ
    );

    var store = Store{
        .allocator = allocator,
        .db = db,

        .select_min_x = select_min_x,
        .select_max_x = select_max_x,
        .select_min_y = select_min_y,
        .select_max_y = select_max_y,
        .select_ids = select_ids,
        .ids = std.ArrayList(u32).init(allocator),

        .quadtree = Quadtree.init(allocator, 0),
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

    store.force = try allocator.alloc(@Vector(2, f32), store.node_count);
    for (0..store.node_count) |i| {
        store.force[i] = .{ 0, 0 };
    }

    return store;
}

pub fn deinit(self: *Store) void {
    self.select_ids.deinit();
    self.db.deinit();

    self.select_min_x.deinit();
    self.select_max_x.deinit();
    self.select_min_y.deinit();
    self.select_max_y.deinit();
    self.ids.deinit();
    self.quadtree.deinit();

    self.allocator.free(self.source);
    self.allocator.free(self.target);
    self.allocator.free(self.x);
    self.allocator.free(self.y);
    self.allocator.free(self.incoming_degree);
    self.allocator.free(self.force);
}

pub fn inject(self: *Store, ctx: Context) !void {
    const global = ctx.getGlobal();

    ctx.setProperty(global, "node_count", ctx.makeNumber(@floatFromInt(self.node_count)));
    ctx.setProperty(global, "edge_count", ctx.makeNumber(@floatFromInt(self.edge_count)));

    ctx.setProperty(global, "source", try ctx.makeTypedArray(u32, self.source));
    ctx.setProperty(global, "target", try ctx.makeTypedArray(u32, self.target));
    ctx.setProperty(global, "x", try ctx.makeTypedArray(f32, self.x));
    ctx.setProperty(global, "y", try ctx.makeTypedArray(f32, self.y));
    ctx.setProperty(global, "incoming_degree", try ctx.makeTypedArray(f32, self.incoming_degree));

    ctx.setProperty(global, "attraction", ctx.makeNumber(self.attraction));
    ctx.setProperty(global, "repulsion", ctx.makeNumber(self.repulsion));
    ctx.setProperty(global, "temperature", ctx.makeNumber(self.temperature));
}

pub fn getBoundingSize(self: Store) !f32 {
    const min_x = try self.getMinX();
    const max_x = try self.getMaxX();
    const min_y = try self.getMinY();
    const max_y = try self.getMaxY();

    const s = @max(@abs(min_x.bound), @abs(max_x.bound), @abs(min_y.bound), @abs(max_y.bound)) * 2;
    return std.math.pow(f32, 2, @ceil(@log2(s)));
}

fn getMinX(self: Store) !BoundingBoxResult {
    try self.select_min_x.bind(.{});
    defer self.select_min_x.reset();
    return try self.select_min_x.step() orelse .{};
}

fn getMaxX(self: Store) !BoundingBoxResult {
    try self.select_max_x.bind(.{});
    defer self.select_max_x.reset();
    return try self.select_max_x.step() orelse .{};
}

fn getMinY(self: Store) !BoundingBoxResult {
    try self.select_min_y.bind(.{});
    defer self.select_min_y.reset();
    return try self.select_min_y.step() orelse .{};
}

fn getMaxY(self: Store) !BoundingBoxResult {
    try self.select_max_y.bind(.{});
    defer self.select_max_y.reset();
    return try self.select_max_y.step() orelse .{};
}

pub fn randomize(self: *Store) void {
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
        self.force[i] = .{ std.math.cos(r), std.math.sin(r) };
        self.force[i] *= @splat(100);
    }
}

pub fn tick(self: *Store) !void {
    const attraction: @Vector(2, f32) = @splat(self.attraction);
    const temperature: @Vector(2, f32) = @splat(self.temperature);

    for (0..self.edge_count) |i| {
        const s = self.source[i] - 1;
        const t = self.target[i] - 1;

        const dx = self.x[t] - self.x[s];
        const dy = self.y[t] - self.y[s];

        const delta = @Vector(2, f32){ dx, dy } * attraction;

        self.force[s] += delta;
        self.force[t] -= delta;
    }

    try self.rebuild();

    for (0..self.node_count) |i| {
        const x = self.x[i];
        const y = self.y[i];
        const mass = self.incoming_degree[i];
        self.force[i] += self.quadtree.getForce(self.repulsion, .{ x, y }, mass);
    }

    for (0..self.node_count) |i| {
        const f = self.force[i] * temperature;
        self.x[i] += f[0];
        self.y[i] += f[1];

        self.force[i] = .{ 0, 0 };
    }
}

pub fn rebuild(self: *Store) !void {
    const s = try self.getBoundingSize();
    self.quadtree.reset(s);

    var i: u32 = 0;
    while (i < self.node_count) : (i += 1) {
        const x = self.x[i];
        const y = self.y[i];
        const mass = self.incoming_degree[i];
        try self.quadtree.insert(i + 1, .{ x, y }, mass);
    }
}

fn getNodeForce(self: *Store, p: @Vector(2, f32), mass: f32) @Vector(2, f32) {
    var force = @Vector(2, f32){ 0, 0 };
    for (0..self.node_count) |i| {
        force += forces.getRepulsion(self.repulsion, p, mass, .{ self.x[i], self.y[i] }, self.incoming_degree[i]);
    }

    return force;
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

pub fn refresh(self: *Store, area: AreaParams) ![]u32 {
    self.ids.clearRetainingCapacity();

    try self.select_ids.bind(area);
    defer self.select_ids.reset();

    while (try self.select_ids.step()) |node| {
        try self.ids.append(node.idx);
    }

    std.log.info("there are {d} nodes in the area", .{self.ids.items.len});
    return self.ids.items;
}
