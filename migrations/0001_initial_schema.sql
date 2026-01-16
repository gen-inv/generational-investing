-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  market_cap REAL,
  exchange TEXT,
  next_earnings_date DATE,
  sector TEXT,
  industry TEXT,
  is_wonderful INTEGER DEFAULT 0, -- Boolean: 0 = false, 1 = true
  research_score INTEGER,
  anti_fragile_score INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Account balances table
CREATE TABLE IF NOT EXISTS account_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_type TEXT NOT NULL, -- Cash, RESP, RRSP, LIRA
  balance_cad REAL DEFAULT 0,
  balance_usd REAL DEFAULT 0,
  cash_balance_usd REAL DEFAULT 0,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, account_type, month, year)
);

-- Stock trades table
CREATE TABLE IF NOT EXISTS stock_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  company_id INTEGER,
  ticker TEXT NOT NULL,
  trade_type TEXT NOT NULL, -- BUY, SELL
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  account_type TEXT NOT NULL,
  trade_date DATE NOT NULL,
  is_open INTEGER DEFAULT 1, -- Boolean: 0 = closed, 1 = open
  cost_basis_adjustment REAL DEFAULT 0, -- For dividends, covered calls, puts
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- Option trades table
CREATE TABLE IF NOT EXISTS option_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  company_id INTEGER,
  ticker TEXT NOT NULL,
  strategy_type TEXT NOT NULL, -- SELLING_PUT, BUYING_PUT, CREDIT_SPREAD, DEBIT_SPREAD, IRON_CONDOR, COVERED_CALL
  strike_price REAL NOT NULL,
  strike_price_2 REAL, -- For multi-leg strategies
  strike_price_3 REAL, -- For iron condors
  strike_price_4 REAL, -- For iron condors
  premium REAL NOT NULL,
  quantity INTEGER NOT NULL, -- Number of contracts
  expiration_date DATE NOT NULL,
  account_type TEXT NOT NULL,
  trade_date DATE NOT NULL,
  is_open INTEGER DEFAULT 1, -- Boolean: 0 = closed, 1 = open
  close_date DATE,
  close_price REAL,
  profit_loss REAL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- Cost basis adjustments table
CREATE TABLE IF NOT EXISTS cost_basis_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  stock_trade_id INTEGER NOT NULL,
  adjustment_type TEXT NOT NULL, -- DIVIDEND, COVERED_CALL, SELLING_PUT
  amount REAL NOT NULL,
  adjustment_date DATE NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (stock_trade_id) REFERENCES stock_trades(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_companies_user_id ON companies(user_id);
CREATE INDEX IF NOT EXISTS idx_companies_ticker ON companies(ticker);
CREATE INDEX IF NOT EXISTS idx_account_balances_user_id ON account_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_trades_user_id ON stock_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_trades_ticker ON stock_trades(ticker);
CREATE INDEX IF NOT EXISTS idx_option_trades_user_id ON option_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_option_trades_ticker ON option_trades(ticker);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
