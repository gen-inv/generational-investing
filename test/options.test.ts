import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import schema from './schema'
import app from '../src/index'

const DB = () => (env as any).DB
let token = '', accountId = 0, companyId = 0

const call = (path: string, method = 'GET', body?: any) =>
  app.fetch(new Request('http://x' + path, {
    method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env as any)

beforeAll(async () => {
  // never touch the network (registration tries to fetch exchange rates)
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }))
  const stmts = schema.split(/;\s*\n/).map(s => s.trim()).filter(s => s && !/^PRAGMA/i.test(s) && !/sqlite_sequence/i.test(s))
  for (const s of stmts) await DB().prepare(s).run()
  const reg = await app.fetch(new Request('http://x/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 't@t.com', password: 'pw', name: 'T' }),
  }), env as any)
  token = ((await reg.json()) as any).token
  const user = await DB().prepare('SELECT id FROM users').first() as any
  accountId = (await DB().prepare("INSERT INTO accounts (user_id, account_name, account_type) VALUES (?, 'Margin', 'MARGIN')").bind(user.id).run()).meta.last_row_id
  companyId = (await DB().prepare("INSERT INTO companies (user_id, ticker, company_name) VALUES (?, 'AAA', 'Alpha')").bind(user.id).run()).meta.last_row_id
})

const open = async (extra: any) => {
  const r = await call('/api/options', 'POST', {
    company_id: companyId, account_id: accountId, ticker: 'AAA', expiration_date: '2026-12-18', trade_date: '2026-10-01', ...extra,
  })
  expect(r.status).toBeLessThan(300)
  return ((await r.json()) as any).id as number
}
const row = async (id: number) => await DB().prepare('SELECT * FROM option_trades WHERE id = ?').bind(id).first() as any

describe('PUT /api/options/:id close: stored profit_loss (characterization)', () => {
  it('short put: 3 contracts, 1.20 -> 0.30, commissions 4 + 4 = 262', async () => {
    const id = await open({ strategy_type: 'SELLING_PUT', strike_price: 50, premium: 1.2, quantity: 3, commission: 4 })
    const r = await call('/api/options/' + id, 'PUT', { close_date: '2026-11-01', close_price: 0.3, close_commission: 4 })
    expect(r.status).toBe(200)
    const t = await row(id)
    expect(t.profit_loss).toBeCloseTo(262, 6)
    expect(t.is_open).toBe(0)
  })

  it('long call: bought 1.50, sold 3.00, 1 contract, commissions 1 + 1 = 148', async () => {
    const id = await open({ strategy_type: 'LONG_CALL', strike_price: 60, premium: 1.5, quantity: 1, commission: 1 })
    await call('/api/options/' + id, 'PUT', { close_date: '2026-11-01', close_price: 3, close_commission: 1 })
    expect((await row(id)).profit_loss).toBeCloseTo(148, 6)
  })

  it('credit spread: 2 contracts, 2.50/1.00 open, 0.50/0.20 close, commissions 1.3 + 1.3 = 237.4', async () => {
    const id = await open({ strategy_type: 'CREDIT_SPREAD', strike_price: 50, strike_price_2: 45, premium: 2.5, premium_2: 1.0, quantity: 2, commission: 1.3 })
    await call('/api/options/' + id, 'PUT', { close_date: '2026-11-01', close_price: 0.5, close_price_2: 0.2, close_commission: 1.3 })
    expect((await row(id)).profit_loss).toBeCloseTo(237.4, 6)
  })
})

describe('POST /api/options/:id/assign (characterization)', () => {
  it('assigns a short put: P/L is premium minus open commission, stock opens at the strike', async () => {
    const id = await open({ strategy_type: 'SELLING_PUT', strike_price: 40, premium: 1.0, quantity: 2, commission: 2 })
    const r = await call('/api/options/' + id + '/assign', 'POST', { assignment_date: '2026-11-20' })
    const body = await r.text()
    expect(r.status, body).toBeLessThan(300)
    const t = await row(id)
    expect(t.is_open).toBe(0)
    expect(t.profit_loss).toBeCloseTo(198, 6)
    const h = await DB().prepare("SELECT * FROM stock_holdings WHERE ticker = 'AAA'").first() as any
    expect(h.total_shares).toBe(200)
    expect(h.average_price).toBe(40)
  })

  it('refuses to assign anything but a short put', async () => {
    const id = await open({ strategy_type: 'LONG_CALL', strike_price: 60, premium: 1, quantity: 1 })
    const r = await call('/api/options/' + id + '/assign', 'POST', { assignment_date: '2026-11-20' })
    expect(r.status).toBe(400)
  })
})

describe('covered calls (characterization)', () => {
  const holding = async (acct: number, shares = 200) =>
    (await DB().prepare("INSERT INTO stock_holdings (user_id, company_id, ticker, account_id, total_shares, average_price, opened_date) VALUES (1, ?, 'CCC', ?, ?, 50, '2026-01-02')").bind(companyId, acct, shares).run()).meta.last_row_id as number
  const adjustments = async (holdingId: number) =>
    (await DB().prepare('SELECT amount, adjustment_type FROM cost_basis_adjustments WHERE holding_id = ?').bind(holdingId).all()).results as any[]

  it('opens via the holding, closes with P/L = 83.70 and records one cost-basis adjustment', async () => {
    const hid = await holding(accountId)
    const o = await call(`/api/stocks/${hid}/covered-calls`, 'POST', { strike_price: 55, premium: 0.85, quantity: 1, expiration_date: '2026-12-18', trade_date: '2026-10-01', commission: 1.3 })
    expect(o.status).toBe(200)
    const ccId = ((await o.json()) as any).id
    const c = await call(`/api/covered-calls/${ccId}/close`, 'PUT', { close_price: 0, close_date: '2026-11-15' })
    expect(c.status).toBe(200)
    expect(((await c.json()) as any).profit_loss).toBeCloseTo(83.7, 6)
    expect(await adjustments(hid)).toEqual([{ amount: expect.closeTo(83.7, 6), adjustment_type: 'COVERED_CALL' }])
  })

  it('refuses a covered call larger than the shares held', async () => {
    const hid = await holding(accountId, 100)
    const o = await call(`/api/stocks/${hid}/covered-calls`, 'POST', { strike_price: 55, premium: 1, quantity: 2, expiration_date: '2026-12-18', trade_date: '2026-10-01' })
    expect(o.status).toBe(400)
  })

  // Fixed: closing used to pick the holding by ticker + user only, so with the same ticker in two
  // accounts the adjustment could land on the wrong account's holding.
  it('records the adjustment against the holding in the covered call\'s own account', async () => {
    const acct2 = (await DB().prepare("INSERT INTO accounts (user_id, account_name, account_type) VALUES (1, 'TFSA', 'TFSA')").run()).meta.last_row_id as number
    await DB().prepare("UPDATE stock_holdings SET is_open = 0 WHERE ticker = 'CCC'").run()
    const h1 = await holding(accountId)      // lower id, other account
    const h2 = await holding(acct2)          // the call belongs to this one
    const o = await call(`/api/stocks/${h2}/covered-calls`, 'POST', { strike_price: 55, premium: 1, quantity: 1, expiration_date: '2026-12-18', trade_date: '2026-10-01' })
    const ccId = ((await o.json()) as any).id
    await call(`/api/covered-calls/${ccId}/close`, 'PUT', { close_price: 0, close_date: '2026-11-15' })
    expect(await adjustments(h2)).toHaveLength(1)
    expect(await adjustments(h1)).toHaveLength(0)
  })
})