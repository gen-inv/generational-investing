import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import schema from './schema'
import app from '../src/index'

const DB = () => (env as any).DB
let token = '', uid = 0, acct = 0
const call = (method: string, path: string, body?: any) => app.fetch(new Request('http://x' + path, {
  method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env as any)

async function holding(ticker: string, open = false) {
  const h = await DB().prepare(`INSERT INTO stock_holdings (user_id, account_id, ticker, total_shares, average_price, opened_date, is_open, closed_date, strategy_type)
    VALUES (?, ?, ?, ?, 57.5, '2026-01-01', ?, ?, 'WHEEL')`).bind(uid, acct, ticker, open ? 300 : 0, open ? 1 : 0, open ? null : '2026-04-01').run()
  const id = h.meta.last_row_id as number
  const ids: number[] = []
  const tx = async (type: string, shares: number, price: number, date: string, comm: number, opt: number | null = null) =>
    ids.push((await DB().prepare(`INSERT INTO stock_transactions (user_id, holding_id, transaction_type, shares, price_per_share, transaction_date, commission, option_trade_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(uid, id, type, shares, price, date, comm, opt).run()).meta.last_row_id as number)
  await tx('BUY', 100, 50, '2026-01-01', 5)
  await tx('BUY', 300, 60, '2026-02-01', 7)
  await tx('SELL', 100, 70, '2026-03-01', 1)
  if (!open) await tx('SELL', 300, 66, '2026-04-01', 2)
  return { id, ids, tx }
}

beforeAll(async () => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }))
  const stmts = schema.split(/;\s*\n/).map(s => s.trim()).filter(s => s && !/^PRAGMA/i.test(s) && !/sqlite_sequence/i.test(s))
  for (const s of stmts) await DB().prepare(s).run()
  const reg = await app.fetch(new Request('http://x/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'se@t.com', password: 'pw', name: 'S' }) }), env as any)
  token = ((await reg.json()) as any).token
  uid = (await DB().prepare('SELECT id FROM users').first() as any).id
  acct = (await DB().prepare("INSERT INTO accounts (user_id, account_name, account_type, balance_cad, balance_usd, cash_balance_cad, cash_balance_usd, default_currency) VALUES (?, 'A', 'TFSA', 0, 0, 0, 0, 'CAD')").bind(uid).run()).meta.last_row_id
})

describe('PUT /api/stocks/:id/sells/:txId', () => {
  it('correcting the closing sale re-books the closed trade P/L the edit modal shows', async () => {
    const h = await holding('AAA')
    const before = await (await call('GET', `/api/stocks/${h.id}`)).json() as any
    const res = await call('PUT', `/api/stocks/${h.id}/sells/${h.ids[3]}`, { transaction_date: '2026-04-10', price_per_share: 70, commission: 3 })
    expect(res.status).toBe(200)
    const out = await res.json() as any
    // 300 shares: (70 - 57.5) x 300 less carried buy commission (12 x 300/400 = 9) less 3 = 3738
    expect(out.realized_pl).toBeCloseTo(300 * 12.5 - 9 - 3, 5)
    const after = await (await call('GET', `/api/stocks/${h.id}`)).json() as any
    expect(after.close_price).toBe(70); expect(after.close_commission).toBe(3); expect(after.close_date).toBe('2026-04-10')
    expect(after.closed_date).toBe('2026-04-10')
    expect(after.profit_loss).toBeCloseTo(before.profit_loss + (out.realized_pl - before.transactions[3].realized_pl), 5)
    expect(after.profit_loss).toBeCloseTo(out.total_realized_pl, 5)
  })
  it('a partial sell on an open holding can be corrected too, and the holding stays open', async () => {
    const h = await holding('BBB', true)
    const res = await call('PUT', `/api/stocks/${h.id}/sells/${h.ids[2]}`, { transaction_date: '2026-03-02', price_per_share: 80, commission: 0 })
    expect(res.status).toBe(200)
    const after = await (await call('GET', `/api/stocks/${h.id}`)).json() as any
    expect(after.is_open).toBe(1); expect(after.closed_date).toBeNull()
    expect(after.realized_pl).toBeCloseTo(100 * 22.5 - 3, 5)
  })
  it('refuses a date that would sell shares before they were bought (409) and changes nothing', async () => {
    const h = await holding('CCC')
    const res = await call('PUT', `/api/stocks/${h.id}/sells/${h.ids[2]}`, { transaction_date: '2025-12-01', price_per_share: 70, commission: 1 })
    expect(res.status).toBe(409)
    const row = await DB().prepare('SELECT transaction_date, price_per_share FROM stock_transactions WHERE id = ?').bind(h.ids[2]).first() as any
    expect(row).toMatchObject({ transaction_date: '2026-03-01', price_per_share: 70 })
  })
  it('validates input, ownership and transaction type', async () => {
    const h = await holding('DDD')
    expect((await call('PUT', `/api/stocks/${h.id}/sells/${h.ids[2]}`, { transaction_date: 'nope', price_per_share: 70, commission: 0 })).status).toBe(400)
    expect((await call('PUT', `/api/stocks/${h.id}/sells/${h.ids[2]}`, { transaction_date: '2026-03-01', price_per_share: -1, commission: 0 })).status).toBe(400)
    expect((await call('PUT', `/api/stocks/${h.id}/sells/${h.ids[0]}`, { transaction_date: '2026-03-01', price_per_share: 70, commission: 0 })).status).toBe(404)
    expect((await call('PUT', `/api/stocks/999999/sells/${h.ids[2]}`, { transaction_date: '2026-03-01', price_per_share: 70, commission: 0 })).status).toBe(404)
  })
  it('a sale created by an option assignment is not editable here', async () => {
    const h = await holding('EEE', true)
    const linked = await DB().prepare(`INSERT INTO stock_transactions (user_id, holding_id, transaction_type, shares, price_per_share, transaction_date, commission, option_trade_id)
      VALUES (?, ?, 'SELL', 50, 90, '2026-03-15', 0, 777)`).bind(uid, h.id).run()
    const res = await call('PUT', `/api/stocks/${h.id}/sells/${linked.meta.last_row_id}`, { transaction_date: '2026-03-15', price_per_share: 91, commission: 0 })
    expect(res.status).toBe(409)
  })
  it('the history list reports which transactions came from an option', async () => {
    const h = await holding('FFF', true)
    const rows = await (await call('GET', `/api/stocks/${h.id}/purchase-history`)).json() as any[]
    expect(rows.length).toBe(3); expect(rows[0]).toHaveProperty('option_trade_id')
  })
})
