const std = @import("std");

const c = @import("c.zig");

const Platform = @import("Ultralight/Platform.zig");
const Config = @import("Ultralight/Config.zig");
const View = @import("Ultralight/View.zig");

const App = @import("AppCore/App.zig");
const Window = @import("AppCore/Window.zig");
const Overlay = @import("AppCore/Overlay.zig");
const Settings = @import("AppCore/Settings.zig");

const File = @import("File.zig");

const fs = @import("filesystem.zig");
const utils = @import("utils.zig");
const getString = utils.getString;

const Environment = @import("Environment.zig");

pub fn main() !void {
    try std.io.getStdOut().writer().print("\n", .{});

    Platform.setFileSystem(fs.filesystem);

    var env: Environment = undefined;
    try env.init();
    defer env.deinit();

    env.run();
}
