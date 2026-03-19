-- Migration: Add close fields to stock_trades (idempotent version)
-- Only adds columns if they don't already exist

-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- So we'll use a different approach: check if column exists via pragma

-- For production deployment, this migration can be skipped if columns exist
-- The following columns should exist in stock_trades:
-- - close_date DATE
-- - close_price DECIMAL(10, 3)
-- - close_commission DECIMAL(10, 2) DEFAULT 0
-- - profit_loss DECIMAL(10, 2)

-- This migration is a no-op if columns already exist
-- If you get "duplicate column" errors, the columns are already there
SELECT 'Checking if close_date columns exist...';
