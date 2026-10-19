import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import schema from './schema'
import app from '../src/index'

const DB = () => (env as any).DB
let token = '', uid = 0, acct = 0, co = 0
const call = (method: string, path: string, body?: any) => app.fetch(new Request('http://x' + path, {
  method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env as any)
const first = (sql: string, ...b: any[]) => DB().prepare(sql).bind(...b).first() as Promise<any>
const all = async (sql: string, ...b: any[]) => ((await DB().prepare(sql).bind(...b).all()).results || []) as any[]

let n = 0
async function newCompany() {
  n++
  co = (await DB().prepare("INSERT INTO companies (user_id, ticker, company_name) VALUES (?, ?, ?)").bind(uid, 'T' + n, 'Co ' + n).run()).meta.last_row_id
  return 'T' + n
}
async function put(ticker: string, o: { strike?: number; premium?: number; qty?: number; commission?: number; strategy?: string } = {}) {
  const r = await DB().prepare(`INSERT INTO option_trades (user_id, company_id, ticker, strategy_type, strike_price, premium, quantity, expiration_date, account_type, account_id, trade_date, is_open, commission)
    VALUES (?, ?, ?, ?, ?, ?, ?, '2026-12-18', 'TFSA', ?, '2026-10-01', 1, ?)`)
    .bind(uid, co, ticker, o.strategy || 'SELLING_PUT', o.strike ?? 50, o.premium ?? 2, o.qty ?? 2, acct, o.commission ?? 1.3).run()
  return r.meta.last_row_id as number
}
const assign = (id: number, date = '2026-10-15') => call('POST', `/api/options/${id}/assign`, { assignment_date: date, notes: 'n' })

beforeAll(async () => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }))
  const stmts = schema.split(/;\s*\n/).map(s => s.trim()).filter(s => s && !/^PRAGMA/i.test(s) && !/sqlite_sequence/i.test(s))
  for (const s of stmts) await DB().prepare(s).run()
  const reg = await app.fetch(new Request('http://x/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'pa@t.com', password: 'pw', name: 'P' }) }), env as any)
  token = ((await reg.json()) as any).token
  uid = (await DB().prepare('SELECT id FROM users').first() as any).id
  acct = (await DB().prepare("INSERT INTO accounts (user_id, account_name, account_type, balance_cad, balance_usd, cash_balance_cad, cash_balance_usd, default_currency) VALUES (?, 'A', 'TFSA', 0, 0, 0, 0, 'CAD')").bind(uid).run()).meta.last_row_id
})

describe('assigning a short put links what it creates to the put', () => {
  it('creates a holding, a BUY transaction and one SELLING_PUT adjustment, all linked', async () => {
    const t = await newCompany(); const id = await put(t)
    expect((await assign(id)).status).toBe(200)
    const tx = await all('SELECT * FROM stock_transactions WHERE option_trade_id = ?', id)
    expect(tx).toHaveLength(1)
    expect(tx[0]).toMatchObject({ transaction_type: 'BUY', shares: 200, price_per_share: 50, transaction_date: '2026-10-15' })
    const adj = await all("SELECT * FROM cost_basis_adjustments WHERE option_trade_id = ? AND adjustment_type = 'SELLING_PUT'", id)
    expect(adj).toHaveLength(1)
    expect(adj[0].amount).toBeCloseTo(398.7, 6)
    expect((await first('SELECT * FROM stock_holdings WHERE id = ?', tx[0].holding_id))).toMatchObject({ total_shares: 200, average_price: 50, is_open: 1 })
  })
})

describe('re-opening or deleting an assigned put reverses the assignment', () => {
  it('re-open: put is open again, adjustment and BUY are gone, the holding it created is removed', async () => {
    const t = await newCompany(); const id = await put(t)
    await assign(id)
    const holdingId = (await first('SELECT holding_id FROM stock_transactions WHERE option_trade_id = ?', id)).holding_id
    expect((await call('PUT', `/api/options/${id}/reopen`)).status).toBe(200)
    expect((await first('SELECT is_open, profit_loss FROM option_trades WHERE id = ?', id))).toMatchObject({ is_open: 1, profit_loss: null })
    expect(await all('SELECT id FROM stock_transactions WHERE option_trade_id = ?', id)).toHaveLength(0)
    expect(await all('SELECT id FROM cost_basis_adjustments WHERE option_trade_id = ?', id)).toHaveLength(0)
    expect(await first('SELECT id FROM stock_holdings WHERE id = ?', holdingId)).toBeNull()
  })
  it('delete: same reversal, and the put is gone', async () => {
    const t = await newCompany(); const id = await put(t)
    await assign(id)
    expect((await call('DELETE', `/api/options/${id}`)).status).toBe(200)
    expect(await first('SELECT id FROM option_trades WHERE id = ?', id)).toBeNull()
    expect(await all('SELECT id FROM stock_transactions WHERE option_trade_id = ?', id)).toHaveLength(0)
    expect(await all('SELECT id FROM cost_basis_adjustments WHERE option_trade_id = ?', id)).toHaveLength(0)
    expect(await all('SELECT id FROM stock_holdings WHERE ticker = ?', t)).toHaveLength(0)
  })
  it('assignment into an existing holding: undoing it restores the original shares and average price', async () => {
    const t = await newCompany()
    const h = (await DB().prepare(`INSERT INTO stock_holdings (user_id, company_id, ticker, account_id, total_shares, average_price, is_open, opened_date, strategy_type) VALUES (?, ?, ?, ?, 300, 40, 1, '2026-01-01', 'WHEEL')`).bind(uid, co, t, acct).run()).meta.last_row_id
    await DB().prepare(`INSERT INTO stock_transactions (user_id, holding_id, transaction_type, shares, price_per_share, transaction_date, commission) VALUES (?, ?, 'BUY', 300, 40, '2026-01-01', 0)`).bind(uid, h).run()
    const id = await put(t)
    await assign(id)
    expect(await first('SELECT total_shares, average_price FROM stock_holdings WHERE id = ?', h)).toMatchObject({ total_shares: 500 })
    await call('PUT', `/api/options/${id}/reopen`)
    const after = await first('SELECT total_shares, average_price FROM stock_holdings WHERE id = ?', h)
    expect(after.total_shares).toBeCloseTo(300, 6)
    expect(after.average_price).toBeCloseTo(40, 6)
    expect(await all('SELECT id FROM stock_transactions WHERE holding_id = ?', h)).toHaveLength(1)
  })
  it('after an undo the put can be assigned again, with no duplicates', async () => {
    const t = await newCompany(); const id = await put(t)
    await assign(id); await call('PUT', `/api/options/${id}/reopen`); await assign(id, '2026-10-16')
    expect(await all('SELECT id FROM stock_transactions WHERE option_trade_id = ?', id)).toHaveLength(1)
    expect(await all('SELECT id FROM cost_basis_adjustments WHERE option_trade_id = ?', id)).toHaveLength(1)
    expect(await all('SELECT id FROM stock_holdings WHERE ticker = ?', t)).toHaveLength(1)
  })
})

describe('refused when it cannot be reversed safely (409, nothing changes)', () => {
  it('shares already sold: re-open and delete are refused', async () => {
    const t = await newCompany(); const id = await put(t)
    await assign(id)
    const hid = (await first('SELECT holding_id FROM stock_transactions WHERE option_trade_id = ?', id)).holding_id
    await DB().prepare(`INSERT INTO stock_transactions (user_id, holding_id, transaction_type, shares, price_per_share, transaction_date, commission) VALUES (?, ?, 'SELL', 150, 60, '2026-10-20', 0)`).bind(uid, hid).run()
    await DB().prepare('UPDATE stock_holdings SET total_shares = 50 WHERE id = ?').bind(hid).run()
    const r1 = await call('PUT', `/api/options/${id}/reopen`)
    expect(r1.status).toBe(409)
    expect(((await r1.json()) as any).error).toContain('no longer in the position')
    expect((await call('DELETE', `/api/options/${id}`)).status).toBe(409)
    expect((await first('SELECT is_open FROM option_trades WHERE id = ?', id)).is_open).toBe(0)
    expect(await all('SELECT id FROM cost_basis_adjustments WHERE option_trade_id = ?', id)).toHaveLength(1)
    expect((await first('SELECT total_shares FROM stock_holdings WHERE id = ?', hid)).total_shares).toBe(50)
  })
  it('position closed: refused until it is re-opened', async () => {
    const t = await newCompany(); const id = await put(t)
    await assign(id)
    const hid = (await first('SELECT holding_id FROM stock_transactions WHERE option_trade_id = ?', id)).holding_id
    await DB().prepare('UPDATE stock_holdings SET is_open = 0 WHERE id = ?').bind(hid).run()
    expect((await call('PUT', `/api/options/${id}/reopen`)).status).toBe(409)
  })
  it('would strand other history (a dividend on the holding): refused', async () => {
    const t = await newCompany(); const id = await put(t)
    await assign(id)
    const hid = (await first('SELECT holding_id FROM stock_transactions WHERE option_trade_id = ?', id)).holding_id
    await DB().prepare(`INSERT INTO cost_basis_adjustments (user_id, holding_id, adjustment_type, amount, adjustment_date, notes) VALUES (?, ?, 'DIVIDEND', 10, '2026-11-01', 'd')`).bind(uid, hid).run()
    const r = await call('DELETE', `/api/options/${id}`)
    expect(r.status).toBe(409)
    expect(await first('SELECT id FROM option_trades WHERE id = ?', id)).not.toBeNull()
  })
})

describe('editing an assigned put makes the stock side follow', () => {
  it('premium and commission change the adjustment; strike and quantity change the shares and average', async () => {
    const t = await newCompany(); const id = await put(t)
    await assign(id)
    const r = await call('PUT', `/api/options/${id}`, { premium: 3, quantity: 3, strike_price: 55, commission: 2 })
    expect(r.status).toBe(200)
    const adj = await first("SELECT amount FROM cost_basis_adjustments WHERE option_trade_id = ?", id)
    expect(adj.amount).toBeCloseTo(3 * 3 * 100 - 2, 6)
    const tx = await first('SELECT shares, price_per_share, holding_id FROM stock_transactions WHERE option_trade_id = ?', id)
    expect(tx).toMatchObject({ shares: 300, price_per_share: 55 })
    expect(await first('SELECT total_shares, average_price FROM stock_holdings WHERE id = ?', tx.holding_id)).toMatchObject({ total_shares: 300, average_price: 55 })
    expect((await first('SELECT profit_loss FROM option_trades WHERE id = ?', id)).profit_loss).toBeCloseTo(898, 6)
  })
  it('an edit that clears the close date re-opens the put and reverses the assignment', async () => {
    const t = await newCompany(); const id = await put(t)
    await assign(id)
    expect((await call('PUT', `/api/options/${id}`, { close_date: null, close_price: null })).status).toBe(200)
    expect(await all('SELECT id FROM stock_transactions WHERE option_trade_id = ?', id)).toHaveLength(0)
    expect(await all('SELECT id FROM cost_basis_adjustments WHERE option_trade_id = ?', id)).toHaveLength(0)
  })
})

describe('puts that were not assigned are untouched', () => {
  it('a put closed normally re-opens and deletes exactly as before, and its holding is left alone', async () => {
    const t = await newCompany(); const id = await put(t)
    await call('PUT', `/api/options/${id}`, { close_date: '2026-11-01', close_price: 0.5 })
    const h = (await DB().prepare(`INSERT INTO stock_holdings (user_id, company_id, ticker, account_id, total_shares, average_price, is_open, opened_date) VALUES (?, ?, ?, ?, 100, 40, 1, '2026-01-01')`).bind(uid, co, t, acct).run()).meta.last_row_id
    expect((await call('PUT', `/api/options/${id}/reopen`)).status).toBe(200)
    expect((await call('DELETE', `/api/options/${id}`)).status).toBe(200)
    expect((await first('SELECT total_shares FROM stock_holdings WHERE id = ?', h)).total_shares).toBe(100)
  })
})
