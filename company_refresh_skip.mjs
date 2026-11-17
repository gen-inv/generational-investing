// Nightly refresh: skip everything on the Discovery ETF list (plus FNNCF and FTN.TO), clear stale errors on skipped funds, 10-second limit on every outside call.
import fs from 'node:fs'

const P = { lib: 'src/lib/refresh-company-data.ts', test: 'src/lib/refresh-company-data.test.ts', comp: 'src/routes/companies.ts' }
const die = (m) => { console.error('\nABORT: ' + m + '\nNothing was changed.'); process.exit(1) }
for (const f of Object.values(P)) if (!fs.existsSync(f)) die(f + ' not found -- run this from the repo root, after company_refresh.mjs')
const load = (f) => { const raw = fs.readFileSync(f, 'utf8'); return { f, eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') } }
const files = { lib: load(P.lib), test: load(P.test), comp: load(P.comp) }
if (files.lib.text.includes('export const ALWAYS_SKIP')) die('this installer looks already applied')

const edits = []
const E = (file, what, find, rep) => edits.push({ file, what, find, rep })

E('lib', 'interface: error field', '  refreshed_at: string | null\n', (m) => m + '  data_refresh_error?: string | null\n')
E('lib', 'excluded companies', 'export function earningsPassedOrMissing(r: RosterTicker, today: string): boolean {',
  (m) => `// Companies that are really funds, which the sector/exchange check cannot spot
export const ALWAYS_SKIP = ['FNNCF', 'FTN.TO']

// Never refreshed: funds, indices, anything on the Discovery ETF list
export function isExcluded(r: RosterTicker, etfs: Set<string>): boolean {
  return isFundOrIndex(r) || ALWAYS_SKIP.includes(r.ticker) || etfs.has(r.ticker)
}

` + m)
E('lib', 'pickBatch signature', 'export function pickBatch(rows: RosterTicker[], today: string, size: number = BATCH_SIZE): RosterTicker[] {',
  'export function pickBatch(rows: RosterTicker[], today: string, size: number = BATCH_SIZE, etfs: Set<string> = new Set()): RosterTicker[] {')
E('lib', 'pickBatch filter', '    .filter((r) => !isFundOrIndex(r))', '    .filter((r) => !isExcluded(r, etfs))')
E('lib', 'deps type', 'export async function refreshCompanyData(deps: { db: any; fetchFn: any; rapidApiKey?: string | null; now?: Date; batchSize?: number; maxFinanceBirdCalls?: number }): Promise<RefreshSummary> {',
  'export async function refreshCompanyData(deps: { db: any; fetchFn: any; rapidApiKey?: string | null; now?: Date; batchSize?: number; maxFinanceBirdCalls?: number; etfTickers?: string[] }): Promise<RefreshSummary> {')
E('lib', 'select the stored error', "    'MAX(next_earnings_date) AS next_earnings_date, MAX(earnings_estimated) AS earnings_estimated, ' +\n",
  (m) => m + "    'MAX(data_refresh_error) AS data_refresh_error, ' +\n")
E('lib', 'batch with the ETF list', '  const batch = pickBatch((result.results || []) as RosterTicker[], today, deps.batchSize || BATCH_SIZE)\n',
  `  const all = (result.results || []) as RosterTicker[]
  const etfs = new Set((deps.etfTickers || []).map((t) => String(t).toUpperCase()))
  // a fund never gets a refresh, and an error left on one earlier is cleared so it stops showing on the roster
  for (const r of all) {
    if (isExcluded(r, etfs) && r.data_refresh_error) {
      await db.prepare('UPDATE companies SET data_refresh_error = NULL WHERE ticker = ?').bind(r.ticker).run()
    }
  }
  const batch = pickBatch(all, today, deps.batchSize || BATCH_SIZE, etfs)
`)
E('lib', 'Yahoo timeout', "    const resp = await fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } })",
  "    const resp = await fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, signal: AbortSignal.timeout(10000) })")
E('lib', 'FinanceBird timeout', "              headers: { 'X-RapidAPI-Key': deps.rapidApiKey, 'X-RapidAPI-Host': 'financebird.p.rapidapi.com' },\n",
  (m) => m + '              signal: AbortSignal.timeout(10000),\n')
E('comp', 'route reads the ETF list', "  const summary = await refreshCompanyData({ db: env.DB, fetchFn: fetch, rapidApiKey: env.RAPIDAPI_KEY || null })\n",
  `  let etfTickers: string[] = []
  try {
    const etfs = await env.RESEARCH_DB.prepare('SELECT ticker FROM setup_etfs').all()
    etfTickers = (etfs.results || []).map((r: any) => r.ticker)
  } catch (e) {
    // the ETF list is a convenience: if it cannot be read the refresh still runs
  }
  const summary = await refreshCompanyData({ db: env.DB, fetchFn: fetch, rapidApiKey: env.RAPIDAPI_KEY || null, etfTickers })
`)

const count = (text, find) => text.split(find).length - 1
const misses = edits.map((e) => ({ e, n: count(files[e.file].text, e.find) })).filter((x) => x.n !== 1)
if (misses.length) die(misses.map((x) => '"' + x.e.what + '" in ' + files[x.e.file].f + ': expected exactly 1 match, found ' + x.n).join('\n') + '\n(the file differs from what I was shown)')
const next = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.text]))
for (const e of edits) next[e.file] = next[e.file].replace(e.find, typeof e.rep === 'function' ? e.rep : () => e.rep)

next.test = next.test.replace(/\s*$/, '\n') + `
describe('funds and the ETF list are never refreshed', () => {
  const now = new Date('2026-11-13T09:17:00Z')
  const yahooOk = jsonResp({ chart: { result: [{ meta: { marketCap: 2e12 } }] } })
  it('FNNCF and FTN.TO are skipped even though they look like companies', () => {
    const rows = [row({ ticker: 'FNNCF', sector: 'Financial Services', industry: 'Asset Management', exchange: 'PNK', refreshed_at: null }), row({ ticker: 'FTN.TO', sector: 'Financial Services', exchange: 'TOR', refreshed_at: null }), row({ ticker: 'AAA' })]
    expect(pickBatch(rows, TODAY).map((r) => r.ticker)).toEqual(['AAA'])
  })
  it('anything on the ETF list is skipped, in any letter case', async () => {
    const db = fakeDb([row({ ticker: 'SLV', sector: 'Basic Materials' }), row({ ticker: 'AAA' })])
    const out = await refreshCompanyData({ db, now, rapidApiKey: 'k', etfTickers: ['slv'], fetchFn: async () => yahooOk })
    expect(out.checked).toBe(1)
    expect(out.refreshed).toEqual(['AAA'])
  })
  it('an error left on a skipped fund is cleared so it stops showing on the roster', async () => {
    const db = fakeDb([row({ ticker: 'FNNCF', data_refresh_error: 'no market cap found' }), row({ ticker: 'AAA' })])
    await refreshCompanyData({ db, now, rapidApiKey: 'k', fetchFn: async () => yahooOk })
    expect(db.updates).toContainEqual(['FNNCF'])
  })
  it('a company that is not excluded still refreshes (SPCX is SpaceX, a real company)', async () => {
    const db = fakeDb([row({ ticker: 'SPCX', sector: 'Industrials', industry: 'Aerospace & Defense', market_cap: null, next_earnings_date: null })])
    const out = await refreshCompanyData({ db, now, rapidApiKey: 'k', fetchFn: async (u: string) => u.includes('financebird') ? jsonResp({}, false, 404) : yahooOk })
    expect(out.checked).toBe(1)
  })
})
`

for (const v of Object.values(files)) fs.writeFileSync(v.f + '.bak-skip', v.eol === '\r\n' ? v.text.replace(/\n/g, '\r\n') : v.text)
for (const [k, v] of Object.entries(files)) fs.writeFileSync(v.f, v.eol === '\r\n' ? next[k].replace(/\n/g, '\r\n') : next[k])
console.log('ok: funds and the ETF list are skipped, stale errors on them are cleared, outside calls time out after 10 seconds (3 files patched, backups *.bak-skip)')
console.log('next: npm test, then npm run deploy')
