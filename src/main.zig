const std = @import("std");

const c = @import("c.zig");

const Environment = @import("Environment.zig");
const Store = @import("Store.zig");
const Context = @import("Context.zig");

pub fn main() !void {
    var env = Environment{};
    try env.init();

    try env.store.init("/Users/joel/Projects/aurora/graph.sqlite");
    defer env.store.deinit();

    // var store = Store{};
    // try store.init("/Users/joel/Projects/aurora/graph.sqlite");
    // defer store.deinit();

    // {
    //     var ctx = Context{};
    //     ctx.init(&env);
    //     defer ctx.deinit();

    //     ctx.setProperty(ctx.global, "wow", ctx.makeString("ok"));
    //     ctx.evaluateScript("console.log(wow)");

    //     const allocator = store.arena.allocator();
    //     var nodes = Context.TypedArray(f32).init(allocator, @as([*]f32, @ptrCast(store.nodes.ptr))[0 .. store.nodes.len * 2]);
    //     var edges = Context.TypedArray(u32).init(allocator, @as([*]u32, @ptrCast(store.edges.ptr))[0 .. store.edges.len * 2]);
    //     var edges_array = ctx.makeTypedArray(u32, &edges);
    //     var nodes_array = ctx.makeTypedArray(f32, &nodes);
    //     ctx.setProperty(ctx.global, "edges", edges_array);
    //     ctx.setProperty(ctx.global, "nodes", nodes_array);
    //     ctx.evaluateScript("console.log(nodes)");
    //     ctx.evaluateScript("console.log(edges)");
    // }

    try env.load("/Users/joel/Projects/aurora/assets/app.html");

    env.run();
}

fn deallocate(ptr: ?*anyopaque, env_ptr: ?*anyopaque) callconv(.C) void {
    std.log.info("deallocate({any}, {any})", .{ ptr, env_ptr });
}
