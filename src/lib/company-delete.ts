// Removing a company from the roster must never take stock history with it.
// stock_holdings.company_id is ON DELETE CASCADE, so a bare DELETE FROM companies also deletes every holding of that
// company, and with it all buys, sells, dividends and premium adjustments (closed trades vanish from the reports).
// Rules here: a company with an open stock position cannot be removed; a company with only closed positions is removed
// after its holdings are detached (company_id set to NULL, like option_trades already does), so the history stays.

export type CompanyDeleteResult =
  | { ok: true; detached: number }
  | { ok: false; status: 404 | 409; error: string; openPositions?: number }

export async function deleteCompanySafely(DB: any, userId: unknown, companyId: unknown): Promise<CompanyDeleteResult> {
  const company = await DB.prepare(`SELECT id, ticker FROM companies WHERE id = ? AND user_id = ?`).bind(companyId, userId).first() as any
  if (!company) return { ok: false, status: 404, error: 'Company not found' }

  const open = await DB.prepare(`
    SELECT COUNT(*) AS n FROM stock_holdings WHERE company_id = ? AND user_id = ? AND is_open = 1
  `).bind(companyId, userId).first() as any
  const openCount = Number(open?.n) || 0
  if (openCount > 0) {
    return {
      ok: false, status: 409, openPositions: openCount,
      error: `${company.ticker} still has ${openCount} open stock position${openCount === 1 ? '' : 's'}. Close ${openCount === 1 ? 'it' : 'them'} first; removing the company would delete the position and its history.`
    }
  }

  // Both statements run together: the history is detached and the company removed, or nothing changes.
  const results = await DB.batch([
    DB.prepare(`UPDATE stock_holdings SET company_id = NULL WHERE company_id = ? AND user_id = ?`).bind(companyId, userId),
    DB.prepare(`DELETE FROM companies WHERE id = ? AND user_id = ?`).bind(companyId, userId),
  ])
  return { ok: true, detached: Number(results?.[0]?.meta?.changes) || 0 }
}
