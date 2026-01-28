-- Migration: Rename RESP account type to TFSA
-- Date: 2026-01-27
-- Description: Change account type from RESP (Registered Education Savings Plan) to TFSA (Tax-Free Savings Account)

-- Update existing RESP accounts to TFSA
UPDATE accounts SET account_type = 'TFSA' WHERE account_type = 'RESP';

-- Note: Application code already validates against: Cash, TFSA, RRSP, LIRA
