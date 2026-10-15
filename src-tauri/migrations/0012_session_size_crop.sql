-- VisionMachine: session video crop normalization snapshot (0012).
--
-- The session target size (resolution preset + orientation + optional custom
-- W x H) and the crop mode live in the composer blob (ComposerConfig), the
-- same layer as fps/resolution/orientation. This migration ONLY adds the
-- compose-time snapshot on the generation-group row so a later session edit
-- can flag the stored session video as stale without re-composing (G8):
--
--   crop_mode_used  the crop mode that produced this group's session video
--   target_w_used   the session target width the normalize-to ran against
--   target_h_used   the session target height the normalize-to ran against
--
-- All three are applied tolerantly in `run_additive_session_size_columns`
-- (duplicate-column errors ignored), exactly like 0010 / 0011. On any install
-- that ran this version at least once the columns already exist.
ALTER TABLE generation_groups ADD COLUMN crop_mode_used TEXT;
ALTER TABLE generation_groups ADD COLUMN target_w_used INTEGER;
ALTER TABLE generation_groups ADD COLUMN target_h_used INTEGER;
