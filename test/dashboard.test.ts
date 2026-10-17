import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import schema from './schema'
import app from '../src/index'

const DB = () => (env as any).DB
let token = ''
const get = (path: string) => app.fetch(new Request('http://x' + path, { headers: { authorization: 'Bearer ' + token } }), env as any)

beforeAll(async () => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }))
  const stmts = schema.split(/;\s*\n/).map(s => s.trim()).filter(s => s && !/^PRAGMA/i.test(s) && !/sqlite_sequence/i.test(s))
  for (const s of stmts) await DB().prepare(s).run()
  const reg = await app.fetch(new Request('http://x/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'd@t.com', password: 'pw', name: 'D' }),
  }), env as any)
  token = ((await reg.json()) as any).token
  const uid = (await DB().prepare('SELECT id FROM users').first() as any).id
  await DB().prepare("INSERT INTO accounts (user_id, account_name, account_type, balance_cad, balance_usd, cash_balance_cad, cash_balance_usd, default_currency) VALUES (?, 'CAD acct', 'TFSA', 1000, 0, 100, 0, 'CAD')").bind(uid).run()
  await DB().prepare("INSERT INTO accounts (user_id, account_name, account_type, balance_cad, balance_usd, cash_balance_cad, cash_balance_usd, default_currency) VALUES (?, 'USD acct', 'MARGIN', 0, 500, 0, 50, 'USD')").bind(uid).run()
  await DB().prepare('INSERT INTO exchange_rates (month, year, usd_to_cad, cad_to_usd) VALUES (1, 2020, 1.25, 0.8)').run()
})

describe('GET /api/dashboard/totals (characterization)', () => {
  it('uses the cached rate for the month asked for', async () => {
    const j = await (await get('/api/dashboard/totals?month=1&year=2020')).json() as any
    expect(j.total_cad).toBeCloseTo(1000 + 500 * 1.25, 6)
    expect(j.total_usd).toBeCloseTo(1000 * 0.8 + 500, 6)
    expect(j.total_cash_cad).toBeCloseTo(100 + 50 * 1.25, 6)
    expect(j.total_cash_usd).toBeCloseTo(100 * 0.8 + 50, 6)
    expect(j.exchange_rate).toMatchObject({ usd_to_cad: 1.25, cad_to_usd: 0.8, month: 1, year: 2020, is_default: false, source: 'Bank of Canada' })
  })
  it('falls back to 1.35 and says so when the month has no cached rate', async () => {
    const j = await (await get('/api/dashboard/totals?month=2&year=2020')).json() as any
    expect(j.total_cad).toBeCloseTo(1000 + 500 * 1.35, 6)
    expect(j.exchange_rate).toMatchObject({ usd_to_cad: 1.35, is_default: true, source: 'Default Rate' })
  })
})

describe('GET /api/dashboard (characterization)', () => {
  it('converts balances and returns exactly the two rate fields', async () => {
    const j = await (await get('/api/dashboard?month=1&year=2020')).json() as any
    expect(j.total_balance_cad).toBeCloseTo(1000 + 500 * 1.25, 6)
    expect(j.total_balance_usd).toBeCloseTo(1000 * 0.8 + 500, 6)
    expect(j.exchange_rate).toEqual({ usd_to_cad: 1.25, cad_to_usd: 0.8 })
  })
  it('uses the fallback when no rate is cached', async () => {
    const j = await (await get('/api/dashboard?month=2&year=2020')).json() as any
    expect(j.total_balance_cad).toBeCloseTo(1000 + 500 * 1.35, 6)
    expect(j.exchange_rate.usd_to_cad).toBe(1.35)
    expect(j.exchange_rate.cad_to_usd).toBeCloseTo(1 / 1.35, 10)
  })
})

describe('GET /api/reports/positions weights use the cached monthly rate (was a hardcoded 1.4)', () => {
  it('total portfolio value converts USD at this month\'s rate', async () => {
    const now = new Date()
    const m = now.getMonth() + 1, y = now.getFullYear()
    await DB().prepare('INSERT OR REPLACE INTO exchange_rates (month, year, usd_to_cad, cad_to_usd) VALUES (?, ?, 1.25, 0.8)').bind(m, y).run()
    await DB().prepare("INSERT INTO account_balances (user_id, account_type, balance_cad, balance_usd, month, year) VALUES (1, 'TFSA', 1000, 500, ?, ?)").bind(m, y).run()
    await DB().prepare("INSERT INTO stock_holdings (user_id, ticker, account_id, total_shares, average_price, opened_date) VALUES (1, 'WWW', 1, 100, 10, '2026-01-02')").run()
    const j = await (await get('/api/reports/positions')).json() as any
    expect(j.summary.totalValue).toBeCloseTo(1000 + 500 * 1.25, 6)
    expect(j.allPositions[0].weight).toBeCloseTo((1000 / 1625) * 100, 6)
  })
})