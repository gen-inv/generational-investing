-- Migration: per-leg open premiums for multi-leg option trades
-- Leg n pairs with strike_price[_n], premium[_n] and close_price[_n].
-- premium (existing) is leg 1; nothing existing is modified.
ALTER TABLE option_trades ADD COLUMN premium_2 REAL;
ALTER TABLE option_trades ADD COLUMN premium_3 REAL;
ALTER TABLE option_trades ADD COLUMN premium_4 REAL;
