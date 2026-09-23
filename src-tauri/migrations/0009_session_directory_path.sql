-- VisionMachine: per-session media directory.
--
-- Sessions get their own `directory_path` (a folder the user picks via the
-- "Open folder" action, or the app creates under the project dir). The
-- generation media tree writes under `<session.directory_path>/<pipe-name>/
-- <gen-hash>/...` so sessions stay name-consistent instead of stacking on a
-- raw uuid. NULL means "no explicit session dir" — the engine falls back to
-- the project's `directory_path` (or the default app-data tree), preserving
-- pre-migration behavior.
ALTER TABLE sessions ADD COLUMN directory_path TEXT;
