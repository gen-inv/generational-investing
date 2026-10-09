-- READ-ONLY check: list a ticker's holdings and every BUY/SELL transaction, per account.
-- Compare these rows with Closed Trades and the Share Ownership History table after deploying.
-- Change 'NFLX' to check another ticker.
--
-- Run (production, read-only):
--   npx wrangler d1 execute webapp-production --remote --file=scripts/check-ticker-sells.sql
--
-- How each SELL's realized P/L is derived from these rows:
--   avg cost  = weighted average of the BUYs held on the sale date
--   P/L       = (sell price - avg cost) x shares sold
--               - sell commission
--               - buy commissions x (shares sold / shares held before the sale)

SELECT
  sh.id            AS holding_id,
  a.account_name,
  a.account_type,
  sh.ticker,
  sh.is_open,
  sh.total_shares  AS shares_now,
  sh.average_price AS avg_price_now,
  sh.opened_date,
  sh.closed_date
FROM stock_holdings sh
LEFT JOIN accounts a ON a.id = sh.account_id
WHERE sh.ticker = 'NFLX'
ORDER BY sh.account_id, sh.id;

SELECT
  st.holding_id,
  a.account_name,
  st.id            AS transaction_id,
  st.transaction_date,
  st.transaction_type,
  st.shares,
  st.price_per_share,
  st.commission,
  st.notes
FROM stock_transactions st
INNER JOIN stock_holdings sh ON sh.id = st.holding_id
LEFT JOIN accounts a ON a.id = sh.account_id
WHERE sh.ticker = 'NFLX'
ORDER BY st.holding_id, st.transaction_date, st.id;
