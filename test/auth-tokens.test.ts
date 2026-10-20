import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import schema from './schema'
import app from '../src/index'
import { generateToken } from '../src/lib/auth'

const DB = () => (env as any).DB
const SECRET = (env as any).JWT_SECRET as string
const req = (method: string, path: string, opts: { token?: string; body?: any; e?: any } = {}) => app.fetch(new Request('http://x' + path, {
  method, headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: 'Bearer ' + opts.token } : {}) },
  body: opts.body ? JSON.stringify(opts.body) : undefined }), opts.e ?? env, { waitUntil() {}, passThroughOnException() {} } as any)
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
let token = '', uid = 0

beforeAll(async () => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }))
  const stmts = schema.split(/;\s*\n/).map(s => s.trim()).filter(s => s && !/^PRAGMA/i.test(s) && !/sqlite_sequence/i.test(s))
  for (const s of stmts) await DB().prepare(s).run()
  const reg = await req('POST', '/api/auth/register', { body: { email: 'tok@t.com', password: 'pw', name: 'T' } })
  token = ((await reg.json()) as any).token
  uid = (await DB().prepare('SELECT id FROM users').first() as any).id
})

describe('login tokens on the API', () => {
  it('register and login issue signed tokens that the API accepts', async () => {
    expect(token.split('.').length).toBe(3)
    expect((await req('GET', '/api/user/profile', { token })).status).toBe(200)
    const login = await req('POST', '/api/auth/login', { body: { email: 'tok@t.com', password: 'pw' } })
    const t2 = ((await login.json()) as any).token
    expect((await req('GET', '/api/user/profile', { token: t2 })).status).toBe(200)
  })
  it('a forged token for another user is refused (the old format, and a tampered payload)', async () => {
    const h = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), body = btoa(JSON.stringify({ userId: uid, email: 'tok@t.com' }))
    const oldStyle = `${h}.${body}.${btoa(`${h}.${body}.secret`)}`
    expect((await req('GET', '/api/user/profile', { token: oldStyle })).status).toBe(401)
    const [hh, , sig] = token.split('.')
    expect((await req('GET', '/api/user/profile', { token: `${hh}.${b64({ userId: uid + 1, exp: 9999999999 })}.${sig}` })).status).toBe(401)
  })
  it('an expired token and a token signed with another secret are refused', async () => {
    expect((await req('GET', '/api/user/profile', { token: await generateToken({ userId: uid }, SECRET, -10) })).status).toBe(401)
    expect((await req('GET', '/api/user/profile', { token: await generateToken({ userId: uid }, 'some-other-secret-0123456789') })).status).toBe(401)
  })
  it('with no JWT_SECRET configured the server fails closed instead of accepting tokens', async () => {
    const e = { ...(env as any), JWT_SECRET: undefined }
    expect((await req('GET', '/api/user/profile', { token, e })).status).toBe(503)
    expect((await req('POST', '/api/auth/login', { body: { email: 'tok@t.com', password: 'pw' }, e })).status).toBe(500)
  })
  it('missing or malformed Authorization headers are still 401', async () => {
    expect((await req('GET', '/api/user/profile')).status).toBe(401)
    expect((await req('GET', '/api/user/profile', { token: 'garbage' })).status).toBe(401)
  })
})
