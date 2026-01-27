-- Migration to add new fields for updated requirements
-- Note: SQLite doesn't support AFTER clause, so new columns will be added at the end

-- 1. Add account_name field to account_balances table
ALTER TABLE account_balances ADD COLUMN account_name VARCHAR(100);

-- 2. Create accounts table for individual account tracking
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  account_type TEXT NOT NULL,
  balance_cad DECIMAL(15, 2) DEFAULT 0,
  balance_usd DECIMAL(15, 2) DEFAULT 0,
  cash_balance_usd DECIMAL(15, 2) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Update option_trades table - add new strike fields
ALTER TABLE option_trades ADD COLUMN short_strike DECIMAL(10, 2);
ALTER TABLE option_trades ADD COLUMN long_strike DECIMAL(10, 2);
ALTER TABLE option_trades ADD COLUMN spread_width DECIMAL(10, 2);
ALTER TABLE option_trades ADD COLUMN account_id INTEGER;

-- 4. Update stock_trades table - add account_id
ALTER TABLE stock_trades ADD COLUMN account_id INTEGER;

-- 5. Create indexes
CREATE INDEX IF NOT EXISTS idx_option_trades_account_id ON option_trades(account_id);
CREATE INDEX IF NOT EXISTS idx_stock_trades_account_id ON stock_trades(account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- Note: The old strike_price fields (strike_price, strike_price_2, etc.) will be deprecated
-- but kept for backward compatibility during migration
