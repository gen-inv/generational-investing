-- Migration: Ensure close_commission field exists in option_trades table
-- Description: This field was manually added to production before this migration was created
-- This migration ensures it exists in all environments (local dev, test, production)
-- 
-- IMPORTANT: This migration will FAIL in production with "duplicate column" error
-- because the column was manually added there before. This is EXPECTED and SAFE.
-- The migration succeeds in fresh local/test databases where it's needed.
--
-- We keep this migration for documentation and to ensure new environments have the column.

-- Add close_commission column with default value
ALTER TABLE option_trades ADD COLUMN close_commission REAL DEFAULT 0;
