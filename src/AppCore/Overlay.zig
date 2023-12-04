const c = @import("../c.zig");

const View = @import("../Ultralight/View.zig");

const Monitor = @import("Monitor.zig");
const Window = @import("Window.zig");

const Overlay = @This();

ptr: c.ULOverlay,

///
/// Create a new Overlay.
///
pub fn create(window: Window, width: u32, height: u32, x: i32, y: i32) Overlay {
    const ptr = c.ulCreateOverlay(window.ptr, width, height, x, y);
    return .{ .ptr = ptr };
}

///
/// Create a new Overlay, wrapping an existing View.
///
pub fn createWithView(window: Window, view: View, x: i32, y: i32) Overlay {
    const ptr = c.ulCreateOverlayWithView(window.ptr, view.ptr, x, y);
    return .{ .ptr = ptr };
}

///
/// Destroy an overlay.
///
pub fn destroy(self: Overlay) void {
    c.ulDestroyOverlay(self.ptr);
}

///
/// Get the underlying View.
///
pub fn getView(self: Overlay) View {
    const ptr = c.ulOverlayGetView(self.ptr);
    return .{ .ptr = ptr };
}

///
/// Get the width (in pixels).
///
pub fn getWidth(self: Overlay) u32 {
    return c.ulOverlayGetWidth(self.ptr);
}

///
/// Get the height (in pixels).
///
pub fn getHeight(self: Overlay) u32 {
    return c.ulOverlayGetHeight(self.ptr);
}

///
/// Get the x-position (offset from the left of the Window), in pixels.
///
pub fn getX(self: Overlay) i32 {
    return c.ulOverlayGetX(self.ptr);
}

///
/// Get the y-position (offset from the top of the Window), in pixels.
///
pub fn getY(self: Overlay) i32 {
    return c.ulOverlayGetY(self.ptr);
}

///
/// Move the overlay to a new position (in pixels).
///
pub fn moveTo(self: Overlay, x: i32, y: i32) void {
    c.ulOverlayMoveTo(self.ptr, x, y);
}

///
/// Resize the overlay (and underlying View), dimensions should be
/// specified in pixels.
///
pub fn resize(self: Overlay, width: u32, height: u32) void {
    c.ulOverlayResize(self.ptr, width, height);
}

///
/// Whether or not the overlay is hidden (not drawn).
///
pub fn isHidden(self: Overlay) bool {
    return c.ulOverlayIsHidden(self.ptr);
}

///
/// Hide the overlay (will no longer be drawn).
///
pub fn hide(self: Overlay) void {
    c.ulOverlayHide(self.ptr);
}

///
/// Show the overlay.
///
pub fn show(self: Overlay) void {
    c.ulOverlayShow(self.ptr);
}

///
/// Whether or not an overlay has keyboard focus.
///
pub fn hasFocus(self: Overlay) bool {
    return c.ulOverlayFocus(self.ptr);
}

///
/// Grant this overlay exclusive keyboard focus.
///
pub fn focus(self: Overlay) void {
    c.ulOverlayFocus(self.ptr);
}

///
/// Remove keyboard focus.
///
pub fn unfocus(self: Overlay) void {
    c.ulOverlayUnfocus(self.ptr);
}
