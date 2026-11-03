import { describe, it, expect, vi } from 'vitest'

// Menu Settings -> reports: a switched-off area (Stock Trades, Options Trades, 0DTE SPX) must not be read into any report.
// The sign-in check and the helper libraries are not what is tested here.
const sells = vi.hoisted(() => vi.fn())
vi.mock('../lib/auth', () => ({ authMiddleware: async (c: any, next: any) => { c.set('userId', 7); await next() } }))
vi.mock('../lib/stock-pl', () => ({ loadRealizedSells: sells, sumRealized: (l: any[]) => l.reduce((s, x) => s + (x.realized_pl || 0), 0) }))
vi.mock('../lib/cost-basis', () => ({ costBasisPerShare: () => 0 }))
vi.mock('../lib/calc', () => ({ optionPL: () => 0 }))
vi.mock('../lib/fx', () => ({ getRates: async () => ({ usd_to_cad: 1.4, cad_to_usd: 0.71 }) }))
import { routes } from './reports'

type Q = { sql: string; args: any[] }
const run = async (path: string, hidden: string[]) => {
  const log: Q[] = []
  sells.mockReset()
  sells.mockResolvedValue([{ realized_pl: 100, sell_date: `${new Date().getFullYear()}-01-05`, account_type: 'Margin', opened_date: '2025-12-01' }])
  const DB = {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => {
        log.push({ sql, args })
        return {
          all: async () => ({ results: [] }),
          first: async () => (sql.includes('FROM user_preferences') ? { menu_hidden: JSON.stringify(hidden) } : null),
        }
      },
    }),
  }
  const res = await routes.request(path, {}, { DB })
  return { res, log: log.filter((q) => !q.sql.includes('user_preferences')) }
}
// What a report actually read: stock sales / dividends / holdings, option trades, 0DTE trades (the combined win-rate query is checked separately)
const used = (log: Q[]) => {
  const own = log.filter((q) => !q.sql.includes('UNION ALL'))
  const has = (re: RegExp) => own.some((q) => re.test(q.sql))
  return {
    stocks: sells.mock.calls.length > 0 || has(/cost_basis_adjustments/) || has(/FROM\s+stock_transactions/) || has(/FROM\s+stock_holdings/),
    options: has(/FROM\s+option_trades/),
    daily: has(/FROM\s+daily_trades/),
  }
}

const REPORTS: { path: string; reads: { stocks: boolean; options: boolean; daily: boolean } }[] = [
  { path: '/api/reports/portfolio-overview', reads: { stocks: true, options: true, daily: true } },
  { path: '/api/reports/pl', reads: { stocks: true, options: true, daily: false } },
  { path: '/api/reports/pl-summary', reads: { stocks: true, options: true, daily: true } },
  { path: '/api/reports/strategy-analysis', reads: { stocks: false, options: true, daily: true } },
  { path: '/api/reports/performance', reads: { stocks: true, options: true, daily: true } },
  { path: '/api/reports/positions', reads: { stocks: true, options: false, daily: false } },
  { path: '/api/reports/dividends', reads: { stocks: true, options: false, daily: false } },
  { path: '/api/reports/monthly-income', reads: { stocks: true, options: true, daily: true } },
]
const AREAS = [{ off: 'stocks', key: 'stocks' }, { off: 'options', key: 'options' }, { off: 'daily-trade', key: 'daily' }] as const

describe('reports follow the Menu Settings switches', () => {
  for (const r of REPORTS) {
    it(`${r.path}: reads everything it owns when all areas are on`, async () => {
      const { res, log } = await run(r.path, [])
      expect(res.status).toBe(200)
      expect(used(log)).toEqual(r.reads)
    })
    for (const a of AREAS) {
      it(`${r.path}: reads nothing from ${a.key} when ${a.off} is switched off`, async () => {
        const { res, log } = await run(r.path, [a.off])
        expect(res.status).toBe(200)
        expect(used(log)).toEqual({ ...r.reads, [a.key]: false })
      })
    }
  }

  it('the overview win-rate statistics leave out a switched-off area', async () => {
    const union = async (hidden: string[]) => (await run('/api/reports/portfolio-overview', hidden)).log.find((q) => q.sql.includes('UNION ALL'))!.args
    expect(await union([])).toEqual([7, 1, 7, 1])
    expect(await union(['options'])).toEqual([7, 0, 7, 1])
    expect(await union(['daily-trade'])).toEqual([7, 1, 7, 0])
    expect(await union(['options', 'daily-trade'])).toEqual([7, 0, 7, 0])
  })

  it('the dividends report is empty, in the usual shape, when Stock Trades is off', async () => {
    for (const groupBy of ['account', 'stock']) {
      const { res, log } = await run(`/api/reports/dividends?groupBy=${groupBy}`, ['stocks'])
      expect(await res.json()).toEqual({ groupBy, period: 'ytd', data: [], total: 0 })
      expect(log).toHaveLength(0)
    }
  })

  it('monthly income keeps covered calls (an option trade) when only Stock Trades is off, and drops stock sales and dividends', async () => {
    const { log } = await run('/api/reports/monthly-income', ['stocks'])
    expect(log.some((q) => /COVERED_CALL/.test(q.sql))).toBe(true)
    expect(log.some((q) => /stock_transactions/.test(q.sql))).toBe(false)
    expect(log.some((q) => /cost_basis_adjustments/.test(q.sql))).toBe(false)
  })

  it('switching areas back on restores the reports', async () => {
    const off = await run('/api/reports/strategy-analysis', ['options', 'daily-trade'])
    expect(used(off.log)).toEqual({ stocks: false, options: false, daily: false })
    const on = await run('/api/reports/strategy-analysis', [])
    expect(used(on.log)).toEqual({ stocks: false, options: true, daily: true })
  })
})
