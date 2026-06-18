-- ============================================================================
-- Backfill Missing Stock Transactions for Holdings Without Transaction History
-- ============================================================================
-- This script handles two scenarios:
-- 1. Holdings with NO transactions at all → Create initial BUY transaction
-- 2. Closed holdings without SELL transactions → Create closing SELL transaction
--
-- Purpose: Enable proper close details display when editing closed stock trades
-- ============================================================================

-- Part 1: Create BUY transactions for holdings that have ZERO transactions
-- ============================================================================
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
  sh.user_id,
  sh.id as holding_id,
  'BUY' as transaction_type,
  sh.total_shares as shares,
  sh.average_price as price_per_share,
  sh.opened_date as transaction_date,
  0 as commission,
  '[BACKFILLED] Initial purchase from stock_holdings' as notes,
  sh.created_at
FROM stock_holdings sh
WHERE NOT EXISTS (
  SELECT 1 FROM stock_transactions st WHERE st.holding_id = sh.id
)
AND sh.total_shares > 0;

-- Part 2: Create SELL transactions for closed holdings that have transactions but no SELL
-- ============================================================================
-- For closed holdings that have BUY transactions but no SELL transaction,
-- we need to create a SELL transaction using the close_date from stock_holdings
-- and calculate the close price from average_price (since we don't have historical close price data)
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
  sh.user_id,
  sh.id as holding_id,
  'SELL' as transaction_type,
  sh.total_shares as shares,
  sh.average_price as price_per_share, -- Using average_price as approximation
  sh.closed_date as transaction_date,
  0 as commission,
  '[BACKFILLED] Position closed - price estimated from average_price' as notes,
  CURRENT_TIMESTAMP as created_at
FROM stock_holdings sh
WHERE sh.is_open = 0
  AND sh.closed_date IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM stock_transactions st WHERE st.holding_id = sh.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM stock_transactions st 
    WHERE st.holding_id = sh.id AND st.transaction_type = 'SELL'
  );

-- Part 3: Create BOTH BUY and SELL transactions for closed holdings with ZERO transactions
-- ============================================================================
-- For closed holdings that have NO transactions at all, create both BUY and SELL
-- This is a two-step process handled by the queries above:
-- - Part 1 creates the BUY transaction
-- - Part 2 creates the SELL transaction (after Part 1 runs)

-- Display summary of changes
SELECT 'Summary of backfill:' as summary;

SELECT 
  COUNT(*) as total_holdings_without_transactions,
  SUM(sh.total_shares) as total_shares_affected
FROM stock_holdings sh
WHERE NOT EXISTS (
  SELECT 1 FROM stock_transactions st WHERE st.holding_id = sh.id
)
AND sh.total_shares > 0;

SELECT 
  COUNT(*) as closed_holdings_without_sell,
  SUM(sh.total_shares) as total_shares_to_sell
FROM stock_holdings sh
WHERE sh.is_open = 0
  AND sh.closed_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_transactions st 
    WHERE st.holding_id = sh.id AND st.transaction_type = 'SELL'
  );
