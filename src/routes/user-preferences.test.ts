import { describe, it, expect, vi } from 'vitest'

// The sign-in check is not what is tested here: pretend every request comes from user 7.
vi.mock('../lib/auth', () => ({
  authMiddleware: async (c: any, next: any) => { c.set('userId', 7); await next() },
  hashPassword: async () => 'hash', verifyPassword: async () => true, generateToken: async () => 'tok', fetchAndCacheExchangeRate: async () => {},
}))
import { routes } from './auth'

const make = (row: any = null) => {
  const runs: any[][] = []
  const DB = { prepare: (sql: string) => ({ bind: (...args: any[]) => ({ first: async () => row, run: async () => { runs.push([sql, ...args]) } }) }) }
  return { env: { DB }, runs }
}
const put = (env: any, body: any) => routes.request('/api/user/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }, env)

describe('GET/PUT /api/user/preferences', () => {
  it('returns the switched-off areas (none by default)', async () => {
    expect(await (await routes.request('/api/user/preferences', {}, make().env)).json()).toEqual({ hidden: [] })
    expect(await (await routes.request('/api/user/preferences', {}, make({ menu_hidden: '["stocks"]' }).env)).json()).toEqual({ hidden: ['stocks'] })
  })
  it('saves a cleaned, de-duplicated list for the signed-in user', async () => {
    const { env, runs } = make()
    const res = await put(env, { hidden: ['reports', 'stocks', 'stocks'] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hidden: ['stocks', 'reports'] })
    expect(runs[0][1]).toBe(7); expect(runs[0][2]).toBe('["stocks","reports"]')
  })
  it('refuses the dashboard, unknown areas and anything that is not a list, and saves nothing', async () => {
    const { env, runs } = make()
    expect((await put(env, { hidden: ['dashboard'] })).status).toBe(400)
    expect((await put(env, { hidden: ['nope'] })).status).toBe(400)
    expect((await put(env, { hidden: 'stocks' })).status).toBe(400)
    expect((await put(env, '{broken')).status).toBe(400)
    expect(runs).toHaveLength(0)
  })
  it('lets everything be switched back on', async () => {
    const { env, runs } = make()
    expect((await put(env, { hidden: [] })).status).toBe(200)
    expect(runs[0][2]).toBe('[]')
  })
})
