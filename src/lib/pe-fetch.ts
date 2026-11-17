// Gets one company's SEC earnings and Yahoo prices and turns them into a P/E result. I/O is injected so it can be tested.
import { buildQuarters, ttmSeries, peSeries, currentPe, summarizePe, type EpsFact, type Split, type PricePoint } from './pe-history'
import type { PeResult } from './pe-store'

export interface PeFetchDeps {
  ciks: Map<string, number>                 // SEC ticker -> CIK
  fetchSec: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>
  fetchYahoo: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>
  today: string                             // YYYY-MM-DD
}

const EPS_TAGS = ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic']

export const secKey = (t: string) => t.toUpperCase().replace(/\./g, '-')
/** Yahoo writes share classes with a dash (BRK-B); an exchange suffix like .TO stays. */
export const yahooSymbol = (t: string) => (/^[A-Z]+\.[A-Z]$/.test(t.toUpperCase()) ? t.toUpperCase().replace('.', '-') : t)
const isoDay = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10)
const monthEnd = (sec: number, today: string) => {
  const d = new Date(sec * 1000)
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  return end > today ? today : end
}

export async function computeCompanyPe(ticker: string, deps: PeFetchDeps): Promise<PeResult> {
  const fail = (error: string, clear: boolean): PeResult => ({ ticker, error, clear })
  const cik = deps.ciks.get(secKey(ticker))
  if (!cik) return fail('not found at the SEC (non-US company, or ticker not matched)', true)

  let facts: EpsFact[] = []
  try {
    for (const tag of EPS_TAGS) {
      const resp = await deps.fetchSec(`https://data.sec.gov/api/xbrl/companyconcept/CIK${String(cik).padStart(10, '0')}/us-gaap/${tag}.json`)
      if (resp.status === 404) continue
      if (!resp.ok) return fail('SEC answered HTTP ' + resp.status, false)
      const body = await resp.json()
      const rows = ((body && body.units && body.units['USD/shares']) || []) as any[]
      const usable = rows.filter(r => typeof r.form === 'string' && r.form.startsWith('10-') && r.start && r.end && Number.isFinite(r.val))
        .map(r => ({ start: r.start, end: r.end, val: Number(r.val), filed: r.filed }) as EpsFact)
      if (usable.length >= 8) { facts = usable; break }
    }
  } catch (e) { return fail('SEC request failed', false) }
  if (!facts.length) return fail('no earnings-per-share history at the SEC', true)

  let prices: PricePoint[] = [], splits: Split[] = []
  try {
    const resp = await deps.fetchYahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(ticker))}?range=10y&interval=1mo&events=split`)
    if (!resp.ok) return fail('Yahoo answered HTTP ' + resp.status, resp.status === 404)
    const result = ((await resp.json()) as any)?.chart?.result?.[0]
    const ts: number[] = result?.timestamp || [], close: (number | null)[] = result?.indicators?.quote?.[0]?.close || []
    ts.forEach((t, i) => { if (typeof close[i] === 'number') prices.push({ date: monthEnd(t, deps.today), close: close[i] as number }) })
    splits = Object.values(result?.events?.splits || {}).map((s: any) => ({ date: isoDay(s.date), ratio: Number(s.numerator) / Number(s.denominator) }))
      .filter(s => Number.isFinite(s.ratio) && s.ratio > 0)
  } catch (e) { return fail('Yahoo request failed', false) }
  if (!prices.length) return fail('no price history at Yahoo', true)

  const ttm = ttmSeries(buildQuarters(facts, splits))
  const now = currentPe(prices, ttm)
  if (!now) return fail('no positive trailing earnings right now (loss-making, or the latest filing is too old)', true)
  const summary = summarizePe(peSeries(prices, ttm), now.pe)
  if (!summary) return fail('less than 3 years of usable P/E history', true)
  return { ticker, eps: now.eps, summary }
}
