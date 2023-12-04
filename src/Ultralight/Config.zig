const c = @import("../c.zig");

const Config = @This();

ptr: c.ULConfig,

///
/// Create config with default values (see <Ultralight/platform/Config.h>).
///
pub fn create() Config {
    const ptr = c.ulCreateConfig();
    return .{ .ptr = ptr };
}

///
/// Destroy config.
///
pub fn destroy(self: Config) void {
    c.ulDestroyConfig(self.ptr);
}

///
/// A writable OS file path to store persistent Session data in.
///
/// This data may include cookies, cached network resources, indexed DB, etc.
///
/// @note Files are only written to the path when using a persistent Session.
///
pub fn setCachePath(self: Config, cache_path: []const u8) void {
    c.ulConfigSetCachePath(self.ptr, c.ulCreateStringUTF8(cache_path.ptr, cache_path.len));
}

///
/// The relative path to the resources folder (loaded via the FileSystem API).
///
/// The library loads certain resources (SSL certs, ICU data, etc.) from the FileSystem API
/// during runtime (eg, `file:///resources/cacert.pem`).
///
/// You can customize the relative file path to the resources folder by modifying this setting.
///
/// (Default = "resources/")
///
pub fn setResourcePathPrefix(self: Config, resource_path_prefix: []const u8) void {
    c.ulConfigSetResourcePathPrefix(self.ptr, c.ulCreateStringUTF8(resource_path_prefix.ptr, resource_path_prefix.len));
}

///
/// Global user-defined CSS string (included before any CSS on the page).
///
/// You can use this to override default styles for various elements on the page.
///
/// @note This is an actual string of CSS, not a file path.
///
pub fn setUserStylesheet(self: Config, css_string: []const u8) void {
    c.ulConfigSetUserStylesheet(self.ptr, c.ulCreateStringUTF8(css_string.ptr, css_string.len));
}
