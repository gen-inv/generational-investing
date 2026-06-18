-- ============================================================================
-- CLEANUP: Remove Incorrect Backfilled SELL Transactions
-- ============================================================================
-- This script removes backfilled SELL transactions that were incorrectly
-- added to positions that ALREADY had proper SELL transactions from the
-- close endpoint.
--
-- Problem: The backfill script was run BEFORE some positions were closed,
-- so it created estimated SELL transactions. Later, when positions were
-- closed via the proper close endpoint, duplicate SELL transactions were
-- created with the actual close prices.
--
-- Solution: Delete all backfilled SELL transactions. Positions closed via
-- the proper close endpoint will keep their accurate SELL transactions.
-- ============================================================================

-- Show what will be deleted
SELECT 
  'Backfilled SELL transactions to be deleted:' as info;

SELECT 
  st.id,
  st.holding_id,
  sh.ticker,
  st.shares,
  st.price_per_share,
  st.transaction_date,
  st.notes
FROM stock_transactions st
JOIN stock_holdings sh ON st.holding_id = sh.id
WHERE st.transaction_type = 'SELL' 
  AND st.notes LIKE '%[BACKFILLED]%Position closed%';

-- Delete backfilled SELL transactions
DELETE FROM stock_transactions 
WHERE transaction_type = 'SELL' 
  AND notes LIKE '%[BACKFILLED]%Position closed%';

-- Show summary
SELECT 'Cleanup complete' as status;
