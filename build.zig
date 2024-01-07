const std = @import("std");
const LazyPath = std.Build.LazyPath;

pub fn build(b: *std.Build) !void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const app = b.addExecutable(.{
        .name = "aurora",
        .root_source_file = LazyPath.relative("./app/main.zig"),
        .target = target,
        .optimize = optimize,
    });

    const sqlite = b.dependency("sqlite", .{
        // .target = target,
        // .optimize = optimize,
    });

    app.root_module.addImport("sqlite", sqlite.module("sqlite"));

    app.addRPath(LazyPath.relative("SDK/bin"));
    app.addLibraryPath(LazyPath.relative("SDK/bin"));
    app.addIncludePath(LazyPath.relative("SDK/include"));
    app.linkSystemLibrary("Ultralight");
    app.linkSystemLibrary("UltralightCore");
    app.linkSystemLibrary("WebCore");
    app.linkSystemLibrary("AppCore");

    app.linkLibC();
    b.installArtifact(app);

    const app_artifact = b.addRunArtifact(app);
    b.step("run", "Run the app").dependOn(&app_artifact.step);
}
