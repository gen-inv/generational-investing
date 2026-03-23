-- Migration: Add manually_edited flag to dividend_repository
-- This prevents automatic fetches from overwriting user edits

ALTER TABLE dividend_repository ADD COLUMN manually_edited INTEGER DEFAULT 0;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_dividend_repository_manually_edited ON dividend_repository(manually_edited);
