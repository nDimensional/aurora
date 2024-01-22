const c = @import("../c.zig");

const Renderer = @import("../Ultralight/Renderer.zig");
const Config = @import("../Ultralight/Config.zig");

const Monitor = @import("Monitor.zig");
const Settings = @import("Settings.zig");

const App = @This();

ptr: c.ULApp,

///
/// Create the App singleton.
///
pub fn create(settings: Settings, config: Config) App {
    const ptr = c.ulCreateApp(settings.ptr, config.ptr);
    return .{ .ptr = ptr };
}

pub fn setUpdateCallback(
    self: App,
    comptime UserData: type,
    user_data: *UserData,
    comptime callback: *const fn (user_data: *UserData) void,
) void {
    const Callback = struct {
        fn exec(user_data_ptr: ?*anyopaque) callconv(.C) void {
            callback(@alignCast(@ptrCast(user_data_ptr)));
        }
    };

    c.ulAppSetUpdateCallback(self.ptr, &Callback.exec, user_data);
}

///
/// Destroy the App instance.
///
pub fn destroy(app: App) void {
    c.ulDestroyApp(app.ptr);
}

///
/// Whether or not the App is running.
///
pub fn isRunning(app: App) bool {
    return c.ulAppIsRunning(app.ptr);
}

///
/// Get the main monitor (this is never NULL).
///
/// @note  We'll add monitor enumeration later.
///
pub fn getMainMonitor(app: App) Monitor {
    const ptr = c.ulAppGetMainMonitor(app.ptr);
    return .{ .ptr = ptr };
}

///
/// Get the underlying Renderer instance.
///
pub fn getRenderer(app: App) Renderer {
    const ptr = c.ulAppGetRenderer(app.ptr);
    return .{ .ptr = ptr };
}

///
/// Run the main loop.
///
pub fn run(app: App) void {
    c.ulAppRun(app.ptr);
}

///
/// Quit the application.
///
pub fn quit(app: App) void {
    c.ulAppQuit(app.ptr);
}
