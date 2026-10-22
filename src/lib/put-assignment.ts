// Keeps a short-put assignment in step with the put itself.
//
// Assigning a short put creates three things, all linked to the put by option_trade_id:
//   1. a BUY stock transaction (shares = contracts x 100 at the strike),
//   2. a stock-holding change (new holding, or shares added to the existing one at a new average price),
//   3. one SELLING_PUT cost-basis adjustment (premium less commission).
// If the put is re-opened or deleted, all three are reversed. If a still-assigned put is edited (strike,
// quantity, premium, commission, date), they follow. A change that cannot be made safely - the shares are
// no longer there, the position is closed, or undoing would strand other history - is refused ('check' mode)
// BEFORE anything is changed, so the caller can answer 409 and leave the data alone.

import { grossPremium } from './calc'

export interface AssignedPutValues {
  quantity: number
  strike_price: number
  premium: number
  commission?: number | null
  close_date?: string | null
}

export type PutAssignmentChange =
  | { kind: 'undo' }
  | { kind: 'keep'; option?: Partial<AssignedPutValues> }

export type PutAssignmentResult = { ok: true; changed: boolean } | { ok: false; error: string }

const EPS = 1e-6

export async function syncPutAssignment(
  DB: any,
  userId: unknown,
  optionId: unknown,
  change: PutAssignmentChange,
  mode: 'check' | 'apply'
): Promise<PutAssignmentResult> {
  const tx = await DB.prepare(`
    SELECT id, holding_id, shares, price_per_share, transaction_date
    FROM stock_transactions WHERE option_trade_id = ? AND user_id = ? ORDER BY id LIMIT 1
  `).bind(optionId, userId).first() as any
  const adjs = ((await DB.prepare(`
    SELECT id FROM cost_basis_adjustments
    WHERE option_trade_id = ? AND user_id = ? AND adjustment_type = 'SELLING_PUT' ORDER BY id
  `).bind(optionId, userId).all()).results || []) as { id: number }[]

  if (!tx && !adjs.length) return { ok: true, changed: false } // not an assigned put (or assigned before linking)

  const row = await DB.prepare(`SELECT * FROM option_trades WHERE id = ? AND user_id = ?`).bind(optionId, userId).first() as any
  const undo = change.kind === 'undo' || !row || row.is_open === 1
  const stmts: any[] = []

  let holding: any = null
  let newTotal = 0, newAvg = 0, deleteHolding = false
  if (tx) {
    holding = await DB.prepare(`SELECT * FROM stock_holdings WHERE id = ? AND user_id = ?`).bind(tx.holding_id, userId).first()
  }

  if (tx && holding) {
    if (holding.is_open === 0) {
      return { ok: false, error: 'The stock position from this assignment is closed. Re-open the position first, then change the option.' }
    }
    const total = Number(holding.total_shares), avg = Number(holding.average_price)
    const remTotal = total - Number(tx.shares)
    if (remTotal < -EPS) {
      return { ok: false, error: 'The shares from this assignment are no longer in the position (they were sold or reduced), so the assignment cannot be changed. Adjust the stock position first.' }
    }
    const remAvg = remTotal > EPS ? Math.max(0, (total * avg - Number(tx.shares) * Number(tx.price_per_share)) / remTotal) : 0

    if (undo) {
      if (remTotal <= EPS) {
        const others = await DB.prepare(`
          SELECT (SELECT COUNT(*) FROM stock_transactions WHERE holding_id = ? AND id != ?) +
                 (SELECT COUNT(*) FROM cost_basis_adjustments WHERE holding_id = ? AND (option_trade_id IS NULL OR option_trade_id != ?)) AS n
        `).bind(holding.id, tx.id, holding.id, optionId).first() as any
        if (others && others.n > 0) {
          return { ok: false, error: 'Undoing this assignment would leave an empty stock position that still has other history (transactions, dividends or option premiums). Remove or move that history first.' }
        }
        deleteHolding = true
      }
      newTotal = remTotal; newAvg = remAvg
    } else {
      const v = { ...row, ...(change.kind === 'keep' ? change.option : {}) } as AssignedPutValues
      const shares = Number(v.quantity) * 100, price = Number(v.strike_price)
      newTotal = remTotal + shares
      newAvg = newTotal > EPS ? (remTotal * remAvg + shares * price) / newTotal : 0
    }
  }

  if (mode === 'check') return { ok: true, changed: true }

  if (undo) {
    if (tx) stmts.push(DB.prepare(`DELETE FROM stock_transactions WHERE id = ?`).bind(tx.id))
    if (adjs.length) stmts.push(DB.prepare(`DELETE FROM cost_basis_adjustments WHERE option_trade_id = ? AND user_id = ? AND adjustment_type = 'SELLING_PUT'`).bind(optionId, userId))
    if (holding) {
      stmts.push(deleteHolding
        ? DB.prepare(`DELETE FROM stock_holdings WHERE id = ?`).bind(holding.id)
        : DB.prepare(`UPDATE stock_holdings SET total_shares = ?, average_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(newTotal, newAvg, holding.id))
    }
  } else {
    const v = { ...row, ...(change.kind === 'keep' ? change.option : {}) } as AssignedPutValues
    const shares = Number(v.quantity) * 100, price = Number(v.strike_price)
    const date = v.close_date || tx?.transaction_date || row.close_date
    const gross = grossPremium(Number(v.premium), Number(v.quantity))
    const commission = Number(v.commission) || 0
    const net = gross - commission
    if (tx) {
      stmts.push(DB.prepare(`UPDATE stock_transactions SET shares = ?, price_per_share = ?, transaction_date = ?, notes = ? WHERE id = ?`)
        .bind(shares, price, date, `Assigned from option: ${shares} shares @ $${price}`, tx.id))
    }
    if (holding) {
      stmts.push(DB.prepare(`UPDATE stock_holdings SET total_shares = ?, average_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(newTotal, newAvg, holding.id))
    }
    if (adjs.length) {
      const wheel = row.strategy_type === 'SELLING_PUT_WHEEL' ? 'Wheel' : row.strategy_type === 'SELLING_PUT_LONG_TERM' ? 'Long-Term' : 'Stockpiling'
      const notes = `Premium from assigned ${wheel} put: ${v.quantity} contract(s) @ $${v.premium}/share = $${gross.toFixed(2)}${commission > 0 ? ` - $${commission.toFixed(2)} commission = $${net.toFixed(2)}` : ''}`
      stmts.push(DB.prepare(`UPDATE cost_basis_adjustments SET amount = ?, adjustment_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(net, date, notes, adjs[0].id))
      for (const extra of adjs.slice(1)) stmts.push(DB.prepare(`DELETE FROM cost_basis_adjustments WHERE id = ?`).bind(extra.id))
    }
  }

  if (stmts.length) await DB.batch(stmts)
  return { ok: true, changed: true }
}
