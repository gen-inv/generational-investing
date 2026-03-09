-- Migration: Backfill account_id for option trades that only have account_type
-- This fixes trades created before account_id was properly saved

-- Update option_trades to set account_id based on account_type
-- Match the first account that belongs to the user with the same account_type
UPDATE option_trades
SET account_id = (
    SELECT id 
    FROM accounts 
    WHERE accounts.user_id = option_trades.user_id 
      AND accounts.account_type = option_trades.account_type
    LIMIT 1
)
WHERE account_id IS NULL 
  AND account_type IS NOT NULL;
