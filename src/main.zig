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
        .onConsoleMessage = &onConsoleMessage,
    });

    window.attachCallbacks(.{
        .user_data = overlay.ptr,
        .onResize = &onWindowResize,
        .onClose = &onWindowClose,
    });

    // {
    //     const html = try File.init("assets/app.html");
    //     defer html.deinit();
    //     view.loadHTML(html.data);
    // }

    {
        // view.loadURL("file://assets/app.html");
        const html = try File.init("assets/app.html");
        defer html.deinit();
        view.loadHTML(html.data);
    }

    app.run();
}

fn onDOMReady(user_data: ?*anyopaque, caller: c.ULView, frame_id: u64, is_main_frame: bool, url: c.ULString) callconv(.C) void {
    _ = user_data;
    _ = url;
    _ = is_main_frame;
    _ = frame_id;

    const view = View{ .ptr = @ptrCast(caller) };

    const js = File.init("dist/index.js") catch @panic("failed to open file");
    defer js.deinit();
    view.evaluateScript(js.data) catch return;
}

fn onConsoleMessage(
    user_data: ?*anyopaque,
    caller: c.ULView,
    source: c.ULMessageSource,
    level: c.ULMessageLevel,
    message: c.ULString,
    line_number: u32,
    column_number: u32,
    source_id: c.ULString,
) callconv(.C) void {
    _ = source_id;
    _ = column_number;
    _ = line_number;
    _ = source;
    _ = caller;
    _ = user_data;

    const log = std.io.getStdOut().writer();
    const err = switch (level + 1) {
        c.kMessageLevel_Log => log.print("[console.log] {s}\n", .{getString(message)}),
        c.kMessageLevel_Warning => log.print("[console.warn] {s}\n", .{getString(message)}),
        c.kMessageLevel_Error => log.print("[console.error] {s}\n", .{getString(message)}),
        c.kMessageLevel_Debug => log.print("[console.debug] {s}\n", .{getString(message)}),
        c.kMessageLevel_Info => log.print("[console.info] {s}\n", .{getString(message)}),
        else => {},
    };

    err catch @panic("fjkdls");
}

fn onWindowClose(user_data: ?*anyopaque, window: c.ULWindow) callconv(.C) void {
    _ = window;
    _ = user_data;
}

fn onWindowResize(user_data: ?*anyopaque, caller: c.ULWindow, width: u32, height: u32) callconv(.C) void {
    _ = height;
    _ = width;

    const window = Window{ .ptr = caller };

    const overlay = Overlay{ .ptr = @ptrCast(user_data) };
    overlay.resize(window.getWidth(), window.getHeight());
}
