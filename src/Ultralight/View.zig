const std = @import("std");

const c = @import("../c.zig");

const utils = @import("../utils.zig");
const getString = utils.getString;

const Renderer = @import("Renderer.zig");
const View = @This();

ptr: c.ULView,

pub const ViewConfig = struct {
    ptr: c.ULViewConfig,

    ///
    /// Create view configuration with default values (see <Ultralight/platform/View.h>).
    ///
    pub fn create() ViewConfig {
        const ptr = c.ulCreateViewConfig();
        return .{ .ptr = ptr };
    }

    ///
    /// Destroy view configuration.
    ///
    pub fn destroy(self: ViewConfig) void {
        c.ulDestroyViewConfig(self.ptr);
    }
};

pub const ViewCallbacks = struct {
    user_data: ?*anyopaque = null,

    onChangeTitle: ?*const fn (
        user_data: ?*anyopaque,
        caller: c.ULView,
        title: c.ULString,
    ) callconv(.C) void = null,

    onChangeURL: ?*const fn (
        user_data: ?*anyopaque,
        caller: c.ULView,
        url: c.ULString,
    ) callconv(.C) void = null,

    onChangeTooltip: ?*const fn (
        user_data: ?*anyopaque,
        caller: c.ULView,
        tooltip: c.ULString,
    ) callconv(.C) void = null,

    onChangeCursor: ?*const fn (
        user_data: ?*anyopaque,
        caller: c.ULView,
        cursor: c.ULCursor,
    ) callconv(.C) void = null,

    onConsoleMessage: ?*const fn (
        user_data: ?*anyopaque,
        caller: c.ULView,
        source: c.ULMessageSource,
        level: c.ULMessageLevel,
        message: c.ULString,
        line_number: u32,
        column_number: u32,
        source_id: c.ULString,
    ) callconv(.C) void = null,

    onCreateChildView: ?*const fn (
        user_data: ?*anyopaque,
        caller: c.ULView,
        opener_url: c.ULString,
        target_url: c.ULString,
        is_popup: bool,
        popup_rect: c.ULIntRect,
    ) callconv(.C) c.ULView = null,

    onCreateInspectorView: ?*const fn (
        user_data: ?*anyopaque,
        caller: c.ULView,
        is_local: bool,
        inspected_url: c.ULString,
    ) callconv(.C) c.ULView = null,

    onBeginLoading: ?*const fn (
        user_data: ?*anyopaque,
        caller: c.ULView,
        frame_id: u64,
        is_main_frame: bool,
        url: c.ULString,
    ) callconv(.C) void = null,

    onFinishLoading: ?*const fn (
        user_data: ?*anyopaque,
        caller: c.ULView,
        frame_id: u64,
        is_main_frame: bool,
        url: c.ULString,
    ) callconv(.C) void = null,

    onFailLoading: ?*const fn (
        user_data: ?*anyopaque,
        caller: c.ULView,
        frame_id: u64,
        is_main_frame: bool,
        url: c.ULString,
        description: c.ULString,
        error_domain: c.ULString,
        error_code: i32,
    ) callconv(.C) void = null,

    onDOMReady: ?*const fn (
        user_data: ?*anyopaque,
        caller: c.ULView,
        frame_id: u64,
        is_main_frame: bool,
        url: c.ULString,
    ) callconv(.C) void = null,

    onWindowObjectReady: ?*const fn (
        user_data: ?*anyopaque,
        caller: c.ULView,
        frame_id: u64,
        is_main_frame: bool,
        url: c.ULString,
    ) callconv(.C) void = null,
};

///
/// Create a View with certain size (in pixels).
///
/// @note  You can pass null to 'session' to use the default session.
///
pub fn create(
    renderer: Renderer,
    width: u32,
    height: u32,
    view_config: ViewConfig,
    session: c.ULSession,
    display_id: u32,
    callbacks: ViewCallbacks,
) View {
    const ptr = c.ulCreateView(renderer.ptr, width, height, view_config.ptr, session, display_id);
    const view = View{ .ptr = ptr };
    view.attachCallbacks(callbacks);
    return view;
}

pub fn attachCallbacks(self: View, cb: ViewCallbacks) void {
    if (cb.onChangeURL) |f| c.ulViewSetChangeURLCallback(self.ptr, f, cb.user_data);
    if (cb.onChangeTitle) |f| c.ulViewSetChangeTitleCallback(self.ptr, f, cb.user_data);
    if (cb.onChangeTooltip) |f| c.ulViewSetChangeTooltipCallback(self.ptr, f, cb.user_data);
    if (cb.onChangeCursor) |f| c.ulViewSetChangeCursorCallback(self.ptr, f, cb.user_data);
    if (cb.onConsoleMessage) |f| c.ulViewSetAddConsoleMessageCallback(self.ptr, f, cb.user_data);
    if (cb.onCreateChildView) |f| c.ulViewSetCreateChildViewCallback(self.ptr, f, cb.user_data);
    if (cb.onCreateInspectorView) |f| c.ulViewSetCreateInspectorViewCallback(self.ptr, f, cb.user_data);
    if (cb.onBeginLoading) |f| c.ulViewSetBeginLoadingCallback(self.ptr, f, cb.user_data);
    if (cb.onFinishLoading) |f| c.ulViewSetFinishLoadingCallback(self.ptr, f, cb.user_data);
    if (cb.onFailLoading) |f| c.ulViewSetFailLoadingCallback(self.ptr, f, cb.user_data);
    if (cb.onWindowObjectReady) |f| c.ulViewSetWindowObjectReadyCallback(self.ptr, f, cb.user_data);
    if (cb.onDOMReady) |f| c.ulViewSetDOMReadyCallback(self.ptr, f, cb.user_data);
}

///
/// Destroy a View.
///
pub fn destroy(self: View) void {
    c.ulDestroyView(self.ptr);
}

///
/// Get current URL.
///
/// @note Don't destroy the returned string, it is owned by the View.
///
pub fn getURL(self: View) []const u8 {
    return getString(c.ulViewGetURL(self.ptr));
}

///
/// Get current title.
///
/// @note Don't destroy the returned string, it is owned by the View.
///
pub fn getTitle(self: View) []const u8 {
    return getString(c.ulViewGetTitle(self.ptr));
}

///
/// Get the width, in pixels.
///
pub fn getWidth(self: View) u32 {
    return c.ulViewGetWidth(self.ptr);
}

///
/// Get the height, in pixels.
///
pub fn getHeight(self: View) u32 {
    return c.ulViewGetHeight(self.ptr);
}

pub fn getDisplayId(self: View) u32 {
    return c.ulViewGetDisplayId(self.ptr);
}

pub fn setDisplayId(self: View, display_id: u32) void {
    c.ulViewSetDisplayId(self.ptr, display_id);
}

///
/// Get the device scale, ie. the amount to scale page units to screen pixels.
///
/// For example, a value of 1.0 is equivalent to 100% zoom. A value of 2.0 is 200% zoom.
///
pub fn getDeviceScale(self: View) f64 {
    return c.ulViewGetDeviceScale(self.ptr);
}

///
/// Set the device scale.
///
pub fn setDeviceScale(self: View, scale: f64) void {
    c.ulViewSetDeviceScale(self.ptr, scale);
}

///
/// Check if the main frame of the page is currrently loading.
///
pub fn isLoading(self: View) bool {
    return c.ulViewIsLoading(self.ptr);
}

///
/// Load a raw string of HTML.
///
pub fn loadHTML(self: View, html_string: []const u8) void {
    c.ulViewLoadHTML(self.ptr, c.ulCreateStringUTF8(html_string.ptr, html_string.len));
}

///
/// Load a URL into main frame.
///
pub fn loadURL(self: View, url_string: []const u8) void {
    c.ulViewLoadURL(self.ptr, c.ulCreateStringUTF8(url_string.ptr, url_string.len));
}

///
/// Resize view to a certain width and height (in pixels).
///
pub fn resize(self: View, width: u32, height: u32) void {
    c.ulViewResize(self.ptr, width, height);
}

///
/// Acquire the page's JSContext for use with JavaScriptCore API.
///
/// @note  This call locks the context for the current thread. You should call
///        ulViewUnlockJSContext() after using the context so other worker threads can modify
///        JavaScript state.
///
/// @note  The lock is recusive, it's okay to call this multiple times as long as you call
///        ulViewUnlockJSContext() the same number of times.
///
pub fn lockJSContext(self: View) c.JSContextRef {
    return c.ulViewLockJSContext(self.ptr);
}

///
/// Unlock the page's JSContext after a previous call to ulViewLockJSContext().
///
pub fn unlockJSContext(self: View) void {
    c.ulViewUnlockJSContext(self.ptr);
}

///
/// Evaluate a string of JavaScript and return result.
///
pub fn evaluateScript(self: View, js_string: []const u8, exception: ?*c.ULString) []const u8 {
    return getString(
        c.ulViewEvaluateScript(
            self.ptr,
            c.ulCreateStringUTF8(js_string.ptr, js_string.len),
            exception,
        ),
    );
}

///
/// Reload current page.
///
pub fn reload(self: View) void {
    c.ulViewReload(self.ptr);
}

///
/// Stop all page loads.
///
pub fn stop(self: View) void {
    c.ulViewStop(self.ptr);
}

///
/// Give focus to the View.
///
/// You should call this to give visual indication that the View has input focus (changes active
/// text selection colors, for example).
///
pub fn focus(self: View) void {
    c.ulViewFocus(self.ptr);
}

///
/// Remove focus from the View and unfocus any focused input elements.
///
/// You should call this to give visual indication that the View has lost input focus.
///
pub fn unfocus(self: View) void {
    c.ulViewUnfocus(self.ptr);
}

///
/// Whether or not the View has focus.
///
pub fn hasFocus(self: View) bool {
    return c.ulViewHasFocus(self.ptr);
}

///
/// Whether or not the View has an input element with visible keyboard focus (indicated by a
/// blinking caret).
///
/// You can use this to decide whether or not the View should consume keyboard input events (useful
/// in games with mixed UI and key handling).
///
pub fn hasInputFocus(self: View) bool {
    return c.ulViewHasInputFocus(self.ptr);
}
