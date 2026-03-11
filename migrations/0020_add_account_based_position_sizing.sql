-- Migration: Add account-based position sizing configuration
-- This adds support for two types of position sizing: profit-based and account-based

-- Add field to enable/disable calculated position sizing (master toggle)
ALTER TABLE daily_trade_config ADD COLUMN enable_position_sizing INTEGER DEFAULT 0;

-- Add field to select sizing type: 'profit' or 'account'
ALTER TABLE daily_trade_config ADD COLUMN position_sizing_type TEXT DEFAULT 'profit';

-- Add field for account-based max loss percentage
ALTER TABLE daily_trade_config ADD COLUMN account_max_loss_percent DECIMAL(5,2) DEFAULT 4.00;
