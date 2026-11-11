// @vitest-environment jsdom
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
