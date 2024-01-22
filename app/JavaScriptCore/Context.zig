const std = @import("std");
const c = @import("../c.zig");

const Context = @This();

ptr: c.JSContextRef = null,

pub fn getGlobal(ctx: Context) c.JSObjectRef {
    return c.JSContextGetGlobalObject(ctx.ptr);
}

pub fn evaluateScript(ctx: Context, js: [*:0]const u8) !void {
    var exception: c.JSValueRef = null;
    const result = c.JSEvaluateScript(ctx.ptr, c.JSStringCreateWithUTF8CString(js), null, null, 0, &exception);
    if (result == null) {
        return error.EXCEPTION;
    }
}

pub fn makeString(ctx: Context, value: [*:0]const u8) c.JSValueRef {
    return c.JSValueMakeString(ctx.ptr, c.JSStringCreateWithUTF8CString(value));
}

pub fn makeBoolean(ctx: Context, value: bool) c.JSValueRef {
    return c.JSValueMakeBoolean(ctx.ptr, value);
}

pub fn makeNumber(ctx: Context, value: f64) c.JSValueRef {
    return c.JSValueMakeNumber(ctx.ptr, value);
}

pub fn makeNull(ctx: Context) c.JSValueRef {
    return c.JSValueMakeNull(ctx.ptr);
}

pub fn makeUndefined(ctx: Context) c.JSValueRef {
    return c.JSValueMakeUndefined(ctx.ptr);
}

pub fn getNumber(ctx: Context, value: c.JSValueRef) f64 {
    return c.JSValueToNumber(ctx.ptr, value, null);
}

pub fn getBoolean(ctx: Context, value: c.JSValueRef) f64 {
    return c.JSValueToBoolean(ctx.ptr, value);
}

pub fn setProperty(ctx: Context, object: c.JSObjectRef, property: [*:0]const u8, value: c.JSValueRef) void {
    var exception: c.JSValueRef = null;
    c.JSObjectSetProperty(ctx.ptr, object, c.JSStringCreateWithUTF8CString(property), value, 0, &exception);
    if (exception != null) {
        std.log.err("setProperty failed", .{});
    }
}

pub const Function = fn (
    ctx: Context,
    args: []const c.JSValueRef,
) anyerror!c.JSValueRef;

pub fn makeFunction(ctx: Context, name: [*:0]const u8, comptime callback: *const Function) c.JSObjectRef {
    const Callback = struct {
        fn exec(
            ptr: c.JSContextRef,
            _: c.JSObjectRef,
            _: c.JSObjectRef,
            argc: usize,
            args: [*]c.JSValueRef,
            exception: ?*c.JSValueRef,
        ) callconv(.C) c.JSValueRef {
            const ref = Context{ .ptr = ptr };
            return callback(ref, args[0..argc]) catch |err| {
                if (exception) |result| {
                    result.* = ref.makeError(@errorName(err));
                }

                return null;
            };
        }
    };

    return c.JSObjectMakeFunctionWithCallback(
        ctx.ptr,
        c.JSStringCreateWithUTF8CString(name),
        @ptrCast(&Callback.exec),
    );
}

pub fn makeError(ctx: Context, message: [*:0]const u8) c.JSObjectRef {
    const arguments = [_]c.JSValueRef{
        c.JSValueMakeString(ctx.ptr, c.JSStringCreateWithUTF8CString(message)),
    };

    return c.JSObjectMakeError(ctx.ptr, 1, &arguments, null);
}

pub fn makeTypedArray(ctx: Context, comptime T: type, array: []T) !c.JSObjectRef {
    var exception: c.JSValueRef = null;
    const value = c.JSObjectMakeTypedArrayWithBytesNoCopy(ctx.ptr, getArrayType(T), array.ptr, @sizeOf(T) * array.len, null, null, &exception);
    if (value == null) {
        std.log.err("JSObjectMakeTypedArrayWithBytesNoCopy", .{});
        return error.Exception;
    }

    return value;
}

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
