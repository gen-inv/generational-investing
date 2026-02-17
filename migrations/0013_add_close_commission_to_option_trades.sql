-- Migration: Ensure close_commission field exists in option_trades table
-- Description: This field was manually added to production but missing from migrations
-- This migration ensures it exists in all environments (local dev, test, production)
-- Note: If the column already exists, this migration will be skipped by checking d1_migrations table

-- Add close_commission column with default value
-- Note: This will fail if column already exists, but that's expected and handled by wrangler
ALTER TABLE option_trades ADD COLUMN close_commission REAL DEFAULT 0;
