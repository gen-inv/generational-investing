import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import schema from './schema'
import app from '../src/index'

const DB = () => (env as any).DB
let token = '', uid = 0, acct = 0
const call = (method: string, path: string) => app.fetch(new Request('http://x' + path, {
  method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' } }), env as any)

async function holding(ticker: string, shares: number, sells: [number, number, string][], adjustments: number[]) {
  const id = (await DB().prepare(`INSERT INTO stock_holdings (user_id, account_id, ticker, total_shares, average_price, opened_date, is_open, strategy_type)
    VALUES (?, ?, ?, ?, 91.57, '2025-02-28', 1, 'STOCKPILING')`).bind(uid, acct, ticker, shares).run()).meta.last_row_id as number
  const tx = (type: string, n: number, price: number, date: string) => DB().prepare(`INSERT INTO stock_transactions (user_id, holding_id, transaction_type, shares, price_per_share, transaction_date, commission)
    VALUES (?, ?, ?, ?, ?, ?, 0)`).bind(uid, id, type, n, price, date).run()
  await tx('BUY', 2000, 91.57, '2025-02-28')
  for (const [n, price, date] of sells) await tx('SELL', n, price, date)
  for (const amt of adjustments) await DB().prepare(`INSERT INTO cost_basis_adjustments (user_id, holding_id, adjustment_type, amount, adjustment_date) VALUES (?, ?, 'COVERED_CALL', ?, '2026-01-01')`).bind(uid, id, amt).run()
  return id
}

beforeAll(async () => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }))
  const stmts = schema.split(/;\s*\n/).map(s => s.trim()).filter(s => s && !/^PRAGMA/i.test(s) && !/sqlite_sequence/i.test(s))
  for (const s of stmts) await DB().prepare(s).run()
  const reg = await app.fetch(new Request('http://x/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'cb@t.com', password: 'pw', name: 'C' }) }), env as any)
  token = ((await reg.json()) as any).token
  uid = (await DB().prepare('SELECT id FROM users').first() as any).id
  acct = (await DB().prepare("INSERT INTO accounts (user_id, account_name, account_type, balance_cad, balance_usd, cash_balance_cad, cash_balance_usd, default_currency) VALUES (?, 'A', 'TFSA', 0, 0, 0, 0, 'CAD')").bind(uid).run()).meta.last_row_id
})

describe('cost basis after partial sells (stocks list)', () => {
  it('NFLX: three losing sells raise the cost basis of the 800 shares left', async () => {
    const id = await holding('NFLX', 800, [[500, 69.23, '2026-09-28'], [200, 67.98, '2026-10-06'], [500, 69.54, '2026-10-14']], [30000, 6839.93])
    const list = await (await call('GET', '/api/stocks?open=true')).json() as any
    const nflx = (Array.isArray(list) ? list : list.stocks).find((s: any) => s.id === id)
    // realized: -(91.57-69.23)*500 - (91.57-67.98)*200 - (91.57-69.54)*500 = -26,903
    expect(nflx.realized_pl).toBeCloseTo(-26903, 2)
    expect(nflx.cost_basis).toBeCloseTo(91.57 - (36839.93 - 26903) / 800, 4)
    expect(nflx.cost_basis).toBeGreaterThan(73) // was 45.52 before the fix
  })
  it('a gain on a partial sell lowers the cost basis of the shares left', async () => {
    const id = await holding('GAIN', 1000, [[1000, 100, '2026-03-01']], [])
    const list = await (await call('GET', '/api/stocks?open=true')).json() as any
    const s = (Array.isArray(list) ? list : list.stocks).find((x: any) => x.id === id)
    expect(s.cost_basis).toBeCloseTo(91.57 - (1000 * (100 - 91.57)) / 1000, 4)
  })
  it('a holding with no sells is unchanged: average price minus premiums', async () => {
    const id = await holding('PLAIN', 2000, [], [2000])
    const list = await (await call('GET', '/api/stocks?open=true')).json() as any
    const s = (Array.isArray(list) ? list : list.stocks).find((x: any) => x.id === id)
    expect(s.cost_basis).toBeCloseTo(91.57 - 2000 / 2000, 4)
  })
})

describe('cost basis in Reports > Positions', () => {
  it('uses the same rule (losses on sold shares raise it)', async () => {
    await holding('RPT', 800, [[500, 69.23, '2026-09-28'], [200, 67.98, '2026-10-06'], [500, 69.54, '2026-10-14']], [36839.93])
    const res = await call('GET', '/api/reports/positions')
    expect(res.status).toBe(200)
    const out = await res.json() as any
    const pos = (out.allPositions || []).find((p: any) => p.ticker === 'RPT')
    expect(pos).toBeTruthy()
    expect(pos.costBasis).toBeCloseTo(91.57 - (36839.93 - 26903) / 800, 4)
  })
})
