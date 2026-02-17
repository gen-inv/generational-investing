-- Migration: Add close_commission to daily_trades
-- This tracks the commission paid when closing a trade (separate from entry commission)

ALTER TABLE daily_trades ADD COLUMN close_commission DECIMAL(10,2) DEFAULT 0;
