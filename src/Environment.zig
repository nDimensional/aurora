const std = @import("std");

const c = @import("c.zig");
const File = @import("File.zig");
const fs = @import("filesystem.zig");
const utils = @import("utils.zig");
const Context = @import("Context.zig");
const Store = @import("Store.zig");

const Environment = @This();

store: Store = Store{},
log: std.fs.File.Writer = std.io.getStdOut().writer(),

app: c.ULApp = null,
window: c.ULWindow = null,
view: c.ULView = null,
overlay: c.ULOverlay = null,
exception: c.ULString = null,

pub fn init(env: *Environment) !void {
    c.ulPlatformSetFileSystem(fs.filesystem);

    std.log.info("hello world", .{});
    const config = c.ulCreateConfig();
    defer c.ulDestroyConfig(config);

    c.ulConfigSetCachePath(config, c.ulCreateString("/Users/joel/Library/Caches/com.MyCompany.Aurora"));
    c.ulConfigSetResourcePathPrefix(config, c.ulCreateString("/Users/joel/Projects/aurora/SDK/resources/"));

    const settings = c.ulCreateSettings();
    defer c.ulDestroySettings(settings);
    c.ulSettingsSetDeveloperName(settings, c.ulCreateString("nDimensional"));
    c.ulSettingsSetAppName(settings, c.ulCreateString("Aurora"));
    c.ulSettingsSetFileSystemPath(settings, c.ulCreateString("/Users/joel/Projects/aurora/assets/"));

    env.app = c.ulCreateApp(settings, config);
    c.ulAppSetUpdateCallback(env.app, &handleAppUpdate, env);

    const flags = c.kWindowFlags_Titled | c.kWindowFlags_Resizable;
    env.window = c.ulCreateWindow(c.ulAppGetMainMonitor(env.app), 600, 400, false, flags);
    c.ulWindowSetCloseCallback(env.window, &handleWindowClose, env);
    c.ulWindowSetResizeCallback(env.window, &handleWindowResize, env);

    const width = c.ulWindowGetWidth(env.window);
    const height = c.ulWindowGetHeight(env.window);
    env.overlay = c.ulCreateOverlay(env.window, width, height, 0, 0);

    env.view = c.ulOverlayGetView(env.overlay);
    c.ulViewSetBeginLoadingCallback(env.view, &handleViewBeginLoading, env);
    c.ulViewSetFinishLoadingCallback(env.view, &handleViewFinishLoading, env);
    c.ulViewSetFailLoadingCallback(env.view, &handleViewFailLoading, env);

    c.ulViewSetDOMReadyCallback(env.view, &handleViewDOMReady, env);
    c.ulViewSetChangeTitleCallback(env.view, &handleViewChangeTitle, env);
    c.ulViewSetAddConsoleMessageCallback(env.view, &handleViewConsoleMessage, env);
}

pub fn load(self: *Environment, html_path: []const u8) !void {
    const html = try File.init(html_path);
    defer html.deinit();
    c.ulViewLoadHTML(self.view, c.ulCreateStringUTF8(html.data.ptr, html.data.len));
}

pub fn run(self: *Environment) void {
    c.ulAppRun(self.app);
}

fn handleAppUpdate(user_data: ?*anyopaque) callconv(.C) void {
    const env: *Environment = @alignCast(@ptrCast(user_data));
    _ = env;
}

fn handleWindowClose(user_data: ?*anyopaque, _: c.ULWindow) callconv(.C) void {
    const env: *Environment = @alignCast(@ptrCast(user_data));
    _ = env;

    std.log.info("handleWindowClose()", .{});
}

fn handleWindowResize(user_data: ?*anyopaque, _: c.ULWindow, width: c_uint, height: c_uint) callconv(.C) void {
    const env: *Environment = @alignCast(@ptrCast(user_data));
    c.ulOverlayResize(env.overlay, width, height);
}

fn handleViewBeginLoading(user_data: ?*anyopaque, _: c.ULView, _: c_ulonglong, _: bool, url: c.ULString) callconv(.C) void {
    const env: *Environment = @alignCast(@ptrCast(user_data));
    _ = env;
    _ = url;

    std.log.info("handleViewBeginLoading", .{});
}

fn handleViewFinishLoading(user_data: ?*anyopaque, _: c.ULView, _: c_ulonglong, _: bool, url: c.ULString) callconv(.C) void {
    const env: *Environment = @alignCast(@ptrCast(user_data));
    _ = env;
    _ = url;

    std.log.info("handleViewFinishLoading", .{});
}

fn handleViewFailLoading(user_data: ?*anyopaque, _: c.ULView, _: c_ulonglong, _: bool, url: c.ULString, description: c.ULString, error_domain: c.ULString, error_code: c_int) callconv(.C) void {
    const env: *Environment = @alignCast(@ptrCast(user_data));
    _ = env;
    _ = error_code;
    _ = error_domain;
    _ = description;
    _ = url;

    std.log.info("handleViewFailLoading", .{});
}

fn handleViewChangeTitle(user_data: ?*anyopaque, _: c.ULView, title: c.ULString) callconv(.C) void {
    const env: *Environment = @alignCast(@ptrCast(user_data));

    c.ulWindowSetTitle(env.window, c.ulStringGetData(title));
}

fn handleViewConsoleMessage(
    user_data: ?*anyopaque,
    caller: c.ULView,
    source: c.ULMessageSource,
    level: c.ULMessageLevel,
    message: c.ULString,
    line_number: c_uint,
    column_number: c_uint,
    source_id: c.ULString,
) callconv(.C) void {
    const env: *Environment = @alignCast(@ptrCast(user_data));

    _ = source_id;
    _ = column_number;
    _ = line_number;
    _ = source;
    _ = caller;

    // TODO: `level + 1` is a bug
    switch (level + 1) {
        c.kMessageLevel_Log => env.log.print("[console.log] {s}\n", .{utils.getString(message)}) catch {},
        c.kMessageLevel_Warning => env.log.print("[console.warn] {s}\n", .{utils.getString(message)}) catch {},
        c.kMessageLevel_Error => env.log.print("[console.error] {s}\n", .{utils.getString(message)}) catch {},
        c.kMessageLevel_Debug => env.log.print("[console.debug] {s}\n", .{utils.getString(message)}) catch {},
        c.kMessageLevel_Info => env.log.print("[console.info] {s}\n", .{utils.getString(message)}) catch {},
        else => env.log.print("[console] {s}\n", .{utils.getString(message)}) catch {},
    }
}

fn handleViewDOMReady(user_data: ?*anyopaque, _: c.ULView, frame_id: c_ulonglong, is_main_frame: bool, url: c.ULString) callconv(.C) void {
    std.log.info("handleViewDOMReady", .{});
    const env: *Environment = @alignCast(@ptrCast(user_data));

    _ = url;
    _ = is_main_frame;
    _ = frame_id;

    env.evaluateScript("window.foo = 6");
    env.evaluateScript("globalThis.bar = 7");
    env.evaluateScript("console.log(`window === globalThis: ${window === globalThis}`)");

    {
        var ctx = Context{};
        ctx.init(env);
        defer ctx.deinit();

        ctx.setProperty(ctx.global, "wow", ctx.makeString("ok"));
        ctx.evaluateScript("console.log(wow)");

        const allocator = env.store.arena.allocator();
        // const allocator = std.heap.c_allocator;
        var nodes = Context.TypedArray(f32).init(allocator, @as([*]f32, @ptrCast(env.store.nodes.ptr))[0 .. env.store.nodes.len * 2]);
        var edges = Context.TypedArray(u32).init(allocator, @as([*]u32, @ptrCast(env.store.edges.ptr))[0 .. env.store.edges.len * 2]);
        var edges_array = ctx.makeTypedArray(u32, &edges);
        var nodes_array = ctx.makeTypedArray(f32, &nodes);
        ctx.setProperty(ctx.global, "edges", edges_array);
        ctx.setProperty(ctx.global, "nodes", nodes_array);
        ctx.evaluateScript("console.log(nodes)");
        ctx.evaluateScript("console.log(edges)");
    }

    {
        const js = File.init("/Users/joel/Projects/aurora/assets/index.js") catch return;
        defer js.deinit();
        env.evaluateScript(js.data);
    }
}

fn evaluateScript(env: *Environment, js: []const u8) void {
    const js_string = c.ulCreateStringUTF8(js.ptr, js.len);
    defer c.ulDestroyString(js_string);

    _ = c.ulViewEvaluateScript(env.view, js_string, &env.exception);

    const exception = utils.getString(env.exception);
    if (exception.len > 0) {
        std.log.err("{s}", .{exception});
    }
}
