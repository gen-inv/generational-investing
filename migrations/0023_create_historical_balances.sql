-- Migration: Create historical_balances table for tracking account balances over time
-- Created: 2025-03-06

-- Create historical_balances table
CREATE TABLE IF NOT EXISTS historical_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  balance_date DATE NOT NULL,
  currency TEXT NOT NULL,
  entered_amount DECIMAL(15,2) NOT NULL,
  exchange_rate DECIMAL(10,6) NOT NULL,
  usd_balance DECIMAL(15,2) NOT NULL,
  cad_balance DECIMAL(15,2) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  UNIQUE(user_id, account_id, balance_date)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_historical_balances_user_id ON historical_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_historical_balances_account_id ON historical_balances(account_id);
CREATE INDEX IF NOT EXISTS idx_historical_balances_date ON historical_balances(balance_date);
