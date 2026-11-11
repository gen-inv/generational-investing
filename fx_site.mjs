// Discovery > Forex setups: the website side of the forex support/resistance scan (scan type "fx").
// Run from the repo root:  node fx_site.mjs     (CRLF-aware; every edit must match exactly once or nothing is written)
import fs from 'node:fs'

function patch(file, edits) {
  let s = fs.readFileSync(file, 'utf8')
  const crlf = s.includes('\r\n')
  s = s.replace(/\r\n/g, '\n')
  for (const [what, oldS, newS] of edits) {
    const n = s.split(oldS).length - 1
    if (n !== 1) { console.error('ABORT (' + file + '): expected 1 match for "' + what + '", found ' + n + '. Nothing was written.'); process.exit(1) }
    s = s.replace(oldS, () => newS)
  }
  return { file, text: crlf ? s.replace(/\n/g, '\r\n') : s }
}

// ------------------------------------------------------------ API: accept the fx scan type
const api = patch('src/routes/discovery.ts', [
  ['scan types', "export const SCAN_TYPES = ['guru', 'maturing', 'event', 'setup']", "export const SCAN_TYPES = ['guru', 'maturing', 'event', 'setup', 'fx']"],
  ['retention if', "if (body.scan_type === 'setup') {", "if (body.scan_type === 'setup' || body.scan_type === 'fx') {"],
  ['retention sql', "WHERE scan_type = 'setup' AND found_at < ?\").bind(new Date(", "WHERE scan_type = ? AND found_at < ?\").bind(body.scan_type, new Date("],
  ['data size', "(body.scan_type === 'setup' ? MAX.setupData : MAX.data)", "(body.scan_type === 'setup' || body.scan_type === 'fx' ? MAX.setupData : MAX.data)"],
])

// ------------------------------------------------------------ the menu button
const front = patch('src/routes/frontend.ts', [
  ['forex button', "<button data-discovery-tab=\"setup\" onclick=\"setDiscoveryTab('setup')\" class=\"px-4 py-2 rounded font-semibold text-sm\">Trade setups</button>",
   "<button data-discovery-tab=\"setup\" onclick=\"setDiscoveryTab('setup')\" class=\"px-4 py-2 rounded font-semibold text-sm\">Trade setups</button>\n            <button data-discovery-tab=\"fx\" onclick=\"setDiscoveryTab('fx')\" class=\"px-4 py-2 rounded font-semibold text-sm\">Forex setups</button>"],
])

// ------------------------------------------------------------ the page
const FX_RULES = String.raw`  // Forex setups: how they are found (the Trade setups engine, run on a fixed list of currency pairs)
  function fxRulesPanel() {
    var items = [
      ['Pairs', 'A fixed list of 11 major and cross pairs (EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD, EUR/JPY, GBP/JPY, EUR/GBP, AUD/JPY), checked on daily bars once each weekday morning. The list is kept on the research machine for now.'],
      ['A level with 3 touches', 'Support or resistance is a line through at least 3 swing points that price then moved away from, each at least 3 sessions apart. Every touch sits within 0.4 ATR of the line, and at least 2 of them are the level\'s own kind (a level that flipped from support to resistance, or the reverse, counts for the rest).'],
      ['A signal candle at the level', 'A bullish or bearish engulfing candle, or an arrival candle followed by a reversal candle, after price has run into the level. Hammer and hanging-man candles are not used: forex has no volume to vet them.'],
      ['Oscillator confirmation', 'At least 1 of 3 must confirm: RSI(14) at or below 35 (at or above 65 for resistance), slow stochastic at or below 20 (80) and turning, or the MACD histogram moving the right way.'],
      ['Trigger and confirmation', 'It triggers when price trades one pip beyond the candle (0.0001, or 0.01 on yen pairs), is confirmed by a daily close beyond it within 3 sessions, and fails on a close back through the other end of the candle. A confirmed setup stays listed for 2 more sessions.']
    ]
    return '<details class="mb-4 border border-gray-200 rounded bg-gray-50" data-rules-panel>' +
      '<summary class="cursor-pointer px-4 py-2 font-semibold text-gray-700">How these setups are found</summary>' +
      '<div class="px-4 pb-4 text-sm text-gray-700"><ol class="list-decimal pl-5 space-y-2">' +
      items.map(function (it) { return '<li><span class="font-semibold">' + escapeHtml(it[0]) + '.</span> ' + escapeHtml(it[1]) + '</li>' }).join('') + '</ol>' +
      '<div class="mt-3 text-gray-500">ATR = average true range over 14 sessions. Prices have 5 decimals (3 for yen pairs). Failed and expired setups are hidden unless you choose to show them. The oscillators are on the StockCharts link for every row.</div>' +
      '</div></details>'
  }

  function render(state, tab, now, opts) {`

const page = patch('public/static/discovery.js', [
  ['fx tab', "every: 2, unit: 'setups' }\n  }", "every: 2, unit: 'setups' },\n    fx: { label: 'Forex setups', emptyText: 'No forex setups right now. The screen runs each weekday morning on daily bars; a confirmed setup stays listed for two more sessions.', every: 2, unit: 'setups' }\n  }"],
  ['isSetupTab', "  // Trade setups: say only whether the latest run found anything new", "  // The Trade setups and Forex setups tabs share one layout\n  function isSetupTab(t) { return t === 'setup' || t === 'fx' }\n\n  // Trade setups: say only whether the latest run found anything new"],
  ['status line tab', "    if (tab === 'setup') {\n      bits.push(newSetupsText(scan, findings))", "    if (isSetupTab(tab)) {\n      bits.push(newSetupsText(scan, findings))"],
  ['status note', "if (scan.note && tab !== 'setup')", "if (scan.note && !isSetupTab(tab))"],
  ['render tab', "    if (tab === 'setup') {\n      var showPast", "    if (isSetupTab(tab)) {\n      var showPast"],
  ['render list', "list: (tab === 'setup' ? rulesPanel(opts && opts.etfs) + toggle : '') + (list.length ? (tab === 'setup' ? renderSetups(list, now) : renderFindings(list))",
   "list: (tab === 'setup' ? rulesPanel(opts && opts.etfs) + toggle : tab === 'fx' ? fxRulesPanel() + toggle : '') + (list.length ? (isSetupTab(tab) ? renderSetups(list, now) : renderFindings(list))"],
  ['rules panel', "  function render(state, tab, now, opts) {", FX_RULES],
  ['no earnings for fx', "if (!d || d.kind === 'etf') return null", "if (!d || d.kind === 'etf' || d.kind === 'fx') return null"],
  ['stockcharts link', "stockChartsUrl(f.ticker)", "stockChartsUrl(d.kind === 'fx' ? '$' + f.ticker : f.ticker)"],
  ['price formatter', "  function stockChartsUrl(ticker) {", "  // Forex prices carry their own decimals (5, or 3 for yen pairs) and no dollar sign\n  function priceFmt(d) {\n    if (d && d.kind === 'fx' && num(d.decimals) !== null) {\n      var dp = num(d.decimals)\n      return function (v) { var n = num(v); return n === null ? '' : n.toFixed(dp) }\n    }\n    return money\n  }\n\n  function stockChartsUrl(ticker) {"],
  ['signal line prices', "  function signalLine(d, bull) {\n    var name = d.pattern", "  function signalLine(d, bull) {\n    var money = priceFmt(d)\n    var name = d.pattern"],
  ['chart width', "L = 54, R = 76, T = 8, B = 18", "L = 54, R = (d && d.kind === 'fx' ? 104 : 76), T = 8, B = 18"],
  ['chart decimals', "    var n = cs.length, plotW = W - L - R, step = plotW / n, bw = Math.max(2, step * 0.62)\n", "    var n = cs.length, plotW = W - L - R, step = plotW / n, bw = Math.max(2, step * 0.62)\n    var dp = d && d.kind === 'fx' && num(d.decimals) !== null ? num(d.decimals) : 2\n"],
  ['chart axis', "' + gp.toFixed(2) + '", "' + gp.toFixed(dp) + '"],
  ['chart labels', "label + ' ' + p.toFixed(2)", "label + ' ' + p.toFixed(dp)"],
  ['macd decimals', "fix(c.macd.hist, 3)", "fix(c.macd.hist, d.kind === 'fx' ? 5 : 3)"],
])

// ------------------------------------------------------------ tests
const apiTest = String.raw`import { describe, it, expect, vi } from 'vitest'

// The forex scan posts to the same Discovery API as the trade-setup scan, under scan type "fx".
vi.mock('../lib/auth', () => ({ verifyToken: async () => null }))
import { routes } from './discovery'

const TOKEN = 'ingest-secret'
const make = () => {
  const log: { sql: string; args: any[] }[] = []
  const prepare = vi.fn((sql: string) => ({
    bind: (...args: any[]) => {
      log.push({ sql, args })
      return { run: async () => ({ meta: { last_row_id: 5 } }), first: async () => null, all: async () => ({ results: [] }) }
    },
    all: async () => ({ results: [] }),
  }))
  return { env: { RESEARCH_INGEST_TOKEN: TOKEN, JWT_SECRET: 'x', RESEARCH_DB: { prepare } }, log }
}
const post = (env: any, path: string, body: any) =>
  routes.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(body) }, env)

describe('forex scan type', () => {
  it('accepts an fx scan record and clears fx findings older than 45 days', async () => {
    const { env, log } = make()
    const res = await post(env, '/scans', { scan_type: 'fx', candidates_found: 1, status: 'ok', note: 'Scanned 11 pairs' })
    expect(res.status).toBe(200)
    const del = log.find((q) => q.sql.includes('DELETE FROM discovery_findings'))!
    expect(del.args[0]).toBe('fx')
    expect(del.sql).toContain('scan_type = ?')
  })
  it('still clears only setup findings when the trade-setup scan reports', async () => {
    const { env, log } = make()
    await post(env, '/scans', { scan_type: 'setup', candidates_found: 0 })
    expect(log.find((q) => q.sql.includes('DELETE FROM discovery_findings'))!.args[0]).toBe('setup')
  })
  it('does not clear anything when another scan reports', async () => {
    const { env, log } = make()
    await post(env, '/scans', { scan_type: 'guru', gurus_scanned: 3 })
    expect(log.some((q) => q.sql.includes('DELETE FROM discovery_findings'))).toBe(false)
  })
  it('accepts an fx finding with chart data up to the trade-setup size, and refuses it for a guru finding', async () => {
    const { env } = make()
    const big = { pad: 'x'.repeat(12000) }
    const body = (t: string) => ({ scan_type: t, ticker: 'EURUSD', headline: 'Bullish engulfing at support 1.08430', data: big })
    expect((await post(env, '/findings', body('fx'))).status).toBe(201)
    expect((await post(env, '/findings', body('guru'))).status).toBe(400)
  })
  it('refuses an unknown scan type and says fx is allowed', async () => {
    const { env } = make()
    const res = await post(env, '/scans', { scan_type: 'crypto' })
    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('fx')
  })
  it('lists fx findings with the others', async () => {
    const { env, log } = make()
    const res = await routes.request('/', { headers: { Authorization: 'Bearer ' + TOKEN } }, env)
    expect(res.status).toBe(200)
    expect(log.some((q) => q.args[0] === 'fx')).toBe(true)
  })
})
`

const uiTest = String.raw`// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(path.resolve(__dirname, '../../public/static/discovery.js'), 'utf8')
const w = () => window as any
w().eval(src)
const V = () => w().DiscoveryView
const NOW = Date.parse('2026-11-11T18:00:00Z')

const candlesAt = (base: number, step: number) => Array.from({ length: 12 }, (_, i) => [base + i * step, base + 2 * step + i * step, base - step + i * step, base + step + i * step])
const setup = (over: any = {}) => {
  const candles = candlesAt(1.085, 0.0002)
  return { direction: 'bullish', kind: 'fx', status: 'candidate', pattern: 'bullish engulfing', candle_date: '2026-11-10', arrival_date: null,
    trigger_date: null, confirm_date: null, level: 1.0843, band: 1.0839, basis: 'bodies', touches: 3, own_touches: 3,
    touch_pts: [[1, 1.0843], [5, 1.0843], [9, 1.0842]], flip_pts: [], trigger: 1.08621, invalidation: 1.0841, close: 1.0872,
    volume_multiple: null, high_volume: false, confirmations: { rsi: { ok: true, value: 31.2 }, stoch: { ok: false, k: 40, d: 38 }, macd: { ok: false, hist: 0.0003 } },
    confirming: ['rsi'], trend: null, avg_volume: null, dates: candles.map((_, i) => '11-' + (i + 1)), candles, rsi_series: candles.map(() => 40),
    candle_idx: 10, decimals: 5, tick: 0.0001, pair: 'EURUSD', ...over }
}
const state = (scanType: string, ticker: string, data: any, status = 'candidate') => ({
  scans: [{ scan_type: scanType, last_run_at: '2026-11-11T13:00:00Z', candidates_found: 1, status: 'ok', note: 'Scanned 11 pairs' }],
  findings: [{ scan_type: scanType, ticker, headline: 'Bullish engulfing at support (3 touches)', status, found_at: '2026-11-11T13:00:00Z', data }],
})

describe('forex setups tab', () => {
  it('has its own tab', () => {
    expect(V().TABS.fx.label).toBe('Forex setups')
  })
  it('lists a pair with a chart and forex prices: no dollar signs, no earnings', () => {
    const out = V().render(state('fx', 'EURUSD', setup()), 'fx', NOW)
    expect(out.list).toContain('EURUSD')
    expect(out.list).toContain('<svg')
    expect(out.list).toContain('1.08621')
    expect(out.list).toContain('1.08410')
    expect(out.list).not.toMatch(/\$\d/)
    expect(out.list).not.toContain('Earnings')
  })
  it('uses three decimals for a yen pair', () => {
    const yen = setup({ level: 151.25, band: 151.1, trigger: 151.4, invalidation: 150.9, decimals: 3, tick: 0.01, pair: 'USDJPY', candles: candlesAt(151.3, 0.1) })
    const out = V().render(state('fx', 'USDJPY', yen), 'fx', NOW)
    expect(out.list).toContain('151.400')
    expect(out.list).toContain('150.900')
  })
  it('links to the StockCharts forex symbol', () => {
    expect(V().render(state('fx', 'EURUSD', setup()), 'fx', NOW).list).toContain('stockcharts.com/h-sc/ui?s=%24EURUSD')
  })
  it('explains the forex rules, not the stock universe', () => {
    const list = V().render(state('fx', 'EURUSD', setup()), 'fx', NOW).list
    expect(list).toContain('How these setups are found')
    expect(list).toContain('Hammer and hanging-man')
    expect(list).not.toContain('data-universe')
  })
  it('says what is new, like the trade-setup tab', () => {
    const status = V().render(state('fx', 'EURUSD', setup()), 'fx', NOW).status
    expect(status).toContain('Last ran')
    expect(status).toContain('EURUSD')
  })
  it('hides failed forex setups until asked', () => {
    const out = V().render(state('fx', 'EURUSD', setup({ status: 'failed' }), 'failed'), 'fx', NOW)
    expect(out.list).toContain('Show failed and expired (1)')
    expect(out.list).not.toContain('Bullish engulfing at support (3 touches)')
  })
})

describe('trade setups tab is unchanged', () => {
  it('still shows dollar prices, the ETF list and no forex rules', () => {
    const stock = setup({ kind: 'stock', decimals: undefined, level: 100.5, band: 100.2, trigger: 101.25, invalidation: 99.8, pair: undefined, candles: candlesAt(100.5, 0.4) })
    const out = V().render(state('setup', 'AAPL', stock), 'setup', NOW, { etfs: ['SPY'] })
    expect(out.list).toContain('$101.25')
    expect(out.list).toContain('data-universe')
    expect(out.list).not.toContain('Hammer and hanging-man candles are not used')
  })
})
`

for (const f of [api, front, page]) { fs.writeFileSync(f.file + '.bak-fx', fs.readFileSync(f.file)); fs.writeFileSync(f.file, f.text) }
fs.writeFileSync('src/routes/discovery-fx.test.ts', apiTest)
fs.writeFileSync('src/ui/discovery-fx.test.ts', uiTest)
console.log('patched src/routes/discovery.ts, src/routes/frontend.ts, public/static/discovery.js (backups: *.bak-fx)')
console.log('wrote src/routes/discovery-fx.test.ts and src/ui/discovery-fx.test.ts')
