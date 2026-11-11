import { describe, it, expect, vi } from 'vitest'

// Monthly Income report: fixed-risk trades (Iron Condors, Credit Spreads, Debit Spreads) and the catch-all for trades no section shows.
vi.mock('../lib/auth', () => ({ authMiddleware: async (c: any, next: any) => { c.set('userId', 1); await next() } }))
import { routes } from './reports'

const FIXED: Record<string, any[]> = {
  IRON_CONDOR: [{ ticker: 'SPY', profit_loss: 120 }],
  CREDIT_SPREAD: [{ ticker: 'AAPL', profit_loss: -250 }, { ticker: 'MSFT', profit_loss: 80 }],
  DEBIT_SPREAD: []
}
const make = () => {
  const calls: { sql: string, args: any[] }[] = []
  const rowsFor = (sql: string, args: any[]) => {
    if (sql.includes('strategy_type = ?') && sql.includes('GROUP BY ticker')) return FIXED[args[1]] || []
    if (sql.includes('NOT IN (')) return [{ ticker: 'XYZ (LONG_CALL)', profit_loss: 12 }]
    if (sql.includes('NOT EXISTS')) return [{ ticker: 'ABC (covered call, no stock strategy)', profit_loss: 30 }]
    return []
  }
  const prepare = vi.fn((sql: string) => ({ bind: (...args: any[]) => { calls.push({ sql, args }); return { all: async () => ({ results: rowsFor(sql, args) }), first: async () => ({ profit_loss: 0, trade_count: 0 }) } } }))
  return { env: { DB: { prepare } }, calls }
}
const get = (env: any, qs = 'year=2026&month=10') => routes.request('/api/reports/monthly-income?' + qs, {}, env)

describe('monthly income: fixed-risk trades', () => {
  it('lists Iron Condors, Credit Spreads and Debit Spreads by ticker, closed in the month', async () => {
    const { env, calls } = make()
    const res = await get(env)
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.optionTrades.fixedRisk.ironCondors.results).toEqual([{ ticker: 'SPY', profit_loss: 120 }])
    expect(body.optionTrades.fixedRisk.creditSpreads.results.map((r: any) => r.ticker)).toEqual(['AAPL', 'MSFT'])
    expect(body.optionTrades.fixedRisk.debitSpreads.results).toEqual([])
    const fixed = calls.filter(c => c.sql.includes('strategy_type = ?') && c.sql.includes('GROUP BY ticker'))
    expect(fixed.map(c => c.args[1]).sort()).toEqual(['CREDIT_SPREAD', 'DEBIT_SPREAD', 'IRON_CONDOR'])
    fixed.forEach(c => { expect(c.sql).toContain('is_open = 0'); expect(c.args).toContain('2026-10-01'); expect(c.args).toContain('2026-11-01'); expect(c.args[0]).toBe(1) })
  })
  it('honours the account filter', async () => {
    const { env, calls } = make()
    await get(env, 'year=2026&month=10&account_id=7')
    const fixed = calls.filter(c => c.sql.includes('strategy_type = ?') && c.sql.includes('GROUP BY ticker'))
    expect(fixed.length).toBe(3)
    fixed.forEach(c => { expect(c.sql).toContain('AND account_id = ?'); expect(c.args).toContain(7) })
    expect(calls.filter(c => c.sql.includes('NOT EXISTS') || c.sql.includes('NOT IN (')).every(c => c.args.includes(7))).toBe(true)
  })
  it('reports closed trades that no section shows (other strategies, covered calls with no stock strategy)', async () => {
    const { env } = make()
    const body: any = await (await get(env)).json()
    expect(body.optionTrades.otherOptions.results.map((r: any) => r.ticker)).toEqual(['XYZ (LONG_CALL)', 'ABC (covered call, no stock strategy)'])
  })
  it('leaves the existing short-put sections as they were', async () => {
    const { env } = make()
    const body: any = await (await get(env)).json()
    expect(Object.keys(body.optionTrades)).toEqual(expect.arrayContaining(['shortPutsWheel', 'shortPutsStockpiling', 'shortPutsLongTerm', 'fixedRisk', 'otherOptions', 'dteTrades']))
  })
})
