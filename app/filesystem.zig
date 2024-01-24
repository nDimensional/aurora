const std = @import("std");

const c = @import("c.zig");

const utils = @import("./Ultralight//utils.zig");
const getString = utils.getString;

fn fileExists(path: c.ULString) callconv(.C) bool {
    std.log.info("Filesystem.fileExists({s})", .{getString(path)});

    std.fs.cwd().access(getString(path), .{}) catch |err| {
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
    std.log.info("Filesystem.getFileMimeType({s})", .{getString(path)});
    return c.ulCreateString("application/unknown");
}

fn getFileCharset(path: c.ULString) callconv(.C) c.ULString {
    std.log.info("Filesystem.getFileCharset({s})", .{getString(path)});
    return c.ulCreateString("utf-8");
}

fn openFile(path: c.ULString) callconv(.C) c.ULBuffer {
    std.log.info("Filesystem.openFile({s})", .{getString(path)});

    const fd = std.os.open(getString(path), std.os.O.RDONLY, 644) catch |err| {
        std.log.err("error opening file: {any}", .{err});
        return null;
    };

    defer std.os.close(fd);

    const stat = std.os.fstat(fd) catch |err| {
        std.log.err("error opening file: {any}", .{err});
        return null;
    };

    const data = std.os.mmap(null, @intCast(stat.size), std.os.PROT.READ, std.os.MAP.SHARED, fd, 0) catch |err| {
        std.log.err("error opening file: {any}", .{err});
        return null;
    };

    return c.ulCreateBuffer(data.ptr, @intCast(stat.size), @ptrFromInt(data.len), &destroyFileBuffer);
}

fn destroyFileBuffer(user_data: ?*anyopaque, data: ?*anyopaque) callconv(.C) void {
    const ptr: [*]align(std.mem.page_size) const u8 = @alignCast(@ptrCast(data));
    const len = @intFromPtr(user_data);
    std.os.munmap(ptr[0..len]);
}

pub const filesystem = c.ULFileSystem{
    .file_exists = &fileExists,
    .get_file_mime_type = &getFileMimeType,
    .get_file_charset = &getFileCharset,
    .open_file = &openFile,
};
