-- ============================================================================
-- STOCK HOLDINGS & TRANSACTIONS REFACTOR
-- This migration creates a proper holdings-based system for stock positions
-- ============================================================================

-- Create stock_holdings table to represent positions
CREATE TABLE IF NOT EXISTS stock_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  company_id INTEGER,
  ticker TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  total_shares INTEGER NOT NULL DEFAULT 0,
  average_price REAL NOT NULL DEFAULT 0,
  is_open INTEGER DEFAULT 1, -- Boolean: 0 = closed, 1 = open
  opened_date DATE NOT NULL,
  closed_date DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(user_id, ticker, account_id, is_open)
);

-- Create stock_transactions table to track individual buy/sell actions
CREATE TABLE IF NOT EXISTS stock_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('BUY', 'SELL')),
  shares INTEGER NOT NULL,
  price_per_share REAL NOT NULL,
  transaction_date DATE NOT NULL,
  commission REAL DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (holding_id) REFERENCES stock_holdings(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_holdings_user_id ON stock_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_ticker ON stock_holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_account_id ON stock_holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_is_open ON stock_holdings(is_open);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_user_ticker_account ON stock_holdings(user_id, ticker, account_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_user_id ON stock_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_holding_id ON stock_transactions(holding_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_date ON stock_transactions(transaction_date);

-- Migrate existing stock_trades data to new structure
-- Group by user_id, ticker, account_id to create holdings
INSERT INTO stock_holdings (user_id, company_id, ticker, account_id, total_shares, average_price, is_open, opened_date, notes)
SELECT 
  st.user_id,
  MAX(st.company_id) as company_id,
  st.ticker,
  st.account_id,
  SUM(CASE WHEN st.trade_type = 'BUY' THEN st.quantity ELSE -st.quantity END) as total_shares,
  -- Calculate weighted average price for BUY transactions only
  SUM(CASE WHEN st.trade_type = 'BUY' THEN st.quantity * st.price ELSE 0 END) / 
    NULLIF(SUM(CASE WHEN st.trade_type = 'BUY' THEN st.quantity ELSE 0 END), 0) as average_price,
  MAX(st.is_open) as is_open,
  MIN(st.trade_date) as opened_date,
  MAX(st.notes) as notes
FROM stock_trades st
GROUP BY st.user_id, st.ticker, st.account_id
HAVING total_shares > 0 OR total_shares = 0;

-- Create transactions from stock_trades
INSERT INTO stock_transactions (user_id, holding_id, transaction_type, shares, price_per_share, transaction_date, commission, notes)
SELECT 
  st.user_id,
  sh.id as holding_id,
  st.trade_type as transaction_type,
  st.quantity as shares,
  st.price as price_per_share,
  st.trade_date as transaction_date,
  COALESCE(st.commission, 0) as commission,
  st.notes
FROM stock_trades st
INNER JOIN stock_holdings sh ON 
  st.user_id = sh.user_id 
  AND st.ticker = sh.ticker 
  AND st.account_id = sh.account_id
ORDER BY st.trade_date ASC, st.id ASC;

-- Update cost_basis_adjustments to reference holding_id instead of stock_trade_id
-- Step 1: Add new holding_id column
ALTER TABLE cost_basis_adjustments ADD COLUMN holding_id INTEGER;

-- Step 2: Populate holding_id from stock_trade_id
UPDATE cost_basis_adjustments
SET holding_id = (
  SELECT sh.id
  FROM stock_trades st
  INNER JOIN stock_holdings sh ON 
    st.user_id = sh.user_id 
    AND st.ticker = sh.ticker 
    AND st.account_id = sh.account_id
  WHERE st.id = cost_basis_adjustments.stock_trade_id
  LIMIT 1
);

-- Step 3: Create new cost_basis_adjustments table with correct structure
CREATE TABLE IF NOT EXISTS cost_basis_adjustments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('DIVIDEND', 'COVERED_CALL', 'SELLING_PUT')),
  amount REAL NOT NULL,
  adjustment_date DATE NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (holding_id) REFERENCES stock_holdings(id) ON DELETE CASCADE
);

-- Step 4: Copy data to new table
INSERT INTO cost_basis_adjustments_new (id, user_id, holding_id, adjustment_type, amount, adjustment_date, notes, created_at)
SELECT id, user_id, holding_id, adjustment_type, amount, adjustment_date, notes, created_at
FROM cost_basis_adjustments
WHERE holding_id IS NOT NULL;

-- Step 5: Drop old table and rename new one
DROP TABLE cost_basis_adjustments;
ALTER TABLE cost_basis_adjustments_new RENAME TO cost_basis_adjustments;

-- Step 6: Create indexes
CREATE INDEX IF NOT EXISTS idx_cost_basis_adjustments_user_id ON cost_basis_adjustments(user_id);
CREATE INDEX IF NOT EXISTS idx_cost_basis_adjustments_holding_id ON cost_basis_adjustments(holding_id);
