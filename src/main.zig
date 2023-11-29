const std = @import("std");

const Context = @import("Context.zig");

pub fn main() !void {
    var ctx = Context{};
    ctx.init();
    try ctx.load("/Users/joel/Projects/aurora/assets/app.html");
    ctx.run();
}
