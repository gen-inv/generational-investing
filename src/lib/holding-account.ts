// Moving a stock position to another account from the Edit Stock Trade form.
// A position is identified by ticker + account, and its buys, sells, dividends and premium adjustments hang off the
// holding itself, so they follow it automatically. What is linked only by ticker + account has to be moved with it:
//  - covered calls dated within the position's holding period, and
//  - the short puts that were assigned into this position (stock_transactions.option_trade_id),
// otherwise editing those trades later would look for the position in the old account.
// A move is refused when the destination already has an open position in the same ticker: shares go there with
// "Add To Position" in the stock detail window, not by moving a second position on top of it.

export interface MovableHolding { id: number; ticker: string; account_id: number | null; is_open: number; opened_date: string; closed_date?: string | null }

export type MoveResult =
  | { ok: true; movedCoveredCalls: number; movedPuts: number }
  | { ok: false; status: 400 | 409; error: string }

export async function moveHoldingToAccount(DB: any, userId: unknown, holding: MovableHolding, newAccountId: number): Promise<MoveResult> {
  const account = await DB.prepare(`SELECT id, account_name, account_type FROM accounts WHERE id = ? AND user_id = ?`).bind(newAccountId, userId).first() as any
  if (!account) return { ok: false, status: 400, error: 'Account not found' }

  if (holding.is_open === 1) {
    const clash = await DB.prepare(`
      SELECT id FROM stock_holdings WHERE user_id = ? AND ticker = ? AND account_id = ? AND is_open = 1 AND id != ?
    `).bind(userId, holding.ticker, newAccountId, holding.id).first() as any
    if (clash) {
      return {
        ok: false, status: 409,
        error: `${holding.ticker} is already held in ${account.account_name}. To add shares there, open that position and use Add To Position instead of moving this one.`
      }
    }
  }

  // One batch: the position and everything linked to it move together, or nothing changes.
  const results = await DB.batch([
    DB.prepare(`UPDATE stock_holdings SET account_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`)
      .bind(newAccountId, holding.id, userId),
    DB.prepare(`
      UPDATE option_trades SET account_id = ?, account_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND ticker = ? AND strategy_type = 'COVERED_CALL' AND account_id = ?
        AND trade_date >= ? AND trade_date <= ?
    `).bind(newAccountId, account.account_type, userId, holding.ticker, holding.account_id, holding.opened_date, holding.closed_date || '9999-12-31'),
    DB.prepare(`
      UPDATE option_trades SET account_id = ?, account_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND id IN (
        SELECT option_trade_id FROM stock_transactions WHERE holding_id = ? AND option_trade_id IS NOT NULL
      )
    `).bind(newAccountId, account.account_type, userId, holding.id),
  ])
  return { ok: true, movedCoveredCalls: Number(results?.[1]?.meta?.changes) || 0, movedPuts: Number(results?.[2]?.meta?.changes) || 0 }
}
