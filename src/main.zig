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

pub fn main() !void {
    try std.io.getStdOut().writer().print("\n", .{});

    Platform.setFileSystem(fs.filesystem);

    const config = Config.create();
    defer config.destroy();
    // config.setCachePath("/Users/joel/Library/Caches/com.nDimensional.Aurora");
    config.setResourcePathPrefix("SDK/resources/");

    const settings = Settings.create();
    defer settings.destroy();
    settings.setDeveloperName("nDimensional");
    settings.setAppName("Aurora");
    // settings.setFileSystemPath("/Users/joel/Projects/aurora/assets/");

    const app = App.create(settings, config);
    defer app.destroy();

    const width = 600;
    const height = 400;

    const monitor = app.getMainMonitor();
    const flags = Window.Flags.Tilted | Window.Flags.Resizable;
    const window = Window.create(monitor, width, height, false, flags);
    defer window.destroy();

    // const view_config = View.ViewConfig.create();
    // defer view_config.destroy();

    // const renderer = app.getRenderer();
    // const view = View.create(renderer, window.getWidth(), window.getHeight(), view_config, null, 0, .{});
    // defer view.destroy();

    // const overlay = Overlay.createWithView(window, view, 0, 0);
    // defer overlay.destroy();

    const overlay = Overlay.create(window, window.getWidth(), window.getHeight(), 0, 0);
    defer overlay.destroy();

    const view = overlay.getView();
    view.attachCallbacks(.{
        .user_data = view.ptr,
        .onDOMReady = &onDOMReady,
    });

    {
        const html = try File.init("assets/app.html");
        defer html.deinit();
        view.loadHTML(html.data);
    }

    app.run();
}

fn onDOMReady(user_data: ?*anyopaque, caller: c.ULView, frame_id: u64, is_main_frame: bool, url: c.ULString) callconv(.C) void {
    _ = url;
    _ = is_main_frame;
    _ = frame_id;
    _ = caller;

    const view = View{ .ptr = @ptrCast(user_data) };

    const js = File.init("dist/index.js") catch @panic("failed to open file");
    defer js.deinit();

    var exception: c.ULString = null;
    _ = view.evaluateScript(js.data, &exception);
    std.log.info("exception: {s}", .{getString(exception)});
}
