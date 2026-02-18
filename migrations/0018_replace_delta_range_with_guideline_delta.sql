-- Migration: Replace delta range with single guideline delta
-- Drop the min/max range and use a single guideline value

-- Drop old columns
ALTER TABLE daily_trade_config DROP COLUMN target_delta_min;
ALTER TABLE daily_trade_config DROP COLUMN target_delta_max;

-- Add new single guideline column
ALTER TABLE daily_trade_config ADD COLUMN guideline_delta DECIMAL(10,4) DEFAULT -0.10;
