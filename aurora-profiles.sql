CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY,
    did TEXT NOT NULL,
    handle TEXT,
    display_name TEXT,
    description TEXT
);

CREATE INDEX IF NOT EXISTS profile_did ON profiles(did);
CREATE INDEX IF NOT EXISTS profile_handle ON profiles(handle);
