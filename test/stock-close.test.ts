import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import schema from './schema'
import app from '../src/index'
import { stockClosePL } from '../src/lib/stock-close'

const DB = () => (env as any).DB
let token = '', uid = 0, acct = 0
const call = (method: string, path: string, body?: any) => app.fetch(new Request('http://x' + path, {
  method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env as any)

async function holding(ticker: string) {
  const h = await DB().prepare(`INSERT INTO stock_holdings (user_id, account_id, ticker, total_shares, average_price, opened_date, is_open, strategy_type)
    VALUES (?, ?, ?, 400, 57.5, '2026-01-01', 1, 'WHEEL')`).bind(uid, acct, ticker).run()
  const id = h.meta.last_row_id
  const tx = (type: string, shares: number, price: number, date: string, comm: number) => DB().prepare(`INSERT INTO stock_transactions
    (user_id, holding_id, transaction_type, shares, price_per_share, transaction_date, commission) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(uid, id, type, shares, price, date, comm).run()
  await tx('BUY', 100, 50, '2026-01-01', 5)
  await tx('BUY', 300, 60, '2026-02-01', 7)
  return id
}

beforeAll(async () => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }))
  const stmts = schema.split(/;\s*\n/).map(s => s.trim()).filter(s => s && !/^PRAGMA/i.test(s) && !/sqlite_sequence/i.test(s))
  for (const s of stmts) await DB().prepare(s).run()
  const reg = await app.fetch(new Request('http://x/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'sc@t.com', password: 'pw', name: 'S' }) }), env as any)
  token = ((await reg.json()) as any).token
  uid = (await DB().prepare('SELECT id FROM users').first() as any).id
  acct = (await DB().prepare("INSERT INTO accounts (user_id, account_name, account_type, balance_cad, balance_usd, cash_balance_cad, cash_balance_usd, default_currency) VALUES (?, 'A', 'TFSA', 0, 0, 0, 0, 'CAD')").bind(uid).run()).meta.last_row_id
})

describe('stock close preview matches what the close books', () => {
  it('preview numbers + stockClosePL equal the profit_loss the close route returns', async () => {
    const id = await holding('AAA')
    const pv = await (await call('GET', `/api/stocks/${id}/close-preview`)).json() as any
    expect(pv).toMatchObject({ ticker: 'AAA', shares: 400, avg_cost: 57.5, pending_buy_commission: 12, open_covered_calls: 0, account_name: 'A' })
    const preview = stockClosePL({ shares: pv.shares, avgCost: pv.avg_cost, pendingBuyCommission: pv.pending_buy_commission, closePrice: 66, closeCommission: 4 })
    const closed = await (await call('PUT', `/api/stocks/${id}/close`, { close_date: '2026-03-01', close_price: 66, commission: 4 })).json() as any
    expect(closed.profit_loss).toBeCloseTo(preview.netPL, 5)
    expect(closed.profit_loss).toBeCloseTo(400 * (66 - 57.5) - 12 - 4, 5)
  })
  it('after a partial sell the preview carries only what is left', async () => {
    const id = await holding('BBB')
    await DB().prepare(`INSERT INTO stock_transactions (user_id, holding_id, transaction_type, shares, price_per_share, transaction_date, commission) VALUES (?, ?, 'SELL', 100, 70, '2026-02-15', 1)`).bind(uid, id).run()
    await DB().prepare('UPDATE stock_holdings SET total_shares = 300 WHERE id = ?').bind(id).run()
    const pv = await (await call('GET', `/api/stocks/${id}/close-preview`)).json() as any
    expect(pv).toMatchObject({ shares: 300, avg_cost: 57.5, pending_buy_commission: 9 })
    const preview = stockClosePL({ shares: pv.shares, avgCost: pv.avg_cost, pendingBuyCommission: pv.pending_buy_commission, closePrice: 66, closeCommission: 2 })
    const closed = await (await call('PUT', `/api/stocks/${id}/close`, { close_date: '2026-03-01', close_price: 66, commission: 2 })).json() as any
    expect(closed.profit_loss).toBeCloseTo(preview.netPL, 5)
  })
  it('reports open covered calls so the modal can refuse', async () => {
    const id = await holding('CCC')
    await DB().prepare(`INSERT INTO option_trades (user_id, account_id, account_type, ticker, strategy_type, quantity, strike_price, premium, trade_date, expiration_date, is_open)
      VALUES (?, ?, 'TFSA', 'CCC', 'COVERED_CALL', 1, 70, 1, '2026-02-01', '2026-12-18', 1)`).bind(uid, acct).run()
    const pv = await (await call('GET', `/api/stocks/${id}/close-preview`)).json() as any
    expect(pv.open_covered_calls).toBe(1)
  })
  it('404 for a holding that is not yours', async () => {
    expect((await call('GET', '/api/stocks/999999/close-preview')).status).toBe(404)
  })
})
