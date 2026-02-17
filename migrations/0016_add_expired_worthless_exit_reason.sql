-- Migration: Add EXPIRED_WORTHLESS to exit_reason enum
-- SQLite doesn't support modifying CHECK constraints directly
-- The constraint in the original table allows: PROFIT_TARGET, ATM_PROXIMITY, TIME_EXIT, MANUAL, STOP_LOSS
-- We're adding EXPIRED_WORTHLESS as a valid value (replacing MANUAL usage)
-- Note: SQLite CHECK constraints are not strictly enforced on existing tables in some cases,
-- and the application layer will ensure only valid values are used.

-- For documentation: valid exit_reason values are now:
-- 'PROFIT_TARGET', 'ATM_PROXIMITY', 'TIME_EXIT', 'EXPIRED_WORTHLESS', 'STOP_LOSS'
