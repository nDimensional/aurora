const std = @import("std");

const c = @import("c.zig");

const Platform = @import("Ultralight/Platform.zig");
const Config = @import("Ultralight/Config.zig");
const View = @import("Ultralight/View.zig");

const App = @import("AppCore/App.zig");
const Window = @import("AppCore/Window.zig");
const Overlay = @import("AppCore/Overlay.zig");
const Settings = @import("AppCore/Settings.zig");
const Context = @import("JavaScriptCore/Context.zig");

const Store = @import("Store.zig");

const File = @import("File.zig");
const utils = @import("utils.zig");
const getString = utils.getString;

const Environment = @This();

config: Config,
settings: Settings,

app: App,
window: Window,
overlay: Overlay,
view: View,

html: File,
store: Store,
timer: std.time.Timer,

fd: std.os.fd_t,
kq: std.os.fd_t,
changes: [1]std.os.Kevent = undefined,
events: [1]std.os.Kevent = undefined,

pub fn init(env: *Environment) !void {
    env.store = try Store.init("graph-100.sqlite");
    env.timer = try std.time.Timer.start();

    env.config = Config.create();
    env.config.setResourcePathPrefix("SDK/resources/");

    env.settings = Settings.create();
    env.settings.setDeveloperName("nDimensional");
    env.settings.setAppName("Aurora");

    env.app = App.create(env.settings, env.config);

    const width = 1200;
    const height = 800;

    const monitor = env.app.getMainMonitor();
    const flags = Window.Flags.Tilted | Window.Flags.Resizable;
    env.window = Window.create(monitor, width, height, false, flags);

    env.overlay = Overlay.create(env.window, env.window.getWidth(), env.window.getHeight(), 0, 0);

    env.view = env.overlay.getView();
    env.view.attachCallbacks(.{
        .user_data = env,
        .onDOMReady = &onDOMReady,
        .onConsoleMessage = &onConsoleMessage,
    });

    env.window.attachCallbacks(.{
        .user_data = env,
        .onResize = &onWindowResize,
        .onClose = &onWindowClose,
    });

    env.html = try File.init("assets/app.html");

    env.fd = std.os.darwin.open("dist/index.js", std.os.darwin.O.RDONLY);
    env.kq = std.os.darwin.kqueue();

    env.changes = .{.{
        .ident = @intCast(env.fd),
        .filter = std.os.darwin.EVFILT_VNODE,
        .flags = std.os.darwin.EV_ADD | std.os.darwin.EV_ENABLE | std.os.darwin.EV_CLEAR,
        .fflags = std.os.darwin.NOTE_WRITE,
        .data = 0,
        .udata = 0,
    }};
}

pub fn deinit(self: Environment) void {
    self.config.destroy();
    self.settings.destroy();
    self.app.destroy();
    self.window.destroy();
    self.overlay.destroy();

    self.html.deinit();
    std.os.close(self.fd);
    std.os.close(self.kq);
}

pub fn run(self: *Environment) void {
    self.view.loadHTML(self.html.data);
    self.app.attachCallbacks(.{ .user_data = self, .onUpdate = &onUpdate });
    self.app.run();
}

pub fn poll(self: *Environment) !?std.os.Kevent {
    const nev = std.os.darwin.kevent(
        self.kq,
        &self.changes,
        self.changes.len,
        &self.events,
        self.events.len,
        &.{ .tv_sec = 0, .tv_nsec = 0 },
    );

    if (nev < 0) {
        return error.EPOLL;
    } else if (nev == 0) {
        return null;
    } else {
        return self.events[0];
    }
}

fn onDOMReady(user_data: ?*anyopaque, caller: c.ULView, frame_id: u64, is_main_frame: bool, url: c.ULString) callconv(.C) void {
    _ = url;
    _ = is_main_frame;
    _ = frame_id;

    const env: *Environment = @alignCast(@ptrCast(user_data));

    const view = View{ .ptr = @ptrCast(caller) };

    {
        var ctx = Context.init(view);
        defer ctx.deinit();

        ctx.evaluateScript("window.foo = 233232") catch @panic("ctx.evaluateScript failed");
        ctx.evaluateScript("window.bar = window") catch @panic("ctx.evaluateScript failed");
        env.store.inject(&ctx) catch @panic("store.inject failed");

        // Now create the API handles
        var api_class_definition: c.JSClassDefinition = c.kJSClassDefinitionEmpty;
        const api_class_ref = c.JSClassCreate(&api_class_definition);
        const api = c.JSObjectMake(ctx.ref, api_class_ref, env);
        const global = ctx.getGlobal();
        ctx.setProperty(global, "api", api);
        ctx.setProperty(global, "boop", ctx.makeFunction("boop", &boop));
        ctx.setProperty(global, "setAttraction", ctx.makeFunction("setAttraction", &setAttraction));
        ctx.setProperty(global, "setRepulsion", ctx.makeFunction("setRepulsion", &setRepulsion));
        ctx.setProperty(global, "setTemperature", ctx.makeFunction("setTemperature", &setTemperature));
    }

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

    const env: *Environment = @alignCast(@ptrCast(user_data));
    _ = env;
}

fn onWindowResize(user_data: ?*anyopaque, caller: c.ULWindow, width: u32, height: u32) callconv(.C) void {
    _ = height;
    _ = width;

    const env: *Environment = @alignCast(@ptrCast(user_data));
    const window = Window{ .ptr = caller };
    env.overlay.resize(window.getWidth(), window.getHeight());
}

fn onUpdate(user_data: ?*anyopaque) callconv(.C) void {
    const env: *Environment = @alignCast(@ptrCast(user_data));

    // Poll
    var result = env.poll() catch return;
    while (result) |event| {
        if (event.fflags & std.os.darwin.NOTE_WRITE != 0) {
            std.log.info("reloading...", .{});
            env.view.loadHTML(env.html.data);
            return;
        }

        result = env.poll() catch return;
    }

    env.store.tick() catch return;
    // const a = env.timer.lap();
    // std.log.info("lap in {d}ns", .{a});
    // for (0..50) |_| {
    //     env.store.tick() catch return;
    // }
    // const t = env.timer.read();
    // std.log.info("50 ticks in {d}ns", .{t});
}

fn boop(ctx: c.JSContextRef, _: c.JSObjectRef, _: c.JSObjectRef, argc: usize, args: [*]c.JSValueRef, exception: ?*c.JSValueRef) callconv(.C) c.JSValueRef {
    _ = ctx;
    _ = exception;

    std.log.info("boop({d})", .{argc});
    if (argc == 0) {
        return null;
    }

    const api = args[0];
    const env: *Environment = @alignCast(@ptrCast(c.JSObjectGetPrivate(@constCast(api))));

    // std.log.info("nodes.len: {d}", .{env.store.nodes.len});
    // std.log.info("edges.len: {d}", .{env.store.edges.len});

    var random = env.store.prng.random();
    for (env.store.nodes) |*node| {
        const dx: f32 = if (random.boolean()) 1 else -1;
        const dy: f32 = if (random.boolean()) 1 else -1;
        node.dx = 100 * dx;
        node.dy = 100 * dy;
    }

    return null;
}

fn setAttraction(ref: c.JSContextRef, _: c.JSObjectRef, _: c.JSObjectRef, argc: usize, args: [*]c.JSValueRef, exception: ?*c.JSValueRef) callconv(.C) c.JSValueRef {
    _ = exception;

    if (argc < 2) {
        return null;
    }

    const api = args[0];
    const env: *Environment = @alignCast(@ptrCast(c.JSObjectGetPrivate(@constCast(api))));
    const ctx = Context{ .ref = ref, .view = env.view.ptr };
    env.store.attraction = @floatCast(ctx.getNumber(args[1]));
    return null;
}

fn setRepulsion(ref: c.JSContextRef, _: c.JSObjectRef, _: c.JSObjectRef, argc: usize, args: [*]c.JSValueRef, exception: ?*c.JSValueRef) callconv(.C) c.JSValueRef {
    _ = exception;

    if (argc < 2) {
        return null;
    }

    const api = args[0];
    const env: *Environment = @alignCast(@ptrCast(c.JSObjectGetPrivate(@constCast(api))));

    const ctx = Context{ .ref = ref, .view = env.view.ptr };
    env.store.repulsion = @floatCast(ctx.getNumber(args[1]));
    return null;
}

fn setTemperature(ref: c.JSContextRef, _: c.JSObjectRef, _: c.JSObjectRef, argc: usize, args: [*]c.JSValueRef, exception: ?*c.JSValueRef) callconv(.C) c.JSValueRef {
    _ = exception;

    if (argc < 2) {
        return null;
    }

    const api = args[0];
    const env: *Environment = @alignCast(@ptrCast(c.JSObjectGetPrivate(@constCast(api))));
    const ctx = Context{ .ref = ref, .view = env.view.ptr };
    env.store.temperature = @floatCast(ctx.getNumber(args[1]));
    return null;
}
