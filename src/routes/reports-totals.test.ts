import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

// Menu Settings must never change a closed P/L figure.
describe('reports ignore Menu Settings for totals', () => {
  const src = fs.readFileSync('src/routes/reports.ts', 'utf8')

  it('only the open-positions screen may read the menu switches', () => {
    const calls = src.split('\n').filter(l => l.includes('getFeatures(') && !l.includes('import'))
    expect(calls.length).toBe(1)
    expect(calls[0]).toContain('Menu Settings: which kinds of trading the reports include')
  })

  it('every total uses the all-on constant', () => {
    expect(src).toContain('const ALL_TRADING = { stocks: true, options: true, daily: true }')
    expect(src.split('const F = ALL_TRADING').length - 1).toBe(6)
  })
})
