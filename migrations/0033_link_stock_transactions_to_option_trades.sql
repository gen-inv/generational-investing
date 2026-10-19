-- Link the BUY transaction created by a short-put assignment back to the put, so re-opening or deleting the put
-- can reverse the shares exactly (the premium adjustment was linked in 0032).
ALTER TABLE stock_transactions ADD COLUMN option_trade_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_stock_transactions_option_trade_id ON stock_transactions(option_trade_id);
