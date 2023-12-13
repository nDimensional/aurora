const c = @import("../c.zig");

const Config = @import("Config.zig");
const Renderer = @This();

ptr: c.ULRenderer,

///
/// Create the core renderer singleton for the library directly.
///
/// Unlike ulCreateApp(), this does not use any native windows for drawing and allows you to manage
/// your own runloop and painting. This method is recommended for those wishing to integrate the
/// library into a game.
///
/// This singleton manages the lifetime of all Views and coordinates all painting, rendering,
/// network requests, and event dispatch.
///
/// You should only call this once per process lifetime.
///
/// You must set up your platform handlers before calling this. At a minimum, you must call
/// ulPlatformSetFileSystem() and  ulPlatformSetFontLoader() before calling this.
///
/// @note  You should not call this if you are using ulCreateApp(), it creates its own renderer and
///        provides default implementations for various platform handlers automatically.
///
pub fn create(config: Config) Renderer {
    const ptr = c.ulCreateRenderer(config.ptr);
    return .{ .ptr = ptr };
}

///
/// Destroy the renderer.
///
pub fn destroy(self: Renderer) void {
    c.ulDestroyRenderer(self.ptr);
}

///
/// Update timers and dispatch internal callbacks (JavaScript and network).
///
pub fn update(self: Renderer) void {
    c.ulUpdate(self.ptr);
}

///
/// Notify the renderer that a display has refreshed (you should call this after vsync).
///
/// This updates animations, smooth scroll, and window.requestAnimationFrame() for all Views
/// matching the display id.
///
pub fn refreshDisplay(self: Renderer) void {
    c.ulRefreshDisplay(self.ptr);
}

///
/// Render all active Views.
///
pub fn render(self: Renderer) void {
    c.ulRender(self.ptr);
}

///
/// Print detailed memory usage statistics to the log. (@see ulPlatformSetLogger)
///
pub fn logMemoryUsage(self: Renderer) void {
    c.ulLogMemoryUsage(self.ptr);
}
