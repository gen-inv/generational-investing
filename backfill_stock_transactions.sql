-- Backfill stock_transactions from stock_trades
-- This script creates transaction records for all existing stock holdings
-- that were migrated from the legacy stock_trades table

-- Insert BUY/SELL transactions from stock_trades
INSERT INTO stock_transactions (
  user_id, 
  holding_id, 
  transaction_type, 
  shares, 
  price_per_share, 
  transaction_date, 
  commission, 
  notes,
  created_at
)
SELECT 
  st.user_id,
  sh.id as holding_id,
  st.trade_type as transaction_type,
  st.quantity as shares,
  st.price as price_per_share,
  st.trade_date as transaction_date,
  0 as commission, -- stock_trades didn't track commission
  st.notes,
  st.created_at
FROM stock_trades st
INNER JOIN stock_holdings sh ON (
  sh.user_id = st.user_id 
  AND sh.ticker = st.ticker
)
INNER JOIN accounts a ON (
  sh.account_id = a.id
  AND a.account_type = st.account_type
)
WHERE st.trade_type IN ('BUY', 'SELL')
  AND sh.id IS NOT NULL
  -- Avoid duplicates if this script runs multiple times
  AND NOT EXISTS (
    SELECT 1 FROM stock_transactions stx
    WHERE stx.user_id = st.user_id
      AND stx.holding_id = sh.id
      AND stx.transaction_date = st.trade_date
      AND stx.shares = st.quantity
  );

-- Report results
SELECT 
  'Backfill Summary' as report,
  COUNT(*) as transactions_created,
  SUM(shares) as total_shares,
  COUNT(DISTINCT holding_id) as holdings_affected
FROM stock_transactions;
