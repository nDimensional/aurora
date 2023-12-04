const c = @import("../c.zig");

///
/// Set a custom Logger implementation.
///
/// This is used to log debug messages to the console or to a log file.
///
/// You should call this before ulCreateRenderer() or ulCreateApp().
///
pub fn setLogger(logger: c.ULLogger) void {
    c.ulPlatformSetLogger(logger);
}

///
/// Set a custom FileSystem implementation.
///
/// The library uses this to load all file URLs (eg, <file:///page.html>).
///
/// You can provide the library with your own FileSystem implementation so that file assets are
/// loaded from your own pipeline.
///
/// You should call this before ulCreateRenderer() or ulCreateApp().
///
pub fn setFileSystem(file_system: c.ULFileSystem) void {
    c.ulPlatformSetFileSystem(file_system);
}
