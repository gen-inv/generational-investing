import { describe, it, expect, vi } from 'vitest'

// GET/PUT /etfs: the ETF list for the trade-setup scan. Anyone logged in or the research machine may read it; only Rob's own login may change it.
vi.mock('../lib/auth', () => ({ verifyToken: async (t: string) => (t === 'owner' ? { userId: 1 } : t === 'other' ? { userId: 2 } : null) }))
import { routes } from './discovery'

const TOKEN = 'ingest-secret'
const make = (rows: string[] = ['SPY', 'QQQ']) => {
  const batch = vi.fn(async (s: any[]) => s.map(() => ({ success: true })))
  const prepare = vi.fn((sql: string) => ({ sql, all: async () => ({ results: rows.map((t) => ({ ticker: t })) }), bind: (...args: any[]) => ({ sql, args }) }))
  return { env: { RESEARCH_INGEST_TOKEN: TOKEN, JWT_SECRET: 'x', RESEARCH_DB: { prepare, batch } }, prepare, batch }
}
const get = (env: any, token?: string) => routes.request('/etfs', { headers: token ? { Authorization: 'Bearer ' + token } : {} }, env)
const put = (env: any, token: string | undefined, body: any) =>
  routes.request('/etfs', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) }, env)

describe('ETF list endpoint', () => {
  it('lets the research machine and a site login read the list, and refuses everyone else', async () => {
    const { env } = make()
    expect(await (await get(env, TOKEN)).json()).toEqual({ tickers: ['SPY', 'QQQ'] })
    expect((await get(env, 'owner')).status).toBe(200)
    expect((await get(env)).status).toBe(401)
    expect((await get(env, 'nope')).status).toBe(401)
  })
  it('saves a cleaned list for Rob: upper-case, trimmed, no duplicates, sorted, replaced whole in one batch', async () => {
    const { env, batch } = make()
    const res = await put(env, 'owner', { tickers: ['spy', ' qqq', 'SPY', 'xme'] })
    expect(res.status).toBe(200); expect(await res.json()).toEqual({ tickers: ['QQQ', 'SPY', 'XME'] })
    expect(batch).toHaveBeenCalledTimes(1)
    const stmts = batch.mock.calls[0][0] as any[]
    expect(stmts[0].sql).toBe('DELETE FROM setup_etfs')
    expect(stmts.slice(1).map((s) => s.args[0])).toEqual(['QQQ', 'SPY', 'XME'])
  })
  it('allows an empty list', async () => {
    const { env, batch } = make()
    expect(await (await put(env, 'owner', { tickers: [] })).json()).toEqual({ tickers: [] })
    expect((batch.mock.calls[0][0] as any[]).length).toBe(1)
  })
  it('only Rob may change it: not the research machine, not another user, not a stranger', async () => {
    const { env, batch } = make()
    expect((await put(env, TOKEN, { tickers: ['SPY'] })).status).toBe(403)
    expect((await put(env, 'other', { tickers: ['SPY'] })).status).toBe(403)
    expect((await put(env, undefined, { tickers: ['SPY'] })).status).toBe(401)
    expect(batch).not.toHaveBeenCalled()
  })
  it('rejects bad input without writing anything', async () => {
    const { env, batch } = make()
    const bad = await put(env, 'owner', { tickers: ['SPY', 'not a ticker', '<b>'] })
    expect(bad.status).toBe(400); expect((await bad.json() as any).error).toContain('Not a valid ticker: not a ticker, <b>')
    expect((await put(env, 'owner', { tickers: 'SPY' })).status).toBe(400)
    expect((await put(env, 'owner', 'not json')).status).toBe(400)
    expect((await put(env, 'owner', { tickers: Array.from({ length: 201 }, (_, i) => 'E' + i) })).status).toBe(400)
    expect(batch).not.toHaveBeenCalled()
  })
})
