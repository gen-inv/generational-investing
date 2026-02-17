-- Migration: Add vix_entry_price and strike_width to daily_trades
-- vix_entry_price: VIX index price at trade entry (volatility indicator)
-- strike_width: Spread width in points (e.g., 5, 10, 20) for RORC calculation

ALTER TABLE daily_trades ADD COLUMN vix_entry_price DECIMAL(10,2);
ALTER TABLE daily_trades ADD COLUMN strike_width INTEGER DEFAULT 5;
