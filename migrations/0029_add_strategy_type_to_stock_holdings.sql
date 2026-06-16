-- Add strategy_type field to stock_holdings table
-- This field identifies whether a stock position is part of the Wheel strategy or regular Stockpiling
-- Values: 'WHEEL' or 'STOCKPILING'
-- NULL values default to STOCKPILING for backward compatibility

ALTER TABLE stock_holdings ADD COLUMN strategy_type TEXT CHECK(strategy_type IN ('WHEEL', 'STOCKPILING'));

-- Create index for filtering by strategy type
CREATE INDEX IF NOT EXISTS idx_stock_holdings_strategy_type ON stock_holdings(strategy_type);
