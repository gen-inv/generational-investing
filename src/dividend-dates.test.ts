import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Regression: D1 rejects `undefined` bind values. A dividend missing a pay/record/declaration date (seen with UNH)
// must store NULL, so every such assignment from the Massive response has to fall back to null.
describe('dividend date fields', () => {
  for (const f of ['routes/dividends.ts', 'scheduled.ts']) {
    it(`${f}: missing dates become null`, () => {
      const lines = fs.readFileSync(path.resolve(__dirname, f), 'utf8').split(/\r?\n/)
      const assigns = lines.filter(l => /const (payDate|recordDate|declaredDate) = /.test(l))
      expect(assigns.length).toBeGreaterThan(0)
      for (const l of assigns) expect(l).toMatch(/\|\| null\s*$/)
    })
  }
})
