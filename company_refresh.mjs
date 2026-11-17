// Nightly refresh of Market Cap and Next Earnings Date for the roster, in small batches, with an on-screen note when a refresh fails.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const T = (s) => s.replaceAll('@{', '${')
const P = {
  merge: 'public/static/research-merge.js', app: 'public/static/app.js', front: 'src/routes/frontend.ts', comp: 'src/routes/companies.ts',
  lib: 'src/lib/refresh-company-data.ts', libTest: 'src/lib/refresh-company-data.test.ts', uiTest: 'src/ui/refresh-note.test.ts',
  mig: 'migrations/0035_company_data_refresh.sql', wf: '.github/workflows/refresh-company-data.yml',
}
const die = (m) => { console.error('\nABORT: ' + m + '\nNothing was changed.'); process.exit(1) }
for (const f of [P.merge, P.app, P.front, P.comp]) if (!fs.existsSync(f)) die(f + ' not found -- run this from the repo root')
for (const f of [P.lib, P.libTest, P.uiTest, P.mig, P.wf]) if (fs.existsSync(f)) die(f + ' already exists -- this installer looks already applied')
if (!fs.existsSync('migrations/0034_create_user_preferences.sql')) die('expected migrations/0034_create_user_preferences.sql to be the latest migration')
for (const f of fs.readdirSync('public/static').filter((x) => x.endsWith('.js'))) {
  const s = fs.readFileSync('public/static/' + f, 'utf8')
  for (const name of ['refreshNoteHtml', 'showRefreshNote']) if (new RegExp('function ' + name + '\\b').test(s)) die('function ' + name + ' already exists in ' + f)
}
const load = (f) => { const raw = fs.readFileSync(f, 'utf8'); return { f, eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') } }
const files = { merge: load(P.merge), app: load(P.app), front: load(P.front), comp: load(P.comp) }

// ---------------------------------------------------------------- new files
const MIGRATION = `-- Nightly refresh of Market Cap and Next Earnings Date: when each company was last refreshed, why a refresh failed, and whether the earnings date is only an estimate
ALTER TABLE companies ADD COLUMN data_refreshed_at DATETIME;
ALTER TABLE companies ADD COLUMN data_refresh_error TEXT;
ALTER TABLE companies ADD COLUMN earnings_estimated INTEGER DEFAULT 0;
`

const WORKFLOW = T(String.raw`name: Refresh company data

# Every night: refresh Market Cap and Next Earnings Date for a small batch of roster companies.
# 09:17 UTC is 3:17 a.m. in Regina. Needs the repository secret COMPANY_REFRESH_SECRET (same value as the Cloudflare Pages secret).
on:
  schedule:
    - cron: '17 9 * * *'
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - name: Refresh market cap and earnings dates
        env:
          REFRESH_SECRET: @{{ secrets.COMPANY_REFRESH_SECRET }}
        run: |
          code=$(curl -s -o out.json -w '%{http_code}' -X POST -H "Authorization: Bearer $REFRESH_SECRET" https://generational-investing.pages.dev/api/cron/refresh-company-data)
          cat out.json; echo
          test "$code" = "200"
`)

const LIB = String.raw`// Nightly refresh of Market Cap and Next Earnings Date for the Company Roster, in small batches.
// Yahoo (free) is tried first; FinanceBird (RapidAPI, 20 calls a day on the free plan) only when Yahoo cannot supply the data.

export const BATCH_SIZE = 8
export const MAX_FINANCEBIRD_CALLS = 10

export interface RosterTicker {
  ticker: string
  exchange: string | null
  sector: string | null
  industry: string | null
  market_cap: number | null
  next_earnings_date: string | null
  earnings_estimated: number | null
  refreshed_at: string | null
}

export interface RefreshSummary {
  checked: number
  refreshed: string[]
  failed: { ticker: string; error: string }[]
  skipped: string[]
  financebirdCalls: number
}

// ETFs and indices have neither a market cap nor earnings: leave them alone
export function isFundOrIndex(r: RosterTicker): boolean {
  if (r.ticker.startsWith('^')) return true
  return !r.sector && !r.industry && (r.exchange === 'PCX' || r.exchange === 'WCB')
}

export function earningsPassedOrMissing(r: RosterTicker, today: string): boolean {
  return !r.next_earnings_date || r.next_earnings_date < today
}

// An estimated date is checked again when its turn comes round, so a real announcement replaces it
export function needsEarnings(r: RosterTicker, today: string): boolean {
  return earningsPassedOrMissing(r, today) || r.earnings_estimated === 1
}

// Up to size companies: missing or passed earnings dates first, then whoever was refreshed longest ago
export function pickBatch(rows: RosterTicker[], today: string, size: number = BATCH_SIZE): RosterTicker[] {
  return rows
    .filter((r) => !isFundOrIndex(r))
    .sort((a, b) => {
      const pa = earningsPassedOrMissing(a, today) ? 0 : 1
      const pb = earningsPassedOrMissing(b, today) ? 0 : 1
      if (pa !== pb) return pa - pb
      const ra = a.refreshed_at || '1970-01-01'
      const rb = b.refreshed_at || '1970-01-01'
      if (ra !== rb) return ra < rb ? -1 : 1
      return a.ticker < b.ticker ? -1 : 1
    })
    .slice(0, size)
}

function rawNumber(v: any): number | null {
  if (typeof v === 'number') return v
  if (v && typeof v.raw === 'number') return v.raw
  return null
}

function addThreeMonths(d: Date): Date {
  const e = new Date(d.getTime())
  e.setUTCMonth(e.getUTCMonth() + 3)
  return e
}

// Reads market cap and the next earnings date out of a FinanceBird summary response
export function parseSummary(json: any, today: string): { marketCap: number | null; earningsDate: string | null; estimated: boolean } {
  const r = json && json.quoteResponse && json.quoteResponse.result && json.quoteResponse.result[0]
  if (!r) return { marketCap: null, earningsDate: null, estimated: false }
  const cap = rawNumber(r.marketCap)
  const marketCap = cap && cap > 0 ? cap : null
  const ts = rawNumber(r.earningsTimestampEnd) || rawNumber(r.earningsTimestampStart) || rawNumber(r.earningsTimestamp)
  if (!ts) return { marketCap, earningsDate: null, estimated: false }
  const d = new Date(ts * 1000)
  const iso = d.toISOString().slice(0, 10)
  if (iso >= today) return { marketCap, earningsDate: iso, estimated: false }
  // the provider only knows the last report: assume the next one is a quarter later
  const est = addThreeMonths(d).toISOString().slice(0, 10)
  return { marketCap, earningsDate: est >= today ? est : null, estimated: est >= today }
}

async function yahooMarketCap(fetchFn: any, ticker: string): Promise<number | null> {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?interval=1d&range=1d'
    const resp = await fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } })
    if (!resp.ok) return null
    const data: any = await resp.json()
    const cap = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta && data.chart.result[0].meta.marketCap
    return typeof cap === 'number' && cap > 0 ? cap : null
  } catch (e) {
    return null
  }
}

export async function refreshCompanyData(deps: { db: any; fetchFn: any; rapidApiKey?: string | null; now?: Date; batchSize?: number; maxFinanceBirdCalls?: number }): Promise<RefreshSummary> {
  const { db, fetchFn } = deps
  const today = (deps.now || new Date()).toISOString().slice(0, 10)
  let budget = deps.maxFinanceBirdCalls === undefined ? MAX_FINANCEBIRD_CALLS : deps.maxFinanceBirdCalls
  const summary: RefreshSummary = { checked: 0, refreshed: [], failed: [], skipped: [], financebirdCalls: 0 }

  const result = await db.prepare(
    'SELECT ticker, MAX(exchange) AS exchange, MAX(sector) AS sector, MAX(industry) AS industry, MAX(market_cap) AS market_cap, ' +
    'MAX(next_earnings_date) AS next_earnings_date, MAX(earnings_estimated) AS earnings_estimated, ' +
    "MIN(COALESCE(data_refreshed_at, '1970-01-01')) AS refreshed_at FROM companies GROUP BY ticker"
  ).all()
  const batch = pickBatch((result.results || []) as RosterTicker[], today, deps.batchSize || BATCH_SIZE)

  for (const r of batch) {
    summary.checked++
    try {
      const needEarn = needsEarnings(r, today)
      let marketCap = await yahooMarketCap(fetchFn, r.ticker)
      let earningsDate: string | null = null
      let estimated = false
      const problems: string[] = []
      let skipped = false

      if (marketCap === null || needEarn) {
        if (!deps.rapidApiKey) {
          problems.push('FinanceBird key not configured')
        } else if (budget <= 0) {
          skipped = true
        } else {
          budget--
          summary.financebirdCalls++
          try {
            const resp = await fetchFn('https://financebird.p.rapidapi.com/quote/' + encodeURIComponent(r.ticker) + '/summary', {
              headers: { 'X-RapidAPI-Key': deps.rapidApiKey, 'X-RapidAPI-Host': 'financebird.p.rapidapi.com' },
            })
            if (resp.ok) {
              const parsed = parseSummary(await resp.json(), today)
              if (marketCap === null) marketCap = parsed.marketCap
              if (needEarn) { earningsDate = parsed.earningsDate; estimated = parsed.estimated }
            } else {
              problems.push('FinanceBird answered HTTP ' + resp.status)
            }
          } catch (e) {
            problems.push('FinanceBird request failed')
          }
        }
      }
      if (skipped) { summary.skipped.push(r.ticker); continue }
      if (marketCap === null) problems.push('no market cap found')
      if (needEarn && !earningsDate) problems.push('no earnings date found')

      const error = problems.length ? problems.join('; ') : null
      await db.prepare(
        'UPDATE companies SET market_cap = COALESCE(?, market_cap), next_earnings_date = COALESCE(?, next_earnings_date), ' +
        'earnings_estimated = CASE WHEN ? IS NULL THEN earnings_estimated ELSE ? END, ' +
        'data_refreshed_at = CURRENT_TIMESTAMP, data_refresh_error = ? WHERE ticker = ?'
      ).bind(marketCap, earningsDate, earningsDate, estimated ? 1 : 0, error, r.ticker).run()
      if (error) summary.failed.push({ ticker: r.ticker, error })
      else summary.refreshed.push(r.ticker)
    } catch (e: any) {
      summary.failed.push({ ticker: r.ticker, error: 'unexpected error: ' + (e && e.message ? e.message : String(e)) })
    }
  }
  return summary
}

// Compares two secrets without stopping at the first difference
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
`

const ROUTE = String.raw`// Nightly refresh of Market Cap and Next Earnings Date (called by the GitHub Action "Refresh company data")
routes.post('/api/cron/refresh-company-data', async (c) => {
  const env: any = c.env
  const given = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!env.COMPANY_REFRESH_SECRET || !safeEqual(given, env.COMPANY_REFRESH_SECRET)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const summary = await refreshCompanyData({ db: env.DB, fetchFn: fetch, rapidApiKey: env.RAPIDAPI_KEY || null })
  return c.json(summary)
})

`

const LIB_TEST = T(String.raw`import { describe, it, expect } from 'vitest'
import { pickBatch, parseSummary, refreshCompanyData, isFundOrIndex, safeEqual, BATCH_SIZE, type RosterTicker } from './refresh-company-data'

const TODAY = '2026-11-13'
const row = (o: Partial<RosterTicker>): RosterTicker => ({ ticker: 'AAA', exchange: 'NMS', sector: 'Technology', industry: 'Software', market_cap: 1e9, next_earnings_date: '2027-01-30', earnings_estimated: 0, refreshed_at: '2026-11-10', ...o })

describe('which companies are checked tonight', () => {
  it('skips ETFs and indices', () => {
    expect(isFundOrIndex(row({ ticker: '^SPX', sector: null, industry: null, exchange: 'WCB' }))).toBe(true)
    expect(isFundOrIndex(row({ ticker: 'GOOY', sector: null, industry: null, exchange: 'PCX' }))).toBe(true)
    expect(isFundOrIndex(row({ ticker: 'BAC', sector: 'Financial Services' }))).toBe(false)
  })
  it('missing or passed earnings dates come first, then the longest since refreshed', () => {
    const rows = [
      row({ ticker: 'NEW', refreshed_at: '2026-11-12' }),
      row({ ticker: 'OLD', refreshed_at: '2026-10-01' }),
      row({ ticker: 'PASSED', next_earnings_date: '2026-11-01', refreshed_at: '2026-11-12' }),
      row({ ticker: 'NODATE', next_earnings_date: null, refreshed_at: '2026-11-12' }),
    ]
    expect(pickBatch(rows, TODAY, 4).map((r) => r.ticker)).toEqual(['NODATE', 'PASSED', 'OLD', 'NEW'])
  })
  it('never more than the batch size, and a never-refreshed company goes before a recent one', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ ticker: 'T' + String(i).padStart(2, '0'), refreshed_at: '2026-11-10' }))
    rows.push(row({ ticker: 'FRESH', refreshed_at: null }))
    const picked = pickBatch(rows, TODAY)
    expect(picked).toHaveLength(BATCH_SIZE)
    expect(picked[0].ticker).toBe('FRESH')
  })
})

describe('reading a FinanceBird summary', () => {
  const summary = (r: any) => ({ quoteResponse: { result: [r] } })
  it('reads market cap and a future earnings date', () => {
    const ts = Date.UTC(2026, 11, 3) / 1000
    expect(parseSummary(summary({ marketCap: { raw: 3.9e12 }, earningsTimestampEnd: { raw: ts } }), TODAY)).toEqual({ marketCap: 3.9e12, earningsDate: '2026-12-03', estimated: false })
  })
  it('a plain number market cap works too', () => {
    expect(parseSummary(summary({ marketCap: 5e9 }), TODAY).marketCap).toBe(5e9)
  })
  it('when the provider only knows the last report, the next date is an estimate a quarter later', () => {
    const ts = Date.UTC(2026, 9, 28) / 1000
    expect(parseSummary(summary({ earningsTimestamp: { raw: ts } }), TODAY)).toMatchObject({ earningsDate: '2027-01-28', estimated: true })
  })
  it('nothing usable gives nulls', () => {
    expect(parseSummary({}, TODAY)).toEqual({ marketCap: null, earningsDate: null, estimated: false })
    expect(parseSummary(summary({}), TODAY)).toMatchObject({ marketCap: null, earningsDate: null })
  })
})

function fakeDb(rows: any[]) {
  const updates: any[][] = []
  return {
    updates,
    prepare(sql: string) {
      return {
        all: async () => ({ results: rows }),
        bind: (...args: any[]) => ({ run: async () => { updates.push(args); return {} } }),
      }
    },
  }
}
const jsonResp = (body: any, ok = true, status = 200) => ({ ok, status, json: async () => body })

describe('the nightly run', () => {
  const now = new Date('2026-11-13T09:17:00Z')
  const yahooOk = jsonResp({ chart: { result: [{ meta: { marketCap: 2e12 } }] } })
  const yahooNone = jsonResp({ chart: { result: [{ meta: {} }] } })

  it('a company with a market cap from Yahoo and a future earnings date needs no FinanceBird call', async () => {
    const db = fakeDb([row({ ticker: 'AAA' })])
    const calls: string[] = []
    const out = await refreshCompanyData({ db, now, rapidApiKey: 'k', fetchFn: async (u: string) => { calls.push(u); return yahooOk } })
    expect(out.refreshed).toEqual(['AAA'])
    expect(out.financebirdCalls).toBe(0)
    expect(calls.some((u) => u.includes('financebird'))).toBe(false)
    expect(db.updates[0][0]).toBe(2e12)
    expect(db.updates[0][4]).toBeNull()
  })
  it('a passed earnings date is refreshed from FinanceBird, and market cap is taken from it when Yahoo has none', async () => {
    const db = fakeDb([row({ ticker: 'BBB', next_earnings_date: '2026-11-01' })])
    const ts = Date.UTC(2027, 0, 20) / 1000
    const out = await refreshCompanyData({ db, now, rapidApiKey: 'k', fetchFn: async (u: string) => u.includes('financebird') ? jsonResp({ quoteResponse: { result: [{ marketCap: { raw: 7e10 }, earningsTimestampEnd: { raw: ts } }] } }) : yahooNone })
    expect(out.refreshed).toEqual(['BBB'])
    expect(db.updates[0].slice(0, 4)).toEqual([7e10, '2027-01-20', '2027-01-20', 0])
  })
  it('a failure is recorded for the roster note, and the other companies still run', async () => {
    const db = fakeDb([row({ ticker: 'BAD', refreshed_at: '2026-01-01' }), row({ ticker: 'GOOD', refreshed_at: '2026-02-01' })])
    const out = await refreshCompanyData({ db, now, rapidApiKey: 'k', fetchFn: async (u: string) => {
      if (u.includes('/BAD')) return u.includes('financebird') ? jsonResp({}, false, 500) : yahooNone
      return yahooOk
    } })
    expect(out.failed.map((f) => f.ticker)).toEqual(['BAD'])
    expect(out.failed[0].error).toContain('no market cap found')
    expect(out.refreshed).toEqual(['GOOD'])
    expect(db.updates).toHaveLength(2)
  })
  it('a failed lookup never blanks an existing value (nulls are passed to COALESCE)', async () => {
    const db = fakeDb([row({ ticker: 'KEEP', next_earnings_date: '2026-11-01' })])
    await refreshCompanyData({ db, now, rapidApiKey: 'k', fetchFn: async () => jsonResp({}, false, 500) })
    expect(db.updates[0].slice(0, 3)).toEqual([null, null, null])
  })
  it('never makes more FinanceBird calls than the daily limit allows, and leaves the rest for tomorrow', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ ticker: 'X' + i, next_earnings_date: null }))
    const db = fakeDb(rows)
    const out = await refreshCompanyData({ db, now, rapidApiKey: 'k', maxFinanceBirdCalls: 3, fetchFn: async (u: string) => u.includes('financebird') ? jsonResp({ quoteResponse: { result: [{ marketCap: 1e9, earningsTimestampEnd: { raw: Date.UTC(2027, 0, 5) / 1000 } }] } }) : yahooNone })
    expect(out.financebirdCalls).toBe(3)
    expect(out.refreshed).toHaveLength(3)
    expect(out.skipped).toHaveLength(5)
    expect(db.updates).toHaveLength(3)
  })
})

describe('the shared secret check', () => {
  it('accepts only the exact secret', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true)
    expect(safeEqual('abc123', 'abc124')).toBe(false)
    expect(safeEqual('abc', 'abc123')).toBe(false)
  })
})
`)

const UI_TEST = T(String.raw`// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

const w = () => window as any
const src = fs.readFileSync(path.resolve(__dirname, '../../public/static/research-merge.js'), 'utf8')
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../..', p), 'utf8')

beforeEach(() => {
  w().eval(src)
  document.body.innerHTML = '<div id="card"><div id="wrap"><table><tbody id="companies-table"></tbody></table></div></div>'
})

describe('roster note for failed refreshes', () => {
  it('shows nothing when every company refreshed', () => {
    expect(w().refreshNoteHtml([{ ticker: 'AAA' }, { ticker: 'BBB', data_refresh_error: null }])).toBe('')
  })
  it('names the companies that failed, with the reasons on hover', () => {
    const html = w().refreshNoteHtml([{ ticker: 'BAC', data_refresh_error: 'no market cap found' }, { ticker: 'AAA' }, { ticker: 'MU', data_refresh_error: 'no earnings date found' }])
    expect(html).toContain('BAC, MU')
    expect(html).toContain('BAC: no market cap found')
    expect(html).not.toContain('AAA')
  })
  it('escapes anything odd in the error text', () => {
    expect(w().refreshNoteHtml([{ ticker: 'X', data_refresh_error: '<b>"x"</b>' }])).not.toContain('<b>')
  })
  it('puts the note above the roster table, and replaces it on the next visit instead of stacking', () => {
    w().showRefreshNote([{ ticker: 'BAC', data_refresh_error: 'no market cap found' }])
    w().showRefreshNote([{ ticker: 'BAC', data_refresh_error: 'no market cap found' }])
    expect(document.querySelectorAll('#companies-refresh-note')).toHaveLength(1)
    expect(document.getElementById('wrap')!.previousElementSibling!.id).toBe('companies-refresh-note')
    w().showRefreshNote([{ ticker: 'BAC' }])
    expect(document.getElementById('companies-refresh-note')).toBeNull()
  })
  it('the roster calls it when it loads, and an estimated earnings date is marked with ~', () => {
    expect(read('public/static/app.js')).toContain('showRefreshNote(companies)')
    expect(w().earningsCellHtml({ next_earnings_date: '2099-01-01', earnings_estimated: 1 })).toContain('~')
    expect(w().earningsCellHtml({ next_earnings_date: '2099-01-01', earnings_estimated: 0 })).not.toContain('~')
  })
})

describe('nightly job wiring', () => {
  it('the workflow runs every night and can be started by hand', () => {
    const wf = read('.github/workflows/refresh-company-data.yml')
    expect(wf).toContain("cron: '17 9 * * *'")
    expect(wf).toContain('workflow_dispatch')
    expect(wf).toContain('/api/cron/refresh-company-data')
  })
  it('the route checks the secret before doing anything', () => {
    const route = read('src/routes/companies.ts')
    expect(route).toContain("'/api/cron/refresh-company-data'")
    expect(route.indexOf('safeEqual(given')).toBeLessThan(route.indexOf('refreshCompanyData({'))
  })
  it('the migration adds the three columns', () => {
    const m = read('migrations/0035_company_data_refresh.sql')
    for (const c of ['data_refreshed_at', 'data_refresh_error', 'earnings_estimated']) expect(m).toContain(c)
  })
})
`)

const NOTE_FNS = T(String.raw`

// ---- Note above the roster when the nightly update could not refresh some companies ----

function refreshNoteHtml(companies) {
    var failed = (companies || []).filter(function (c) { return c && c.data_refresh_error })
    if (!failed.length) return ''
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
    var names = failed.map(function (c) { return esc(c.ticker) }).join(', ')
    var detail = failed.map(function (c) { return esc(c.ticker) + ': ' + esc(c.data_refresh_error) }).join('; ')
    return '<div id="companies-refresh-note" class="mb-3 px-4 py-3 rounded border border-amber-300 bg-amber-50 text-amber-800 text-sm" title="' + detail + '"><i class="fas fa-exclamation-triangle mr-2"></i>The nightly update could not refresh Market Cap or Next Earnings for ' + names + '. It will try again; hover for details.</div>'
}

function showRefreshNote(companies) {
    var old = document.getElementById('companies-refresh-note')
    if (old) old.remove()
    var html = refreshNoteHtml(companies)
    if (!html) return
    var body = document.getElementById('companies-table')
    var table = body && body.closest('table')
    if (table && table.parentElement) table.parentElement.insertAdjacentHTML('beforebegin', html)
}
`)

// ---------------------------------------------------------------- edits to existing files
const edits = []
const E = (file, what, find, rep) => edits.push({ file, what, find, rep })
E('comp', 'import the refresh code', "import { addCompanyToRoster } from '../lib/add-company'\n", (m) => m + "import { refreshCompanyData, safeEqual } from '../lib/refresh-company-data'\n")
E('comp', 'add the nightly route', '// Fetch earnings date for a company\n', (m) => ROUTE + m)
E('app', 'roster shows the refresh note', /([ \t]*)let companies = await fetchCompaniesWithResearch\(\)\n/, (m, ind) => m + ind + 'showRefreshNote(companies)\n')
E('merge', 'estimated earnings marked with ~ (flag)', "    if (s.state === 'none') return '-'\n", (m) => m + '    var est = !!company && Number(company.earnings_estimated) === 1\n')
E('merge', 'estimated earnings marked with ~ (text)', "    var text = new Date(s.year, s.month - 1, s.day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })\n", (m) => m + "    if (est) text = '~' + text\n")
E('merge', 'estimated earnings marked with ~ (hover)', "    var when = s.days === 0 ? 'Earnings today' : 'Earnings in ' + s.days + (s.days === 1 ? ' day' : ' days')\n", (m) => m + "    if (est) when += ' (estimated until the company announces its date)'\n")
E('front', 'legend: explain ~', 'grey</span> = the date has passed and needs a refresh.</p>', 'grey</span> = the date has passed and needs a refresh. A ~ in front of a date means it is an estimate until the company announces it.</p>')

const count = (text, find) => typeof find === 'string' ? text.split(find).length - 1 : [...text.matchAll(new RegExp(find.source, 'g'))].length
const misses = edits.map((e) => ({ e, n: count(files[e.file].text, e.find) })).filter((x) => x.n !== 1)
if (misses.length) die(misses.map((x) => '"' + x.e.what + '" in ' + files[x.e.file].f + ': expected exactly 1 match, found ' + x.n).join('\n') + '\n(the file differs from what I was shown)')
const next = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.text]))
for (const e of edits) next[e.file] = next[e.file].replace(e.find, typeof e.rep === 'function' ? e.rep : () => e.rep)
next.merge = next.merge.replace(/\s*$/, '\n') + NOTE_FNS

const syntax = (code) => { const tmp = path.join(os.tmpdir(), 'refresh-check-' + process.pid + '.js'); fs.writeFileSync(tmp, code); const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' }); fs.unlinkSync(tmp); return r }
for (const k of ['merge', 'app']) {
  const before = syntax(files[k].text), after = syntax(next[k])
  if (before.status === 0 && after.status !== 0) die(files[k].f + ' would no longer parse:\n' + after.stderr.split('\n').slice(0, 6).join('\n'))
}

// ---------------------------------------------------------------- write
for (const v of Object.values(files)) fs.writeFileSync(v.f + '.bak-refresh', v.eol === '\r\n' ? v.text.replace(/\n/g, '\r\n') : v.text)
for (const [k, v] of Object.entries(files)) fs.writeFileSync(v.f, v.eol === '\r\n' ? next[k].replace(/\n/g, '\r\n') : next[k])
fs.mkdirSync('.github/workflows', { recursive: true })
fs.writeFileSync(P.lib, LIB)
fs.writeFileSync(P.libTest, LIB_TEST)
fs.writeFileSync(P.uiTest, UI_TEST)
fs.writeFileSync(P.mig, MIGRATION)
fs.writeFileSync(P.wf, WORKFLOW)
console.log('ok: nightly company refresh installed (4 files patched, backups *.bak-refresh; 5 new files)')
console.log('next: npm test; apply migration 0035; set COMPANY_REFRESH_SECRET; deploy; commit and push; run the workflow once by hand')
