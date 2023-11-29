const std = @import("std");

const sqlite = @import("sqlite");

pub const db = sqlite.Database.open();
