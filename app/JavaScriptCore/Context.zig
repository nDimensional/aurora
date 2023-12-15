const std = @import("std");
const c = @import("../c.zig");

const View = @import("../Ultralight//View.zig");

const Context = @This();

view: c.ULView,
ref: c.JSContextRef = null,
global: c.JSObjectRef = null,
window: c.JSObjectRef = null,
exception: c.JSValueRef = null,

pub fn init(view: View) Context {
    var ctx: Context = undefined;
    ctx.view = view.ptr;
    ctx.ref = c.ulViewLockJSContext(view.ptr);
    std.log.info("locked js context", .{});
    ctx.global = c.JSContextGetGlobalObject(ctx.ref);
    ctx.window = @constCast(c.JSObjectGetProperty(ctx.ref, ctx.global, c.JSStringCreateWithUTF8CString("window"), null));
    return ctx;
}

pub fn deinit(self: Context) void {
    c.ulViewUnlockJSContext(self.view);
    std.log.info("unlocked js context", .{});
}

pub fn getGlobal(ctx: Context) c.JSObjectRef {
    return c.JSContextGetGlobalObject(ctx.ref);
}

pub fn evaluateScript(ctx: *Context, js: [*:0]const u8) !void {
    const result = c.JSEvaluateScript(ctx.ref, c.JSStringCreateWithUTF8CString(js), null, null, 0, &ctx.exception);
    if (result == null) {
        return error.EXCEPTION;
    }
}

pub fn makeString(ctx: Context, value: [*:0]const u8) c.JSValueRef {
    return c.JSValueMakeString(ctx.ref, c.JSStringCreateWithUTF8CString(value));
}

pub fn makeBoolean(ctx: Context, value: bool) c.JSValueRef {
    return c.JSValueMakeBoolean(ctx.ref, value);
}

pub fn makeNumber(ctx: Context, value: f64) c.JSValueRef {
    return c.JSValueMakeNumber(ctx.ref, value);
}

pub fn makeNull(ctx: Context) c.JSValueRef {
    return c.JSValueMakeNull(ctx.ref);
}

pub fn makeUndefined(ctx: Context) c.JSValueRef {
    return c.JSValueMakeUndefined(ctx.ref);
}

pub fn getNumber(ctx: Context, value: c.JSValueRef) f64 {
    return c.JSValueToNumber(ctx.ref, value, null);
}

pub fn getBoolean(ctx: Context, value: c.JSValueRef) f64 {
    return c.JSValueToBoolean(ctx.ref, value);
}

pub fn setProperty(ctx: *Context, object: c.JSObjectRef, property: [*:0]const u8, value: c.JSValueRef) void {
    ctx.exception = null;
    c.JSObjectSetProperty(ctx.ref, object, c.JSStringCreateWithUTF8CString(property), value, 0, &ctx.exception);
    if (ctx.exception != null) {
        std.log.err("setProperty failed", .{});
    }
}

pub const Function = fn (
    ctx: c.JSContextRef,
    function: c.JSObjectRef,
    this: c.JSObjectRef,
    argc: usize,
    args: [*]c.JSValueRef,
    exception: ?*c.JSValueRef,
) callconv(.C) c.JSValueRef;

pub fn makeFunction(ctx: *Context, name: [*:0]const u8, callback: *const Function) c.JSObjectRef {
    return c.JSObjectMakeFunctionWithCallback(
        ctx.ref,
        c.JSStringCreateWithUTF8CString(name),
        @ptrCast(callback),
    );
}

// JSObjectRef JSObjectMakeTypedArrayWithBytesNoCopy(JSContextRef ctx, JSTypedArrayType arrayType, void* bytes, size_t byteLength, JSTypedArrayBytesDeallocator bytesDeallocator, void* deallocatorContext, JSValueRef* exception) JSC_API_AVAILABLE(macos(10.12), ios(10.0));

// pub fn TypedArray(comptime T: type) type {
//     return struct {
//         const Self = @This();

//         allocator: std.mem.Allocator,
//         elements: []T,
//         byte_length: usize,

//         pub fn init(allocator: std.mem.Allocator, elements: []T) Self {
//             const byte_length = @sizeOf(T) * elements.len;
//             return .{ .allocator = allocator, .elements = elements, .byte_length = byte_length };
//         }

//         pub fn deinit(self: Self) void {
//             self.allocator.free(self.elements);
//         }

//         pub fn deallocate(bytes: ?*anyopaque, deallocator_context: ?*anyopaque) callconv(.C) void {
//             const array: *const Self = @ptrCast(deallocator_context);
//             if (array.elements.ptr != bytes) {
//                 @panic("unexpected deallocator arguments");
//             }

//             array.deinit();
//         }
//     };
// }

pub fn makeTypedArray(ctx: *Context, comptime T: type, array: []const T) c.JSObjectRef {
    const value = c.JSObjectMakeTypedArrayWithBytesNoCopy(ctx.ref, getArrayType(T), array.ptr, @sizeOf(T) * array.len, null, null, &ctx.exception);
    if (value == null) {
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
