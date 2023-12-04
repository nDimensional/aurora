const c = @import("../c.zig");

const Monitor = @This();

ptr: c.ULMonitor,

///
/// Get the monitor's DPI scale (1.0 = 100%).
///
pub fn getScale(self: Monitor) f64 {
    return c.ulMonitorGetScale(self.ptr);
}

///
/// Get the width of the monitor (in pixels).
///
pub fn getWidth(self: Monitor) u32 {
    return c.ulMonitorGetWidth(self.ptr);
}

///
/// Get the height of the monitor (in pixels).
///
pub fn getHeight(self: Monitor) u32 {
    return c.ulMonitorGetHeight(self.ptr);
}
