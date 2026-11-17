import { describe, it, expect } from 'vitest'
import { computeCompanyPe, secKey, yahooSymbol } from './pe-fetch'

// Six fiscal years of quarters (EPS 1.00 a quarter in 2020, +0.25 a year), shaped like SEC companyconcept rows.
const secRows = () => {
  const rows: any[] = []
  for (let y = 2018; y <= 2023; y++) {
    const eps = 1 + (y - 2020) * 0.25
    const ends = [`${y}-03-31`, `${y}-06-30`, `${y}-09-30`], starts = [`${y}-01-01`, `${y}-04-01`, `${y}-07-01`], filed = [`${y}-05-05`, `${y}-08-05`, `${y}-11-05`]
    ends.forEach((end, i) => rows.push({ start: starts[i], end, val: eps, filed: filed[i], form: '10-Q' }))
    rows.push({ start: `${y}-01-01`, end: `${y}-12-31`, val: eps * 4, filed: `${y + 1}-02-20`, form: '10-K' })
  }
  return rows
}
const prices = () => {
  const ts: number[] = [], close: number[] = []
  for (let y = 2019; y <= 2023; y++) for (let m = 0; m < 12; m++) { ts.push(Date.UTC(y, m, 1) / 1000); close.push(30 + ts.length) }
  return { chart: { result: [{ timestamp: ts, indicators: { quote: [{ close }] }, events: {} }] } }
}
const ok = (body: any) => ({ ok: true, status: 200, json: async () => body })
const bad = (status: number) => ({ ok: false, status, json: async () => ({}) })
const deps = (over: any = {}) => ({
  ciks: new Map([['ABC', 123]]), today: '2024-01-15',
  fetchSec: async (url: string) => ok({ units: { 'USD/shares': secRows() } }),
  fetchYahoo: async () => ok(prices()),
  ...over,
})

describe('computeCompanyPe', () => {
  it('turns SEC earnings and Yahoo prices into a P/E range and today\'s EPS', async () => {
    const r = await computeCompanyPe('ABC', deps())
    expect(r.error).toBeUndefined()
    expect(r.eps).toBeCloseTo(6.75, 10)                  // Dec-2023 quarter not filed by 15 Jan 2024
    expect(r.summary!.months).toBeGreaterThanOrEqual(36)
    expect(r.summary!.current).toBeCloseTo(90 / 6.75, 6)  // last bar: 60th point = 30 + 60
    expect(r.summary!.min).toBeLessThan(r.summary!.max)
  })
  it('asks the SEC for the right company number, padded to 10 digits', async () => {
    const urls: string[] = []
    await computeCompanyPe('ABC', deps({ fetchSec: async (u: string) => { urls.push(u); return ok({ units: { 'USD/shares': secRows() } }) } }))
    expect(urls[0]).toBe('https://data.sec.gov/api/xbrl/companyconcept/CIK0000000123/us-gaap/EarningsPerShareDiluted.json')
  })
  it('falls back to the next EPS tag when the first does not exist', async () => {
    const urls: string[] = []
    const fetchSec = async (u: string) => { urls.push(u); return u.includes('EarningsPerShareDiluted') ? bad(404) : ok({ units: { 'USD/shares': secRows() } }) }
    const r = await computeCompanyPe('ABC', deps({ fetchSec }))
    expect(r.summary).toBeTruthy(); expect(urls[1]).toContain('IncomeLossFromContinuingOperationsPerDilutedShare')
  })
  it('fills a gap in the main tag from a fallback tag (a company that changed tags)', async () => {
    const without2023 = secRows().filter(r => !r.end.startsWith('2023'))
    const fetchSec = async (u: string) => u.includes('/EarningsPerShareDiluted.json') ? ok({ units: { 'USD/shares': without2023 } })
      : u.includes('/IncomeLossFromContinuingOperationsPerDilutedShare.json') ? ok({ units: { 'USD/shares': secRows() } }) : bad(404)
    const r = await computeCompanyPe('ABC', deps({ fetchSec }))
    expect(r.error).toBeUndefined()
    expect(r.eps).toBeCloseTo(6.75, 10)        // 2023 came from the fallback tag
  })
  it('a fallback tag never overrides a period the main tag already has', async () => {
    const wrong = secRows().map(r => ({ ...r, val: r.val * 100 }))
    const fetchSec = async (u: string) => u.includes('/EarningsPerShareDiluted.json') ? ok({ units: { 'USD/shares': secRows() } })
      : u.includes('/EarningsPerShareBasic.json') ? ok({ units: { 'USD/shares': wrong } }) : bad(404)
    expect((await computeCompanyPe('ABC', deps({ fetchSec }))).eps).toBeCloseTo(6.75, 10)
  })
  it('a server error on a later tag keeps what the earlier tag gave; on the first tag it is a temporary failure', async () => {
    const fetchSec = async (u: string) => u.includes('/EarningsPerShareDiluted.json') ? ok({ units: { 'USD/shares': secRows() } }) : bad(503)
    expect((await computeCompanyPe('ABC', deps({ fetchSec }))).summary).toBeTruthy()
  })
  it('a company the SEC does not know is a permanent "n/a"', async () => {
    expect(await computeCompanyPe('NOPE', deps())).toMatchObject({ ticker: 'NOPE', clear: true, error: expect.stringContaining('not found at the SEC') })
  })
  it('no EPS tag at the SEC is permanent; a server error is temporary', async () => {
    expect(await computeCompanyPe('ABC', deps({ fetchSec: async () => bad(404) }))).toMatchObject({ clear: true })
    expect(await computeCompanyPe('ABC', deps({ fetchSec: async () => bad(503) }))).toMatchObject({ clear: false, error: 'SEC answered HTTP 503' })
    expect(await computeCompanyPe('ABC', deps({ fetchSec: async () => { throw new Error('x') } }))).toMatchObject({ clear: false })
  })
  it('Yahoo failing is temporary, except a 404 (no such symbol)', async () => {
    expect(await computeCompanyPe('ABC', deps({ fetchYahoo: async () => bad(500) }))).toMatchObject({ clear: false })
    expect(await computeCompanyPe('ABC', deps({ fetchYahoo: async () => bad(404) }))).toMatchObject({ clear: true })
    expect(await computeCompanyPe('ABC', deps({ fetchYahoo: async () => { throw new Error('x') } }))).toMatchObject({ clear: false })
  })
  it('a loss-making company has no P/E today', async () => {
    const losses = secRows().map(r => ({ ...r, val: -Math.abs(r.val) }))
    const r = await computeCompanyPe('ABC', deps({ fetchSec: async () => ok({ units: { 'USD/shares': losses } }) }))
    expect(r).toMatchObject({ clear: true, error: expect.stringContaining('no positive trailing earnings') })
  })
  it('too little history gives n/a instead of a misleading bar', async () => {
    const short = prices(); short.chart.result[0].timestamp = short.chart.result[0].timestamp.slice(-20); short.chart.result[0].indicators.quote[0].close = short.chart.result[0].indicators.quote[0].close.slice(-20)
    expect(await computeCompanyPe('ABC', deps({ fetchYahoo: async () => ok(short) }))).toMatchObject({ clear: true, error: expect.stringContaining('less than 3 years') })
  })
  it('ignores non-annual filings forms and rows without a start date', async () => {
    const mixed = [...secRows().map(r => ({ ...r, form: '8-K' })), { end: '2023-12-31', val: 9, filed: '2024-02-01', form: '10-K' }]
    expect(await computeCompanyPe('ABC', deps({ fetchSec: async () => ok({ units: { 'USD/shares': mixed } }) }))).toMatchObject({ clear: true })
  })
})

describe('ticker spelling', () => {
  it('SEC and Yahoo spell share classes with a dash; exchange suffixes stay', () => {
    expect(secKey('brk.b')).toBe('BRK-B'); expect(yahooSymbol('BRK.B')).toBe('BRK-B')
    expect(yahooSymbol('SHOP.TO')).toBe('SHOP.TO'); expect(yahooSymbol('NVDA')).toBe('NVDA')
  })
})
