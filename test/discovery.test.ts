import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { markDiscoveryAdded } from '../src/routes/discovery'
import { generateToken } from '../src/lib/auth'
// @ts-ignore  (vite raw import)
import migration from '../migrations_research/0012_create_discovery_tables.sql?raw'

const INGEST = 'ingest-token-for-tests-only'
const E = () => ({ ...(env as any), RESEARCH_INGEST_TOKEN: INGEST })
const req = (method: string, path: string, opts: { token?: string; body?: any } = {}) => app.fetch(new Request('http://x' + path, {
  method, headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: 'Bearer ' + opts.token } : {}) },
  body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined }), E(), { waitUntil() {}, passThroughOnException() {} } as any)
let site = ''
beforeAll(async () => {
  const sql = migration as string
  for (const stmt of sql.split(';').map(s => s.replace(/--.*$/gm, '').trim()).filter(Boolean)) await (env as any).RESEARCH_DB.prepare(stmt).run()
  site = await generateToken({ userId: 1, email: 't@t.com' }, (env as any).JWT_SECRET)
})

describe('discovery api', () => {
  it('reads need a login or ingest token', async () => {
    expect((await req('GET', '/api/research/discovery')).status).toBe(401)
    expect((await req('GET', '/api/research/discovery', { token: 'bad' })).status).toBe(401)
    expect((await req('GET', '/api/research/discovery', { token: site })).status).toBe(200)
  })
  it('writes are ingest-token only (a site login is refused)', async () => {
    const f = { scan_type: 'guru', ticker: 'ABC', headline: 'h' }
    expect((await req('POST', '/api/research/discovery/findings', { body: f })).status).toBe(401)
    expect((await req('POST', '/api/research/discovery/findings', { body: f, token: site })).status).toBe(401)
    expect((await req('POST', '/api/research/discovery/scans', { body: { scan_type: 'guru' }, token: site })).status).toBe(401)
  })
  it('records a scan and a finding, dedupes, and lists them', async () => {
    expect((await req('POST', '/api/research/discovery/scans', { token: INGEST, body: { scan_type: 'guru', last_run_at: '2026-10-18 04:00:00', gurus_scanned: 70, candidates_found: 5 } })).status).toBe(200)
    const body = { scan_type: 'guru', ticker: 'abc', company_name: 'ABC Corp', headline: 'Guru X new 6% position', tier: 'Tier 1', details: 'Quick-5 passed', data: { guru: 'X', pct: 6 } }
    const a = await req('POST', '/api/research/discovery/findings', { token: INGEST, body })
    expect(a.status).toBe(201)
    const b = await req('POST', '/api/research/discovery/findings', { token: INGEST, body: { ...body, headline: 'updated' } })
    expect(b.status).toBe(200)
    const list: any = await (await req('GET', '/api/research/discovery?scan_type=guru', { token: site })).json()
    expect(list.findings).toHaveLength(1)
    expect(list.findings[0]).toMatchObject({ ticker: 'ABC', headline: 'updated', tier: 'Tier 1', data: { guru: 'X', pct: 6 } })
    expect(list.scans[0]).toMatchObject({ scan_type: 'guru', last_run_at: '2026-10-18T04:00:00.000Z', gurus_scanned: 70 })
  })
  it('rejects bad input', async () => {
    const post = (b: any) => req('POST', '/api/research/discovery/findings', { token: INGEST, body: b })
    expect((await post({ scan_type: 'nope', ticker: 'A', headline: 'h' })).status).toBe(400)
    expect((await post({ scan_type: 'guru', ticker: 'bad ticker!', headline: 'h' })).status).toBe(400)
    expect((await post({ scan_type: 'guru', ticker: 'A', headline: '' })).status).toBe(400)
    expect((await post({ scan_type: 'guru', ticker: 'A', headline: 'x'.repeat(301) })).status).toBe(400)
    expect((await post({ scan_type: 'guru', ticker: 'A', headline: 'h', found_at: 'garbage' })).status).toBe(400)
    expect((await req('GET', '/api/research/discovery?scan_type=zzz', { token: INGEST })).status).toBe(400)
  })
  it('does not shadow a ticker lookup', async () => {
    expect((await req('GET', '/api/research/discovery', { token: INGEST })).status).toBe(200)
  })
})

describe('marking findings added to the roster', () => {
  it('marks open findings for the ticker, leaves others alone, and never throws', async () => {
    const post = (b: any) => req('POST', '/api/research/discovery/findings', { token: INGEST, body: b })
    await post({ scan_type: 'guru', ticker: 'AAA', headline: 'h', source_key: 'a1' })
    await post({ scan_type: 'guru', ticker: 'BBB', headline: 'h', source_key: 'b1', status: 'potential_override' })
    await post({ scan_type: 'guru', ticker: 'CCC', headline: 'h', source_key: 'c1', status: 'declined' })
    await markDiscoveryAdded(E(), 'aaa'); await markDiscoveryAdded(E(), 'ccc')
    const list: any = await (await req('GET', '/api/research/discovery', { token: INGEST })).json()
    const st = (t: string) => list.findings.find((f: any) => f.ticker === t).status
    expect(st('AAA')).toBe('added'); expect(st('BBB')).toBe('potential_override'); expect(st('CCC')).toBe('declined')
    await markDiscoveryAdded(E(), 'bbb')
    expect(((await (await req('GET', '/api/research/discovery', { token: INGEST })).json()) as any).findings.find((f: any) => f.ticker === 'BBB').status).toBe('added')
    await expect(markDiscoveryAdded({ RESEARCH_DB: { prepare() { throw new Error('boom') } } }, 'X')).resolves.toBeUndefined()
  })
})
