-- Add commission field to stock_trades table
ALTER TABLE stock_trades ADD COLUMN commission DECIMAL(10, 2) DEFAULT 0;
