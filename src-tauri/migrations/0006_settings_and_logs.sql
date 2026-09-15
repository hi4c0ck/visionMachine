-- VisionMachine Settings & Generation Log (Migration 0006)
-- Per-profile settings blob + portable generation log (P5: entry_json is
-- already redacted on the frontend — no keys, no raw local paths).

CREATE TABLE IF NOT EXISTS profile_settings (
    profile_id TEXT PRIMARY KEY,
    settings_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS generation_logs (
    task_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    pipe_id TEXT NOT NULL,
    entry_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
