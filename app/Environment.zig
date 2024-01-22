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

const Listener = @import("Listener.zig");
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
// timer: std.time.Timer,

listener: Listener,

pub fn init(env: *Environment) !void {
    env.store = try Store.init(std.heap.c_allocator, "graph-1000.sqlite");
    // env.store = try Store.init("graph-1000.sqlite");

    // env.timer = try std.time.Timer.start();

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

    env.view.setWindowObjectReadyCallback(Environment, env, &onWindowReady);
    env.view.setDOMReadyCallback(Environment, env, &onDOMReady);
    env.view.setBeginLoadingCallback(Environment, env, &onBeginLoading);
    env.view.setFinishLoadingCallback(Environment, env, &onFinishLoading);
    env.view.setFailLoadingCallback(Environment, env, &onFailLoading);

    env.view.setChangeTitleCallback(Environment, env, &onChangeTitle);
    env.view.setChangeURLCallback(Environment, env, &onChangeURL);
    env.view.setChangeTooltipCallback(Environment, env, &onChangeTooltip);
    env.view.setChangeCursorCallback(Environment, env, &onChangeCursor);

    env.view.setConsoleMessageCallback(Environment, env, &onConsoleMessage);

    env.view.setCreateChildViewCallback(Environment, env, &onCreateChildView);
    env.view.setCreateInspectorViewCallback(Environment, env, &onCreateInspectorView);

    env.window.setCloseCallback(Environment, env, &onWindowClose);
    env.window.setResizeCallback(Environment, env, &onWindowResize);

    env.html = try File.init("assets/app.html");
    env.listener = Listener.init("dist/index.js");
}

pub fn deinit(self: Environment) void {
    self.config.destroy();
    self.settings.destroy();
    self.app.destroy();
    self.window.destroy();
    self.overlay.destroy();

    self.html.deinit();
    self.listener.deinit();
}

pub fn run(self: *Environment) void {
    self.view.loadHTML(self.html.data);
    self.app.setUpdateCallback(Environment, self, &onUpdate);
    self.app.run();
}

fn onWindowReady(_: *Environment, _: View.WindowObjectReadyEvent) void {}

fn onDOMReady(env: *Environment, event: View.DOMReadyEvent) void {
    {
        const ctx = event.view.lock();
        defer event.view.unlock();

        ctx.evaluateScript("window.foo = 233232") catch @panic("ctx.evaluateScript failed");
        ctx.evaluateScript("window.bar = window") catch @panic("ctx.evaluateScript failed");
        env.store.inject(ctx) catch @panic("store.inject failed");

        // Now create the API handles
        var api_class_definition: c.JSClassDefinition = c.kJSClassDefinitionEmpty;
        const api_class_ref = c.JSClassCreate(&api_class_definition);
        const api = c.JSObjectMake(ctx.ptr, api_class_ref, env);
        const global = ctx.getGlobal();
        ctx.setProperty(global, "api", api);
        ctx.setProperty(global, "refresh", ctx.makeFunction("refresh", &refresh));
        ctx.setProperty(global, "boop", ctx.makeFunction("boop", &boop));
        ctx.setProperty(global, "tick", ctx.makeFunction("tick", &tick));
        ctx.setProperty(global, "save", ctx.makeFunction("save", &save));
        ctx.setProperty(global, "setAttraction", ctx.makeFunction("setAttraction", &setAttraction));
        ctx.setProperty(global, "setRepulsion", ctx.makeFunction("setRepulsion", &setRepulsion));
        ctx.setProperty(global, "setTemperature", ctx.makeFunction("setTemperature", &setTemperature));
    }

    const js = File.init("dist/index.js") catch @panic("failed to open file");
    defer js.deinit();

    env.view.evaluateScript(js.data) catch |err| {
        std.log.err("failed to evaluate script: {any}", .{err});
        return;
    };
}

fn onBeginLoading(_: *Environment, _: View.BeginLoadingEvent) void {}
fn onFinishLoading(_: *Environment, _: View.FinishLoadingEvent) void {}
fn onFailLoading(_: *Environment, _: View.FailLoadingEvent) void {}
fn onChangeTitle(_: *Environment, _: View.ChangeTitleEvent) void {}
fn onChangeURL(_: *Environment, _: View.ChangeURLEvent) void {}
fn onChangeTooltip(_: *Environment, _: View.ChangeTooltipEvent) void {}
fn onChangeCursor(_: *Environment, _: View.ChangeCursorEvent) void {}

fn onConsoleMessage(_: *Environment, event: View.ConsoleMessageEvent) void {
    const log = std.io.getStdOut().writer();
    const err = switch (event.level + 1) {
        c.kMessageLevel_Log => log.print("[console.log] {s}\n", .{event.message}),
        c.kMessageLevel_Warning => log.print("[console.warn] {s}\n", .{event.message}),
        c.kMessageLevel_Error => log.print("[console.error] {s}\n", .{event.message}),
        c.kMessageLevel_Debug => log.print("[console.debug] {s}\n", .{event.message}),
        c.kMessageLevel_Info => log.print("[console.info] {s}\n", .{event.message}),
        else => {},
    };

    err catch @panic("fjkdls");
}

fn onCreateChildView(_: *Environment, _: View.CreateChildViewEvent) ?View {
    return null;
}

fn onCreateInspectorView(_: *Environment, _: View.CreateInspectorViewEvent) ?View {
    return null;
}

fn onWindowClose(_: *Environment, _: Window) void {}
fn onWindowResize(env: *Environment, window: Window, width: u32, height: u32) void {
    _ = width; // autofix
    _ = height; // autofix

    env.overlay.resize(window.getWidth(), window.getHeight());
}

fn onUpdate(env: *Environment) void {

    // Poll
    var result = env.listener.poll() catch return;
    while (result) |event| {
        if (event.fflags & std.os.darwin.NOTE_WRITE != 0) {
            std.log.info("reloading...", .{});
            env.view.loadHTML(env.html.data);
            return;
        }

        result = env.listener.poll() catch return;
    }

    env.store.tick() catch return;
}

fn boop(_: Context, args: []const c.JSValueRef) !c.JSValueRef {
    std.log.info("boop([{d}])", .{args.len});
    return null;
}

fn refresh(ctx: Context, args: []const c.JSValueRef) !c.JSValueRef {
    if (args.len < 5) {
        return null;
    }

    const api = args[0];
    const env: *Environment = @alignCast(@ptrCast(c.JSObjectGetPrivate(@constCast(api))));

    const area = Store.AreaParams{
        .minX = @floatCast(ctx.getNumber(args[1])),
        .maxX = @floatCast(ctx.getNumber(args[2])),
        .minY = @floatCast(ctx.getNumber(args[3])),
        .maxY = @floatCast(ctx.getNumber(args[4])),
        .minZ = @floatCast(ctx.getNumber(args[5])),
    };

    std.log.info("refresh({any})", .{area});
    const ids = try env.store.refresh(area);
    return try ctx.makeTypedArray(u32, ids);
}

fn tick(_: Context, args: []const c.JSValueRef) !c.JSValueRef {
    if (args.len == 0) {
        return null;
    }

    const api = args[0];
    const env: *Environment = @alignCast(@ptrCast(c.JSObjectGetPrivate(@constCast(api))));

    std.log.info("tick()", .{});
    try env.store.tick();

    return null;
}

fn save(_: Context, args: []const c.JSValueRef) !c.JSValueRef {
    if (args.len == 0) {
        return null;
    }

    const api = args[0];
    const env: *Environment = @alignCast(@ptrCast(c.JSObjectGetPrivate(@constCast(api))));

    std.log.info("save()", .{});
    try env.store.save();

    return null;
}

fn setAttraction(ctx: Context, args: []const c.JSValueRef) !c.JSValueRef {
    if (args.len < 2) {
        return null;
    }

    const api = args[0];
    const env: *Environment = @alignCast(@ptrCast(c.JSObjectGetPrivate(@constCast(api))));

    env.store.attraction = @floatCast(ctx.getNumber(args[1]));
    return null;
}

fn setRepulsion(ctx: Context, args: []const c.JSValueRef) !c.JSValueRef {
    if (args.len < 2) {
        return null;
    }

    const api = args[0];
    const env: *Environment = @alignCast(@ptrCast(c.JSObjectGetPrivate(@constCast(api))));
    env.store.repulsion = @floatCast(ctx.getNumber(args[1]));
    return null;
}

fn setTemperature(ctx: Context, args: []const c.JSValueRef) !c.JSValueRef {
    if (args.len < 2) {
        return null;
    }

    const api = args[0];
    const env: *Environment = @alignCast(@ptrCast(c.JSObjectGetPrivate(@constCast(api))));
    env.store.temperature = @floatCast(ctx.getNumber(args[1]));
    return null;
}
