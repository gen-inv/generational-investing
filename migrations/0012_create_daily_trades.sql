-- Migration: Create daily_trades table for 0DTE trading
-- This stores individual 0DTE trade entries with detailed tracking

CREATE TABLE IF NOT EXISTS daily_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER,
    
    -- Trade Identification
    trade_date DATE NOT NULL,
    entry_time TIME NOT NULL,
    exit_time TIME,
    
    -- Strategy Configuration
    strategy_type TEXT NOT NULL CHECK(strategy_type IN ('IRON_CONDOR', 'CREDIT_SPREAD_CALL', 'CREDIT_SPREAD_PUT')),
    contracts INTEGER NOT NULL,
    
    -- Call Spread (if enabled)
    call_enabled INTEGER DEFAULT 0,
    call_short_strike DECIMAL(10,2),
    call_total_credit DECIMAL(10,2),
    call_close_debit DECIMAL(10,2),
    
    -- Put Spread (if enabled)
    put_enabled INTEGER DEFAULT 0,
    put_short_strike DECIMAL(10,2),
    put_total_credit DECIMAL(10,2),
    put_close_debit DECIMAL(10,2),
    
    -- SPX Pricing
    spx_entry_price DECIMAL(10,2),
    spx_exit_price DECIMAL(10,2),
    
    -- Trade Financials
    total_credit DECIMAL(10,2) NOT NULL,
    total_debit DECIMAL(10,2),
    commission DECIMAL(10,2) DEFAULT 0,
    profit_loss DECIMAL(10,2),
    
    -- Exit Reasons
    exit_reason TEXT CHECK(exit_reason IN ('PROFIT_TARGET', 'ATM_PROXIMITY', 'TIME_EXIT', 'MANUAL', 'STOP_LOSS')),
    
    -- Trade Status
    is_open INTEGER DEFAULT 1,
    
    -- Notes
    notes TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_daily_trades_user_date ON daily_trades(user_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_trades_user_open ON daily_trades(user_id, is_open);
CREATE INDEX IF NOT EXISTS idx_daily_trades_date ON daily_trades(trade_date DESC);
