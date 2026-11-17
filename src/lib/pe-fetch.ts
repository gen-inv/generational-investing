// Gets one company's SEC earnings and Yahoo prices and turns them into a P/E result. I/O is injected so it can be tested.
import { buildQuarters, ttmSeries, peSeries, currentPe, summarizePe, type EpsFact, type Split, type PricePoint } from './pe-history'
import type { PeResult } from './pe-store'

export interface PeFetchDeps {
  ciks: Map<string, number>                 // SEC ticker -> CIK
  fetchSec: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>
  fetchYahoo: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>
  today: string                             // YYYY-MM-DD
}

// Companies switch tags over the years (continuing operations, basic-and-diluted...). The first tag wins for every period it has;
// later tags only fill the periods it lacks, so a gap in one tag cannot break the four-quarter run.
const EPS_TAGS = [
  'EarningsPerShareDiluted', 'IncomeLossFromContinuingOperationsPerDilutedShare', 'EarningsPerShareBasicAndDiluted',
  'EarningsPerShareBasic', 'IncomeLossFromContinuingOperationsPerBasicShare',
]

export const secKey = (t: string) => t.toUpperCase().replace(/\./g, '-')
/** Yahoo writes share classes with a dash (BRK-B); an exchange suffix like .TO stays. */
export const yahooSymbol = (t: string) => (/^[A-Z]+\.[A-Z]$/.test(t.toUpperCase()) ? t.toUpperCase().replace('.', '-') : t)
const isoDay = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10)
const monthEnd = (sec: number, today: string) => {
  const d = new Date(sec * 1000)
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  return end > today ? today : end
}

export type FetchResp = { ok: boolean; status: number; json: () => Promise<any> }
export type Loaded<T> = { ok: true; value: T; tag?: string } | { ok: false; error: string; clear: boolean }

/** SEC earnings-per-share rows for a company (10-K and 10-Q periods with a start and end date), merged across tags. */
export async function loadEpsFacts(cik: number, fetchSec: (url: string) => Promise<FetchResp>): Promise<Loaded<EpsFact[]>> {
  const have = new Set<string>()          // periods already covered by a higher-priority tag
  const facts: EpsFact[] = []
  const used: string[] = []
  try {
    for (const tag of EPS_TAGS) {
      const resp = await fetchSec(`https://data.sec.gov/api/xbrl/companyconcept/CIK${String(cik).padStart(10, '0')}/us-gaap/${tag}.json`)
      if (resp.status === 404) continue
      if (!resp.ok) {
        if (facts.length) break           // keep what the earlier tags gave
        return { ok: false, error: 'SEC answered HTTP ' + resp.status, clear: false }
      }
      const body = await resp.json()
      const rows = ((body && body.units && body.units['USD/shares']) || []) as any[]
      const usable = rows.filter(r => typeof r.form === 'string' && r.form.startsWith('10-') && r.start && r.end && Number.isFinite(r.val))
        .map(r => ({ start: r.start, end: r.end, val: Number(r.val), filed: r.filed, tag }) as EpsFact)
      const fresh = usable.filter(f => !have.has(f.start + '|' + f.end))
      if (!fresh.length) continue
      fresh.forEach(f => facts.push(f))
      new Set(fresh.map(f => f.start + '|' + f.end)).forEach(k => have.add(k))
      used.push(tag)
    }
  } catch (e) {
    if (!facts.length) return { ok: false, error: 'SEC request failed', clear: false }
  }
  if (facts.length < 8) return { ok: false, error: 'no earnings-per-share history at the SEC', clear: true }
  return { ok: true, value: facts, tag: used.join(' + ') }
}

/** Ten years of month-end closes (split-adjusted) and the splits, from Yahoo. */
export async function loadPrices(ticker: string, fetchYahoo: (url: string) => Promise<FetchResp>, today: string): Promise<Loaded<{ prices: PricePoint[]; splits: Split[] }>> {
  try {
    const resp = await fetchYahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(ticker))}?range=10y&interval=1mo&events=split`)
    if (!resp.ok) return { ok: false, error: 'Yahoo answered HTTP ' + resp.status, clear: resp.status === 404 }
    const result = ((await resp.json()) as any)?.chart?.result?.[0]
    const ts: number[] = result?.timestamp || [], close: (number | null)[] = result?.indicators?.quote?.[0]?.close || []
    const prices: PricePoint[] = []
    ts.forEach((t, i) => { if (typeof close[i] === 'number') prices.push({ date: monthEnd(t, today), close: close[i] as number }) })
    const splits: Split[] = Object.values(result?.events?.splits || {}).map((s: any) => ({ date: isoDay(s.date), ratio: Number(s.numerator) / Number(s.denominator) }))
      .filter(s => Number.isFinite(s.ratio) && s.ratio > 0)
    if (!prices.length) return { ok: false, error: 'no price history at Yahoo', clear: true }
    return { ok: true, value: { prices, splits } }
  } catch (e) { return { ok: false, error: 'Yahoo request failed', clear: false } }
}

export async function computeCompanyPe(ticker: string, deps: PeFetchDeps): Promise<PeResult> {
  const fail = (error: string, clear: boolean): PeResult => ({ ticker, error, clear })
  const cik = deps.ciks.get(secKey(ticker))
  if (!cik) return fail('not found at the SEC (non-US company, or ticker not matched)', true)
  const eps = await loadEpsFacts(cik, deps.fetchSec)
  if (!eps.ok) return fail(eps.error, eps.clear)
  const px = await loadPrices(ticker, deps.fetchYahoo, deps.today)
  if (!px.ok) return fail(px.error, px.clear)

  const ttm = ttmSeries(buildQuarters(eps.value, px.value.splits))
  const now = currentPe(px.value.prices, ttm)
  if (!now) return fail('no positive trailing earnings right now (loss-making, or the latest filing is too old)', true)
  const summary = summarizePe(peSeries(px.value.prices, ttm), now.pe)
  if (!summary) return fail('less than 3 years of usable P/E history', true)
  return { ticker, eps: now.eps, summary }
}
