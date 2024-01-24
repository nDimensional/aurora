const std = @import("std");

const c = @import("../c.zig");

pub fn getString(string: c.ULString) []const u8 {
    const length = c.ulStringGetLength(string);
    const data = c.ulStringGetData(string);
    return data[0..length];
}

pub fn getBytes(buffer: c.ULBuffer) []const u8 {
    const size = c.ulBufferGetSize(buffer);
    const data = c.ulBufferGetData(buffer);
    return data[0..size];
}
