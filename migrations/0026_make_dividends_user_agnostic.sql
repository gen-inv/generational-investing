-- Migration: Remove user_id from dividend_repository to make dividends user-agnostic
-- Dividends are universal data that any user can reference
-- Application to individual holdings will match based on ticker and dates

-- Drop the old table
DROP TABLE IF EXISTS dividend_repository;

-- Create dividend_repository with user-agnostic structure
CREATE TABLE dividend_repository (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  status TEXT DEFAULT 'active',     -- active, deprecated, corrected
  notes TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(ticker, ex_date)  -- One dividend per ticker per ex-date (universal)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_dividend_repository_ticker ON dividend_repository(ticker);
CREATE INDEX IF NOT EXISTS idx_dividend_repository_ex_date ON dividend_repository(ex_date);
CREATE INDEX IF NOT EXISTS idx_dividend_repository_pay_date ON dividend_repository(pay_date);
CREATE INDEX IF NOT EXISTS idx_dividend_repository_status ON dividend_repository(status);

-- Update api_configurations table to remain user-specific
-- (API keys are still per-user)

-- Update dividend_fetch_logs to track system-wide fetches
-- Keep user_id for audit purposes (who triggered the fetch)
