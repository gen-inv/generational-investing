-- Backfill cost basis adjustments for all closed covered calls
-- Run this ONCE against production database

INSERT INTO cost_basis_adjustments (user_id, holding_id, adjustment_type, amount, adjustment_date, notes)
SELECT 
  ot.user_id,
  sh.id as holding_id,
  'COVERED_CALL' as adjustment_type,
  ot.profit_loss as amount,
  ot.close_date as adjustment_date,
  'Covered call closed - Net P/L: $' || ROUND(ot.profit_loss, 2) || 
  ' (' || ot.quantity || ' contracts @ $' || ot.strike_price || 
  ', closed @ $' || ot.close_price || ') [BACKFILLED]' as notes
FROM option_trades ot
INNER JOIN stock_holdings sh ON sh.ticker = ot.ticker 
  AND sh.user_id = ot.user_id 
  AND sh.account_id = ot.account_id
WHERE ot.strategy_type = 'COVERED_CALL'
  AND ot.is_open = 0
  AND ot.profit_loss IS NOT NULL
  AND sh.id IS NOT NULL;
