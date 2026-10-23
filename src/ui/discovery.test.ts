// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(path.resolve(__dirname, '../../public/static/discovery.js'), 'utf8')
const w = () => window as any
w().eval(src)
const V = () => w().DiscoveryView
const NOW = Date.parse('2026-10-20T12:00:00Z')

describe('discovery view', () => {
  it('escapes agent-written text everywhere', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const out = V().render({ scans: [{ scan_type: 'guru', last_run_at: '2026-10-18T00:00:00Z', note: evil }],
      findings: [{ scan_type: 'guru', ticker: 'AAA', company_name: evil, headline: evil, tier: evil, details: evil, data: { k: evil }, found_at: '2026-10-18T00:00:00Z' }] }, 'guru', NOW)
    expect(out.status + out.list).not.toContain('<img')
    expect(out.list).toContain('&lt;img')
  })
  it('shows only the selected tab and an empty state', () => {
    const state = { scans: [], findings: [{ scan_type: 'maturing', ticker: 'ZZZ', headline: 'h', found_at: '2026-10-18T00:00:00Z' }] }
    expect(V().render(state, 'guru', NOW).list).toContain('No guru purchases')
    expect(V().render(state, 'maturing', NOW).list).toContain('ZZZ')
    expect(V().render(state, 'guru', NOW).status).toContain('not reported in yet')
  })
  it('shows last run and flags an overdue scan', () => {
    const fresh = V().statusLine({ scan_type: 'guru', last_run_at: '2026-10-18T12:00:00Z', gurus_scanned: 70, candidates_found: 4 }, 'guru', NOW)
    expect(fresh).toContain('2 days ago'); expect(fresh).toContain('70 gurus'); expect(fresh).not.toContain('overdue')
    expect(V().statusLine({ scan_type: 'guru', last_run_at: '2026-09-20T12:00:00Z' }, 'guru', NOW)).toContain('overdue')
  })
  it('shows a status badge for added and override findings, none for plain alerts', () => {
    const mk = (status: string) => V().render({ scans: [], findings: [{ scan_type: 'guru', ticker: 'MCO', headline: 'h', status, found_at: '2026-10-18T00:00:00Z' }] }, 'guru', NOW).list
    expect(mk('added')).toContain('Added to roster')
    expect(mk('potential_override')).toContain('Potential override')
    expect(mk('alerted')).not.toContain('rounded text-xs')
    expect(mk('<b>x</b>')).not.toContain('<b>')
  })
  describe('trade setups', () => {
    const setup = (over: any = {}, data: any = {}) => ({ scan_type: 'setup', ticker: 'AAA', headline: 'Bullish bounce off support $99.20', tier: 'Bullish', status: 'candidate', found_at: '2026-10-22T14:00:00Z',
      data: { direction: 'bullish', kind: 'stock', arrival_date: '2026-10-20', candle_date: '2026-10-21', level: 99.2, band: 99.9, basis: 'wicks', touches: 3, trigger: 101.2, invalidation: 99.4, trend: 'above 200-day average',
        touch_pts: [[0, 99.2], [2, 99.5], [4, 99.9]], flip_pts: [[1, 99.6]],
        confirmations: { rsi: { ok: true, value: 28.4 }, stoch: { ok: true, k: 14.1, d: 12.9 }, macd: { ok: false, hist: -0.12 } },
        dates: ['10-14', '10-15', '10-16', '10-17', '10-20', '10-21'], candles: [[103, 104, 102, 102.5], [102.5, 103, 101, 101.4], [101.4, 102, 100.2, 100.6], [100.6, 101, 99.8, 100], [100, 100.4, 99.5, 99.8], [99.9, 101.2, 99.4, 101]],
        rsi_series: [40, 36, 33, 30, 28, 31], candle_idx: 5, ...data }, ...over })
    const NOW2 = Date.parse('2026-10-23T14:00:00Z')
    const list = (rows: any[]) => V().render({ scans: [], findings: rows }, 'setup', NOW2).list
    it('shows one row per ticker with direction, status, a chart and a StockCharts link', () => {
      const html = list([setup()])
      expect(html).toContain('AAA'); expect(html).toContain('Bullish'); expect(html).toContain('Awaiting confirmation')
      expect(html).toContain('<svg'); expect(html).toContain('Support 99.20'); expect(html).toContain('Confirm 101.20'); expect(html).toContain('Fails 99.40')
      expect(html).toContain('https://stockcharts.com/h-sc/ui?s=AAA'); expect(html).toContain('confirms when price trades above $101.20')
    })
    it('bearish rows say resistance and below', () => {
      const html = list([setup({ ticker: 'BBB' }, { direction: 'bearish', level: 120, trigger: 118, invalidation: 120.9 })])
      expect(html).toContain('Bearish'); expect(html).toContain('Resistance 120.00'); expect(html).toContain('confirms when price trades below $118.00')
    })
    it('confirmed first, then waiting, then failed/expired (dimmed); two-week-old rows are hidden', () => {
      const rows = [setup({ ticker: 'FFF', status: 'failed' }), setup({ ticker: 'CCC', status: 'confirmed' }), setup({ ticker: 'WWW' }),
        setup({ ticker: 'OLD' }, { candle_date: '2026-09-20' })]
      const html = list(rows)
      expect(html.indexOf('CCC')).toBeLessThan(html.indexOf('WWW')); expect(html.indexOf('WWW')).toBeLessThan(html.indexOf('FFF'))
      expect(html).not.toContain('OLD'); expect(html).toContain('opacity-60')
    })
    it('a waiting setup that was never resolved shows as expired after a week', () => {
      const html = list([setup({ ticker: 'STALE' }, { candle_date: '2026-10-14' })])
      expect(html).toContain('Expired'); expect(html).not.toContain('Awaiting confirmation')
    })
    it('escapes everything the agent wrote and tolerates bad chart data', () => {
      const evil = '<img src=x onerror=alert(1)>'
      const html = list([setup({ headline: evil, ticker: 'EVIL' }, { trend: evil, dates: [evil], candles: [[1, 2, 'x', 4], [1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]] })])
      expect(html).not.toContain('<img'); expect(html).not.toContain('<svg')
      expect(V().chartSvg({ dates: [evil], candles: [[1, 2, 0.5, 1.5], [1, 2, 0.5, 1.5], [1, 2, 0.5, 1.5], [1, 2, 0.5, 1.5], [1, 2, 0.5, 1.5]], level: 1 })).not.toContain('<img')
    })
    it('names which oscillators confirmed and says how many are needed', () => {
      const html = list([setup()])
      expect(html).toContain('RSI 28.4'); expect(html).toContain('Stochastic %K 14.1'); expect(html).toContain('MACD histogram -0.120')
      expect(html).toContain('2 of 3 confirm'); expect(html).toContain('2 are needed')
      expect(html.match(/&#10003;/g)).toHaveLength(2); expect(html.match(/&#10007;/g)).toHaveLength(1)
    })
    it('shows what the level is made of: touches, basis, old resistance, and the arrival candle', () => {
      const html = list([setup()])
      expect(html).toContain('Support: 3 touches (wicks), also acted as resistance 1 time')
      expect(html).toContain('Arrival candle: 2026-10-20')
      const bear = list([setup({ ticker: 'BBB' }, { direction: 'bearish', flip_pts: [] })])
      expect(bear).toContain('Resistance: 3 touches (wicks)'); expect(bear).not.toContain('also acted as')
    })
    it('draws the level band, a dot for every touch, hollow dots for old resistance, and both candles', () => {
      const svg = V().chartSvg(setup().data)
      expect((svg.match(/<circle/g) || []).length).toBe(4)       // 3 touches + 1 earlier swing point of the opposite kind
      expect(svg).toContain('arrival'); expect(svg).toContain('reversal'); expect(svg).toContain('opacity="0.13"')
      expect(V().chartSvg(setup({}, { touch_pts: [[99, 99.2], ['x', 1]], flip_pts: null }).data)).not.toContain('<circle')   // junk points are ignored
    })
    it('the status line counts setups and the empty state explains itself', () => {
      expect(V().render({ scans: [{ scan_type: 'setup', last_run_at: '2026-10-22T14:00:00Z', candidates_found: 3 }], findings: [] }, 'setup', NOW2).status).toContain('3 setups')
      expect(list([])).toContain('No trade setups')
    })
    it('the page has the tab button', () => {
      const html = fs.readFileSync(path.resolve(__dirname, '../routes/frontend.ts'), 'utf8')
      expect(html).toContain("setDiscoveryTab('setup')")
    })
  })
  it('page wires the Discovery tab and script', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../routes/frontend.ts'), 'utf8')
    expect(html).toContain('id="discovery-utility"'); expect(html).toContain('/static/discovery.js'); expect(html).toContain("loadDiscovery()")
  })
})
