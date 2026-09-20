-- VisionMachine: persist the redacted request-log path on generation tasks.
-- `request_log` is derived from the media root at start time and travels with
-- the in-memory task view; without a column, the DB fallback in
-- `get_generation_task` (used after the registry evicts a terminal task, or
-- after an app restart) has no way to rebuild it, so the progress-modal
-- expander would read "no request log" even when the file exists on disk.
--
-- Migration files are applied in order on startup; 0005 already created the
-- table, so this is safe on a fresh DB too.
ALTER TABLE video_generation_tasks ADD COLUMN request_log TEXT;
