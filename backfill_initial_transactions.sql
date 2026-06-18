-- Backfill initial BUY transactions for stock_holdings without transactions
-- These are holdings that were created directly (via option assignment or manual entry)
-- and don't have corresponding records in stock_trades

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
  'Initial purchase (backfilled from stock_holdings)' as notes,
  sh.created_at
FROM stock_holdings sh
WHERE sh.is_open = 1
  AND sh.total_shares > 0
  -- Only create for holdings without any transactions
  AND NOT EXISTS (
    SELECT 1 FROM stock_transactions stx
    WHERE stx.holding_id = sh.id
  );

-- Report results
SELECT
  'Backfill Initial Transactions Summary' as report,
  COUNT(*) as new_transactions_created,
  SUM(shares) as total_shares_added,
  COUNT(DISTINCT holding_id) as holdings_affected
FROM stock_transactions
WHERE notes LIKE '%backfilled from stock_holdings%';