import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Money received is "proceeds", money paid is "cost" -- everywhere a person can see it.
const src = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../' + rel), 'utf8')

describe('cash-flow wording', () => {
  it('no screen still says "Total Premium" or "Net Premium"', () => {
    for (const f of ['public/static/app.js', 'src/routes/frontend.ts', 'public/static/modal-close.js', 'public/static/modal-cc-manage.js']) {
      expect(src(f), f).not.toMatch(/[>\x27"]\s*(Total|Net) Premium/)
    }
  })
  it('option details window names the total by direction', () => {
    expect(src('public/static/app.js')).toContain("strategyConfig.isPremiumCredit ? 'Total proceeds' : 'Total cost'")
  })
  it('spread list header: Net Cost for debit spreads, Net Proceeds for credit spreads and condors', () => {
    expect(src('public/static/app.js')).toContain("currentStrategyFilter === 'DEBIT_SPREAD' ? 'Net Cost' : 'Net Proceeds'")
  })
  it('covered call summaries say Total proceeds, not Premium received', () => {
    for (const f of ['public/static/modal-close.js', 'public/static/modal-cc-manage.js']) {
      expect(src(f), f).toContain("K.stat('Total proceeds'")
      expect(src(f), f).not.toContain("K.stat('Premium received'")
    }
  })
})
