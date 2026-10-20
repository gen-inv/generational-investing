import { describe, it, expect } from 'vitest'
// @ts-ignore plain ES module used by the CLI
import { runSmoke, summarize } from '../scripts/smoke-lib.mjs'

const HTML = `<html><title>Generational Investing</title><script src="/static/calc.js"></script><script src="/static/app.js"></script><link href="/static/logo.png"></html>`
const files: Record<string, string> = { '/static/calc.js': 'var Calc={}', '/static/app.js': 'console.log(1)', '/static/logo.png': 'PNG' }

function site(over: Record<string, any> = {}) {
  return async (url: string, init: any = {}) => {
    const u = new URL(url); const p = u.pathname
    const auth = (init.headers || {}).Authorization
    if (over[p]) return over[p](init)
    const json = (b: any, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
    if (p === '/') return new Response(HTML, { status: 200 })
    if (files[p]) return new Response(files[p], { status: 200 })
    if (p === '/api/auth/login') {
      const b = JSON.parse(init.body); return b.password === 'good' ? json({ token: 't' }) : json({ error: 'Invalid credentials' }, 401)
    }
    if (p.startsWith('/api/')) return auth === 'Bearer t' ? json([]) : json({ error: 'Unauthorized' }, 401)
    return new Response('nope', { status: 404 })
  }
}
const run = (fetch: any, extra: any = {}) => runSmoke({ baseUrl: 'https://x.test/', fetch, ...extra })
const failing = (r: any[]) => r.filter(x => !x.ok).map(x => x.name)

describe('smoke test', () => {
  it('passes against a healthy site, with and without credentials', async () => {
    expect(failing(await run(site()))).toEqual([])
    const full = await run(site(), { email: 'a@b.c', password: 'good', readLocal: (a: string) => files[a] ?? null })
    expect(failing(full)).toEqual([])
    expect(full.some((r: any) => r.name === 'GET /api/stocks/closed-trades')).toBe(true)
    expect(summarize(full)).toMatchObject({ failed: 0 })
  })
  it('skips the authenticated checks (and says so) without credentials', async () => {
    const r = await run(site())
    expect(r.find((x: any) => x.skipped)).toBeTruthy()
  })
  it('flags a script that is missing (the host answers with HTML) and one that is a 404', async () => {
    const f = site({ '/static/app.js': () => new Response('<!doctype html><html>', { status: 200 }), '/static/calc.js': () => new Response('x', { status: 404 }) })
    expect(failing(await run(f))).toEqual(['static /static/calc.js', 'static /static/app.js'])
  })
  it('flags a stale deploy that differs from the local build', async () => {
    const r = await run(site(), { readLocal: (a: string) => a === '/static/app.js' ? 'console.log(2)' : null })
    expect(failing(r)).toEqual(['static /static/app.js'])
  })
  it('treats CRLF and LF copies of a text file as the same file, but still flags real changes', async () => {
    const onlyApp = (text: string) => (a: string) => a === '/static/app.js' ? text : null
    const served = (text: string) => site({ '/static/app.js': () => new Response(text, { status: 200 }) })
    expect(failing(await run(served('console.log(1)\nconsole.log(2)\n'), { readLocal: onlyApp('console.log(1)\r\nconsole.log(2)\r\n') }))).toEqual([])
    expect(failing(await run(served('console.log(1)\r\nconsole.log(2)\r\n'), { readLocal: onlyApp('console.log(1)\nconsole.log(2)\n') }))).toEqual([])
    expect(failing(await run(served('console.log(1)\nconsole.log(2)\n'), { readLocal: onlyApp('console.log(1)\r\nconsole.log(3)\r\n') }))).toEqual(['static /static/app.js'])
  })
  it('compares images byte for byte', async () => {
    const f = site({ '/static/logo.png': () => new Response('a\nb', { status: 200 }) })
    expect(failing(await run(f, { readLocal: (a: string) => a === '/static/logo.png' ? 'a\r\nb' : null }))).toEqual(['static /static/logo.png'])
  })
  it('flags a protected route that answers anonymous callers', async () => {
    const r = await run(site({ '/api/options': () => new Response('[]', { status: 200 }) }))
    expect(failing(r)).toEqual(['anonymous /api/options is refused'])
  })
  it('flags a server that accepts a forged token', async () => {
    const r = await run(site({ '/api/user/profile': () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) }))
    expect(failing(r)).toEqual(['forged token is refused'])
  })
  it('flags a broken login or a failing API route', async () => {
    expect(failing(await run(site(), { email: 'a@b.c', password: 'bad' }))).toEqual(['login works'])
    const r = await run(site({ '/api/stocks': (init: any) => new Response('boom', { status: 500 }) }), { email: 'a@b.c', password: 'good' })
    expect(failing(r)).toContain('GET /api/stocks')
  })
  it('flags a home page that is not the app, and a fetch that throws', async () => {
    expect(failing(await run(site({ '/': () => new Response('<html>Error 1101</html>', { status: 200 }) })))).toContain('home page loads')
    const boom = async () => { throw new Error('network down') }
    const r = await run(boom)
    expect(r.every((x: any) => x.skipped || !x.ok)).toBe(true)
    expect(r[0].detail).toContain('network down')
  })
  it('summarize reports the failure count', () => {
    expect(summarize([{ name: 'a', ok: false, detail: 'x' }, { name: 'b', ok: true }])).toMatchObject({ failed: 1 })
  })
})
