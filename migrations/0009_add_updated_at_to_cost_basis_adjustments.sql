-- Migration: Add updated_at column to cost_basis_adjustments table
-- Description: Track when adjustments are modified (e.g., when covered calls are closed)

ALTER TABLE cost_basis_adjustments ADD COLUMN updated_at DATETIME;

-- Set updated_at to created_at for existing records
UPDATE cost_basis_adjustments SET updated_at = created_at;
