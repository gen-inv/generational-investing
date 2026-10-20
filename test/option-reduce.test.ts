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
const base = () => ({ company_id: companyId, account_id: accountId, ticker: 'RRR', quantity: 4, expiration_date: '2026-12-18', trade_date: '2026-10-01', commission: 4 })
const create = async (extra: any) => ((await (await call('/api/options', 'POST', { ...base(), ...extra })).json()) as any).id as number
const row = async (id: number) => (await DB().prepare('SELECT * FROM option_trades WHERE id = ?').bind(id).first()) as any

beforeAll(async () => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }))
  const stmts = schema.split(/;\s*\n/).map(s => s.trim()).filter(s => s && !/^PRAGMA/i.test(s) && !/sqlite_sequence/i.test(s))
  for (const s of stmts) await DB().prepare(s).run()
  const reg = await app.fetch(new Request('http://x/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'r@t.com', password: 'pw', name: 'R' }),
  }), env as any)
  token = ((await reg.json()) as any).token
  accountId = (await DB().prepare("INSERT INTO accounts (user_id, account_name, account_type) VALUES (1, 'Margin', 'MARGIN')").run()).meta.last_row_id
  companyId = (await DB().prepare("INSERT INTO companies (user_id, ticker, company_name) VALUES (1, 'RRR', 'Rho')").run()).meta.last_row_id
})

describe('POST /api/options/:id/reduce', () => {
  it('splits a short put: the closed contracts keep their close date, price and P/L; the open trade keeps the rest', async () => {
    const id = await create({ strategy_type: 'SELLING_PUT', strike_price: 50, premium: 1 })
    const res = await call(`/api/options/${id}/reduce`, 'POST', { contracts: 1, close_date: '2026-10-20', close_price: 0.2, close_commission: 1 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.remaining_contracts).toBe(3)
    expect(body.profit_loss).toBeCloseTo(78, 6)           // (1.00 - 0.20) x 100 - 1 open share - 1 close
    const closed = await row(body.closed_id)
    expect(closed).toMatchObject({ is_open: 0, quantity: 1, close_date: '2026-10-20', close_price: 0.2, close_commission: 1, strategy_type: 'SELLING_PUT', account_type: 'MARGIN', trade_date: '2026-10-01' })
    expect(closed.commission).toBeCloseTo(1, 6); expect(closed.profit_loss).toBeCloseTo(78, 6)
    const open = await row(id)
    expect(open.is_open).toBe(1); expect(open.quantity).toBe(3); expect(open.commission).toBeCloseTo(3, 6); expect(open.close_date).toBeNull()
  })

  it('a credit spread needs a close price for both legs and books the net', async () => {
    const id = await create({ strategy_type: 'CREDIT_SPREAD', short_strike: 100, long_strike: 95, short_premium: 3, long_premium: 1, commission: 4 })
    const bad = await call(`/api/options/${id}/reduce`, 'POST', { contracts: 2, close_date: '2026-10-20', close_price: 1 })
    expect(bad.status).toBe(400)
    const ok = await call(`/api/options/${id}/reduce`, 'POST', { contracts: 2, close_date: '2026-10-20', close_price: 1, close_price_2: 0.25, close_commission: 0 })
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as any
    expect(body.profit_loss).toBeCloseTo((2 - 0.75) * 2 * 100 - 2, 6)   // net credit 2.00 -> 0.75, 2 contracts, half the commission
    const closed = await row(body.closed_id)
    expect(closed.close_price_2).toBe(0.25); expect(closed.premium_2).toBe(1)
  })

  it('a long call books a debit trade with the right sign', async () => {
    const id = await create({ strategy_type: 'LONG_CALL', strike_price: 60, premium: 2, commission: 2 })
    const res = await call(`/api/options/${id}/reduce`, 'POST', { contracts: 1, close_date: '2026-10-20', close_price: 3, close_commission: 0.5 })
    expect(((await res.json()) as any).profit_loss).toBeCloseTo((3 - 2) * 100 - 0.5 - 0.5, 6)
  })

  it('keeps a close price of 0 (expired worthless)', async () => {
    const id = await create({ strategy_type: 'SELLING_PUT', strike_price: 50, premium: 1 })
    const res = await call(`/api/options/${id}/reduce`, 'POST', { contracts: 1, close_date: '2026-10-20', close_price: 0 })
    const body = (await res.json()) as any
    expect(body.profit_loss).toBeCloseTo(100 - 1, 6)
    expect((await row(body.closed_id)).close_price).toBe(0)
  })

  it('rejects closing every contract, a missing date, a closed trade, a covered call and an unknown trade', async () => {
    const id = await create({ strategy_type: 'SELLING_PUT', strike_price: 50, premium: 1 })
    expect((await call(`/api/options/${id}/reduce`, 'POST', { contracts: 4, close_date: '2026-10-20', close_price: 0.2 })).status).toBe(400)
    expect((await call(`/api/options/${id}/reduce`, 'POST', { contracts: 0, close_date: '2026-10-20', close_price: 0.2 })).status).toBe(400)
    expect((await call(`/api/options/${id}/reduce`, 'POST', { contracts: 1, close_price: 0.2 })).status).toBe(400)
    expect((await row(id)).quantity).toBe(4)
    await DB().prepare('UPDATE option_trades SET is_open = 0 WHERE id = ?').bind(id).run()
    expect((await call(`/api/options/${id}/reduce`, 'POST', { contracts: 1, close_date: '2026-10-20', close_price: 0.2 })).status).toBe(400)
    const cc = await create({ strategy_type: 'COVERED_CALL', strike_price: 55, premium: 0.5 })
    expect((await call(`/api/options/${cc}/reduce`, 'POST', { contracts: 1, close_date: '2026-10-20', close_price: 0.2 })).status).toBe(400)
    expect((await call('/api/options/99999/reduce', 'POST', { contracts: 1, close_date: '2026-10-20', close_price: 0.2 })).status).toBe(404)
  })
})

describe('adding contracts records a separate open trade (POST /api/options)', () => {
  it('a spread keeps every leg and its own dates; the original trade is untouched', async () => {
    const id = await create({ strategy_type: 'CREDIT_SPREAD', short_strike: 100, long_strike: 95, short_premium: 3, long_premium: 1 })
    const res = await call('/api/options', 'POST', { ...base(), strategy_type: 'CREDIT_SPREAD', strike_price: 100, strike_price_2: 95, premium: 4, premium_2: 2,
      quantity: 2, commission: 3, trade_date: '2026-10-19', is_open: true })
    expect(res.status).toBe(201)
    const added = await row(((await res.json()) as any).id)
    expect(added).toMatchObject({ strike_price: 100, strike_price_2: 95, premium: 4, premium_2: 2, quantity: 2, trade_date: '2026-10-19', is_open: 1 })
    expect(await row(id)).toMatchObject({ quantity: 4, trade_date: '2026-10-01', premium: 3, premium_2: 1 })
  })
})
