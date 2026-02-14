-- Migration: Add multi-leg close price fields to option_trades
-- Date: 2026-02-14
-- Note: close_commission already exists in production, only adding multi-leg close prices

-- Add close price fields for multi-leg strategies
-- close_price already exists for single-leg strategies
-- Add fields for 2-leg and 4-leg strategies
ALTER TABLE option_trades ADD COLUMN close_price_2 REAL;
ALTER TABLE option_trades ADD COLUMN close_price_3 REAL;
ALTER TABLE option_trades ADD COLUMN close_price_4 REAL;

-- Note: These fields are used as follows:
-- Single-leg (SELLING_PUT, BUYING_PUT, LONG_CALL): close_price
-- Two-leg (CREDIT_SPREAD, DEBIT_SPREAD): close_price (short leg), close_price_2 (long leg)
-- Four-leg (IRON_CONDOR, ZERO_DTE_SPX_IC): 
--   close_price (short call), close_price_2 (long call), 
--   close_price_3 (short put), close_price_4 (long put)
