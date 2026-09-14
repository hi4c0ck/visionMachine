-- VisionMachine Generation Task Tracking (Migration 0005)
-- Live task table for the pipe-level generation flow.
-- NOTE: the legacy 0002 `generation_tasks` table (FK -> prompt_nodes) is NOT
-- reused on purpose; pipes live in JSON blobs, so pipe_id is a plain column.

CREATE TABLE IF NOT EXISTS video_generation_tasks (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    pipe_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    progress REAL NOT NULL DEFAULT 0.0,
    stages_json TEXT,
    output_path TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
