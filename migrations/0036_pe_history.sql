-- 10-year P/E range per company (a "how the market sees it" view; never used in valuations).
-- Filled weekly by the GitHub Action "Refresh P/E history" from SEC earnings and Yahoo prices.
ALTER TABLE companies ADD COLUMN pe_eps_ttm REAL;        -- trailing-12-month diluted EPS, today's share count
ALTER TABLE companies ADD COLUMN pe_current REAL;
ALTER TABLE companies ADD COLUMN pe_min REAL;
ALTER TABLE companies ADD COLUMN pe_p5 REAL;
ALTER TABLE companies ADD COLUMN pe_median REAL;
ALTER TABLE companies ADD COLUMN pe_p95 REAL;
ALTER TABLE companies ADD COLUMN pe_max REAL;
ALTER TABLE companies ADD COLUMN pe_percentile INTEGER;  -- share of the last 10 years whose P/E was at or below today's
ALTER TABLE companies ADD COLUMN pe_months INTEGER;      -- how many months of history the range is built from
ALTER TABLE companies ADD COLUMN pe_updated_at DATETIME;
ALTER TABLE companies ADD COLUMN pe_error TEXT;
