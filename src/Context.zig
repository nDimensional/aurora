const std = @import("std");

const c = @import("c.zig");
const File = @import("File.zig");
const fs = @import("filesystem.zig");
const utils = @import("utils.zig");

const Context = @This();

log: std.fs.File.Writer = std.io.getStdOut().writer(),
app: c.ULApp = null,
window: c.ULWindow = null,
view: c.ULView = null,
overlay: c.ULOverlay = null,

pub fn init(ctx: *Context) void {
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

    ctx.app = c.ulCreateApp(settings, config);
    c.ulAppSetUpdateCallback(ctx.app, &handleAppUpdate, ctx);

    const flags = c.kWindowFlags_Titled | c.kWindowFlags_Resizable;
    ctx.window = c.ulCreateWindow(c.ulAppGetMainMonitor(ctx.app), 600, 400, false, flags);
    c.ulWindowSetCloseCallback(ctx.window, &handleWindowClose, ctx);
    c.ulWindowSetResizeCallback(ctx.window, &handleWindowResize, ctx);

    const width = c.ulWindowGetWidth(ctx.window);
    const height = c.ulWindowGetHeight(ctx.window);
    ctx.overlay = c.ulCreateOverlay(ctx.window, width, height, 0, 0);

    ctx.view = c.ulOverlayGetView(ctx.overlay);
    c.ulViewSetBeginLoadingCallback(ctx.view, &handleViewBeginLoading, ctx);
    c.ulViewSetFinishLoadingCallback(ctx.view, &handleViewFinishLoading, ctx);
    c.ulViewSetFailLoadingCallback(ctx.view, &handleViewFailLoading, ctx);

    c.ulViewSetDOMReadyCallback(ctx.view, &handleViewDOMReady, ctx);
    c.ulViewSetChangeTitleCallback(ctx.view, &handleViewChangeTitle, ctx);
    c.ulViewSetAddConsoleMessageCallback(ctx.view, &handleViewConsoleMessage, ctx);
}

pub fn load(self: Context, html_path: []const u8) !void {
    const html = try File.init(html_path);
    defer html.deinit();
    c.ulViewLoadHTML(self.view, c.ulCreateStringUTF8(html.data.ptr, html.data.len));
}

pub fn run(self: Context) void {
    c.ulAppRun(self.app);
}

fn handleAppUpdate(user_data: ?*anyopaque) callconv(.C) void {
    const ctx: *const Context = @alignCast(@ptrCast(user_data));
    _ = ctx;
}

fn handleWindowClose(user_data: ?*anyopaque, _: c.ULWindow) callconv(.C) void {
    const ctx: *const Context = @alignCast(@ptrCast(user_data));
    _ = ctx;

    std.log.info("handleWindowClose()", .{});
}

fn handleWindowResize(user_data: ?*anyopaque, _: c.ULWindow, width: c_uint, height: c_uint) callconv(.C) void {
    const ctx: *const Context = @alignCast(@ptrCast(user_data));
    c.ulOverlayResize(ctx.overlay, width, height);
}

fn handleViewBeginLoading(user_data: ?*anyopaque, _: c.ULView, frame_id: c_ulonglong, is_main_frame: bool, url: c.ULString) callconv(.C) void {
    const ctx: *const Context = @alignCast(@ptrCast(user_data));
    _ = ctx;

    std.log.info("handleViewBeginLoading(frame_id = {d}, is_main_frame = {any}, url = {s})", .{ frame_id, is_main_frame, utils.getString(url) });
}

fn handleViewFinishLoading(user_data: ?*anyopaque, _: c.ULView, frame_id: c_ulonglong, is_main_frame: bool, url: c.ULString) callconv(.C) void {
    const ctx: *const Context = @alignCast(@ptrCast(user_data));
    _ = ctx;

    std.log.info("handleViewFinishLoading(frame_id = {d}, is_main_frame = {any}, url = {s})", .{ frame_id, is_main_frame, utils.getString(url) });
}

fn handleViewFailLoading(user_data: ?*anyopaque, caller: c.ULView, frame_id: c_ulonglong, is_main_frame: bool, url: c.ULString, description: c.ULString, error_domain: c.ULString, error_code: c_int) callconv(.C) void {
    const ctx: *const Context = @alignCast(@ptrCast(user_data));
    _ = ctx;

    std.log.info("handleViewFailLoading({any}, {any}, {d}, {any}, {s}, {s}, {s}, {d})", .{ user_data, caller, frame_id, is_main_frame, utils.getString(url), utils.getString(description), utils.getString(error_domain), error_code });
}

fn handleViewDOMReady(user_data: ?*anyopaque, _: c.ULView, frame_id: c_ulonglong, is_main_frame: bool, url: c.ULString) callconv(.C) void {
    const ctx: *const Context = @alignCast(@ptrCast(user_data));

    _ = url;
    _ = is_main_frame;
    _ = frame_id;

    const js = File.init("/Users/joel/Projects/aurora/assets/index.js") catch return;
    defer js.deinit();

    const js_string = c.ulCreateStringUTF8(js.data.ptr, js.data.len);
    defer c.ulDestroyString(js_string);

    var exception: c.ULString = undefined;
    const result = c.ulViewEvaluateScript(ctx.view, js_string, &exception);
    std.log.info("execution result: {s}", .{utils.getString(result)});
    std.log.info("exception result: {s}", .{utils.getString(exception)});
}

fn handleViewChangeTitle(user_data: ?*anyopaque, _: c.ULView, title: c.ULString) callconv(.C) void {
    const ctx: *const Context = @alignCast(@ptrCast(user_data));

    c.ulWindowSetTitle(ctx.window, c.ulStringGetData(title));
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
    const ctx: *const Context = @alignCast(@ptrCast(user_data));

    _ = source_id;
    _ = column_number;
    _ = line_number;
    _ = source;
    _ = caller;

    // TODO: `level + 1` is a bug
    switch (level + 1) {
        c.kMessageLevel_Log => ctx.log.print("[console.log] {s}\n", .{utils.getString(message)}) catch {},
        c.kMessageLevel_Warning => ctx.log.print("[console.warn] {s}\n", .{utils.getString(message)}) catch {},
        c.kMessageLevel_Error => ctx.log.print("[console.error] {s}\n", .{utils.getString(message)}) catch {},
        c.kMessageLevel_Debug => ctx.log.print("[console.debug] {s}\n", .{utils.getString(message)}) catch {},
        c.kMessageLevel_Info => ctx.log.print("[console.info] {s}\n", .{utils.getString(message)}) catch {},
        else => ctx.log.print("[console] {s}\n", .{utils.getString(message)}) catch {},
    }
}
