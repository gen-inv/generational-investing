-- Link a covered-call cost-basis adjustment to the option trade that produced it, so deleting,
-- re-opening or editing the trade can keep the adjustment in step (no orphans, no double counting).
ALTER TABLE cost_basis_adjustments ADD COLUMN option_trade_id INTEGER;
CREATE INDEX idx_cost_basis_adjustments_option_trade_id ON cost_basis_adjustments(option_trade_id);

-- Backfill: stamp existing covered-call adjustments when exactly one closed covered call on the same
-- ticker matches the adjustment's amount and date. Anything ambiguous or orphaned is left unlinked.
UPDATE cost_basis_adjustments
SET option_trade_id = (
  SELECT ot.id FROM option_trades ot
  JOIN stock_holdings sh ON sh.id = cost_basis_adjustments.holding_id
  WHERE ot.user_id = cost_basis_adjustments.user_id AND ot.strategy_type = 'COVERED_CALL' AND ot.is_open = 0
    AND ot.ticker = sh.ticker AND ot.profit_loss IS NOT NULL
    AND ABS(ot.profit_loss - cost_basis_adjustments.amount) < 0.005
    AND ot.close_date = cost_basis_adjustments.adjustment_date
)
WHERE adjustment_type = 'COVERED_CALL' AND option_trade_id IS NULL
  AND (
    SELECT COUNT(*) FROM option_trades ot
    JOIN stock_holdings sh ON sh.id = cost_basis_adjustments.holding_id
    WHERE ot.user_id = cost_basis_adjustments.user_id AND ot.strategy_type = 'COVERED_CALL' AND ot.is_open = 0
      AND ot.ticker = sh.ticker AND ot.profit_loss IS NOT NULL
      AND ABS(ot.profit_loss - cost_basis_adjustments.amount) < 0.005
      AND ot.close_date = cost_basis_adjustments.adjustment_date
  ) = 1;