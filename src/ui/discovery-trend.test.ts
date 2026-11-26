// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(path.resolve(__dirname, '../../public/static/discovery.js'), 'utf8')
const w = () => window as any
w().eval(src)
const V = () => w().DiscoveryView
const NOW = Date.parse('2026-11-26T20:00:00Z')   // a Thursday: the latest closed session is Wednesday 2026-11-25

// 22 daily bars ending 2026-11-25, rising
const bars = Array.from({ length: 22 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 10, 4 + i)).toISOString().slice(0, 10)
  const c = 100 + i * 0.35
  return [d, c - 0.4, c + 0.8, c - 1.0, c, 1000 + i]
})
const dt = (i: number) => bars[i][0] as string
const trend = (over: any = {}) => ({
  direction: 'bullish', kind: 'stock', status: 'signal', pattern: 'higher low', candle_date: dt(21), age: 0,
  level: 107.0, touches: 3, touch_points: [[dt(2), 102.0], [dt(14), 104.5], [dt(21), 107.0]],
  prev_extreme: 104.5, prev_extreme_date: dt(14), gap_sessions: 7,
  line_start: [dt(2), 102.0], line_end: [dt(21), 107.3], slope_atr: 0.2, atr: 1.5,
  volume_multiple: 1.8, high_volume: true, decimals: 2, bars, next_earnings: { date: '2026-12-20', estimate: false }, ...over,
})
const finding = (ticker: string, data: any, status = 'signal') => ({ scan_type: 'trend', ticker, headline: 'Higher low on rising support $107.00 (3 touches)', tier: 'Bullish', status, found_at: '2026-11-26T14:00:00Z', data })
const scan = { scan_type: 'trend', last_run_at: '2026-11-26T14:00:00Z', candidates_found: 1, status: 'ok' }
const render = (rows: any[], opts: any = {}) => V().render({ scans: [scan], findings: rows }, 'trend', NOW, opts)

describe('tabs', () => {
  it('are named Reversal Scan and Trend Scan, and there is no forex tab', () => {
    expect(V().TABS.setup.label).toBe('Reversal Scan')
    expect(V().TABS.trend.label).toBe('Trend Scan')
    expect(V().TABS.fx).toBeUndefined()
  })
  it('the page has the two buttons and no forex button', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../routes/frontend.ts'), 'utf8')
    expect(html).toContain("setDiscoveryTab('setup')"); expect(html).toContain('>Reversal Scan</button>')
    expect(html).toContain("setDiscoveryTab('trend')"); expect(html).toContain('>Trend Scan</button>')
    expect(html).not.toContain('Forex setups'); expect(html).not.toContain("setDiscoveryTab('fx')")
  })
})

describe('trend scan tab', () => {
  it('lists a setup with a chart, a status badge, the volume and earnings badges and a StockCharts link', () => {
    const out = render([finding('AAA', trend())])
    expect(out.list).toContain('AAA'); expect(out.list).toContain('<svg'); expect(out.list).toContain('>Signal<')
    expect(out.list).toContain('Bullish'); expect(out.list).toMatch(/data-volume class="[^"]*bg-purple-100[^"]*"[^>]*>Volume 1\.8x/)
    expect(out.list).toContain('data-earnings'); expect(out.list).toContain('https://stockcharts.com/h-sc/ui?s=AAA')
    expect(out.list).toContain('Higher low on rising support')
  })
  it('draws the line, a numbered dot for every touch and the signal candle', () => {
    const svg = V().trendChartSvg(trend())
    expect((svg.match(/<circle/g) || []).length).toBe(3)
    expect(svg).toContain('>1</text>'); expect(svg).toContain('>2</text>'); expect(svg).toContain('>3</text>')
    expect(svg).toContain('stroke-dasharray="6 4"'); expect(svg).toContain('Support 107.30'); expect(svg).toContain('>signal</text>')
    expect(V().trendChartSvg(trend({ direction: 'bearish' }))).toContain('Resistance 107.30')
  })
  it('says what the signal candle did and where the trend breaks', () => {
    const html = render([finding('AAA', trend())]).list
    expect(html).toContain('Signal candle low $107.00 is above the $104.50 low of ' + dt(14) + ' (7 sessions earlier)')
    expect(html).toContain('Rising support: 3 touches'); expect(html).toContain('slope 0.20 ATR per session (about 1.0 ATR per week)')
    expect(html).toContain('Signal candle: Higher low on ' + dt(21)); expect(html).toContain('the trend breaks on a close below $106.55 (0.5 ATR under the line, now at $107.30)')
  })
  it('bearish rows say lower high, resistance and above', () => {
    const html = render([finding('BBB', trend({ direction: 'bearish', pattern: 'lower high', prev_extreme: 110, touch_points: [[dt(2), 112], [dt(14), 110], [dt(21), 108]] }))]).list
    expect(html).toContain('Bearish'); expect(html).toContain('Falling resistance: 3 touches')
    expect(html).toContain('Signal candle high $108.00 is below the $110.00 high'); expect(html).toContain('Lower high on'); expect(html).toContain('a close above $108.05')
  })
  it('names the setups whose signal candle is from the latest session, and says Nothing new otherwise', () => {
    const fresh = render([finding('NEW', trend()), finding('OLD', trend({ candle_date: dt(19) }))]).status
    expect(fresh).toContain('Last ran:'); expect(fresh).toContain('Found 1 new setup: NEW'); expect(fresh).not.toContain('OLD')
    expect(render([finding('OLD', trend({ candle_date: dt(19) }))]).status).toContain('Nothing new')
  })
  it('a signal stays listed for 3 sessions, then goes to the hidden group', () => {
    const wed = trend(), mon = trend({ candle_date: '2026-11-23' }), fri = trend({ candle_date: '2026-11-20' })
    expect(render([finding('WED', wed)]).list).toContain('WED')
    expect(render([finding('MON', mon)]).list).toContain('MON')                  // Nov 24, 25, 26: 2 sessions
    const old = render([finding('FRI', fri)])
    expect(old.list).not.toContain('FRI'); expect(old.list).toContain('Show failed and expired (1)')
    expect(render([finding('FRI', fri)], { showPast: true }).list).toContain('FRI')
  })
  it('failed setups are hidden until asked and shown dimmed', () => {
    const rows = [finding('FFF', trend(), 'failed'), finding('SSS', trend())]
    const hidden = render(rows)
    expect(hidden.list).not.toContain('FFF'); expect(hidden.list).toContain('Show failed and expired (1)')
    const shown = render(rows, { showPast: true }).list
    expect(shown).toContain('Hide failed and expired'); expect(shown.indexOf('SSS')).toBeLessThan(shown.indexOf('FFF')); expect(shown).toContain('opacity-60')
  })
  it('posts the rules for both directions and does not mention oscillators as a rule or the ETF editor', () => {
    const list = render([]).list
    expect(list).toContain('How these setups are found'); expect(list).toContain('Rising support line'); expect(list).toContain('Falling resistance line')
    expect(list).toContain('at least 0.10 ATR per session'); expect(list).toContain('more than 0.5 ATR below the line'); expect(list).toContain('3 to 10 sessions')
    expect(list).toContain('This scan does not use oscillators'); expect(list).not.toContain('data-universe'); expect(list).not.toContain('Edit ETF list')
    expect(list).toContain('No trend setups')
  })
  it('escapes what the agent wrote and tolerates bad chart data', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const html = render([{ ...finding('EVIL', trend({ prev_extreme_date: evil, candle_date: evil, bars: [[evil, 1, 2, 'x', 4, 0], [evil, 1, 2, 3, 4, 0], [evil, 1, 2, 3, 4, 0], [evil, 1, 2, 3, 4, 0], [evil, 1, 2, 3, 4, 0]] })), headline: evil }]).list
    expect(html).not.toContain('<img'); expect(html).not.toContain('<svg')
    expect(V().trendChartSvg({ bars: [[evil, 1, 2, 0.5, 1.5, 0], [evil, 1, 2, 0.5, 1.5, 0], [evil, 1, 2, 0.5, 1.5, 0], [evil, 1, 2, 0.5, 1.5, 0], [evil, 1, 2, 0.5, 1.5, 0]] })).not.toContain('<img')
  })
})

describe('reversal scan tab is unchanged', () => {
  it('still shows dollar prices, the ETF list and the reversal rules', () => {
    const candles = Array.from({ length: 12 }, (_, i) => [100 + i * 0.4, 100.8 + i * 0.4, 99.6 + i * 0.4, 100.4 + i * 0.4])
    const data = { direction: 'bullish', kind: 'stock', status: 'candidate', pattern: 'bullish engulfing', candle_date: '2026-11-25', level: 100.5, band: 100.2, touches: 3, own_touches: 3,
      touch_pts: [[1, 100.5], [5, 100.5], [9, 100.4]], flip_pts: [], trigger: 101.25, invalidation: 99.8, dates: candles.map((_, i) => '11-' + (i + 1)), candles, rsi_series: candles.map(() => 40), candle_idx: 10 }
    const out = V().render({ scans: [], findings: [{ scan_type: 'setup', ticker: 'AAPL', headline: 'h', status: 'candidate', found_at: '2026-11-26T14:00:00Z', data }] }, 'setup', NOW, { etfs: ['SPY'] })
    expect(out.list).toContain('$101.25'); expect(out.list).toContain('data-universe'); expect(out.list).toContain('Oscillators: at least 1 of 3')
  })
})
