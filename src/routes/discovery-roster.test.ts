import { describe, it, expect, vi } from 'vitest'
import { routes } from './discovery'

// GET /roster: the Company Roster tickers for the research machine's trade-setup scan.
const TOKEN = 'ingest-secret'
const make = (rows: any[]) => {
  const bind = vi.fn(() => ({ all: async () => ({ results: rows }) }))
  const prepare = vi.fn(() => ({ bind }))
  return { env: { RESEARCH_INGEST_TOKEN: TOKEN, JWT_SECRET: 'x', DB: { prepare } }, prepare, bind }
}
const get = (env: any, token?: string) => routes.request('/roster', { headers: token ? { Authorization: 'Bearer ' + token } : {} }, env)

describe('discovery roster endpoint', () => {
  it('returns the roster tickers, upper-cased, de-duplicated, sorted and valid only', async () => {
    const { env, prepare, bind } = make([{ ticker: 'ulta' }, { ticker: 'AMAT' }, { ticker: 'AMAT' }, { ticker: 'BRK.B' }, { ticker: 'bad ticker!' }, { ticker: null }])
    const res = await get(env, TOKEN)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tickers: ['AMAT', 'BRK.B', 'ULTA'] })
    expect(String(prepare.mock.calls[0][0])).toContain('FROM companies WHERE user_id = ?')
    expect(bind).toHaveBeenCalledWith(1)
  })
  it('refuses a missing token, a wrong token, and never reads the roster for them', async () => {
    const { env, prepare } = make([{ ticker: 'AMAT' }])
    expect((await get(env)).status).toBe(401)
    expect((await get(env, 'nope')).status).toBe(401)
    expect(prepare).not.toHaveBeenCalled()
  })
  it('is closed when no ingest token is configured', async () => {
    const { env } = make([{ ticker: 'AMAT' }])
    env.RESEARCH_INGEST_TOKEN = undefined as any
    expect((await get(env, 'anything')).status).toBe(401)
  })
  it('returns an empty list for an empty roster', async () => {
    const { env } = make([])
    expect(await (await get(env, TOKEN)).json()).toEqual({ tickers: [] })
  })
})
