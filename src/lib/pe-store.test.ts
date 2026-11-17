import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { listPeTickers, storePeResults } from './pe-store'

const fakeDb = (rows: any[] = []) => {
  const calls: { sql: string; args: any[] }[] = []
  return {
    calls,
    prepare: (sql: string) => ({
      all: async () => ({ results: rows }),
      bind: (...args: any[]) => ({ run: async () => { calls.push({ sql, args }); return {} } }),
    }),
  }
}
const stats = { min: 10, p5: 12, median: 20, p95: 30, max: 40, current: 25, percentile: 70, months: 118 }

describe('listPeTickers', () => {
  it('lists companies only: no funds, indices, ETF-list tickers or permanently excluded ones', async () => {
    const db = fakeDb([
      { ticker: 'AAA', exchange: 'NMS', sector: 'Tech', industry: 'Software' },
      { ticker: '^GSPC', exchange: 'SNP', sector: null, industry: null },
      { ticker: 'SPY', exchange: 'PCX', sector: null, industry: null },
      { ticker: 'SLV', exchange: 'NMS', sector: 'Basic Materials', industry: 'Silver' },
      { ticker: 'FNNCF', exchange: 'PNK', sector: 'Financial', industry: 'Asset' },
      { ticker: 'FTN.TO', exchange: 'TOR', sector: 'Financial', industry: 'Asset' },
      { ticker: 'BBB', exchange: 'NYQ', sector: 'Energy', industry: 'Oil' },
    ])
    expect(await listPeTickers(db, ['slv'])).toEqual(['AAA', 'BBB'])
  })
})

describe('storePeResults', () => {
  it('stores a range and clears any earlier error', async () => {
    const db = fakeDb()
    const out = await storePeResults(db, [{ ticker: 'AAA', eps: 4.2, summary: stats }])
    expect(out).toEqual({ stored: 1, errors: 0, rejected: [] })
    expect(db.calls[0].sql).toContain('pe_error = NULL')
    expect(db.calls[0].args).toEqual([4.2, 25, 10, 12, 20, 30, 40, 70, 118, 'AAA'])
  })
  it('a permanent problem clears the old range so it cannot mislead', async () => {
    const db = fakeDb()
    const out = await storePeResults(db, [{ ticker: 'LOSS', error: 'no positive trailing earnings', clear: true }])
    expect(out.errors).toBe(1)
    expect(db.calls[0].sql).toContain('pe_current = NULL'); expect(db.calls[0].args).toEqual(['no positive trailing earnings', 'LOSS'])
  })
  it('a temporary problem keeps last week\'s numbers and only notes the error', async () => {
    const db = fakeDb()
    await storePeResults(db, [{ ticker: 'AAA', error: 'SEC answered HTTP 503' }])
    expect(db.calls[0].sql).not.toContain('pe_current'); expect(db.calls[0].args).toEqual(['SEC answered HTTP 503', 'AAA'])
  })
  it('rejects bad input instead of writing it', async () => {
    const db = fakeDb()
    const out = await storePeResults(db, [
      { ticker: '' } as any, { ticker: 'X'.repeat(30), summary: stats }, { ticker: 'NAN', eps: 1, summary: { ...stats, p5: NaN } },
      { ticker: 'STR', eps: '4' as any, summary: stats }, null as any,
    ])
    expect(out.stored).toBe(0); expect(db.calls).toHaveLength(0); expect(out.rejected).toHaveLength(5)
  })
  it('only the first 100 results of one post are handled', async () => {
    const db = fakeDb()
    const many = Array.from({ length: 150 }, (_, i) => ({ ticker: 'T' + i, eps: 1, summary: stats }))
    expect((await storePeResults(db, many)).stored).toBe(100)
  })
  it('the migration has every column the update writes', () => {
    const mig = fs.readFileSync(path.resolve(__dirname, '../../migrations/0036_pe_history.sql'), 'utf8')
    for (const col of ['pe_eps_ttm', 'pe_current', 'pe_min', 'pe_p5', 'pe_median', 'pe_p95', 'pe_max', 'pe_percentile', 'pe_months', 'pe_updated_at', 'pe_error']) {
      expect(mig, col).toContain('ADD COLUMN ' + col + ' ')
    }
  })
})

describe('the two cron routes', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../routes/companies.ts'), 'utf8')
  it('check the secret before touching any data', () => {
    for (const [route, fn] of [["'/api/cron/pe-history/companies'", 'listPeTickers('], ["'/api/cron/pe-history'", 'storePeResults(']]) {
      const at = src.indexOf(route)
      expect(at, route).toBeGreaterThan(-1)
      const body = src.slice(at, at + 900)
      expect(body.indexOf('peCronAuth(c)'), route).toBeGreaterThan(-1)
      expect(body.indexOf('peCronAuth(c)'), route).toBeLessThan(body.indexOf(fn))
    }
  })
})
