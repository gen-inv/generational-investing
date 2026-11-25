// Removing a company from the roster must never take trades with it or leave them stranded.
// stock_holdings.company_id is ON DELETE CASCADE, so a bare DELETE FROM companies also deletes every holding of that
// company, and with it all buys, sells, dividends and premium adjustments (closed trades vanish from the reports).
// option_trades.company_id is ON DELETE SET NULL: the trade survives but loses its company in the edit form.
// Rules here: a company with an open stock position or an open option trade cannot be removed; a company with only
// closed trades is removed after its stock holdings are detached (company_id set to NULL, like option_trades already does),
// so the history stays.

export type CompanyDeleteResult =
  | { ok: true; detached: number }
  | { ok: false; status: 404 | 409; error: string; openPositions?: number; openOptionTrades?: number }

export async function deleteCompanySafely(DB: any, userId: unknown, companyId: unknown): Promise<CompanyDeleteResult> {
  const company = await DB.prepare(`SELECT id, ticker FROM companies WHERE id = ? AND user_id = ?`).bind(companyId, userId).first() as any
  if (!company) return { ok: false, status: 404, error: 'Company not found' }

  const openStocks = await DB.prepare(`
    SELECT COUNT(*) AS n FROM stock_holdings WHERE company_id = ? AND user_id = ? AND is_open = 1
  `).bind(companyId, userId).first() as any
  const openOptions = await DB.prepare(`
    SELECT COUNT(*) AS n FROM option_trades WHERE company_id = ? AND user_id = ? AND is_open = 1
  `).bind(companyId, userId).first() as any
  const stockCount = Number(openStocks?.n) || 0
  const optionCount = Number(openOptions?.n) || 0
  if (stockCount > 0 || optionCount > 0) {
    const parts: string[] = []
    if (stockCount > 0) parts.push(`${stockCount} open stock position${stockCount === 1 ? '' : 's'}`)
    if (optionCount > 0) parts.push(`${optionCount} open option trade${optionCount === 1 ? '' : 's'}`)
    const total = stockCount + optionCount
    return {
      ok: false, status: 409, openPositions: stockCount, openOptionTrades: optionCount,
      error: `${company.ticker} still has ${parts.join(' and ')}. Close ${total === 1 ? 'it' : 'them'} first; removing the company would delete or orphan ${total === 1 ? 'it' : 'them'}.`
    }
  }

  // Both statements run together: the history is detached and the company removed, or nothing changes.
  const results = await DB.batch([
    DB.prepare(`UPDATE stock_holdings SET company_id = NULL WHERE company_id = ? AND user_id = ?`).bind(companyId, userId),
    DB.prepare(`DELETE FROM companies WHERE id = ? AND user_id = ?`).bind(companyId, userId),
  ])
  return { ok: true, detached: Number(results?.[0]?.meta?.changes) || 0 }
}
