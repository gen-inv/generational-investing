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
    body: JSON.stringify({ email: 'e@t.com', password: 'pw', name: 'E' }),
  }), env as any)
  token = ((await reg.json()) as any).token
  accountId = (await DB().prepare("INSERT INTO accounts (user_id, account_name, account_type) VALUES (1, 'Margin', 'MARGIN')").run()).meta.last_row_id
  companyId = (await DB().prepare("INSERT INTO companies (user_id, ticker, company_name) VALUES (1, 'EEE', 'Epsilon')").run()).meta.last_row_id
  holdingId = (await DB().prepare("INSERT INTO stock_holdings (user_id, company_id, ticker, account_id, total_shares, average_price, opened_date) VALUES (1, ?, 'EEE', ?, 500, 50, '2026-01-02')").bind(companyId, accountId).run()).meta.last_row_id
})

describe('editing a closed covered call', () => {
  it('keeps a close price of 0 (expired worthless) and books the full premium', async () => {
    const created = await call(`/api/stocks/${holdingId}/covered-calls`, 'POST', { strike_price: 55, premium: 0.85, quantity: 1, expiration_date: '2026-12-18', trade_date: '2026-10-01', commission: 1.3 })
    const id = ((await created.json()) as any).id as number
    await call(`/api/covered-calls/${id}/close`, 'PUT', { close_price: 0.2, close_date: '2026-11-15' })
    const edit = await call(`/api/covered-calls/${id}`, 'PUT', {
      strike_price: 55, premium: 0.85, quantity: 1, expiration_date: '2026-12-18', trade_date: '2026-10-01', commission: 1.3,
      close_date: '2026-12-18', close_price: 0, close_commission: 0, holding_id: holdingId })
    expect(edit.status).toBe(200)
    const row: any = await DB().prepare('SELECT close_price, is_open, profit_loss FROM option_trades WHERE id = ?').bind(id).first()
    expect(row.close_price).toBe(0)
    expect(row.is_open).toBe(0)
    expect(row.profit_loss).toBeCloseTo(83.7, 6)
  })
})
