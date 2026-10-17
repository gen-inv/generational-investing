import { describe, it, expect } from 'vitest'
import {
  legacyStockTradePL, adjustedCostBasisPerShare,
  optionPL, optionPLBreakdown, grossPremium, assignmentPL, assignmentDetails, coveredCallAnalysis, daysBetween,
} from './calc'

describe('stock leftovers', () => {
  it('legacy stock_trades price difference', () => {
    expect(legacyStockTradePL({ openPrice: 10, closePrice: 12.5, shares: 40, openCommission: 1, closeCommission: 1 })).toBe(98)
  })
  it('adjusted cost basis subtracts adjustments per share', () => {
    expect(adjustedCostBasisPerShare(50, 300, 100)).toBe(47)
    expect(adjustedCostBasisPerShare(50, 0, 0)).toBe(50)     // 0/0 = NaN -> 0 via the `|| 0` guard, as in the route
    expect(adjustedCostBasisPerShare(50, 300, 0)).toBe(-Infinity) // quirk kept as-is: x/0 = Infinity is truthy, so the guard does not catch it
  })
})

describe('option P/L', () => {
  const near = (v: number, e: number) => expect(v).toBeCloseTo(e, 6)

  it('short put / covered call: (open - close) x contracts x 100 - commissions', () => {
    near(optionPL({ strategy: 'SELLING_PUT', contracts: 3, open: { premium: 1.2 }, close: { close_price: 0.3 }, openCommission: 4, closeCommission: 4 }), 262)
    near(optionPL({ strategy: 'COVERED_CALL', contracts: 1, open: { premium: 0.85 }, close: { close_price: 0 }, openCommission: 1.3, closeCommission: 0 }), 83.7)
    near(optionPL({ strategy: 'SELLING_PUT_WHEEL', contracts: 2, open: { premium: 2 }, close: { close_price: 3 }, openCommission: 0, closeCommission: 0 }), -200)
    near(optionPL({ strategy: 'SELLING_PUT_LONG_TERM', contracts: 1, open: { premium: 5 }, close: { close_price: 1 }, openCommission: 2, closeCommission: 2 }), 396)
  })
  it('long put / long call: (close - open) x contracts x 100 - commissions', () => {
    near(optionPL({ strategy: 'LONG_CALL', contracts: 1, open: { premium: 1.5 }, close: { close_price: 3 }, openCommission: 1, closeCommission: 1 }), 148)
    near(optionPL({ strategy: 'BUYING_PUT', contracts: 2, open: { premium: 2 }, close: { close_price: 0.5 }, openCommission: 0, closeCommission: 0 }), -300)
  })
  it('two-leg spreads: (short-long) open credit minus (short-long) close debit', () => {
    near(optionPL({
      strategy: 'CREDIT_SPREAD', contracts: 2, open: { premium: 2.5, premium_2: 1 }, close: { close_price: 0.5, close_price_2: 0.2 },
      openCommission: 1.3, closeCommission: 1.3,
    }), 237.4)
    near(optionPL({
      strategy: 'DEBIT_SPREAD', contracts: 1, open: { premium: 2.5, premium_2: 1 }, close: { close_price: 0.5, close_price_2: 0.2 },
    }), 120) // same formula as the credit spread, as in the route
  })
  it('iron condor: four legs', () => {
    // open: SC 1.0, LC 0.3, SP 0.9, LP 0.2 -> (0.7 + 0.7) x 100 = 140 ; close: 0.2, 0.05, 0.15, 0.05 -> (0.15 + 0.10) x 100 = 25
    near(optionPL({
      strategy: 'IRON_CONDOR', contracts: 1,
      open: { premium: 1.0, premium_2: 0.3, premium_3: 0.9, premium_4: 0.2 },
      close: { close_price: 0.2, close_price_2: 0.05, close_price_3: 0.15, close_price_4: 0.05 },
      openCommission: 2.6, closeCommission: 2.6,
    }), 140 - 25 - 5.2)
  })
  it('missing legs default to 0 and missing commissions to 0', () => {
    near(optionPL({ strategy: 'IRON_CONDOR', contracts: 1, open: { premium: 1 }, close: { close_price: 0.5 } }), 50)
    near(optionPL({ strategy: 'CREDIT_SPREAD', contracts: 1, open: { premium: 1 }, close: { close_price: 0 }, openCommission: null, closeCommission: null }), 100)
  })
  it('gross premium', () => {
    expect(grossPremium(1.25, 4)).toBe(500)
  })
})

describe('short-put assignment', () => {
  it('P/L keeps all premium less the opening commission', () => {
    expect(assignmentPL({ premium: 2, contracts: 3, openCommission: 5 })).toBe(595)
    expect(assignmentPL({ premium: 2, contracts: 3 })).toBe(600)
  })
  it('new position: shares, strike as average price, adjusted cost basis', () => {
    const d = assignmentDetails({ premium: 2, contracts: 3, strike: 50, openCommission: 5 })
    expect(d.shares).toBe(300)
    expect(d.totalShares).toBe(300)
    expect(d.averagePrice).toBe(50)
    expect(d.netProceeds).toBe(595)
    expect(d.adjustedCostBasis).toBeCloseTo(50 - 595 / 300, 10)
  })
  it('adds to an existing holding at a weighted average price', () => {
    const d = assignmentDetails({ premium: 1, contracts: 1, strike: 40, existing: { totalShares: 100, averagePrice: 50 } })
    expect(d.totalShares).toBe(200)
    expect(d.averagePrice).toBe(45)
  })
})

describe('covered-call live analysis (new)', () => {
  const base = { contracts: 2, strike: 55, premium: 1.0, commission: 2, costBasisPerShare: 50, daysToExpiry: 30 }
  it('income and returns', () => {
    const r = coveredCallAnalysis(base)
    expect(r.shares).toBe(200)
    expect(r.grossPremium).toBe(200)
    expect(r.netPremium).toBe(198)
    expect(r.returnIfUnchanged).toBeCloseTo(198 / 10000, 10)
    expect(r.annualizedIfUnchanged).toBeCloseTo((198 / 10000) * (365 / 30), 10)
  })
  it('if called away: premium plus strike gain over cost basis', () => {
    const r = coveredCallAnalysis(base)
    expect(r.gainIfCalled).toBe(198 + 5 * 200) // 1198
    expect(r.returnIfCalled).toBeCloseTo(1198 / 10000, 10)
    expect(r.lockedInLoss).toBe(false)
  })
  it('break-even and downside protection', () => {
    const r = coveredCallAnalysis(base)
    expect(r.breakeven).toBeCloseTo(50 - 198 / 200, 10) // 49.01
    expect(r.downsideProtection).toBeCloseTo((198 / 200) / 50, 10)
  })
  it('warns when the strike is below cost basis', () => {
    const r = coveredCallAnalysis({ ...base, strike: 48 })
    expect(r.lockedInLoss).toBe(true)
    expect(r.gainIfCalled).toBe(198 + (48 - 50) * 200) // -202
  })
  it('no annualised figures without a valid expiry; no divide-by-zero without a cost basis', () => {
    expect(coveredCallAnalysis({ ...base, daysToExpiry: null }).annualizedIfCalled).toBeNull()
    expect(coveredCallAnalysis({ ...base, daysToExpiry: 0 }).daysToExpiry).toBeNull()
    const r = coveredCallAnalysis({ ...base, costBasisPerShare: 0 })
    expect(r.returnIfUnchanged).toBeNull()
    expect(r.downsideProtection).toBeNull()
  })
})

describe('daysBetween', () => {
  it('ceil of the day difference, null when a date is missing', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30)
    expect(daysBetween('', '2026-10-31')).toBeNull()
    expect(daysBetween('2026-10-31', '2026-10-01')).toBe(-30)
  })
})
describe('optionPLBreakdown (what the close modals show)', () => {
  const near = (v: number, e: number) => expect(v).toBeCloseTo(e, 6)

  it('short put: credit in, cost out, commissions, net', () => {
    const b = optionPLBreakdown({ strategy: 'SELLING_PUT', contracts: 3, open: { premium: 1.2 }, close: { close_price: 0.3 }, openCommission: 4, closeCommission: 4 })
    near(b.openingCredit, 360); near(b.closingCost, 90); expect(b.openCommission).toBe(4); expect(b.closeCommission).toBe(4); near(b.netPL, 262)
  })
  it('long call: both sides negative, net is close - open', () => {
    const b = optionPLBreakdown({ strategy: 'LONG_CALL', contracts: 1, open: { premium: 1.5 }, close: { close_price: 3 }, openCommission: 1, closeCommission: 1 })
    near(b.openingCredit, -150); near(b.closingCost, -300); near(b.netPL, 148)
  })
  it('credit spread and iron condor net the legs', () => {
    const s = optionPLBreakdown({ strategy: 'CREDIT_SPREAD', contracts: 2, open: { premium: 2.5, premium_2: 1 }, close: { close_price: 0.5, close_price_2: 0.2 }, openCommission: 1.3, closeCommission: 1.3 })
    near(s.openingCredit, 300); near(s.closingCost, 60); near(s.netPL, 237.4)
    const ic = optionPLBreakdown({
      strategy: 'IRON_CONDOR', contracts: 1, open: { premium: 1.0, premium_2: 0.3, premium_3: 0.9, premium_4: 0.2 },
      close: { close_price: 0.2, close_price_2: 0.05, close_price_3: 0.15, close_price_4: 0.05 }, openCommission: 2.6, closeCommission: 2.6,
    })
    near(ic.openingCredit, 140); near(ic.closingCost, 25); near(ic.netPL, 109.8)
  })
  it('optionPL is exactly the breakdown net for every strategy', () => {
    for (const strategy of ['SELLING_PUT', 'SELLING_PUT_WHEEL', 'SELLING_PUT_LONG_TERM', 'BUYING_PUT', 'LONG_CALL', 'COVERED_CALL', 'CREDIT_SPREAD', 'DEBIT_SPREAD', 'IRON_CONDOR']) {
      const a = { strategy, contracts: 3, open: { premium: 2.1, premium_2: 0.9, premium_3: 1.7, premium_4: 0.4 }, close: { close_price: 0.7, close_price_2: 0.1, close_price_3: 0.5, close_price_4: 0.2 }, openCommission: 3.1, closeCommission: 2.2 }
      expect(optionPL(a)).toBe(optionPLBreakdown(a).netPL)
    }
  })
})
