-- Insert test user (password: test123)
-- Password hash for 'test123' using bcrypt
INSERT OR IGNORE INTO users (id, email, password_hash, name) VALUES 
  (1, 'demo@generationalinvesting.ca', '$2a$10$rN1qQZzKJZ.0vQKJ5YQJKOhXKXKXKXKXKXKXKXKXKXKXKXKXKXKXK', 'Demo User');

-- Insert sample companies
INSERT OR IGNORE INTO companies (user_id, ticker, company_name, market_cap, exchange, sector, industry, is_wonderful, research_score, anti_fragile_score) VALUES 
  (1, 'AAPL', 'Apple Inc.', 3000000000000, 'NASDAQ', 'Technology', 'Consumer Electronics', 1, 95, 88),
  (1, 'MSFT', 'Microsoft Corporation', 2800000000000, 'NASDAQ', 'Technology', 'Software', 1, 93, 90),
  (1, 'GOOGL', 'Alphabet Inc.', 1800000000000, 'NASDAQ', 'Technology', 'Internet Services', 1, 90, 85),
  (1, 'BRK.B', 'Berkshire Hathaway', 900000000000, 'NYSE', 'Financial', 'Diversified Holdings', 1, 98, 95);

-- Insert sample account balances
INSERT OR IGNORE INTO account_balances (user_id, account_type, balance_cad, balance_usd, cash_balance_usd, month, year) VALUES 
  (1, 'Cash', 50000, 37000, 5000, 1, 2026),
  (1, 'RESP', 100000, 74000, 10000, 1, 2026),
  (1, 'RRSP', 250000, 185000, 25000, 1, 2026),
  (1, 'LIRA', 150000, 111000, 15000, 1, 2026);

-- Insert sample stock trades
INSERT OR IGNORE INTO stock_trades (user_id, company_id, ticker, trade_type, quantity, price, account_type, trade_date, is_open) VALUES 
  (1, 1, 'AAPL', 'BUY', 100, 175.50, 'RRSP', '2025-11-15', 1),
  (1, 2, 'MSFT', 'BUY', 50, 380.25, 'RRSP', '2025-12-01', 1),
  (1, 3, 'GOOGL', 'BUY', 75, 145.80, 'Cash', '2025-10-20', 1);

-- Insert sample option trades
INSERT OR IGNORE INTO option_trades (user_id, company_id, ticker, strategy_type, strike_price, premium, quantity, expiration_date, account_type, trade_date, is_open) VALUES 
  (1, 1, 'AAPL', 'SELLING_PUT', 170.00, 3.50, 5, '2026-02-21', 'Cash', '2026-01-10', 1),
  (1, 2, 'MSFT', 'COVERED_CALL', 400.00, 5.25, 2, '2026-03-21', 'RRSP', '2026-01-05', 1);
