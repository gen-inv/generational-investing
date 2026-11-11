import { describe, it, expect } from 'vitest'
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
