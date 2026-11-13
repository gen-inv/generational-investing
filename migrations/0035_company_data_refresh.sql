-- Nightly refresh of Market Cap and Next Earnings Date: when each company was last refreshed, why a refresh failed, and whether the earnings date is only an estimate
ALTER TABLE companies ADD COLUMN data_refreshed_at DATETIME;
ALTER TABLE companies ADD COLUMN data_refresh_error TEXT;
ALTER TABLE companies ADD COLUMN earnings_estimated INTEGER DEFAULT 0;
