-- Migration: Add commission field to option_trades table
-- Description: Track commission fees for option trades, especially important when closing positions

ALTER TABLE option_trades ADD COLUMN commission REAL DEFAULT 0;

-- Update existing records to have 0 commission
UPDATE option_trades SET commission = 0 WHERE commission IS NULL;
