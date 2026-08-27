-- VisionMachine Composer Schema (Migration 0002)
-- Full composer with pipes, keyframes, and hierarchical prompt tree

-- Session settings: resolution, aspect ratio, total length (frames)
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

-- Pipes: one row = one generation segment
CREATE TABLE IF NOT EXISTS pipes (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    composer_id TEXT NOT NULL,
    name TEXT DEFAULT '',
    order_index INTEGER NOT NULL,
    num_inference_steps INTEGER DEFAULT 20,
    cfg_scale REAL DEFAULT 7.5,
    target_frames INTEGER,
    task_id TEXT,
    status TEXT DEFAULT 'idle',
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Prompt nodes: hierarchical structure
CREATE TABLE IF NOT EXISTS prompt_nodes (
    id TEXT PRIMARY KEY,
    pipe_id TEXT NOT NULL,
    parent_id TEXT,
    prompt TEXT NOT NULL,
    node_type TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    start_frame INTEGER DEFAULT 0,
    end_frame INTEGER,
    status TEXT DEFAULT 'queued',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pipe_id) REFERENCES pipes(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES prompt_nodes(id) ON DELETE CASCADE
);

-- Keyframes: reference images for generation
CREATE TABLE IF NOT EXISTS keyframes (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    frame_index INTEGER NOT NULL,
    image_path TEXT,
    width INTEGER,
    height INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES prompt_nodes(id) ON DELETE CASCADE
);

-- Generation tasks: tracking individual generation jobs
CREATE TABLE IF NOT EXISTS generation_tasks (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    pipe_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    status TEXT DEFAULT 'queued',
    progress REAL DEFAULT 0.0,
    output_path TEXT,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (pipe_id) REFERENCES pipes(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES prompt_nodes(id) ON DELETE CASCADE
);
