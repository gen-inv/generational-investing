import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'
import app from '../src/index'
import { generateToken } from '../src/lib/auth'

const SECRET = (env as any).JWT_SECRET as string
const INGEST = 'ingest-token-for-tests-only'
const E = () => ({ ...(env as any), RESEARCH_INGEST_TOKEN: INGEST })
const req = (method: string, path: string, opts: { token?: string; body?: any } = {}) => app.fetch(new Request('http://x' + path, {
  method, headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: 'Bearer ' + opts.token } : {}) },
  body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined }), E(), { waitUntil() {}, passThroughOnException() {} } as any)
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
let siteToken = ''

beforeAll(async () => {
  const db = (env as any).RESEARCH_DB
  await db.prepare(`CREATE TABLE companies (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT UNIQUE, name TEXT, sector TEXT, industry TEXT, last_updated TEXT DEFAULT CURRENT_TIMESTAMP)`).run()
  await db.prepare(`CREATE TABLE pending_research (id INTEGER PRIMARY KEY AUTOINCREMENT, ticker TEXT, update_type TEXT, user_notes TEXT, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, requested_at TEXT DEFAULT CURRENT_TIMESTAMP, claimed_at TEXT, completed_at TEXT, awaiting_reply_kind TEXT, awaiting_reply_question TEXT, awaiting_reply_response TEXT, awaiting_reply_sent_at TEXT)`).run()
  siteToken = await generateToken({ userId: 1, email: 't@t.com' }, SECRET)
})

const LOCKED: [string, string, any?][] = [
  ['GET', '/api/research/findings'],
  ['GET', '/api/research/queue'],
  ['GET', '/api/research/AAPL'],
  ['GET', '/api/research/AAPL/notes/1'],
  ['GET', '/api/research/AAPL/fcf-trend-events'],
  ['POST', '/api/research/update/AAPL', { update_type: 'annual' }],
  ['POST', '/api/research/queue/1/retry', {}],
  ['POST', '/api/research/queue/1/cancel', {}],
]

describe('research routes need a login or the ingest token', () => {
  for (const [method, path, body] of LOCKED) {
    it(`${method} ${path}: no token, wrong token and forged token are refused`, async () => {
      expect((await req(method, path, { body })).status).toBe(401)
      expect((await req(method, path, { body, token: 'nope' })).status).toBe(401)
      const forged = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ userId: 1, exp: 9999999999 }) + '.' + 'AAAA'
      expect((await req(method, path, { body, token: forged })).status).toBe(401)
      const unsigned = b64({ alg: 'none' }) + '.' + b64({ userId: 1, exp: 9999999999 }) + '.'
      expect((await req(method, path, { body, token: unsigned })).status).toBe(401)
    })
  }

  it('a signed site login works, and so does the ingest token', async () => {
    const a = await req('GET', '/api/research/queue', { token: siteToken })
    expect(a.status).toBe(200)
    expect(((await a.json()) as any).queue).toEqual([])
    expect((await req('GET', '/api/research/queue', { token: INGEST })).status).toBe(200)
    expect((await req('GET', '/api/research/ZZZZ', { token: siteToken })).status).toBe(404)
  })

  it('a site login cannot use the machine-only routes, and the ingest token cannot prune', async () => {
    expect((await req('GET', '/api/research/queue/next', { token: siteToken })).status).toBe(401)
    expect((await req('POST', '/api/research/AAPL/notes/prune', { token: INGEST, body: {} })).status).toBe(401)
  })
})

describe('research update requests are validated', () => {
  it('queues a normal request', async () => {
    const r = await req('POST', '/api/research/update/brk.b', { token: siteToken, body: { update_type: 'annual' } })
    expect(r.status).toBe(201)
    expect(((await r.json()) as any).ticker).toBe('BRK.B')
  })
  it('rejects a malformed ticker', async () => {
    for (const t of ['BAD%3BDROP', 'A%20B', 'TOOLONGTICKER1', '%3Cscript%3E']) {
      expect((await req('POST', '/api/research/update/' + t, { token: siteToken, body: { update_type: 'annual' } })).status).toBe(400)
    }
  })
  it('rejects oversized or non-text notes and a non-JSON body', async () => {
    expect((await req('POST', '/api/research/update/MSFT', { token: siteToken, body: { update_type: 'info', user_notes: 'x'.repeat(5001) } })).status).toBe(400)
    expect((await req('POST', '/api/research/update/MSFT', { token: siteToken, body: { update_type: 'info', user_notes: { a: 1 } } })).status).toBe(400)
    const r = await app.fetch(new Request('http://x/api/research/update/MSFT', { method: 'POST', headers: { authorization: 'Bearer ' + siteToken }, body: 'not json' }), E(), { waitUntil() {}, passThroughOnException() {} } as any)
    expect(r.status).toBe(400)
  })
  it('retry and cancel work for a signed-in user (404 for a missing row, not 401)', async () => {
    expect((await req('POST', '/api/research/queue/999/retry', { token: siteToken, body: {} })).status).toBe(404)
    expect((await req('POST', '/api/research/queue/999/cancel', { token: siteToken, body: {} })).status).toBe(404)
  })
})

describe('ingest', () => {
  it('an event with no event_key is skipped with a warning instead of crashing', async () => {
    const r = await req('POST', '/api/research/ingest', { token: INGEST, body: { ticker: 'WARN', events: [{ description: 'No key on this one' }] } })
    expect(r.status).toBe(200)
    const j = (await r.json()) as any
    expect(j.success).toBe(true)
    expect(j.warnings).toHaveLength(1)
    expect(j.warnings[0]).toMatch(/event_key/)
  })
  it('a clean ingest has no warnings field', async () => {
    const j = (await (await req('POST', '/api/research/ingest', { token: INGEST, body: { ticker: 'CLEAN' } })).json()) as any
    expect(j.success).toBe(true)
    expect(j.warnings).toBeUndefined()
  })
  it('still refuses without the ingest token', async () => {
    expect((await req('POST', '/api/research/ingest', { body: { ticker: 'X' } })).status).toBe(401)
    expect((await req('POST', '/api/research/ingest', { token: siteToken, body: { ticker: 'X' } })).status).toBe(401)
  })
})
