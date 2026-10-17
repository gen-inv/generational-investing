import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import schema from './schema'
import app from '../src/index'

const DB = () => (env as any).DB
let token = '', accountId = 0, companyId = 0, holdingId = 0

const call = (path: string, method = 'GET', body?: any) =>
  app.fetch(new Request('http://x' + path, {
    method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env as any)

beforeAll(async () => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }))
  const stmts = schema.split(/;\s*\n/).map(s => s.trim()).filter(s => s && !/^PRAGMA/i.test(s) && !/sqlite_sequence/i.test(s))
  for (const s of stmts) await DB().prepare(s).run()
  const reg = await app.fetch(new Request('http://x/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'c@t.com', password: 'pw', name: 'C' }),
  }), env as any)
  token = ((await reg.json()) as any).token
  accountId = (await DB().prepare("INSERT INTO accounts (user_id, account_name, account_type) VALUES (1, 'Margin', 'MARGIN')").run()).meta.last_row_id
  companyId = (await DB().prepare("INSERT INTO companies (user_id, ticker, company_name) VALUES (1, 'CCC', 'Gamma')").run()).meta.last_row_id
  holdingId = (await DB().prepare("INSERT INTO stock_holdings (user_id, company_id, ticker, account_id, total_shares, average_price, opened_date) VALUES (1, ?, 'CCC', ?, 500, 50, '2026-01-02')").bind(companyId, accountId).run()).meta.last_row_id
})

const adjustments = async () =>
  (await DB().prepare("SELECT id, holding_id, amount, adjustment_date, option_trade_id FROM cost_basis_adjustments WHERE adjustment_type = 'COVERED_CALL' ORDER BY id").all()).results as any[]
const openCC = async (premium = 0.85, commission = 1.3) => {
  const r = await call(`/api/stocks/${holdingId}/covered-calls`, 'POST', { strike_price: 55, premium, quantity: 1, expiration_date: '2026-12-18', trade_date: '2026-10-01', commission })
  return ((await r.json()) as any).id as number
}
const close = (id: number, price = 0, date = '2026-11-15') => call(`/api/covered-calls/${id}/close`, 'PUT', { close_price: price, close_date: date })

describe('covered call <-> cost-basis adjustment stay in step', () => {
  it('closing links exactly one adjustment to the call', async () => {
    const id = await openCC()
    expect((await close(id)).status).toBe(200)
    const a = (await adjustments()).filter(x => x.option_trade_id === id)
    expect(a).toHaveLength(1)
    expect(a[0].amount).toBeCloseTo(83.7, 6)
    expect(a[0].holding_id).toBe(holdingId)
  })

  it('deleting a closed covered call removes its adjustment', async () => {
    const id = await openCC()
    await close(id)
    expect((await adjustments()).some(x => x.option_trade_id === id)).toBe(true)
    expect((await call('/api/options/' + id, 'DELETE')).status).toBe(200)
    expect((await adjustments()).some(x => x.option_trade_id === id)).toBe(false)
  })

  it('re-opening removes the adjustment, and closing again does not double count', async () => {
    const id = await openCC()
    await close(id)
    await call(`/api/options/${id}/reopen`, 'PUT')
    expect((await adjustments()).filter(x => x.option_trade_id === id)).toHaveLength(0)
    await close(id, 0.25, '2026-11-20')
    const a = (await adjustments()).filter(x => x.option_trade_id === id)
    expect(a).toHaveLength(1)
    expect(a[0].amount).toBeCloseTo((0.85 - 0.25) * 100 - 1.3, 6)
  })

  it('editing the close price of a closed call updates its adjustment', async () => {
    const id = await openCC(1.0, 0)
    await close(id, 0)
    const edit = await call('/api/covered-calls/' + id, 'PUT', {
      strike_price: 55, premium: 1.0, quantity: 1, expiration_date: '2026-12-18', trade_date: '2026-10-01',
      commission: 0, close_date: '2026-11-15', close_price: 0.4, close_commission: 0,
    })
    expect(edit.status).toBe(200)
    const a = (await adjustments()).filter(x => x.option_trade_id === id)
    expect(a).toHaveLength(1)
    expect(a[0].amount).toBeCloseTo(60, 6)
  })

  it('an open covered call has no adjustment, and deleting it leaves other adjustments alone', async () => {
    const keep = await openCC(); await close(keep)
    const open = await openCC()
    expect((await adjustments()).some(x => x.option_trade_id === open)).toBe(false)
    await call('/api/options/' + open, 'DELETE')
    expect((await adjustments()).some(x => x.option_trade_id === keep)).toBe(true)
  })
})