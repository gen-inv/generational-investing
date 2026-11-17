// 10-year P/E range from SEC EPS facts + monthly prices. Pure functions (no network, no database).
// "Market view" metric only: it never feeds the scoresheet or any valuation.

export interface EpsFact { start: string; end: string; val: number; filed: string }   // SEC companyconcept row (dates are YYYY-MM-DD)
export interface Split { date: string; ratio: number }                                  // ratio = numerator / denominator (4-for-1 -> 4)
export interface PricePoint { date: string; close: number }                             // month, split-adjusted close (as Yahoo returns it)
export interface Quarter { start: string; end: string; val: number; available: string }
export interface Ttm { end: string; available: string; eps: number }
export interface PeSummary { min: number; p5: number; median: number; p95: number; max: number; current: number; percentile: number; months: number }

const DAY = 86400000
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10)
const maxStr = (a: string, b: string) => (a > b ? a : b)

/** A value reported in a filing is on that filing's share count: apply every split that happened after the filing. */
export function splitFactor(splits: Split[], filed: string): number {
  return splits.filter(s => s.date > filed).reduce((p, s) => p * s.ratio, 1)
}

/** Discrete quarterly EPS on today's share count. Q4 is not reported on its own: it is the year minus Q1..Q3. */
export function buildQuarters(facts: EpsFact[], splits: Split[]): Quarter[] {
  const byPeriod = new Map<string, EpsFact[]>()
  for (const f of facts) {
    if (!Number.isFinite(f.val) || !f.start || !f.end) continue
    const k = f.start + '|' + f.end
    const g = byPeriod.get(k)
    if (g) g.push(f); else byPeriod.set(k, [f])
  }
  const periods: Quarter[] = []
  for (const g of byPeriod.values()) {
    g.sort((a, b) => (a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : 0))
    const first = g[0], last = g[g.length - 1]
    // newest filing's value (latest restatement), adjusted for splits after it; usable from the first filing's date
    periods.push({ start: first.start, end: first.end, val: last.val / splitFactor(splits, last.filed), available: first.filed })
  }
  const len = (p: Quarter) => days(p.start, p.end)
  // 12 or 13 weeks normally; retailers such as Kroger (16-week first quarter) and Costco (16-week fourth) run longer
  const quarters = periods.filter(p => len(p) >= 80 && len(p) <= 125)
  const years = periods.filter(p => len(p) >= 350 && len(p) <= 380)
  const out = [...quarters]
  for (const y of years) {
    const inside = quarters.filter(q => q.start >= y.start && q.end <= y.end).sort((a, b) => (a.end < b.end ? -1 : 1))
    if (inside.length !== 3) continue
    const gap = days(inside[2].end, y.end)
    if (gap < 70 || gap > 125) continue
    out.push({ start: addDays(inside[2].end, 1), end: y.end, val: y.val - inside.reduce((s, q) => s + q.val, 0), available: y.available })
  }
  return out.sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0))
}

/** Trailing-twelve-month EPS at each quarter end: four consecutive quarters, usable once the last of them was filed. */
export function ttmSeries(quarters: Quarter[]): Ttm[] {
  const out: Ttm[] = []
  for (let i = 3; i < quarters.length; i++) {
    const w = quarters.slice(i - 3, i + 1)
    const consecutive = w.every((q, j) => j === 0 || (days(w[j - 1].end, q.end) >= 70 && days(w[j - 1].end, q.end) <= 130))
    if (!consecutive) continue
    out.push({ end: w[3].end, available: w.map(q => q.available).reduce(maxStr), eps: w.reduce((s, q) => s + q.val, 0) })
  }
  return out
}

/** The TTM EPS an investor could have known on a given date (and not stale: newest quarter ended within ~200 days). */
export function ttmOn(date: string, ttm: Ttm[]): Ttm | null {
  let best: Ttm | null = null
  for (const t of ttm) if (t.available <= date && (!best || t.end > best.end)) best = t
  return best && days(best.end, date) <= 200 ? best : null
}

/** One P/E per month; months with no usable or non-positive EPS are skipped (a loss has no P/E). */
export function peSeries(prices: PricePoint[], ttm: Ttm[]): number[] {
  const out: number[] = []
  for (const p of prices) {
    const t = ttmOn(p.date, ttm)
    if (t && t.eps > 0 && p.close > 0) out.push(p.close / t.eps)
  }
  return out
}

export function currentPe(prices: PricePoint[], ttm: Ttm[]): { pe: number; eps: number } | null {
  const last = prices[prices.length - 1]
  const t = last ? ttmOn(last.date, ttm) : null
  return last && t && t.eps > 0 && last.close > 0 ? { pe: last.close / t.eps, eps: t.eps } : null
}

const quantile = (sorted: number[], q: number) => {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** null when there is too little history to mean anything. percentile = share of months whose P/E was at or below today's. */
export function summarizePe(series: number[], current: number | null, minMonths = 36): PeSummary | null {
  if (current == null || series.length < minMonths) return null
  const s = [...series].sort((a, b) => a - b)
  return {
    min: s[0], p5: quantile(s, 0.05), median: quantile(s, 0.5), p95: quantile(s, 0.95), max: s[s.length - 1],
    current, months: s.length, percentile: Math.round((s.filter(v => v <= current).length / s.length) * 100),
  }
}

/** Dot position on a bar drawn from the 5th to the 95th percentile (so one freak year cannot flatten the bar). */
export function barPosition(sum: PeSummary, pe: number): { pos: number; outside: 'below' | 'above' | null } {
  const span = sum.p95 - sum.p5
  if (!(span > 0)) return { pos: 0.5, outside: null }
  const raw = (pe - sum.p5) / span
  return { pos: Math.min(1, Math.max(0, raw)), outside: raw < 0 ? 'below' : raw > 1 ? 'above' : null }
}

/** Words for the compact view and the dot colour: cheap / neutral / rich compared with the company's own history. */
export function peBand(percentile: number): { label: string; tone: 'cheap' | 'neutral' | 'rich' } {
  if (percentile <= 20) return { label: 'Low end', tone: 'cheap' }
  if (percentile <= 45) return { label: 'Below median', tone: 'cheap' }
  if (percentile < 55) return { label: 'Near median', tone: 'neutral' }
  if (percentile < 80) return { label: 'Above median', tone: 'rich' }
  return { label: 'High end', tone: 'rich' }
}

/** P/E you would effectively pay if a short put is assigned: (strike - premium collected) / trailing EPS. */
export function peIfAssigned(strike: number, premium: number, ttmEps: number | null): number | null {
  const net = (Number(strike) || 0) - (Number(premium) || 0)
  if (!(net > 0) || ttmEps == null || !(ttmEps > 0)) return null
  return net / ttmEps
}
