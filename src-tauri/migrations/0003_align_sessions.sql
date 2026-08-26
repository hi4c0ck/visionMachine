-- VisionMachine Alignment Migration (Migration 0003)
-- Add columns that live code writes but 0001/0002 don't have

ALTER TABLE sessions ADD COLUMN fps INTEGER DEFAULT 24;
ALTER TABLE sessions ADD COLUMN resolution TEXT DEFAULT '720p';
ALTER TABLE sessions ADD COLUMN orientation TEXT DEFAULT 'horizontal';
ALTER TABLE sessions ADD COLUMN pipes_json TEXT;
ALTER TABLE sessions ADD COLUMN total_generated_frames INTEGER DEFAULT 0;
