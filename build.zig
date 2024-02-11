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
}
