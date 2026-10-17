// Keeps a stock holding's covered-call cost-basis adjustment in step with the covered call itself.
//
// Rule: a covered call has exactly one adjustment (linked by option_trade_id) while it is CLOSED with a
// profit_loss, equal to that P/L. If it is re-opened, edited back to open, or deleted, the adjustment is removed.
// If a closed call is edited, the adjustment amount/date follow. Call this after ANY change to a covered call.

export async function syncCoveredCallAdjustment(DB: any, userId: unknown, optionId: unknown): Promise<void> {
  const cc = await DB.prepare(`
    SELECT id, ticker, account_id, quantity, strike_price, close_price, close_date, is_open, profit_loss, strategy_type
    FROM option_trades WHERE id = ? AND user_id = ?
  `).bind(optionId, userId).first() as any

  const linked = ((await DB.prepare(`
    SELECT id, holding_id FROM cost_basis_adjustments WHERE option_trade_id = ? AND user_id = ? ORDER BY id
  `).bind(optionId, userId).all()).results || []) as { id: number; holding_id: number }[]

  const shouldExist = !!cc && cc.strategy_type === 'COVERED_CALL' && !cc.is_open &&
    cc.profit_loss !== null && cc.profit_loss !== undefined

  if (!shouldExist) {
    if (linked.length) {
      await DB.prepare(`DELETE FROM cost_basis_adjustments WHERE option_trade_id = ? AND user_id = ?`).bind(optionId, userId).run()
    }
    return
  }

  // Keep the holding the adjustment was first booked against; otherwise find the open holding in the call's account.
  let holdingId: number | null = linked.length ? linked[0].holding_id : null
  if (!holdingId) {
    const h = await DB.prepare(`
      SELECT id FROM stock_holdings
      WHERE ticker = ? AND user_id = ? AND is_open = 1 AND (? IS NULL OR account_id = ?)
      ORDER BY id LIMIT 1
    `).bind(cc.ticker, userId, cc.account_id ?? null, cc.account_id ?? null).first() as any
    holdingId = h?.id ?? null
  }
  if (!holdingId) return // no holding to book against

  const date = cc.close_date || new Date().toISOString().split('T')[0]
  const pl = Number(cc.profit_loss)
  const notes = `Covered call closed - Net P/L: $${pl.toFixed(2)} (${cc.quantity} contracts @ $${cc.strike_price}, closed @ $${cc.close_price ?? 0})`

  if (linked.length) {
    await DB.prepare(`UPDATE cost_basis_adjustments SET amount = ?, adjustment_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(pl, date, notes, linked[0].id).run()
    // self-heal any duplicates left by earlier re-open / re-close cycles
    for (const extra of linked.slice(1)) {
      await DB.prepare(`DELETE FROM cost_basis_adjustments WHERE id = ?`).bind(extra.id).run()
    }
  } else {
    await DB.prepare(`
      INSERT INTO cost_basis_adjustments (user_id, holding_id, adjustment_type, amount, adjustment_date, notes, option_trade_id)
      VALUES (?, ?, 'COVERED_CALL', ?, ?, ?, ?)
    `).bind(userId, holdingId, pl, date, notes, cc.id).run()
  }
}