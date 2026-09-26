-- Group-run source records (pipe-by-pipe session generation).
--
-- A JSON array of {pipe_id, task_id, source_path, staged_path, order_index}
-- written ATOMICALLY with the composition state, so a group row can never
-- describe a source set different from the clips its composition actually
-- staged. NULL on older rows (read back as an empty list).
--
-- Applied tolerantly in code (see `run_additive_group_source_column`): a bare
-- ALTER TABLE ADD COLUMN hard-fails on databases that already have it.

ALTER TABLE generation_groups ADD COLUMN sources_json TEXT;
