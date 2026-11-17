// Shows what the SEC and Yahoo return for one company and where the P/E calculation stops. Read-only; nothing is stored.
//   PowerShell:  $env:SEC_USER_AGENT = 'GenerationalInvesting you@example.com'; npx --yes tsx@4.19.2 scripts/pe-diagnose.ts COST
import { loadEpsFacts, loadPrices, secKey } from '../src/lib/pe-fetch'
import { buildQuarters, ttmSeries, ttmOn, currentPe, peSeries } from '../src/lib/pe-history'

const ticker = (process.argv[2] || '').trim()
if (!ticker) { console.error('usage: pe-diagnose.ts TICKER'); process.exit(1) }
const SEC_UA = process.env.SEC_USER_AGENT || 'GenerationalInvesting (github.com/gen-inv/generational-investing)'
const get = (url: string, ua: string) => fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

async function main() {
  const map = (await (await get('https://www.sec.gov/files/company_tickers.json', SEC_UA)).json()) as Record<string, any>
  const row = Object.values(map).find((r: any) => secKey(String(r.ticker)) === secKey(ticker)) as any
  console.log('ticker', ticker, '| SEC CIK', row ? row.cik_str : 'NOT FOUND')
  if (!row) return
  const eps = await loadEpsFacts(Number(row.cik_str), (u) => get(u, SEC_UA))
  if (!eps.ok) { console.log('EPS:', eps.error); return }
  const facts = eps.value
  console.log('EPS tag used:', eps.tag, '| rows:', facts.length)
  const periods = new Map<string, number>()
  for (const f of facts) periods.set(days(f.start, f.end) + ' days', (periods.get(days(f.start, f.end) + ' days') || 0) + 1)
  console.log('period lengths in the rows:', [...periods.entries()].sort().map(([k, v]) => k + ' x' + v).join(', '))
  const px = await loadPrices(ticker, (u) => get(u, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'), new Date().toISOString().slice(0, 10))
  if (!px.ok) { console.log('Prices:', px.error); return }
  const { prices, splits } = px.value
  console.log('prices:', prices.length, 'months, last', prices[prices.length - 1].date, prices[prices.length - 1].close, '| splits:', splits.map(s => s.date + ' x' + s.ratio).join(', ') || 'none')
  const q = buildQuarters(facts, splits)
  console.log('quarters built:', q.length, '(newest 10 below)')
  for (const x of q.slice(-10)) console.log('  ', x.start, '->', x.end, '(' + days(x.start, x.end) + 'd)', 'EPS', x.val.toFixed(3), 'available', x.available)
  const t = ttmSeries(q)
  console.log('TTM points:', t.length, '(newest 6 below)')
  for (const x of t.slice(-6)) console.log('  ', 'ending', x.end, 'EPS', x.eps.toFixed(3), 'available', x.available)
  const last = prices[prices.length - 1].date
  const on = ttmOn(last, t)
  console.log('TTM usable on', last + ':', on ? on.eps.toFixed(3) + ' (ending ' + on.end + ')' : 'NONE')
  const cur = currentPe(prices, t)
  console.log('current P/E:', cur ? cur.pe.toFixed(1) : 'none', '| monthly P/E points:', peSeries(prices, t).length)
}
main().catch((e) => { console.error('failed:', e && e.message ? e.message : e); process.exit(1) })
