const std = @import("std");
const LazyPath = std.Build.LazyPath;

pub fn build(b: *std.Build) !void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const sqlite = b.dependency("sqlite", .{ .SQLITE_ENABLE_RTREE = true });
    const ultralight = b.dependency("ultralight", .{ .SDK = @as([]const u8, "SDK") });

    const app = b.addExecutable(.{
        .name = "aurora",
        .root_source_file = LazyPath.relative("./app/main.zig"),
        .target = target,
        .optimize = optimize,
    });

    app.root_module.addImport("sqlite", sqlite.module("sqlite"));
    app.root_module.addImport("ul", ultralight.module("ul"));

    app.linkLibC();
    b.installArtifact(app);

    const app_artifact = b.addRunArtifact(app);
    b.step("run", "Run the app").dependOn(&app_artifact.step);

    const query = try std.Target.Query.parse(.{ .arch_os_abi = "wasm32-freestanding-musl" });
    // const query = try std.Target.Query.parse(.{ .arch_os_abi = "wasm32-wasi" });
    const math = b.addExecutable(.{
        .name = "math",
        .root_source_file = LazyPath.relative("./store/math.zig"),
        .target = b.resolveTargetQuery(query),
        .optimize = .Debug,
    });

    // math.linkLibC();

    math.entry = .disabled;
    math.root_module.export_symbol_names = &.{ "add", "mul", "msgPtr", "msgLen", "allocate" };

    const sqlite_mod = sqlite.module("sqlite");
    sqlite_mod.addSystemIncludePath(LazyPath.relative("./store/include"));
    // sqlite_mod.addIncludePath(LazyPath.relative("./store/include"));

    math.root_module.addImport("sqlite", sqlite_mod);

    // math.root_module.addSystemIncludePath(LazyPath.relative("./store/include"));
    // math.root_module.addIncludePath(LazyPath.relative("./store/include"));

    b.installArtifact(math);
}
