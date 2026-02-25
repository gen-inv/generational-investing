-- Migration: Add close_date, close_price, close_commission, and profit_loss to stock_trades
-- This allows proper tracking of when and how stock positions are closed

ALTER TABLE stock_trades ADD COLUMN close_date DATE;
ALTER TABLE stock_trades ADD COLUMN close_price DECIMAL(10, 3);
ALTER TABLE stock_trades ADD COLUMN close_commission DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE stock_trades ADD COLUMN profit_loss DECIMAL(10, 2);
