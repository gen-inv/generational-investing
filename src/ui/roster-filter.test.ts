// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

const w = () => window as any
const root = path.resolve(__dirname, '../..')
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

const dbCompanies = [
  { id: 1, ticker: 'AAA', company_name: 'Alpha', research_score: 50, is_wonderful: 0 },   // researched, 85% -> wonderful
  { id: 2, ticker: 'BBB', company_name: 'Beta', research_score: 70, is_wonderful: 1 },    // researched, 72% -> scored, NOT wonderful (research wins over the old star)
  { id: 3, ticker: 'CCC', company_name: 'Gamma', research_score: 60, is_wonderful: 0 },   // no research: stale number on the row must not count as scored
  { id: 4, ticker: 'DDD', company_name: 'Delta', is_wonderful: 1 },                       // no research, manual star
  { id: 5, ticker: 'EEE', company_name: 'Epsilon', is_wonderful: 0 },                     // researched but no scoresheet yet
]
const research = {
  AAA: { scoresheet_pct: 85 }, BBB: { scoresheet_pct: 72 }, EEE: { scoresheet_pct: null },
}

beforeEach(() => { w().eval(read('public/static/research-merge.js')) })
const tickers = (list: any[]) => list.map(c => c.ticker)
const merged = () => w().mergeResearchIntoCompanies(dbCompanies, research)

describe('roster filter', () => {
  it('all shows everything', () => {
    expect(tickers(w().filterCompaniesByResearch(merged(), 'all'))).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE'])
  })
  it('scored = has a real scoresheet, ignoring stale numbers on the company row', () => {
    expect(tickers(w().filterCompaniesByResearch(merged(), 'scored'))).toEqual(['AAA', 'BBB'])
  })
  it('wonderful = scoresheet 80%+ (Grade A), or the manual star on a company with no research', () => {
    expect(tickers(w().filterCompaniesByResearch(merged(), 'wonderful'))).toEqual(['AAA', 'DDD'])
  })
  it('an unknown filter value shows everything', () => {
    expect(w().filterCompaniesByResearch(merged(), 'nonsense')).toHaveLength(5)
  })
  it('80% is the Wonderful line', () => {
    const at = (pct: number) => w().filterCompaniesByResearch(w().mergeResearchIntoCompanies([{ id: 1, ticker: 'X' }], { X: { scoresheet_pct: pct } }), 'wonderful').length
    expect([at(79.9), at(80), at(85)]).toEqual([0, 1, 1])
  })
})

describe('roster filter wiring', () => {
  it('the roster page has the filter control', () => {
    const html = read('src/routes/frontend.ts')
    expect(html).toMatch(/id="companies-filter"/)
    expect(html).toMatch(/setCompaniesFilter\(this\.value\)/)
    for (const v of ['all', 'scored', 'wonderful']) expect(html).toContain(`<option value="${v}">`)
  })
  it('loadCompanies applies the filter and remembers the choice', () => {
    const app = read('public/static/app.js')
    expect(app).toMatch(/filterCompaniesByResearch\(companies, companiesFilter\)/)
    expect(app).toMatch(/localStorage\.setItem\('companiesFilter'/)
    expect(app).toMatch(/No companies match this filter/)
  })
})
