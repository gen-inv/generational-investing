import { describe, it, expect } from 'vitest'
import { pickBatch, parseSummary, refreshCompanyData, isFundOrIndex, safeEqual, BATCH_SIZE, type RosterTicker } from './refresh-company-data'

const TODAY = '2026-11-13'
const row = (o: Partial<RosterTicker>): RosterTicker => ({ ticker: 'AAA', exchange: 'NMS', sector: 'Technology', industry: 'Software', market_cap: 1e9, next_earnings_date: '2027-01-30', earnings_estimated: 0, refreshed_at: '2026-11-10', ...o })

describe('which companies are checked tonight', () => {
  it('skips ETFs and indices', () => {
    expect(isFundOrIndex(row({ ticker: '^SPX', sector: null, industry: null, exchange: 'WCB' }))).toBe(true)
    expect(isFundOrIndex(row({ ticker: 'GOOY', sector: null, industry: null, exchange: 'PCX' }))).toBe(true)
    expect(isFundOrIndex(row({ ticker: 'BAC', sector: 'Financial Services' }))).toBe(false)
  })
  it('missing or passed earnings dates come first, then the longest since refreshed', () => {
    const rows = [
      row({ ticker: 'NEW', refreshed_at: '2026-11-12' }),
      row({ ticker: 'OLD', refreshed_at: '2026-10-01' }),
      row({ ticker: 'PASSED', next_earnings_date: '2026-11-01', refreshed_at: '2026-11-12' }),
      row({ ticker: 'NODATE', next_earnings_date: null, refreshed_at: '2026-11-12' }),
    ]
    expect(pickBatch(rows, TODAY, 4).map((r) => r.ticker)).toEqual(['NODATE', 'PASSED', 'OLD', 'NEW'])
  })
  it('never more than the batch size, and a never-refreshed company goes before a recent one', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ ticker: 'T' + String(i).padStart(2, '0'), refreshed_at: '2026-11-10' }))
    rows.push(row({ ticker: 'FRESH', refreshed_at: null }))
    const picked = pickBatch(rows, TODAY)
    expect(picked).toHaveLength(BATCH_SIZE)
    expect(picked[0].ticker).toBe('FRESH')
  })
})

describe('reading a FinanceBird summary', () => {
  const summary = (r: any) => ({ quoteResponse: { result: [r] } })
  it('reads market cap and a future earnings date', () => {
    const ts = Date.UTC(2026, 11, 3) / 1000
    expect(parseSummary(summary({ marketCap: { raw: 3.9e12 }, earningsTimestampEnd: { raw: ts } }), TODAY)).toEqual({ marketCap: 3.9e12, earningsDate: '2026-12-03', estimated: false })
  })
  it('a plain number market cap works too', () => {
    expect(parseSummary(summary({ marketCap: 5e9 }), TODAY).marketCap).toBe(5e9)
  })
  it('when the provider only knows the last report, the next date is an estimate a quarter later', () => {
    const ts = Date.UTC(2026, 9, 28) / 1000
    expect(parseSummary(summary({ earningsTimestamp: { raw: ts } }), TODAY)).toMatchObject({ earningsDate: '2027-01-28', estimated: true })
  })
  it('nothing usable gives nulls', () => {
    expect(parseSummary({}, TODAY)).toEqual({ marketCap: null, earningsDate: null, estimated: false })
    expect(parseSummary(summary({}), TODAY)).toMatchObject({ marketCap: null, earningsDate: null })
  })
})

function fakeDb(rows: any[]) {
  const updates: any[][] = []
  return {
    updates,
    prepare(sql: string) {
      return {
        all: async () => ({ results: rows }),
        bind: (...args: any[]) => ({ run: async () => { updates.push(args); return {} } }),
      }
    },
  }
}
const jsonResp = (body: any, ok = true, status = 200) => ({ ok, status, json: async () => body })

describe('the nightly run', () => {
  const now = new Date('2026-11-13T09:17:00Z')
  const yahooOk = jsonResp({ chart: { result: [{ meta: { marketCap: 2e12 } }] } })
  const yahooNone = jsonResp({ chart: { result: [{ meta: {} }] } })

  it('a company with a market cap from Yahoo and a future earnings date needs no FinanceBird call', async () => {
    const db = fakeDb([row({ ticker: 'AAA' })])
    const calls: string[] = []
    const out = await refreshCompanyData({ db, now, rapidApiKey: 'k', fetchFn: async (u: string) => { calls.push(u); return yahooOk } })
    expect(out.refreshed).toEqual(['AAA'])
    expect(out.financebirdCalls).toBe(0)
    expect(calls.some((u) => u.includes('financebird'))).toBe(false)
    expect(db.updates[0][0]).toBe(2e12)
    expect(db.updates[0][4]).toBeNull()
  })
  it('a passed earnings date is refreshed from FinanceBird, and market cap is taken from it when Yahoo has none', async () => {
    const db = fakeDb([row({ ticker: 'BBB', next_earnings_date: '2026-11-01' })])
    const ts = Date.UTC(2027, 0, 20) / 1000
    const out = await refreshCompanyData({ db, now, rapidApiKey: 'k', fetchFn: async (u: string) => u.includes('financebird') ? jsonResp({ quoteResponse: { result: [{ marketCap: { raw: 7e10 }, earningsTimestampEnd: { raw: ts } }] } }) : yahooNone })
    expect(out.refreshed).toEqual(['BBB'])
    expect(db.updates[0].slice(0, 4)).toEqual([7e10, '2027-01-20', '2027-01-20', 0])
  })
  it('a failure is recorded for the roster note, and the other companies still run', async () => {
    const db = fakeDb([row({ ticker: 'BAD', refreshed_at: '2026-01-01' }), row({ ticker: 'GOOD', refreshed_at: '2026-02-01' })])
    const out = await refreshCompanyData({ db, now, rapidApiKey: 'k', fetchFn: async (u: string) => {
      if (u.includes('/BAD')) return u.includes('financebird') ? jsonResp({}, false, 500) : yahooNone
      return yahooOk
    } })
    expect(out.failed.map((f) => f.ticker)).toEqual(['BAD'])
    expect(out.failed[0].error).toContain('no market cap found')
    expect(out.refreshed).toEqual(['GOOD'])
    expect(db.updates).toHaveLength(2)
  })
  it('a failed lookup never blanks an existing value (nulls are passed to COALESCE)', async () => {
    const db = fakeDb([row({ ticker: 'KEEP', next_earnings_date: '2026-11-01' })])
    await refreshCompanyData({ db, now, rapidApiKey: 'k', fetchFn: async () => jsonResp({}, false, 500) })
    expect(db.updates[0].slice(0, 3)).toEqual([null, null, null])
  })
  it('never makes more FinanceBird calls than the daily limit allows, and leaves the rest for tomorrow', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ ticker: 'X' + i, next_earnings_date: null }))
    const db = fakeDb(rows)
    const out = await refreshCompanyData({ db, now, rapidApiKey: 'k', maxFinanceBirdCalls: 3, fetchFn: async (u: string) => u.includes('financebird') ? jsonResp({ quoteResponse: { result: [{ marketCap: 1e9, earningsTimestampEnd: { raw: Date.UTC(2027, 0, 5) / 1000 } }] } }) : yahooNone })
    expect(out.financebirdCalls).toBe(3)
    expect(out.refreshed).toHaveLength(3)
    expect(out.skipped).toHaveLength(5)
    expect(db.updates).toHaveLength(3)
  })
})

describe('the shared secret check', () => {
  it('accepts only the exact secret', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true)
    expect(safeEqual('abc123', 'abc124')).toBe(false)
    expect(safeEqual('abc', 'abc123')).toBe(false)
  })
})

describe('funds and the ETF list are never refreshed', () => {
  const now = new Date('2026-11-13T09:17:00Z')
  const yahooOk = jsonResp({ chart: { result: [{ meta: { marketCap: 2e12 } }] } })
  it('FNNCF and FTN.TO are skipped even though they look like companies', () => {
    const rows = [row({ ticker: 'FNNCF', sector: 'Financial Services', industry: 'Asset Management', exchange: 'PNK', refreshed_at: null }), row({ ticker: 'FTN.TO', sector: 'Financial Services', exchange: 'TOR', refreshed_at: null }), row({ ticker: 'AAA' })]
    expect(pickBatch(rows, TODAY).map((r) => r.ticker)).toEqual(['AAA'])
  })
  it('anything on the ETF list is skipped, in any letter case', async () => {
    const db = fakeDb([row({ ticker: 'SLV', sector: 'Basic Materials' }), row({ ticker: 'AAA' })])
    const out = await refreshCompanyData({ db, now, rapidApiKey: 'k', etfTickers: ['slv'], fetchFn: async () => yahooOk })
    expect(out.checked).toBe(1)
    expect(out.refreshed).toEqual(['AAA'])
  })
  it('an error left on a skipped fund is cleared so it stops showing on the roster', async () => {
    const db = fakeDb([row({ ticker: 'FNNCF', data_refresh_error: 'no market cap found' }), row({ ticker: 'AAA' })])
    await refreshCompanyData({ db, now, rapidApiKey: 'k', fetchFn: async () => yahooOk })
    expect(db.updates).toContainEqual(['FNNCF'])
  })
  it('a company that is not excluded still refreshes (SPCX is SpaceX, a real company)', async () => {
    const db = fakeDb([row({ ticker: 'SPCX', sector: 'Industrials', industry: 'Aerospace & Defense', market_cap: null, next_earnings_date: null })])
    const out = await refreshCompanyData({ db, now, rapidApiKey: 'k', fetchFn: async (u: string) => u.includes('financebird') ? jsonResp({}, false, 404) : yahooOk })
    expect(out.checked).toBe(1)
  })
})
