const std = @import("std");

const ul = @import("ul");
const Platform = ul.Ultralight.Platform;

const Environment = @import("Environment.zig");

pub fn main() !void {
    try std.io.getStdOut().writer().print("\n", .{});

    Platform.setFileSystem(Platform.filesystem);
    // Platform.setLogger(Platform.logger);

    var env: Environment = undefined;
    try env.init();
    defer env.deinit();

    env.run();
}
