// Monthly Income report: add a Fixed-Risk Trades block (Iron Condors, Credit Spreads, Debit Spreads) under Option Trades,
// and an "Other option trades" row for closed trades no section would otherwise show.
// Run from the repo root:  node monthly_fixed_risk.mjs
import fs from 'node:fs'

const T = x => x.replaceAll('§', '`').replaceAll('@{', '${')
function patch(file, edits) {
  let s = fs.readFileSync(file, 'utf8')
  const crlf = s.includes('\r\n')
  s = s.replace(/\r\n/g, '\n')
  for (let [what, oldS, newS] of edits) {
    oldS = T(oldS); newS = T(newS)
    const n = s.split(oldS).length - 1
    if (n !== 1) { console.error(`ABORT (${file}): expected 1 match for "${what}", found ${n}. Nothing was written.`); process.exit(1) }
    s = s.replace(oldS, () => newS)
  }
  return { file, text: crlf ? s.replace(/\n/g, '\r\n') : s }
}

// ---------------------------------------------------------------- API
const api = patch('src/routes/reports.ts', [
  ['monthly income dte anchor', "    // 0 DTE SPX Trades\n    const dteTrades = !F.daily ? null : await DB.prepare(`\n      SELECT SUM(profit_loss) as profit_loss, COUNT(*) as trade_count\n      FROM daily_trades\n      WHERE user_id = ? AND is_open = 0\n        @{accountId ? 'AND account_id = ?' : ''}\n        AND trade_date >= ? AND trade_date < ?\n    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).first() as any\n    \n    return c.json({\n      year: parseInt(year),",
   String.raw`    // Fixed-risk trades: Iron Condors, Credit Spreads, Debit Spreads (defined risk, so no stock behind them)
    const fixedRisk = async (strategy: string) => !F.options ? none : await DB.prepare(§
      SELECT ticker, SUM(profit_loss) as profit_loss
      FROM option_trades
      WHERE user_id = ? AND strategy_type = ?
        @{accountId ? 'AND account_id = ?' : ''}
        AND is_open = 0 AND close_date >= ? AND close_date < ?
      GROUP BY ticker
      ORDER BY ticker ASC
    §).bind(userId, strategy, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    const ironCondors = await fixedRisk('IRON_CONDOR')
    const creditSpreads = await fixedRisk('CREDIT_SPREAD')
    const debitSpreads = await fixedRisk('DEBIT_SPREAD')

    // Anything closed this month that none of the sections above would show, so the report never drops a trade silently:
    // a strategy this report has no section for, and covered calls with no matching stock strategy.
    const otherStrategies = !F.options ? none : await DB.prepare(§
      SELECT ticker || ' (' || COALESCE(strategy_type, 'no strategy') || ')' as ticker, SUM(profit_loss) as profit_loss
      FROM option_trades
      WHERE user_id = ?
        AND COALESCE(strategy_type, '') NOT IN ('SELLING_PUT_WHEEL', 'SELLING_PUT', 'SELLING_PUT_LONG_TERM', 'IRON_CONDOR', 'CREDIT_SPREAD', 'DEBIT_SPREAD', 'COVERED_CALL')
        @{accountId ? 'AND account_id = ?' : ''}
        AND is_open = 0 AND close_date >= ? AND close_date < ?
      GROUP BY ticker, strategy_type
    §).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    const unlinkedCalls = !F.options ? none : await DB.prepare(§
      SELECT ot.ticker || ' (covered call, no stock strategy)' as ticker, SUM(ot.profit_loss) as profit_loss
      FROM option_trades ot
      WHERE ot.user_id = ? AND ot.strategy_type = 'COVERED_CALL'
        AND NOT EXISTS (
          SELECT 1 FROM stock_holdings sh
          WHERE sh.ticker = ot.ticker AND sh.account_id = ot.account_id
            AND sh.strategy_type IN ('DIVIDEND_ETFS', 'STOCKPILING', 'WHEEL')
        )
        @{accountId ? 'AND ot.account_id = ?' : ''}
        AND ot.is_open = 0 AND ot.close_date >= ? AND ot.close_date < ?
      GROUP BY ot.ticker
    §).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()

    // 0 DTE SPX Trades
    const dteTrades = !F.daily ? null : await DB.prepare(§
      SELECT SUM(profit_loss) as profit_loss, COUNT(*) as trade_count
      FROM daily_trades
      WHERE user_id = ? AND is_open = 0
        @{accountId ? 'AND account_id = ?' : ''}
        AND trade_date >= ? AND trade_date < ?
    §).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).first() as any
    
    return c.json({
      year: parseInt(year),`],
  ['monthly income payload', "        shortPutsLongTerm: { results: shortPutsLongTerm.results || [] },\n        dteTrades: {",
   "        shortPutsLongTerm: { results: shortPutsLongTerm.results || [] },\n        fixedRisk: {\n          ironCondors: { results: ironCondors.results || [] },\n          creditSpreads: { results: creditSpreads.results || [] },\n          debitSpreads: { results: debitSpreads.results || [] }\n        },\n        otherOptions: { results: [...(otherStrategies.results || []), ...(unlinkedCalls.results || [])] },\n        dteTrades: {"],
])

// ---------------------------------------------------------------- page
const page = patch('public/static/app.js', [
  ['render the blocks', "    // 0DTE SPX Trades (no ticker breakdown)\n",
   "    // Fixed-risk trades: Iron Condors, Credit Spreads, Debit Spreads\n    if (!menuAreaOff('options')) html += renderFixedRiskSection(optionTrades.fixedRisk)\n    \n    // Closed trades that match none of the sections (shown only when there are some)\n    if (!menuAreaOff('options')) html += renderOtherOptionsSection(optionTrades.otherOptions)\n    \n    // 0DTE SPX Trades (no ticker breakdown)\n"],
  ['new render functions', "// Render a single option strategy subsection\nfunction renderOptionStrategySubsection(title, icon, trades) {",
   String.raw`// Fixed-risk trades (Iron Condors, Credit Spreads, Debit Spreads): one block with a total, a table per kind that has trades
function renderFixedRiskSection(fixed) {
    const kinds = [
        ['Iron Condors', '🦅', fixed && fixed.ironCondors],
        ['Credit Spreads', '🛡️', fixed && fixed.creditSpreads],
        ['Debit Spreads', '🎟️', fixed && fixed.debitSpreads]
    ]
    const plOf = t => (t && t.results ? t.results.reduce((sum, item) => sum + parseFloat(item.profit_loss || 0), 0) : 0)
    const used = kinds.filter(k => k[2] && k[2].results && k[2].results.length > 0)
    if (used.length === 0) {
        return §
            <div class="mb-6">
                <h5 class="text-lg font-semibold text-gray-700 mb-2">
                    <span class="text-2xl mr-2">⚖️</span>Fixed-Risk Trades
                </h5>
                <p class="text-sm text-gray-500 ml-10">No closed trades this month</p>
            </div>
        §
    }
    const total = kinds.reduce((sum, k) => sum + plOf(k[2]), 0)
    return §
        <div class="mb-6">
            <div class="flex justify-between items-center mb-3">
                <h5 class="text-lg font-semibold text-gray-700">
                    <span class="text-2xl mr-2">⚖️</span>Fixed-Risk Trades
                </h5>
                <div class="text-lg font-bold @{total >= 0 ? 'text-green-600' : 'text-red-600'}">
                    @{formatCurrency(total)}
                </div>
            </div>
            <div class="ml-6 pl-4 border-l-2 border-gray-200">
                @{used.map(k => renderOptionStrategySubsection(k[0], k[1], k[2])).join('')}
            </div>
        </div>
    §
}

// Closed option trades no other section shows (a strategy without its own section, or a covered call with no matching stock strategy).
// Left out entirely when there are none; the amounts are in the Option Trades Total.
function renderOtherOptionsSection(other) {
    if (!other || !other.results || other.results.length === 0) return ''
    return renderOptionStrategySubsection('Other Option Trades', '❔', other) +
        '<p class="text-xs text-gray-500 ml-10 -mt-4 mb-6">Closed this month and not part of any section above; included in the Option Trades Total.</p>'
}

// Render a single option strategy subsection
function renderOptionStrategySubsection(title, icon, trades) {`],
  ['total', "    total += optionTrades.shortPutsLongTerm.results?.reduce(",
   "    const plOf = t => (t && t.results ? t.results.reduce((sum, item) => sum + parseFloat(item.profit_loss || 0), 0) : 0)\n    const fixed = optionTrades.fixedRisk || {}\n    total += plOf(fixed.ironCondors) + plOf(fixed.creditSpreads) + plOf(fixed.debitSpreads) + plOf(optionTrades.otherOptions)\n    total += optionTrades.shortPutsLongTerm.results?.reduce("],
])

// ---------------------------------------------------------------- tests
const apiTest = String.raw`import { describe, it, expect, vi } from 'vitest'

// Monthly Income report: fixed-risk trades (Iron Condors, Credit Spreads, Debit Spreads) and the catch-all for trades no section shows.
vi.mock('../lib/auth', () => ({ authMiddleware: async (c: any, next: any) => { c.set('userId', 1); await next() } }))
import { routes } from './reports'

const FIXED: Record<string, any[]> = {
  IRON_CONDOR: [{ ticker: 'SPY', profit_loss: 120 }],
  CREDIT_SPREAD: [{ ticker: 'AAPL', profit_loss: -250 }, { ticker: 'MSFT', profit_loss: 80 }],
  DEBIT_SPREAD: []
}
const make = () => {
  const calls: { sql: string, args: any[] }[] = []
  const rowsFor = (sql: string, args: any[]) => {
    if (sql.includes('strategy_type = ?') && sql.includes('GROUP BY ticker')) return FIXED[args[1]] || []
    if (sql.includes('NOT IN (')) return [{ ticker: 'XYZ (LONG_CALL)', profit_loss: 12 }]
    if (sql.includes('NOT EXISTS')) return [{ ticker: 'ABC (covered call, no stock strategy)', profit_loss: 30 }]
    return []
  }
  const prepare = vi.fn((sql: string) => ({ bind: (...args: any[]) => { calls.push({ sql, args }); return { all: async () => ({ results: rowsFor(sql, args) }), first: async () => ({ profit_loss: 0, trade_count: 0 }) } } }))
  return { env: { DB: { prepare } }, calls }
}
const get = (env: any, qs = 'year=2026&month=10') => routes.request('/api/reports/monthly-income?' + qs, {}, env)

describe('monthly income: fixed-risk trades', () => {
  it('lists Iron Condors, Credit Spreads and Debit Spreads by ticker, closed in the month', async () => {
    const { env, calls } = make()
    const res = await get(env)
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.optionTrades.fixedRisk.ironCondors.results).toEqual([{ ticker: 'SPY', profit_loss: 120 }])
    expect(body.optionTrades.fixedRisk.creditSpreads.results.map((r: any) => r.ticker)).toEqual(['AAPL', 'MSFT'])
    expect(body.optionTrades.fixedRisk.debitSpreads.results).toEqual([])
    const fixed = calls.filter(c => c.sql.includes('strategy_type = ?') && c.sql.includes('GROUP BY ticker'))
    expect(fixed.map(c => c.args[1]).sort()).toEqual(['CREDIT_SPREAD', 'DEBIT_SPREAD', 'IRON_CONDOR'])
    fixed.forEach(c => { expect(c.sql).toContain('is_open = 0'); expect(c.args).toContain('2026-10-01'); expect(c.args).toContain('2026-11-01'); expect(c.args[0]).toBe(1) })
  })
  it('honours the account filter', async () => {
    const { env, calls } = make()
    await get(env, 'year=2026&month=10&account_id=7')
    const fixed = calls.filter(c => c.sql.includes('strategy_type = ?') && c.sql.includes('GROUP BY ticker'))
    expect(fixed.length).toBe(3)
    fixed.forEach(c => { expect(c.sql).toContain('AND account_id = ?'); expect(c.args).toContain(7) })
    expect(calls.filter(c => c.sql.includes('NOT EXISTS') || c.sql.includes('NOT IN (')).every(c => c.args.includes(7))).toBe(true)
  })
  it('reports closed trades that no section shows (other strategies, covered calls with no stock strategy)', async () => {
    const { env } = make()
    const body: any = await (await get(env)).json()
    expect(body.optionTrades.otherOptions.results.map((r: any) => r.ticker)).toEqual(['XYZ (LONG_CALL)', 'ABC (covered call, no stock strategy)'])
  })
  it('leaves the existing short-put sections as they were', async () => {
    const { env } = make()
    const body: any = await (await get(env)).json()
    expect(Object.keys(body.optionTrades)).toEqual(expect.arrayContaining(['shortPutsWheel', 'shortPutsStockpiling', 'shortPutsLongTerm', 'fixedRisk', 'otherOptions', 'dteTrades']))
  })
})
`

const uiTest = String.raw`import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// The Monthly Income page: the Fixed-Risk Trades block and the totals. The functions are cut out of app.js and run with a stubbed formatCurrency.
const src = fs.readFileSync(path.resolve(__dirname, '../../public/static/app.js'), 'utf8').replace(/\r\n/g, '\n')
const fn = (name: string) => {
  const i = src.indexOf('function ' + name + '(')
  if (i < 0) throw new Error(name + ' not found in app.js')
  return src.slice(i, src.indexOf('\n}\n', i) + 3)
}
const load = () => new Function('formatCurrency', 'menuAreaOff',
  ['renderOptionStrategySubsection', 'renderFixedRiskSection', 'renderOtherOptionsSection', 'calculateOptionTradesTotal'].map(fn).join('\n') +
  '\nreturn { renderFixedRiskSection, renderOtherOptionsSection, calculateOptionTradesTotal }')(
  (v: number) => (v < 0 ? '-' : '') + '$' + Math.abs(v).toFixed(2), () => false)
const P = () => load()
const rows = (...r: any[]) => ({ results: r.map(([ticker, profit_loss]) => ({ ticker, profit_loss })) })
const empty = { results: [] as any[] }
const base = { shortPutsWheel: rows(['W', -100]), shortPutsStockpiling: empty, shortPutsLongTerm: rows(['L', 50]), dteTrades: { profitLoss: 10, tradeCount: 2 } }

describe('monthly income: fixed-risk trades', () => {
  it('shows each kind that has trades, the tickers, a group total, and leaves empty kinds out', () => {
    const html = P().renderFixedRiskSection({ ironCondors: rows(['SPY', 120]), creditSpreads: rows(['AAPL', -250], ['MSFT', 80]), debitSpreads: empty })
    expect(html).toContain('Fixed-Risk Trades'); expect(html).toContain('Iron Condors'); expect(html).toContain('Credit Spreads')
    expect(html).toContain('SPY'); expect(html).toContain('AAPL'); expect(html).toContain('MSFT')
    expect(html).not.toContain('Debit Spreads')
    expect(html).toContain('-$50.00')                       // 120 - 250 + 80 = -50, the group total
  })
  it('says so when there are none, and copes with an older payload that has no fixedRisk at all', () => {
    expect(P().renderFixedRiskSection({ ironCondors: empty, creditSpreads: empty, debitSpreads: empty })).toContain('No closed trades this month')
    expect(P().renderFixedRiskSection(undefined)).toContain('No closed trades this month')
  })
  it('the Option Trades total includes fixed-risk and other trades', () => {
    const t = P().calculateOptionTradesTotal
    expect(t(base)).toBe(-40)                                // the old total, unchanged: -100 + 50 + 10
    expect(t({ ...base, fixedRisk: { ironCondors: rows(['SPY', 120]), creditSpreads: rows(['AAPL', -250]), debitSpreads: empty }, otherOptions: rows(['XYZ', 12]) })).toBe(-40 + 120 - 250 + 12)
  })
  it('the other-trades row appears only when there are some, with a note that it is in the total', () => {
    expect(P().renderOtherOptionsSection(empty)).toBe(''); expect(P().renderOtherOptionsSection(undefined)).toBe('')
    const html = P().renderOtherOptionsSection(rows(['ABC (covered call, no stock strategy)', 30]))
    expect(html).toContain('Other Option Trades'); expect(html).toContain('ABC (covered call, no stock strategy)'); expect(html).toContain('included in the Option Trades Total')
  })
})
`

for (const f of [api, page]) { fs.writeFileSync(f.file + '.bak-fr', fs.readFileSync(f.file)); fs.writeFileSync(f.file, f.text) }
fs.writeFileSync('src/routes/reports-monthly-income.test.ts', T(apiTest))
fs.writeFileSync('src/ui/monthly-income.test.ts', T(uiTest))
console.log('patched src/routes/reports.ts and public/static/app.js (backups: *.bak-fr)')
console.log('wrote src/routes/reports-monthly-income.test.ts and src/ui/monthly-income.test.ts')
