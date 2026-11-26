import { describe, it, expect, vi } from 'vitest'

// The trend scan posts to the same Discovery API as the reversal scan, under scan type "trend".
vi.mock('../lib/auth', () => ({ verifyToken: async () => null }))
import { routes } from './discovery'

const TOKEN = 'ingest-secret'
const make = () => {
  const log: { sql: string; args: any[] }[] = []
  const prepare = vi.fn((sql: string) => ({
    bind: (...args: any[]) => {
      log.push({ sql, args })
      return { run: async () => ({ meta: { last_row_id: 5 } }), first: async () => null, all: async () => ({ results: [] }) }
    },
    all: async () => ({ results: [] }),
  }))
  return { env: { RESEARCH_INGEST_TOKEN: TOKEN, JWT_SECRET: 'x', RESEARCH_DB: { prepare } }, log }
}
const post = (env: any, path: string, body: any) =>
  routes.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(body) }, env)

describe('trend scan type', () => {
  it('accepts a trend scan record and clears trend findings older than 45 days', async () => {
    const { env, log } = make()
    const res = await post(env, '/scans', { scan_type: 'trend', candidates_found: 2, status: 'ok', note: 'Scanned 65 symbols' })
    expect(res.status).toBe(200)
    const del = log.find((q) => q.sql.includes('DELETE FROM discovery_findings'))!
    expect(del.args[0]).toBe('trend')
    expect(del.sql).toContain('scan_type = ?')
  })
  it('still clears only setup findings when the reversal scan reports', async () => {
    const { env, log } = make()
    await post(env, '/scans', { scan_type: 'setup', candidates_found: 0 })
    expect(log.find((q) => q.sql.includes('DELETE FROM discovery_findings'))!.args[0]).toBe('setup')
  })
  it('does not clear anything when another scan reports', async () => {
    const { env, log } = make()
    await post(env, '/scans', { scan_type: 'guru', gurus_scanned: 3 })
    expect(log.some((q) => q.sql.includes('DELETE FROM discovery_findings'))).toBe(false)
  })
  it('accepts a trend finding with chart data up to the setup size, and refuses it for a guru finding', async () => {
    const { env } = make()
    const big = { pad: 'x'.repeat(12000) }
    const body = (t: string) => ({ scan_type: t, ticker: 'AAPL', headline: 'Higher low on rising support $344.07', data: big })
    expect((await post(env, '/findings', body('trend'))).status).toBe(201)
    expect((await post(env, '/findings', body('guru'))).status).toBe(400)
  })
  it('refuses the old forex scan type and an unknown one, and says trend is allowed', async () => {
    const { env } = make()
    for (const t of ['fx', 'crypto']) {
      const res = await post(env, '/scans', { scan_type: t })
      expect(res.status).toBe(400)
      expect(JSON.stringify(await res.json())).toContain('trend')
    }
  })
  it('lists trend findings with the others', async () => {
    const { env, log } = make()
    const res = await routes.request('/', { headers: { Authorization: 'Bearer ' + TOKEN } }, env)
    expect(res.status).toBe(200)
    expect(log.some((q) => q.args[0] === 'trend')).toBe(true)
    expect(log.some((q) => q.args[0] === 'fx')).toBe(false)
  })
})
