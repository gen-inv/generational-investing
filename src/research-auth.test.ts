import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { isValidTicker, safeEqual, MAX_USER_NOTES } from './lib/research-auth'

const api = fs.readFileSync('src/research-api.ts', 'utf8')
const app = fs.readFileSync('public/static/app.js', 'utf8')

describe('research routes are not public', () => {
  const registrations = [...api.matchAll(/researchApp\.(get|post|put|delete|patch)\(\s*'([^']+)'\s*,\s*([A-Za-z]+)/g)]

  it('finds the route registrations', () => {
    expect(registrations.length).toBeGreaterThanOrEqual(15)
  })

  it('every research route sits behind a login or the ingest token', () => {
    // The prune route checks the signed-in user itself (and index.tsx adds the login middleware in front of it).
    const selfChecked = new Set(['post /:ticker/notes/prune'])
    const open = registrations
      .filter(m => !['researchAuthMiddleware', 'researchAccessMiddleware'].includes(m[3]))
      .map(m => `${m[1]} ${m[2]}`)
      .filter(r => !selfChecked.has(r))
    expect(open).toEqual([])
  })

  it('the prune route still refuses without a signed-in user', () => {
    expect(api).toMatch(/notes\/prune[\s\S]{0,200}get\('userId'\)/)
  })
})

describe('front end uses this site only, with the login token', () => {
  it('has no calls to the retired research site or the pages.dev address', () => {
    expect(app).not.toMatch(/research-e79/)
    expect(app).not.toMatch(/generational-investing\.pages\.dev/)
    expect(app).not.toMatch(/\bRESEARCH_API\b/)
  })
  it('sends the login token on research calls', () => {
    expect(app).toMatch(/axios\.interceptors\.request\.use/)
    expect(app).toMatch(/function researchFetch/)
    // The helper itself is the one place allowed to call fetch on a research route.
    const withoutHelper = app.replace(/function researchFetch[\s\S]*?\r?\n}\r?\n/, '')
    expect(withoutHelper).not.toMatch(/\bfetch\(\s*['"`][^'"`]*\/api\/research/)
  })
})

describe('helpers', () => {
  it('accepts real tickers and rejects anything else', () => {
    for (const t of ['AAPL', 'BRK.B', 'BRK-B', 'FTN.TO', 'GOOY', '7203.T']) expect(isValidTicker(t)).toBe(true)
    for (const t of ['', '.A', 'AAPL;DROP', 'A B', 'a', 'TOOLONGTICKER1', '<script>', 'AAPL/../x']) expect(isValidTicker(t)).toBe(false)
  })
  it('compares tokens exactly', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', 'a')).toBe(false)
  })
  it('caps research notes', () => { expect(MAX_USER_NOTES).toBe(5000) })
})
