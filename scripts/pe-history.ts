// Weekly job (GitHub Action "Refresh P/E history"): for every roster company, build a 10-year P/E range from SEC earnings
// and Yahoo prices, then post the results to the site. Run:  npx tsx scripts/pe-history.ts
import { computeCompanyPe, secKey } from '../src/lib/pe-fetch'
import type { PeResult } from '../src/lib/pe-store'

const SITE = (process.env.SITE_URL || 'https://generational-investing.pages.dev').replace(/\/$/, '')
const SECRET = process.env.REFRESH_SECRET || ''
// The SEC asks every caller to say who they are in the User-Agent (a name and an email)
const SEC_UA = process.env.SEC_USER_AGENT || 'GenerationalInvesting (github.com/gen-inv/generational-investing)'
const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const die = (msg: string): never => { console.error(msg); process.exit(1) }

const get = (url: string, ua: string) => fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) })

async function main() {
  if (!SECRET) die('REFRESH_SECRET is not set')

  const list = await fetch(SITE + '/api/cron/pe-history/companies', { headers: { Authorization: 'Bearer ' + SECRET }, signal: AbortSignal.timeout(30000) })
  if (!list.ok) die('could not get the company list from the site: HTTP ' + list.status)
  const tickers: string[] = ((await list.json()) as any).tickers || []
  if (!tickers.length) die('the site returned no companies')

  const tick = await get('https://www.sec.gov/files/company_tickers.json', SEC_UA)
  if (!tick.ok) die('could not get the SEC ticker list: HTTP ' + tick.status)
  const ciks = new Map<string, number>()
  for (const row of Object.values((await tick.json()) as Record<string, any>)) ciks.set(secKey(String(row.ticker)), Number(row.cik_str))

  const today = new Date().toISOString().slice(0, 10)
  const results: PeResult[] = []
  for (const ticker of tickers) {
    const r = await computeCompanyPe(ticker, {
      ciks, today,
      fetchSec: async (url) => { await sleep(250); return get(url, SEC_UA) },       // the SEC allows 10 requests a second; stay well under
      fetchYahoo: async (url) => { await sleep(150); return get(url, YAHOO_UA) },
    })
    results.push(r)
    console.log((r.summary ? 'ok     ' : 'n/a    ') + ticker + (r.error ? '  ' + r.error : ''))
  }

  let stored = 0, errors = 0
  for (let i = 0; i < results.length; i += 50) {
    const post = await fetch(SITE + '/api/cron/pe-history', {
      method: 'POST', headers: { Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: results.slice(i, i + 50) }), signal: AbortSignal.timeout(60000),
    })
    if (!post.ok) die('posting results failed: HTTP ' + post.status)
    const out = (await post.json()) as any
    stored += out.stored || 0; errors += out.errors || 0
  }
  const failed = results.filter(r => !r.summary).map(r => ({ ticker: r.ticker, error: r.error }))
  console.log(JSON.stringify({ checked: tickers.length, stored, errors, failed }))
}

main().catch(e => die('P/E history job failed: ' + (e && e.message ? e.message : String(e))))
