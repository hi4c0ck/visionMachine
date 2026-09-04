-- VisionMachine Clean Schema
-- Fresh start without legacy tables

-- Session settings (keep existing)
CREATE TABLE IF NOT EXISTS session_settings (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    resolution TEXT DEFAULT 'P720',
    aspect_ratio TEXT DEFAULT 'R16x9',
    total_frames INTEGER DEFAULT 121,
    fps REAL DEFAULT 8.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Composers table (stores pipe data as JSON)
CREATE TABLE IF NOT EXISTS composers (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    name TEXT DEFAULT 'Untitled',
    config_json TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Pipes table removed - now stored in composers.config_json
