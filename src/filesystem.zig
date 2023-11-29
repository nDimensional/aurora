const std = @import("std");

const c = @import("c.zig");
const utils = @import("utils.zig");

var path_buffer: [std.fs.MAX_PATH_BYTES]u8 = undefined;

fn update(user_data: ?*anyopaque) callconv(.C) void {
    std.log.info("UPDATE ({any})", .{user_data});
}

fn fileExists(path: c.ULString) callconv(.C) bool {
    std.log.info("fileExists({s})", .{utils.getString(path)});

    std.fs.cwd().access(utils.getString(path), .{}) catch |err| {
        switch (err) {
            error.FileNotFound => return false,
            else => {
                std.log.err("error accessing filesystem: {any}", .{err});
                return false;
            },
        }
    };

    return true;
}

fn getFileMimeType(path: c.ULString) callconv(.C) c.ULString {
    std.log.info("getFileMimeType({s})", .{utils.getString(path)});
    return c.ulCreateString("application/unknown");
}

fn getFileCharset(path: c.ULString) callconv(.C) c.ULString {
    std.log.info("getFileCharset({s})", .{utils.getString(path)});
    return c.ulCreateString("utf-8");
}

fn openFile(path: c.ULString) callconv(.C) c.ULBuffer {
    std.log.info("openFile({s})", .{utils.getString(path)});

    const fd = std.os.open(utils.getString(path), std.os.O.RDONLY, 644) catch |err| {
        std.log.err("error opening file: {any}", .{err});
        return null;
    };

    defer std.os.close(fd);

    const stat = std.os.fstat(fd) catch |err| {
        std.log.err("error opening file: {any}", .{err});
        return null;
    };

    const buffer = std.os.mmap(null, @intCast(stat.size), std.os.PROT.READ, std.os.MAP.SHARED, fd, 0) catch |err| {
        std.log.err("error opening file: {any}", .{err});
        return null;
    };

    return c.ulCreateBuffer(buffer.ptr, @intCast(stat.size), null, &destroyFileBuffer);
}

fn destroyFileBuffer(user_data: ?*anyopaque, data: ?*anyopaque) callconv(.C) void {
    std.log.info("destroyFileBuffer({any}, {any})", .{ user_data, data });
    const ptr = @as([*]u8, @ptrCast(data));
    _ = ptr;
    // std.os.munmap(memory: []align(mem.page_size)const u8);
}

pub const filesystem = c.ULFileSystem{
    .file_exists = &fileExists,
    .get_file_mime_type = &getFileMimeType,
    .get_file_charset = &getFileCharset,
    .open_file = &openFile,
};
