const std = @import("std");
const c = @import("c.zig");

const Context = @This();

ref: c.JSContextRef = null,
global: c.JSObjectRef = null,
window: c.JSObjectRef = null,
exception: c.JSValueRef = null,

pub fn init(ctx: *Context) void {
    // ctx.ref = c.ulViewLockJSContext(env.view);
    std.log.info("locked js context", .{});
    ctx.global = c.JSContextGetGlobalObject(ctx.ref);
    ctx.window = @constCast(c.JSObjectGetProperty(ctx.ref, ctx.global, c.JSStringCreateWithUTF8CString("window"), null));
}

pub fn deinit(ctx: *Context) void {
    c.ulViewUnlockJSContext(ctx.view);
    std.log.info("unlocked js context", .{});
}

pub fn evaluateScript(ctx: *Context, js: [*:0]const u8) void {
    _ = c.JSEvaluateScript(ctx.ref, c.JSStringCreateWithUTF8CString(js), null, null, 0, &ctx.exception);
    if (ctx.exception != null) {
        std.log.err("evaluateScript failed", .{});
    }
}

pub fn makeString(ctx: *Context, value: [*:0]const u8) c.JSValueRef {
    return c.JSValueMakeString(ctx.ref, c.JSStringCreateWithUTF8CString(value));
}

pub fn setProperty(ctx: *Context, object: c.JSObjectRef, property: [*:0]const u8, value: c.JSValueRef) void {
    c.JSObjectSetProperty(ctx.ref, object, c.JSStringCreateWithUTF8CString(property), value, 0, &ctx.exception);
    if (ctx.exception != null) {
        std.log.err("setProperty failed", .{});
    }
}

// JSObjectRef JSObjectMakeTypedArrayWithBytesNoCopy(JSContextRef ctx, JSTypedArrayType arrayType, void* bytes, size_t byteLength, JSTypedArrayBytesDeallocator bytesDeallocator, void* deallocatorContext, JSValueRef* exception) JSC_API_AVAILABLE(macos(10.12), ios(10.0));

pub fn TypedArray(comptime T: type) type {
    return struct {
        const Self = @This();

        allocator: std.mem.Allocator,
        elements: []T,
        byte_length: usize,

        pub fn init(allocator: std.mem.Allocator, elements: []T) Self {
            const byte_length = @sizeOf(T) * elements.len;
            return .{ .allocator = allocator, .elements = elements, .byte_length = byte_length };
        }

        pub fn deinit(self: Self) void {
            self.allocator.free(self.elements);
        }

        pub fn deallocate(bytes: ?*anyopaque, deallocator_context: ?*anyopaque) callconv(.C) void {
            const array: *const Self = @ptrCast(deallocator_context);
            if (array.elements.ptr != bytes) {
                @panic("unexpected deallocator arguments");
            }

            array.deinit();
        }
    };
}

pub fn makeTypedArray(ctx: *Context, comptime T: type, array: *const TypedArray(T)) c.JSObjectRef {
    const byte_length = @sizeOf(T) * array.elements.len;
    // const value = c.JSObjectMakeTypedArrayWithBytesNoCopy(ctx.ref, getArrayType(T), array.elements.ptr, byte_length, &TypedArray(T).deallocate, @constCast(array), &ctx.exception);
    const value = c.JSObjectMakeTypedArrayWithBytesNoCopy(ctx.ref, getArrayType(T), array.elements.ptr, byte_length, null, null, &ctx.exception);
    if (ctx.exception != null) {
        std.log.err("makeTypedArray failed", .{});
    }

    return value;
}

// fn deallocate(bytes: ?*anyopaque, deallocator_context: ?*anyopaque) callconv(.C) void {
//     const allocator: *const std.mem.Allocator = @ptrCast(deallocator_context);
//     allocator.free(bytes);
// }

pub fn getArrayType(comptime T: type) c.JSTypedArrayType {
    return switch (T) {
        i8 => c.kJSTypedArrayTypeInt8Array,
        u8 => c.kJSTypedArrayTypeUint8Array,
        i16 => c.kJSTypedArrayTypeInt16Array,
        u16 => c.kJSTypedArrayTypeUint16Array,
        i32 => c.kJSTypedArrayTypeInt32Array,
        u32 => c.kJSTypedArrayTypeUint32Array,
        f32 => c.kJSTypedArrayTypeFloat32Array,
        f64 => c.kJSTypedArrayTypeFloat64Array,
        i64 => c.kJSTypedArrayTypeBigInt64Array,
        u64 => c.kJSTypedArrayTypeBigUint64Array,
        else => @compileError("invalid typed array type"),
    };
}
