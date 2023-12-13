const c = @import("../c.zig");

const Settings = @This();

ptr: c.ULSettings,

///
/// Create settings with default values (see <AppCore/App.h>).
///
pub fn create() Settings {
    const ptr = c.ulCreateSettings();
    return .{ .ptr = ptr };
}

///
/// Destroy settings.
///
pub fn destroy(self: Settings) void {
    c.ulDestroySettings(self.ptr);
}

///
/// Set the name of the developer of this app.
///
/// This is used to generate a unique path to store local application data
/// on the user's machine.
///
/// Default is "MyCompany"
///
pub fn setDeveloperName(self: Settings, name: [*:0]const u8) void {
    c.ulSettingsSetDeveloperName(self.ptr, c.ulCreateString(name));
}

///
/// Set the name of this app.
///
/// This is used to generate a unique path to store local application data
/// on the user's machine.
///
/// Default is "MyApp"
///
pub fn setAppName(self: Settings, name: [*:0]const u8) void {
    c.ulSettingsSetAppName(self.ptr, c.ulCreateString(name));
}

///
/// Set the root file path for our file system, you should set this to the
/// relative path where all of your app data is.
///
/// This will be used to resolve all file URLs, eg file:///page.html
///
pub fn setFileSystemPath(self: Settings, path: [*:0]const u8) void {
    c.ulSettingsSetFileSystemPath(self.ptr, c.ulCreateString(path));
}

///
/// Set whether or not we should load and compile shaders from the file system
/// (eg, from the /shaders/ path, relative to file_system_path).
///
/// If this is false (the default), we will instead load pre-compiled shaders
/// from memory which speeds up application startup time.
///
pub fn setLoadShadersFromFileSystem(self: Settings, enabled: bool) void {
    c.ulSettingsSetLoadShadersFromFileSystem(self.ptr, enabled);
}

///
/// We try to use the GPU renderer when a compatible GPU is detected.
///
/// Set this to true to force the engine to always use the CPU renderer.
///
pub fn setForceCPURenderer(self: Settings, force_cpu: bool) void {
    c.ulSettingsSetForceCPURenderer(self.ptr, force_cpu);
}
