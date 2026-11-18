// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../' + rel), 'utf8')
const w = () => window as any

// A company with a stored 10-year range: P/E 36 today, 5th to 95th percentile 10 to 1000, median 100
const co = (over: any = {}) => ({
  id: 1, ticker: 'ABC', company_name: 'Abc Corp', pe_current: 36, pe_p5: 10, pe_median: 100, pe_p95: 1000, pe_min: 8, pe_max: 1200,
  pe_percentile: 18, pe_months: 118, pe_updated_at: '2026-11-17 10:23:00', pe_eps_ttm: 4, pe_error: null, ...over,
})

beforeAll(() => { w().eval(read('public/static/research-merge.js')) })

describe('bar position (log scale between the 5th and 95th percentile)', () => {
  it('the geometric middle sits in the middle, the ends at 0 and 1', () => {
    expect(w().peBarPosition(co(), 100).pos).toBeCloseTo(0.5, 10)
    expect(w().peBarPosition(co(), 10)).toEqual({ pos: 0, outside: null })
    expect(w().peBarPosition(co(), 1000)).toEqual({ pos: 1, outside: null })
  })
  it('outside the range the dot stops at the end and says which side', () => {
    expect(w().peBarPosition(co(), 5)).toEqual({ pos: 0, outside: 'below' })
    expect(w().peBarPosition(co(), 4000)).toEqual({ pos: 1, outside: 'above' })
  })
  it('a flat range puts the dot in the middle instead of dividing by zero', () => {
    expect(w().peBarPosition(co({ pe_p5: 20, pe_p95: 20 }), 20).pos).toBe(0.5)
  })
})

describe('colours, words and numbers', () => {
  it('cheap up to the 30th percentile, rich above the 70th', () => {
    expect([0, 30].map(w().peTone)).toEqual(['cheap', 'cheap'])
    expect([31, 50, 70].map(w().peTone)).toEqual(['fair', 'fair', 'fair'])
    expect([71, 100].map(w().peTone)).toEqual(['rich', 'rich'])
  })
  it('band words', () => {
    expect([10, 20].map(w().peBandLabel)).toEqual(['Low end', 'Low end'])
    expect(w().peBandLabel(30)).toBe('Below median'); expect(w().peBandLabel(50)).toBe('Near median')
    expect(w().peBandLabel(68)).toBe('Above median'); expect(w().peBandLabel(95)).toBe('High end')
  })
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 68, 100].map(w().peOrdinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '68th', '100th'])
  })
  it('P/E is rounded like the figures people quote', () => {
    expect(w().peFmt(36.4)).toBe('36'); expect(w().peFmt(110.6)).toBe('111'); expect(w().peFmt(9.64)).toBe('9.6')
  })
  it('P/E if a short put is assigned: strike less premium over trailing EPS', () => {
    expect(w().peIfAssigned(168, 3.4, 4)).toBeCloseTo(41.15, 10)
    expect(w().peIfAssigned(168, 0, 4)).toBeCloseTo(42, 10)
    expect(w().peIfAssigned(168, 3.4, -1)).toBeNull(); expect(w().peIfAssigned(168, 3.4, null)).toBeNull()
    expect(w().peIfAssigned(0, 1, 4)).toBeNull(); expect(w().peIfAssigned(2, 5, 4)).toBeNull()
  })
})

describe('roster cell', () => {
  const cell = (c: any) => { const d = document.createElement('div'); d.innerHTML = w().peRangeCellHtml(c); return d }
  it('shows the range ends, the dot, the P/E and the percentile', () => {
    const d = cell(co())
    expect(d.textContent).toContain('10'); expect(d.textContent).toContain('1000'); expect(d.textContent).toContain('P/E 36'); expect(d.textContent).toContain('18th pct')
    const dot = d.querySelector('[data-pe-dot]') as HTMLElement
    expect(dot.style.left).toBe('27.8%')                      // ln(3.6) / ln(100)
    expect(dot.style.backgroundColor).toContain('22, 163, 74') // 18th percentile: green
  })
  it('colours the dot amber in the middle and red at the expensive end', () => {
    expect((cell(co({ pe_percentile: 50 })).querySelector('[data-pe-dot]') as HTMLElement).style.backgroundColor).toContain('245, 158, 11')
    expect((cell(co({ pe_percentile: 88 })).querySelector('[data-pe-dot]') as HTMLElement).style.backgroundColor).toContain('220, 38, 38')
  })
  it('hover text explains the numbers', () => {
    const title = (cell(co()).firstElementChild as HTMLElement).getAttribute('title')!
    expect(title).toContain('Abc Corp: P/E now 36'); expect(title).toContain('low 8.0, median 100, high 1200')
    expect(title).toContain('higher than 18% of those months'); expect(title).toContain('Updated 2026-11-17')
  })
  it('no range shows a dash, with the reason on hover, escaped', () => {
    const d = cell(co({ pe_current: null, pe_error: 'not found <b>at the SEC' }))
    expect(d.textContent).toBe('-')
    expect(d.querySelector('b')).toBeNull()
    expect((d.firstElementChild as HTMLElement).getAttribute('title')).toContain('not found <b>at the SEC')
    expect(cell({}).textContent).toBe('-'); expect(cell(null as any).textContent).toBe('-')
  })
  it('a company name cannot inject markup through the hover text', () => {
    const d = cell(co({ company_name: '<img src=x onerror=alert(1)>' }))
    expect(d.querySelector('img')).toBeNull()
  })
})

describe('wiring', () => {
  it('the research merge keeps the P/E fields on each company', () => {
    const merged = w().mergeResearchIntoCompanies([co()], [])
    expect(merged[0].pe_current).toBe(36); expect(merged[0].pe_percentile).toBe(18)
  })
  it('the roster has a 10-yr P/E column between Anti-Fragile and Buy Price, header and cell in the same place', () => {
    const html = read('src/routes/frontend.ts'), app = read('public/static/app.js')
    const head = html.indexOf('>10-yr P/E<')
    expect(head).toBeGreaterThan(html.indexOf('Anti-Fragile')); expect(head).toBeLessThan(html.indexOf("sortCompanies('buy_price')"))
    const cellAt = app.indexOf('${peRangeCellHtml(company)}')
    expect(cellAt).toBeGreaterThan(app.indexOf('${antiFragileDisplay}')); expect(cellAt).toBeLessThan(app.indexOf('${buyPriceDisplay}</td>'))
  })
  it('the legend explains the column', () => {
    expect(read('src/routes/frontend.ts')).toContain('10-yr P/E:')
  })
})

describe('P/E if assigned (short puts)', () => {
  const approx = (v: number) => w().peApproxPercentile(co(), v)
  it('interpolates a percentile from the stored 5th, 50th and 95th points', () => {
    expect(approx(10)).toEqual({ pct: 5, beyond: null }); expect(approx(100)).toEqual({ pct: 50, beyond: null }); expect(approx(1000)).toEqual({ pct: 95, beyond: null })
    expect(Math.abs(approx(Math.sqrt(10 * 100)).pct - 27.5)).toBeLessThanOrEqual(0.5)   // halfway (log) between the 5th and the median
    expect(approx(5)).toEqual({ pct: 5, beyond: 'below' }); expect(approx(4000)).toEqual({ pct: 95, beyond: 'above' })
  })
  const html = (c: any, strike: any, premium: any) => { const d = document.createElement('div'); d.innerHTML = w().peAssignedHtml(c, strike, premium); return d }
  it('shows nothing until a company, a strike and a premium are entered, or when the premium swallows the strike', () => {
    expect(w().peAssignedHtml(null, 50, 2)).toBe(''); expect(w().peAssignedHtml(co(), '', 2)).toBe(''); expect(w().peAssignedHtml(co(), 50, '')).toBe('')
    expect(w().peAssignedHtml(co(), 2, 5)).toBe('')
  })
  it('P/E at strike less premium, the dot on the bar, and today as a hollow ring', () => {
    const d = html(co({ pe_eps_ttm: 4, pe_p5: 10, pe_median: 20, pe_p95: 40, pe_current: 12.5 }), 50, 2)
    expect(d.textContent).toContain('P/E if assigned'); expect(d.textContent).toContain('12'); expect(d.textContent).toContain('$48.00')
    expect(d.textContent).toContain('17th percentile'); expect(d.textContent).toContain("today's P/E (13)")
    expect((d.querySelector('[data-pe-assigned-dot]') as HTMLElement).style.left).toBe('13.2%')   // ln(12/10) / ln(40/10)
    expect((d.querySelector('[data-pe-today-dot]') as HTMLElement).style.left).toBe('16.1%')      // ln(12.5/10) / ln(4)
    expect((d.querySelector('[data-pe-assigned-dot]') as HTMLElement).style.backgroundColor).toContain('22, 163, 74')   // low in its own history: green
  })
  it('an assigned P/E above the usual range is red and says so', () => {
    const d = html(co({ pe_eps_ttm: 1, pe_p5: 10, pe_median: 20, pe_p95: 40 }), 100, 2)
    expect(d.textContent).toContain('above its usual 10-year range')
    expect((d.querySelector('[data-pe-assigned-dot]') as HTMLElement).style.backgroundColor).toContain('220, 38, 38')
  })
  it('no earnings (loss-making or non-US) says n/a with the reason, and no bar', () => {
    const d = html(co({ pe_eps_ttm: null, pe_current: null, pe_error: 'not found at the SEC' }), 50, 2)
    expect(d.textContent).toContain('n/a - this happens on companies with unavailable EPS reporting data, loss-making companies (which have no P/E), and non-US companies.')
    expect(d.querySelector('[data-pe-assigned-dot]')).toBeNull()
    expect((d.querySelector('p') as HTMLElement).getAttribute('title')).toBe('not found at the SEC')
  })
  it('earnings but no range yet shows the P/E without a bar', () => {
    const d = html(co({ pe_p5: null, pe_p95: null, pe_percentile: null, pe_eps_ttm: 4 }), 50, 2)
    expect(d.textContent).toContain('12'); expect(d.textContent).toContain('No 10-year range yet'); expect(d.querySelector('[data-pe-assigned-dot]')).toBeNull()
  })
})
