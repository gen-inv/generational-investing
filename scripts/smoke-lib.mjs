// Post-deploy smoke checks. Pure logic with an injectable fetch so it is unit-tested; scripts/smoke.mjs is the CLI.
// Checks: the page loads; every /static asset the page references is served and is byte-identical to the local build;
// protected API routes refuse anonymous callers; and, when SMOKE_EMAIL/SMOKE_PASSWORD are set, a real login works and the
// main read-only API routes answer with JSON. Nothing here writes data.

const AUTH_READS = ['/api/user/profile', '/api/accounts', '/api/companies', '/api/stocks', '/api/stocks/closed-trades', '/api/options']
const ANON_BLOCKED = ['/api/stocks', '/api/options', '/api/accounts']

export async function runSmoke({ baseUrl, fetch: f = fetch, readLocal = () => null, email, password, stamp = Date.now() }) {
  const base = baseUrl.replace(/\/+$/, '')
  const results = []
  const check = async (name, fn) => {
    try { const detail = await fn(); results.push({ name, ok: true, detail: detail || '' }) }
    catch (e) { results.push({ name, ok: false, detail: e && e.message ? e.message : String(e) }) }
  }
  const get = (p, headers) => f(`${base}${p}${p.includes('?') ? '&' : '?'}_smoke=${stamp}`, { headers, redirect: 'manual' })

  let html = ''
  await check('home page loads', async () => {
    const r = await get('/')
    if (r.status !== 200) throw new Error('GET / returned ' + r.status)
    html = await r.text()
    if (!/Generational Investing/.test(html)) throw new Error('page does not look like the app')
    return html.length + ' bytes'
  })

  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/static\/[^"?#]+)"/g)].map(m => m[1]))]
  await check('page references its scripts', async () => {
    if (!assets.some(a => a.endsWith('/app.js')) || !assets.some(a => a.endsWith('/calc.js'))) throw new Error('app.js or calc.js not referenced: ' + assets.join(', '))
    return assets.length + ' static files'
  })
  for (const a of assets) {
    await check(`static ${a}`, async () => {
      const r = await get(a)
      if (r.status !== 200) throw new Error('returned ' + r.status)
      const body = Buffer.from(await r.arrayBuffer())
      if (!body.length) throw new Error('empty response')
      if (a.endsWith('.js') && /^\s*</.test(body.toString('utf8', 0, 40))) throw new Error('served HTML instead of JavaScript (missing file?)')
      const local = readLocal(a)
      if (local && !Buffer.from(local).equals(body)) throw new Error('differs from the local build (stale deploy or cache?)')
      return body.length + ' bytes' + (local ? ', matches local' : '')
    })
  }

  for (const p of ANON_BLOCKED) {
    await check(`anonymous ${p} is refused`, async () => {
      const r = await get(p)
      if (r.status !== 401) throw new Error('expected 401, got ' + r.status)
    })
  }
  await check('wrong password is refused', async () => {
    const r = await f(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'smoke-test@invalid.example', password: 'not-a-real-password' }) })
    if (r.status !== 401) throw new Error('expected 401, got ' + r.status)
  })

  await check('forged token is refused', async () => {
    const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url')
    const forged = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ userId: 1, email: 'x@example.com' })}.${Buffer.from('forged').toString('base64url')}`
    const r = await get('/api/user/profile', { Authorization: 'Bearer ' + forged })
    if (r.status !== 401) throw new Error('expected 401, got ' + r.status)
  })

  if (!email || !password) {
    results.push({ name: 'authenticated checks', ok: true, skipped: true, detail: 'skipped (set SMOKE_EMAIL and SMOKE_PASSWORD to enable)' })
    return results
  }
  let token = ''
  await check('login works', async () => {
    const r = await f(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
    if (r.status !== 200) throw new Error('login returned ' + r.status)
    token = (await r.json()).token
    if (!token) throw new Error('no token in the login response')
  })
  if (token) {
    for (const p of AUTH_READS) {
      await check(`GET ${p}`, async () => {
        const r = await get(p, { Authorization: 'Bearer ' + token })
        if (r.status !== 200) throw new Error('returned ' + r.status)
        const ct = r.headers.get('content-type') || ''
        if (!/json/.test(ct)) throw new Error('not JSON (' + ct + ')')
        await r.json()
      })
    }
  }
  return results
}

export function summarize(results) {
  const failed = results.filter(r => !r.ok)
  const lines = results.map(r => `${r.ok ? (r.skipped ? '-' : 'ok  ') : 'FAIL'} ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`)
  lines.push('', failed.length ? `SMOKE TEST FAILED: ${failed.length} of ${results.length} checks` : `Smoke test passed: ${results.filter(r => !r.skipped).length} checks`)
  return { failed: failed.length, text: lines.join('\n') }
}
