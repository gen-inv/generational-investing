-- Migration: Create dividend_repository table for automated dividend tracking
-- This table stores dividend information fetched from external APIs (RapidAPI Dividend Tracker)
-- and tracks which dividends are eligible for each stock holding

CREATE TABLE IF NOT EXISTS dividend_repository (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  
  -- Dividend details from API
  ex_date DATE NOT NULL,           -- Ex-dividend date (must own stock before this date)
  record_date DATE,                 -- Record date
  pay_date DATE,                    -- Payment date
  declared_date DATE,               -- Declaration date
  amount REAL NOT NULL,             -- Dividend amount per share
  frequency TEXT,                   -- QUARTERLY, MONTHLY, ANNUAL, etc.
  currency TEXT DEFAULT 'USD',      -- Currency of dividend
  
  -- Eligibility tracking
  is_eligible INTEGER DEFAULT 0,   -- Boolean: 1 if holding owned stock before ex_date
  shares_held INTEGER,              -- Number of shares held on ex_date
  total_dividend REAL,              -- Total dividend = amount * shares_held
  
  -- Application tracking
  is_applied INTEGER DEFAULT 0,     -- Boolean: 1 if dividend was applied to cost_basis_adjustments
  applied_date DATETIME,            -- When dividend was applied
  cost_basis_adjustment_id INTEGER, -- Link to cost_basis_adjustments table
  
  -- API tracking
  api_source TEXT DEFAULT 'rapidapi_dividend_tracker',
  fetch_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Status and notes
  status TEXT DEFAULT 'pending',    -- pending, eligible, applied, ignored
  notes TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (holding_id) REFERENCES stock_holdings(id) ON DELETE CASCADE,
  FOREIGN KEY (cost_basis_adjustment_id) REFERENCES cost_basis_adjustments(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_dividend_repository_user_id ON dividend_repository(user_id);
CREATE INDEX IF NOT EXISTS idx_dividend_repository_holding_id ON dividend_repository(holding_id);
CREATE INDEX IF NOT EXISTS idx_dividend_repository_ticker ON dividend_repository(ticker);
CREATE INDEX IF NOT EXISTS idx_dividend_repository_ex_date ON dividend_repository(ex_date);
CREATE INDEX IF NOT EXISTS idx_dividend_repository_status ON dividend_repository(status);
CREATE INDEX IF NOT EXISTS idx_dividend_repository_is_eligible ON dividend_repository(is_eligible);

-- Create API configuration table for storing RapidAPI keys and settings
CREATE TABLE IF NOT EXISTS api_configurations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  api_name TEXT NOT NULL,           -- e.g., 'rapidapi_dividend_tracker'
  api_key TEXT NOT NULL,            -- Encrypted API key
  api_host TEXT,                    -- API host URL
  settings TEXT,                    -- JSON string for additional settings
  is_active INTEGER DEFAULT 1,      -- Boolean: is this configuration active
  last_used DATETIME,               -- Last time API was called
  rate_limit_remaining INTEGER,     -- Track rate limits
  rate_limit_reset DATETIME,        -- When rate limit resets
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, api_name)
);

CREATE INDEX IF NOT EXISTS idx_api_configurations_user_id ON api_configurations(user_id);
CREATE INDEX IF NOT EXISTS idx_api_configurations_api_name ON api_configurations(api_name);

-- Create dividend fetch log for tracking automated fetches
CREATE TABLE IF NOT EXISTS dividend_fetch_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  fetch_type TEXT NOT NULL,         -- 'manual', 'scheduled', 'auto'
  status TEXT NOT NULL,              -- 'success', 'partial', 'failed'
  tickers_processed TEXT,            -- Comma-separated list of tickers processed
  dividends_found INTEGER DEFAULT 0,
  dividends_eligible INTEGER DEFAULT 0,
  api_calls_made INTEGER DEFAULT 0,
  error_message TEXT,
  fetch_duration_ms INTEGER,        -- Duration in milliseconds
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dividend_fetch_logs_user_id ON dividend_fetch_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_dividend_fetch_logs_started_at ON dividend_fetch_logs(started_at);
