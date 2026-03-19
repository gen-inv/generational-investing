-- Migration: Update dividend_repository structure to remove holding_id and shares calculation
-- Dividends are now stored by ticker only, not linked to specific holdings
-- Application to individual holdings will be done separately based on pay_date

-- First, let's drop the old table if it has the wrong structure
-- We'll recreate it with the correct structure
DROP TABLE IF EXISTS dividend_repository;

-- Create dividend_repository with simplified structure
CREATE TABLE dividend_repository (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  
  -- Dividend details from API
  ex_date DATE NOT NULL,           -- Ex-dividend date (must own stock before this date)
  record_date DATE,                 -- Record date
  pay_date DATE,                    -- Payment date
  declared_date DATE,               -- Declaration date
  amount REAL NOT NULL,             -- Dividend amount per share
  frequency TEXT,                   -- QUARTERLY, MONTHLY, ANNUAL, etc.
  currency TEXT DEFAULT 'USD',      -- Currency of dividend
  
  -- API tracking
  api_source TEXT DEFAULT 'rapidapi_dividend_tracker',
  fetch_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Status tracking
  status TEXT DEFAULT 'pending',    -- pending, applied, ignored
  notes TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, ticker, ex_date)  -- Prevent duplicate dividends per ticker
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_dividend_repository_user_id ON dividend_repository(user_id);
CREATE INDEX IF NOT EXISTS idx_dividend_repository_ticker ON dividend_repository(ticker);
CREATE INDEX IF NOT EXISTS idx_dividend_repository_ex_date ON dividend_repository(ex_date);
CREATE INDEX IF NOT EXISTS idx_dividend_repository_pay_date ON dividend_repository(pay_date);
CREATE INDEX IF NOT EXISTS idx_dividend_repository_status ON dividend_repository(status);
