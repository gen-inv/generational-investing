-- Migration 0003: Add account balance history and default currency

-- Add default_currency to accounts table
ALTER TABLE accounts ADD COLUMN default_currency TEXT DEFAULT 'CAD';

-- Create account_balance_history table for monthly snapshots
CREATE TABLE IF NOT EXISTS account_balance_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  balance REAL NOT NULL,
  cash_balance REAL NOT NULL,
  currency TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  exchange_rate_to_usd REAL DEFAULT 1.0,
  exchange_rate_to_cad REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_balance_history_account ON account_balance_history(account_id);
CREATE INDEX IF NOT EXISTS idx_balance_history_date ON account_balance_history(year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_balance_history_user ON account_balance_history(user_id);

-- Create exchange_rates table for caching monthly rates
CREATE TABLE IF NOT EXISTS exchange_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  usd_to_cad REAL NOT NULL,
  cad_to_usd REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(month, year)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(year DESC, month DESC);
