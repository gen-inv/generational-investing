// Nightly refresh of Market Cap and Next Earnings Date for the Company Roster, in small batches.
// Yahoo (free) is tried first; FinanceBird (RapidAPI, 20 calls a day on the free plan) only when Yahoo cannot supply the data.

export const BATCH_SIZE = 8
export const MAX_FINANCEBIRD_CALLS = 10

export interface RosterTicker {
  ticker: string
  exchange: string | null
  sector: string | null
  industry: string | null
  market_cap: number | null
  next_earnings_date: string | null
  earnings_estimated: number | null
  refreshed_at: string | null
  data_refresh_error?: string | null
}

export interface RefreshSummary {
  checked: number
  refreshed: string[]
  failed: { ticker: string; error: string }[]
  skipped: string[]
  financebirdCalls: number
}

// ETFs and indices have neither a market cap nor earnings: leave them alone
export function isFundOrIndex(r: RosterTicker): boolean {
  if (r.ticker.startsWith('^')) return true
  return !r.sector && !r.industry && (r.exchange === 'PCX' || r.exchange === 'WCB')
}

// Companies that are really funds, which the sector/exchange check cannot spot
export const ALWAYS_SKIP = ['FNNCF', 'FTN.TO']

// Never refreshed: funds, indices, anything on the Discovery ETF list
export function isExcluded(r: RosterTicker, etfs: Set<string>): boolean {
  return isFundOrIndex(r) || ALWAYS_SKIP.includes(r.ticker) || etfs.has(r.ticker)
}

export function earningsPassedOrMissing(r: RosterTicker, today: string): boolean {
  return !r.next_earnings_date || r.next_earnings_date < today
}

// An estimated date is checked again when its turn comes round, so a real announcement replaces it
export function needsEarnings(r: RosterTicker, today: string): boolean {
  return earningsPassedOrMissing(r, today) || r.earnings_estimated === 1
}

// Up to size companies: missing or passed earnings dates first, then whoever was refreshed longest ago
export function pickBatch(rows: RosterTicker[], today: string, size: number = BATCH_SIZE, etfs: Set<string> = new Set()): RosterTicker[] {
  return rows
    .filter((r) => !isExcluded(r, etfs))
    .sort((a, b) => {
      const pa = earningsPassedOrMissing(a, today) ? 0 : 1
      const pb = earningsPassedOrMissing(b, today) ? 0 : 1
      if (pa !== pb) return pa - pb
      const ra = a.refreshed_at || '1970-01-01'
      const rb = b.refreshed_at || '1970-01-01'
      if (ra !== rb) return ra < rb ? -1 : 1
      return a.ticker < b.ticker ? -1 : 1
    })
    .slice(0, size)
}

function rawNumber(v: any): number | null {
  if (typeof v === 'number') return v
  if (v && typeof v.raw === 'number') return v.raw
  return null
}

function addThreeMonths(d: Date): Date {
  const e = new Date(d.getTime())
  e.setUTCMonth(e.getUTCMonth() + 3)
  return e
}

// Reads market cap and the next earnings date out of a FinanceBird summary response
export function parseSummary(json: any, today: string): { marketCap: number | null; earningsDate: string | null; estimated: boolean } {
  const r = json && json.quoteResponse && json.quoteResponse.result && json.quoteResponse.result[0]
  if (!r) return { marketCap: null, earningsDate: null, estimated: false }
  const cap = rawNumber(r.marketCap)
  const marketCap = cap && cap > 0 ? cap : null
  const ts = rawNumber(r.earningsTimestampEnd) || rawNumber(r.earningsTimestampStart) || rawNumber(r.earningsTimestamp)
  if (!ts) return { marketCap, earningsDate: null, estimated: false }
  const d = new Date(ts * 1000)
  const iso = d.toISOString().slice(0, 10)
  if (iso >= today) return { marketCap, earningsDate: iso, estimated: false }
  // the provider only knows the last report: assume the next one is a quarter later
  const est = addThreeMonths(d).toISOString().slice(0, 10)
  return { marketCap, earningsDate: est >= today ? est : null, estimated: est >= today }
}

async function yahooMarketCap(fetchFn: any, ticker: string): Promise<number | null> {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?interval=1d&range=1d'
    const resp = await fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, signal: AbortSignal.timeout(10000) })
    if (!resp.ok) return null
    const data: any = await resp.json()
    const cap = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta && data.chart.result[0].meta.marketCap
    return typeof cap === 'number' && cap > 0 ? cap : null
  } catch (e) {
    return null
  }
}

export async function refreshCompanyData(deps: { db: any; fetchFn: any; rapidApiKey?: string | null; now?: Date; batchSize?: number; maxFinanceBirdCalls?: number; etfTickers?: string[] }): Promise<RefreshSummary> {
  const { db, fetchFn } = deps
  const today = (deps.now || new Date()).toISOString().slice(0, 10)
  let budget = deps.maxFinanceBirdCalls === undefined ? MAX_FINANCEBIRD_CALLS : deps.maxFinanceBirdCalls
  const summary: RefreshSummary = { checked: 0, refreshed: [], failed: [], skipped: [], financebirdCalls: 0 }

  const result = await db.prepare(
    'SELECT ticker, MAX(exchange) AS exchange, MAX(sector) AS sector, MAX(industry) AS industry, MAX(market_cap) AS market_cap, ' +
    'MAX(next_earnings_date) AS next_earnings_date, MAX(earnings_estimated) AS earnings_estimated, ' +
    'MAX(data_refresh_error) AS data_refresh_error, ' +
    "MIN(COALESCE(data_refreshed_at, '1970-01-01')) AS refreshed_at FROM companies GROUP BY ticker"
  ).all()
  const all = (result.results || []) as RosterTicker[]
  const etfs = new Set((deps.etfTickers || []).map((t) => String(t).toUpperCase()))
  // a fund never gets a refresh, and an error left on one earlier is cleared so it stops showing on the roster
  for (const r of all) {
    if (isExcluded(r, etfs) && r.data_refresh_error) {
      await db.prepare('UPDATE companies SET data_refresh_error = NULL WHERE ticker = ?').bind(r.ticker).run()
    }
  }
  const batch = pickBatch(all, today, deps.batchSize || BATCH_SIZE, etfs)

  for (const r of batch) {
    summary.checked++
    try {
      const needEarn = needsEarnings(r, today)
      let marketCap = await yahooMarketCap(fetchFn, r.ticker)
      let earningsDate: string | null = null
      let estimated = false
      const problems: string[] = []
      let skipped = false

      if (marketCap === null || needEarn) {
        if (!deps.rapidApiKey) {
          problems.push('FinanceBird key not configured')
        } else if (budget <= 0) {
          skipped = true
        } else {
          budget--
          summary.financebirdCalls++
          try {
            const resp = await fetchFn('https://financebird.p.rapidapi.com/quote/' + encodeURIComponent(r.ticker) + '/summary', {
              headers: { 'X-RapidAPI-Key': deps.rapidApiKey, 'X-RapidAPI-Host': 'financebird.p.rapidapi.com' },
              signal: AbortSignal.timeout(10000),
            })
            if (resp.ok) {
              const parsed = parseSummary(await resp.json(), today)
              if (marketCap === null) marketCap = parsed.marketCap
              if (needEarn) { earningsDate = parsed.earningsDate; estimated = parsed.estimated }
            } else {
              problems.push('FinanceBird answered HTTP ' + resp.status)
            }
          } catch (e) {
            problems.push('FinanceBird request failed')
          }
        }
      }
      if (skipped) { summary.skipped.push(r.ticker); continue }
      if (marketCap === null) problems.push('no market cap found')
      if (needEarn && !earningsDate) problems.push('no earnings date found')

      const error = problems.length ? problems.join('; ') : null
      await db.prepare(
        'UPDATE companies SET market_cap = COALESCE(?, market_cap), next_earnings_date = COALESCE(?, next_earnings_date), ' +
        'earnings_estimated = CASE WHEN ? IS NULL THEN earnings_estimated ELSE ? END, ' +
        'data_refreshed_at = CURRENT_TIMESTAMP, data_refresh_error = ? WHERE ticker = ?'
      ).bind(marketCap, earningsDate, earningsDate, estimated ? 1 : 0, error, r.ticker).run()
      if (error) summary.failed.push({ ticker: r.ticker, error })
      else summary.refreshed.push(r.ticker)
    } catch (e: any) {
      summary.failed.push({ ticker: r.ticker, error: 'unexpected error: ' + (e && e.message ? e.message : String(e)) })
    }
  }
  return summary
}

// Compares two secrets without stopping at the first difference
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
