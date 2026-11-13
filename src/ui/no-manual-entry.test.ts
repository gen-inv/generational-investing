import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Companies are filled in automatically (Yahoo data, Kendry's research, Fetch Earnings Date). Nothing is typed in by hand.
const appSrc = readFileSync('public/static/app.js', 'utf8')
const compSrc = readFileSync('src/routes/companies.ts', 'utf8')

describe('no manual company entry', () => {
  it('the roster has no pencil (edit) button and no edit function', () => {
    expect(appSrc).not.toContain('editCompany')
  })
  it('there are no boxes for typing a research score, anti-fragile score or Wonderful tick', () => {
    expect(appSrc).not.toContain('name="research_score"')
    expect(appSrc).not.toContain('name="anti_fragile_score"')
    expect(appSrc).not.toContain('name="is_wonderful"')
    expect(appSrc).not.toContain("formData.get('research_score')")
    expect(appSrc).not.toContain("formData.get('is_wonderful')")
  })
  it('the server no longer accepts typed-in scores or a Wonderful flag', () => {
    expect(compSrc).not.toContain("'research_score = ?'")
    expect(compSrc).not.toContain("'anti_fragile_score = ?'")
    expect(compSrc).not.toContain("'is_wonderful = ?'")
  })
  it('Add Company (ticker only) and Delete are still there', () => {
    expect(appSrc).toContain('name="ticker"')
    expect(appSrc).toContain('deleteCompany(')
  })
})
