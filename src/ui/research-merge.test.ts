// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const w = () => window as any
const dbCompanies = [
  { id: 1, ticker: 'AAA', company_name: 'Alpha', buy_price: 10, sticker_price: null, research_score: 50, is_wonderful: 0 },
  { id: 2, ticker: 'BBB', company_name: 'Beta', buy_price: 99 },
]
const research = {
  AAA: { scoresheet_pct: 85, anti_fragile_total: 7, blended_buy_price: 42.5, blended_sticker: 85, last_researched_date: '2026-10-10' },
}

beforeEach(() => {
  w().eval(fs.readFileSync(path.resolve(__dirname, '../../public/static/research-merge.js'), 'utf8'))
  w().fetchResearchFindings = vi.fn(async () => research)
  w().api = { get: vi.fn(async () => ({ data: { companies: dbCompanies } })) }
})

describe('mergeResearchIntoCompanies', () => {
  it('research buy price, sticker, scores and last-researched replace the stale company values', () => {
    const [a] = w().mergeResearchIntoCompanies(dbCompanies, research)
    expect(a).toMatchObject({ id: 1, ticker: 'AAA', buy_price: 42.5, sticker_price: 85, research_score: 85, anti_fragile_score: 7, last_researched: '2026-10-10', is_wonderful: true })
  })
  it('wonderful follows the research score (>= 80)', () => {
    expect(w().mergeResearchIntoCompanies(dbCompanies, { AAA: { ...research.AAA, scoresheet_pct: 79 } })[0].is_wonderful).toBe(false)
  })
  it('a company with no research is returned untouched', () => {
    const [, b] = w().mergeResearchIntoCompanies(dbCompanies, research)
    expect(b).toBe(dbCompanies[1])
  })
  it('does not mutate its input', () => {
    w().mergeResearchIntoCompanies(dbCompanies, research)
    expect(dbCompanies[0].buy_price).toBe(10)
  })
})

describe('fetchCompaniesWithResearch', () => {
  it('returns companies with research merged (what the Add Option / Add Stock / details screens use)', async () => {
    const out = await w().fetchCompaniesWithResearch()
    expect(w().api.get).toHaveBeenCalledWith('/api/companies')
    expect(out.map((c: any) => c.buy_price)).toEqual([42.5, 99])
  })
  it('accepts either response shape (array or { companies })', async () => {
    w().api.get = vi.fn(async () => ({ data: dbCompanies }))
    expect((await w().fetchCompaniesWithResearch())[0].buy_price).toBe(42.5)
  })
  it('if research is unavailable the company values are kept', async () => {
    w().fetchResearchFindings = vi.fn(async () => ({}))
    expect((await w().fetchCompaniesWithResearch()).map((c: any) => c.buy_price)).toEqual([10, 99])
  })
})
