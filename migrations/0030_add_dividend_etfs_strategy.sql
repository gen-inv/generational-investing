-- Add DIVIDEND_ETFS strategy type to stock_holdings
-- This strategy is for dividend-focused ETF investments

-- SQLite doesn't support ALTER COLUMN to modify CHECK constraints
-- We need to recreate the table without the CHECK constraint
-- The application layer will enforce valid strategy types

-- Step 1: Create new table without CHECK constraint (app will enforce)
CREATE TABLE stock_holdings_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  account_id INTEGER,
  total_shares REAL NOT NULL,
  average_price REAL NOT NULL,
  is_open INTEGER DEFAULT 1,
  opened_date DATE NOT NULL,
  closed_date DATE,
  strategy_type TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

-- Step 2: Copy data from old table
INSERT INTO stock_holdings_new 
SELECT * FROM stock_holdings;

-- Step 3: Drop old table
DROP TABLE stock_holdings;

-- Step 4: Rename new table
ALTER TABLE stock_holdings_new RENAME TO stock_holdings;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_stock_holdings_user_id ON stock_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_company_id ON stock_holdings(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_account_id ON stock_holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_ticker ON stock_holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_is_open ON stock_holdings(is_open);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_strategy_type ON stock_holdings(strategy_type);

-- Valid strategy_type values enforced by application:
-- NULL, 'WHEEL', 'STOCKPILING', 'DIVIDEND_ETFS'

