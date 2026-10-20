import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import schema from './schema'
import app from '../src/index'

const DB = () => (env as any).DB
const ctx = { waitUntil() {}, passThroughOnException() {} }
const post = (path: string, body: any, headers: Record<string, string> = {}, e: any = env) =>
  app.fetch(new Request('http://x' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }), e, ctx as any)

beforeAll(async () => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }))
  const stmts = schema.split(/;\s*\n/).map(s => s.trim()).filter(s => s && !/^PRAGMA/i.test(s) && !/sqlite_sequence/i.test(s))
  for (const s of stmts) await DB().prepare(s).run()
})

describe('cron endpoint secret', () => {
  it('rejects a call with no secret when CRON_SECRET is not configured (undefined must never equal undefined)', async () => {
    const res = await post('/api/cron/dividend-repository/fetch', {})
    expect(res.status).toBe(401)
  })
  it('rejects the old built-in default secret', async () => {
    const res = await post('/api/cron/dividend-repository/fetch', { secret: 'dividend-fetch-cron-2026-secret-key' })
    expect(res.status).toBe(401)
  })
  it('rejects a wrong secret and accepts the configured one', async () => {
    const e = { ...(env as any), CRON_SECRET: 'unit-test-secret', MASSIVE_API_KEY: 'test-key' }
    expect((await post('/api/cron/dividend-repository/fetch', { secret: 'nope' }, {}, e)).status).toBe(401)
    expect((await post('/api/cron/dividend-repository/fetch', {}, { 'X-Cron-Secret': 'unit-test-secret' }, e)).status).toBe(202)
  })
  it('a correct secret still refuses to run when the Massive key is not configured', async () => {
    const e = { ...(env as any), CRON_SECRET: 'unit-test-secret' }
    const res = await post('/api/cron/dividend-repository/fetch', {}, { 'X-Cron-Secret': 'unit-test-secret' }, e)
    expect(res.status).toBe(503)
  })
  it('the old debug endpoint that echoed the expected secret is gone', async () => {
    const res = await post('/api/cron/test', { secret: 'x' })
    expect(res.status).toBe(404)
  })
})
