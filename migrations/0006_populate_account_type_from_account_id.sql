-- Make account_type nullable since we now use account_id
-- SQLite doesn't support ALTER COLUMN directly, so we need to work around it

-- First, check if account_type is being used
-- We'll keep the column but make it nullable by creating a new table

-- Note: In SQLite, we can't directly modify column constraints
-- But we can update existing rows to have a value based on account_id
-- and then rely on application logic

-- Set account_type from account_id for existing records
UPDATE stock_trades 
SET account_type = (
    SELECT account_type 
    FROM accounts 
    WHERE accounts.id = stock_trades.account_id
)
WHERE account_id IS NOT NULL AND (account_type IS NULL OR account_type = '');

-- For records without account_id, set a default
UPDATE stock_trades 
SET account_type = 'Cash'
WHERE account_type IS NULL OR account_type = '';
