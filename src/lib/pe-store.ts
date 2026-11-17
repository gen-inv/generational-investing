// Stores the weekly P/E-history results and lists which companies to compute. The heavy work happens in the GitHub Action.
import { isExcluded, type RosterTicker } from './refresh-company-data'

export interface PeStats { min: number; p5: number; median: number; p95: number; max: number; current: number; percentile: number; months: number }
export interface PeResult { ticker: string; eps?: number | null; summary?: PeStats | null; error?: string | null; clear?: boolean }
export interface PeStoreSummary { stored: number; errors: number; rejected: string[] }

export const MAX_RESULTS_PER_POST = 100
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Every roster ticker worth computing: companies only (no funds, indices, ETF-list tickers or permanently excluded ones). */
export async function listPeTickers(db: any, etfTickers: string[] = []): Promise<string[]> {
  const etfs = new Set(etfTickers.map(t => String(t).toUpperCase()))
  const res = await db.prepare('SELECT ticker, MAX(exchange) AS exchange, MAX(sector) AS sector, MAX(industry) AS industry FROM companies GROUP BY ticker ORDER BY ticker').all()
  return ((res.results || []) as any[])
    .filter(r => r.ticker && !isExcluded({ ticker: r.ticker, exchange: r.exchange, sector: r.sector, industry: r.industry } as RosterTicker, etfs))
    .map(r => r.ticker as string)
}

export async function storePeResults(db: any, results: PeResult[]): Promise<PeStoreSummary> {
  const out: PeStoreSummary = { stored: 0, errors: 0, rejected: [] }
  for (const r of (results || []).slice(0, MAX_RESULTS_PER_POST)) {
    const ticker = r && typeof r.ticker === 'string' ? r.ticker.trim() : ''
    if (!ticker || ticker.length > 20) { out.rejected.push(String(r && r.ticker)); continue }
    const s = r.summary
    const values = s ? [num(r.eps), num(s.current), num(s.min), num(s.p5), num(s.median), num(s.p95), num(s.max), num(s.percentile), num(s.months)] : []
    if (s && values.some(v => v === null)) { out.rejected.push(ticker); continue }
    if (s) {
      await db.prepare('UPDATE companies SET pe_eps_ttm = ?, pe_current = ?, pe_min = ?, pe_p5 = ?, pe_median = ?, pe_p95 = ?, pe_max = ?, pe_percentile = ?, pe_months = ?, pe_updated_at = CURRENT_TIMESTAMP, pe_error = NULL WHERE ticker = ?')
        .bind(...values, ticker).run()
      out.stored++
    } else {
      const msg = String(r.error || 'no P/E history').slice(0, 200)
      if (r.clear) {
        // a permanent reason (loss-making, not an SEC filer, too little history): do not leave an old range on screen
        await db.prepare('UPDATE companies SET pe_eps_ttm = NULL, pe_current = NULL, pe_min = NULL, pe_p5 = NULL, pe_median = NULL, pe_p95 = NULL, pe_max = NULL, pe_percentile = NULL, pe_months = NULL, pe_updated_at = CURRENT_TIMESTAMP, pe_error = ? WHERE ticker = ?').bind(msg, ticker).run()
      } else {
        // a temporary problem (network, SEC or Yahoo down): keep last week's numbers and just note it
        await db.prepare('UPDATE companies SET pe_error = ? WHERE ticker = ?').bind(msg, ticker).run()
      }
      out.errors++
    }
  }
  return out
}
