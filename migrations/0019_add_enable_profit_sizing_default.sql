-- Add enable_profit_sizing_default column to daily_trade_config table
ALTER TABLE daily_trade_config ADD COLUMN enable_profit_sizing_default INTEGER DEFAULT 0;
