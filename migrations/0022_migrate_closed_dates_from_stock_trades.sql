-- Migration: Update stock_holdings with closed_date and create SELL transactions
-- This fixes holdings that were marked as closed (is_open=0) but are missing:
-- 1. closed_date (lost during migration)
-- 2. SELL transactions (needed for P/L calculation)

-- Step 1: Update stock_holdings with closed_date from stock_trades
UPDATE stock_holdings
SET closed_date = (
  SELECT MAX(st.close_date)
  FROM stock_trades st
  WHERE st.ticker = stock_holdings.ticker
    AND st.account_id = stock_holdings.account_id
    AND st.user_id = stock_holdings.user_id
    AND st.is_open = 0
    AND st.close_date IS NOT NULL
)
WHERE stock_holdings.is_open = 0
  AND stock_holdings.closed_date IS NULL;

-- Step 2: Create SELL transactions for closed positions that don't have them
-- This uses the close_price and close_date from the old stock_trades table
INSERT INTO stock_transactions (user_id, holding_id, transaction_type, shares, price_per_share, transaction_date, commission, notes)
SELECT 
  sh.user_id,
  sh.id as holding_id,
  'SELL' as transaction_type,
  sh.total_shares as shares,
  MAX(st.close_price) as price_per_share,
  MAX(st.close_date) as transaction_date,
  COALESCE(MAX(st.close_commission), 0) as commission,
  'Migrated from stock_trades' as notes
FROM stock_holdings sh
INNER JOIN stock_trades st ON 
  st.ticker = sh.ticker
  AND st.account_id = sh.account_id
  AND st.user_id = sh.user_id
  AND st.is_open = 0
  AND st.close_date IS NOT NULL
  AND st.close_price IS NOT NULL
WHERE sh.is_open = 0
  AND NOT EXISTS (
    -- Only insert if no SELL transaction exists for this holding
    SELECT 1 FROM stock_transactions stx
    WHERE stx.holding_id = sh.id
      AND stx.transaction_type = 'SELL'
  )
GROUP BY sh.user_id, sh.id, sh.total_shares;
