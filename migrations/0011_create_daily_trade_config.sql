-- Migration: Create daily_trade_config table for 0DTE trading configuration
-- This stores user-specific configuration for the Daily Trade feature

CREATE TABLE IF NOT EXISTS daily_trade_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    
    -- Risk Management
    max_contract_limit INTEGER NOT NULL DEFAULT 25,
    rolling_profit_window INTEGER NOT NULL DEFAULT 50,
    
    -- Default Entry Parameters
    target_premium_min DECIMAL(10,2) NOT NULL DEFAULT 10.00,
    target_premium_max DECIMAL(10,2) NOT NULL DEFAULT 15.00,
    strike_width INTEGER NOT NULL DEFAULT 5,
    default_contracts INTEGER NOT NULL DEFAULT 1,
    
    -- Exit Rules
    profit_target_percent INTEGER NOT NULL DEFAULT 50,
    atm_proximity_limit INTEGER NOT NULL DEFAULT 30,
    time_exit TIME NOT NULL DEFAULT '14:00:00',
    
    -- Account Settings
    default_account_id INTEGER,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (default_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    UNIQUE(user_id)
);

-- Create index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_daily_trade_config_user_id ON daily_trade_config(user_id);
