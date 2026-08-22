-- VisionMachine Composer Schema (Migration 0002)
-- Full composer with pipes, keyframes, and hierarchical prompt tree

-- Session settings: resolution, aspect ratio, total length (frames)
CREATE TABLE IF NOT EXISTS session_settings (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    resolution TEXT DEFAULT 'P720',       -- 'P480' | 'P720' | 'P1080'
    aspect_ratio TEXT DEFAULT 'R16x9',    -- 'R16x9' | 'R9x16' | 'R1x1'
    total_frames INTEGER DEFAULT 121,      -- max per resolution: 480p=441, 720p=241, 1080p=121
    fps REAL DEFAULT 8.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Pipes: one row = one generation segment
CREATE TABLE IF NOT EXISTS pipes (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    composer_id TEXT NOT NULL,
    name TEXT DEFAULT '',
    order_index INTEGER NOT NULL,
    num_inference_steps INTEGER DEFAULT 20,   -- quality thumb "q", range 5-30
    cfg_scale REAL DEFAULT 7.5,                -- creativity thumb "c", range 0.5-15
    target_frames INTEGER,                     -- optional per-pipe override; NULL -> inherited from session_settings
    task_id TEXT,                              -- shared across session, refreshed per generation batch
    status TEXT DEFAULT 'idle',                -- idle | generating | completed | error:<msg>
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (composer_id) REFERENCES composers(id) ON DELETE CASCADE
);

-- Keyframe slots per pipe (up to 3: k1, k2, k3)
CREATE TABLE IF NOT EXISTS pipe_keyframes (
    id TEXT PRIMARY KEY,
    pipe_id TEXT NOT NULL,
    slot_index INTEGER NOT NULL CHECK (slot_index BETWEEN 1 AND 3),
    source_type TEXT NOT NULL,                 -- 'url' | 'generated' | 'local' | 'none'
    source_value TEXT NOT NULL,                -- URL path or local file path
    description TEXT,
    width INTEGER,
    height INTEGER,
    ratio TEXT,                                -- derived from dimensions if available
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pipe_id) REFERENCES pipes(id) ON DELETE CASCADE,
    UNIQUE(pipe_id, slot_index)
);

-- Prompt nodes: hierarchical tree with one-type-per-row constraint
-- parent_id=NULL means root-level node (segment or global_style)
-- parent_id references another node => child belonging to that parent's ROW
-- CONSTRAINT: each parent row can only contain ONE tag type
CREATE TABLE IF NOT EXISTS pipe_prompt_nodes (
    id TEXT PRIMARY KEY,
    pipe_id TEXT NOT NULL,
    parent_id TEXT,                            -- NULL = root-level; self-reference = same row sibling
    tag TEXT NOT NULL,                         -- 'segment' | 'movement' | 'rotation' | 'focal_point' | 'lighting' | 'exposure' | 'lens_effect' | 'global_style'
    value TEXT NOT NULL DEFAULT '',
    frame_start INTEGER,                       -- optional frame start within segment scope
    frame_end INTEGER,                         -- optional frame end within segment scope
    enabled INTEGER DEFAULT 1,                 -- 1 = active, 0 = inactive
    order_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pipe_id) REFERENCES pipes(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES pipe_prompt_nodes(id) ON DELETE SET NULL
);

-- Generation log per pipe
CREATE TABLE IF NOT EXISTS pipe_generation_log (
    id TEXT PRIMARY KEY,
    pipe_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    num_inference_steps INTEGER,
    cfg_scale REAL,
    output_video_path TEXT,
    output_frame_count INTEGER,
    status TEXT DEFAULT 'queued',              -- queued | running | completed | failed
    error_message TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pipe_id) REFERENCES pipes(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pipes_session ON pipes(session_id);
CREATE INDEX IF NOT EXISTS idx_pipes_composer ON pipes(composer_id);
CREATE INDEX IF NOT EXISTS idx_pipe_keyframes_pipe ON pipe_keyframes(pipe_id);
CREATE INDEX IF NOT EXISTS idx_pipe_prompt_nodes_pipe ON pipe_prompt_nodes(pipe_id);
CREATE INDEX IF NOT EXISTS idx_pipe_prompt_nodes_parent ON pipe_prompt_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_pipe_gen_log_pipe ON pipe_generation_log(pipe_id);
CREATE INDEX IF NOT EXISTS idx_pipe_gen_log_task ON pipe_generation_log(task_id);
CREATE INDEX IF NOT EXISTS idx_session_settings_session ON session_settings(session_id);
