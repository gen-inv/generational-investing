import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The roster list and the company popup both go through research-merge.js; these tests pin the shared behaviour.
const mergeSrc = readFileSync('public/static/research-merge.js', 'utf8')
const lib = new Function(mergeSrc + '\nreturn { mergeResearchIntoCompanies, formatResearchScore, formatAntiFragile, wonderfulBadgeHtml, earningsStatus, earningsCellHtml, scoresheetGrade }')()
const appSrc = readFileSync('public/static/app.js', 'utf8')
const frontSrc = readFileSync('src/routes/frontend.ts', 'utf8')

const NOW = new Date(2026, 10, 13, 23, 59) // Nov 13 2026, late evening local time

describe('Next Earnings colours', () => {
  const state = (d: string) => lib.earningsStatus(d, NOW).state
  it('today and the next 10 days are red', () => {
    expect(state('2026-11-13')).toBe('red')
    expect(state('2026-11-23')).toBe('red')
  })
  it('11 to 30 days out is orange', () => {
    expect(state('2026-11-24')).toBe('orange')
    expect(state('2026-12-13')).toBe('orange')
  })
  it('more than 30 days out is plain', () => {
    expect(state('2026-12-14')).toBe('later')
  })
  it('a date that has passed is grey and says how to refresh it', () => {
    expect(state('2026-11-12')).toBe('passed')
    const html = lib.earningsCellHtml({ next_earnings_date: '2026-11-12' }, NOW)
    expect(html).toContain('text-gray-400')
    expect(html).toContain('Fetch Earnings Date')
  })
  it('a missing or unreadable date shows a dash', () => {
    expect(lib.earningsCellHtml({ next_earnings_date: null }, NOW)).toBe('-')
    expect(lib.earningsCellHtml({}, NOW)).toBe('-')
    expect(lib.earningsCellHtml({ next_earnings_date: 'soon' }, NOW)).toBe('-')
  })
  it('a date with a time on the end is read by its date part', () => {
    expect(state('2026-11-20T00:00:00Z')).toBe('red')
  })
  it('uses the colours Rob asked for', () => {
    expect(lib.earningsCellHtml({ next_earnings_date: '2026-11-20' }, NOW)).toContain('text-red-600')
    expect(lib.earningsCellHtml({ next_earnings_date: '2026-12-01' }, NOW)).toContain('text-orange-600')
  })
})

describe('roster and popup show the same scores', () => {
  const research = { AAA: { scoresheet_pct: 88.44, anti_fragile_total: 27, blended_buy_price: 10, blended_sticker: 20, last_researched_date: '2026-11-01' } }
  const stale = { ticker: 'AAA', research_score: 12, anti_fragile_score: 3, is_wonderful: 0 }
  const merged = lib.mergeResearchIntoCompanies([stale], research)[0]
  it('a merged company shows the researched numbers, not the stale company row', () => {
    expect(lib.formatResearchScore(merged)).toBe('88.4%')
    expect(lib.formatAntiFragile(merged)).toBe('27/32')
    expect(lib.formatResearchScore(stale)).toBe('12.0%')
  })
  it('no score shows a dash', () => {
    expect(lib.formatResearchScore({})).toBe('-')
    expect(lib.formatAntiFragile({})).toBe('-')
    expect(lib.formatAntiFragile({ anti_fragile_score: 0 })).toBe('0/32')
  })
  it('the popup merges the research data and uses the shared formatters', () => {
    expect(appSrc).toContain('mergeResearchIntoCompanies([company], await fetchResearchFindings())')
    expect(appSrc.split('formatResearchScore(company)').length - 1).toBeGreaterThanOrEqual(2)
    expect(appSrc.split('formatAntiFragile(company)').length - 1).toBeGreaterThanOrEqual(2)
  })
})

describe('Wonderful badge', () => {
  const at = (pct: number) => lib.mergeResearchIntoCompanies([{ ticker: 'AAA' }], { AAA: { scoresheet_pct: pct } })[0]
  it('appears at 80% and above, not below', () => {
    expect(lib.wonderfulBadgeHtml(at(80))).toContain('Wonderful')
    expect(lib.wonderfulBadgeHtml(at(79.9))).toBe('')
  })
  it('the roster puts a star in front of the company name and the popup uses the badge', () => {
    expect(appSrc).toContain('wonderfulStarHtml(company) + company.company_name')
    expect(appSrc).toContain('wonderfulBadgeHtml(company) : \'No\'')
  })
})

describe('scoresheet grade comes from the percentage', () => {
  it('80% and above is investable, 75% to 80% is tradeable via options, below that is below threshold', () => {
    expect(lib.scoresheetGrade({ total_pct: 80 })).toBe('A+ (investable)')
    expect(lib.scoresheetGrade({ total_pct: 79.9 })).toBe('A (tradeable via options)')
    expect(lib.scoresheetGrade({ total_pct: 75 })).toBe('A (tradeable via options)')
    expect(lib.scoresheetGrade({ total_pct: 74.9 })).toBe('Below threshold')
  })
  it('ignores a stale stored grade, and falls back to it only when there is no percentage', () => {
    expect(lib.scoresheetGrade({ total_pct: 82, grade: 'A (tradeable via options)' })).toBe('A+ (investable)')
    expect(lib.scoresheetGrade({ scoresheet_pct: 77 })).toBe('A (tradeable via options)')
    expect(lib.scoresheetGrade({ grade: 'Incomplete' })).toBe('Incomplete')
  })
  it('the research view uses it', () => {
    expect(appSrc).toContain('Grade: ${scoresheetGrade(scoresheet)}')
  })
})

describe('roster columns', () => {
  it('the roster no longer has Exchange or a Wonderful column, and has Next Earnings', () => {
    expect(frontSrc).not.toContain('>Exchange</th>')
    expect(frontSrc).not.toContain('>Wonderful</th>')
    expect(frontSrc).toContain('>Next Earnings</th>')
    expect(appSrc).not.toContain("<td class=\"px-4 py-3\">${company.exchange || '-'}</td>")
    expect(appSrc).toContain('${earningsCellHtml(company)}')
  })
  it('the company popup still shows the Exchange', () => {
    expect(appSrc).toContain('<p class="text-sm text-gray-500 mb-1">Exchange</p>')
  })
})

describe('Wonderful star and roster legend', () => {
  const starLib = new Function(mergeSrc + '\nreturn { wonderfulStarHtml }')()
  it('a Wonderful company gets a gold star, others get nothing', () => {
    expect(starLib.wonderfulStarHtml({ is_wonderful: true })).toContain('fa-star')
    expect(starLib.wonderfulStarHtml({ is_wonderful: true })).toContain('text-brand-gold')
    expect(starLib.wonderfulStarHtml({ is_wonderful: false })).toBe('')
    expect(starLib.wonderfulStarHtml({ is_wonderful: 0 })).toBe('')
    expect(starLib.wonderfulStarHtml(null)).toBe('')
  })
  it('a company at 75% with an old manual star is not Wonderful once it has research at 75%', () => {
    const merged = lib.mergeResearchIntoCompanies([{ ticker: 'AAA', research_score: 60, is_wonderful: 1 }], { AAA: { scoresheet_pct: 75 } })[0]
    expect(starLib.wonderfulStarHtml(merged)).toBe('')
  })
  it('the legend explains the star and the earnings colours', () => {
    expect(frontSrc).toContain('considered worthy of long-term investment')
    expect(frontSrc).toContain('the date has passed and needs a refresh')
  })
})
