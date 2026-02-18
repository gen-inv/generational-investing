-- Migration: Add target delta range to daily_trade_config
-- This adds target_delta_min and target_delta_max fields for option selection criteria

ALTER TABLE daily_trade_config ADD COLUMN target_delta_min DECIMAL(10,4) DEFAULT -0.15;
ALTER TABLE daily_trade_config ADD COLUMN target_delta_max DECIMAL(10,4) DEFAULT -0.05;
