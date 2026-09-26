-- Session generation groups (P0). Pipe task rows remain in video_generation_tasks.

CREATE TABLE IF NOT EXISTS generation_groups (
    group_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    progress REAL NOT NULL DEFAULT 0.0,
    pipes_json TEXT NOT NULL DEFAULT '[]',
    failure_policy TEXT NOT NULL DEFAULT 'stop',
    auto_compose INTEGER NOT NULL DEFAULT 1,
    session_video_path TEXT,
    compose_state TEXT,
    compose_error TEXT,
    error TEXT,
    started_at INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
