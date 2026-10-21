import { describe, it, expect } from 'vitest'
import { costBasisPerShare } from './cost-basis'

describe('costBasisPerShare', () => {
  it('NFLX case: losses on sold shares raise the cost basis of the shares left', () => {
    // 800 shares at 91.57, $36,839.93 of premiums, three losing sells totalling -26,910.81
    const cb = costBasisPerShare(91.57, 800, 36839.93, -26910.81)
    expect(cb).toBeCloseTo(79.16, 2)
    expect(cb).toBeGreaterThan(costBasisPerShare(91.57, 800, 36839.93, 0)) // the old (buggy) answer was 45.52
  })
  it('gains on sold shares lower it', () => {
    expect(costBasisPerShare(50, 100, 200, 1000)).toBeCloseTo(50 - 1200 / 100, 6)
  })
  it('no sales: unchanged from average price minus premiums', () => {
    expect(costBasisPerShare(50, 100, 300, 0)).toBeCloseTo(47, 6)
  })
  it('no shares held returns the average price (no divide by zero)', () => {
    expect(costBasisPerShare(50, 0, 300, -100)).toBe(50)
    expect(Number.isFinite(costBasisPerShare(50, 0, 300, 100))).toBe(true)
  })
  it('tolerates missing numbers', () => {
    expect(costBasisPerShare(50, 100, undefined as any, null as any)).toBe(50)
  })
})
