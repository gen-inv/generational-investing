import { describe, it, expect } from 'vitest'
import { optionEntryAnalysis } from './option-entry'

describe('optionEntryAnalysis', () => {
  it('short put: risk = strike less premium plus commission, profit = premium less commission', () => {
    const r = optionEntryAnalysis({ strategy: 'SELLING_PUT', contracts: 2, commission: 1.3, values: { strike_price: 50, premium: 2 } })
    expect(r.totalRisk).toBeCloseTo(50 * 200 - 2 * 200 + 1.3, 6)
    expect(r.maxProfit).toBeCloseTo(398.7, 6)
    expect(r.netCredit).toBeNull()
  })
  it('wheel and long-term puts use the same formula as stockpiling', () => {
    for (const s of ['SELLING_PUT_WHEEL', 'SELLING_PUT_LONG_TERM']) {
      expect(optionEntryAnalysis({ strategy: s, contracts: 1, values: { strike_price: 40, premium: 1 } }).totalRisk).toBe(3900)
    }
  })
  it('long put / long call: risk is what you paid, no max profit', () => {
    for (const s of ['BUYING_PUT', 'LONG_CALL']) {
      const r = optionEntryAnalysis({ strategy: s, contracts: 3, commission: 2, values: { strike_price: 100, premium: 1.5 } })
      expect(r.totalRisk).toBeCloseTo(452, 6)
      expect(r.maxProfit).toBeNull()
    }
  })
  it('covered call: max profit only', () => {
    const r = optionEntryAnalysis({ strategy: 'COVERED_CALL', contracts: 1, commission: 1, values: { premium: 2 } })
    expect(r).toMatchObject({ totalRisk: null, maxProfit: 199 })
  })
  it('credit spread', () => {
    const r = optionEntryAnalysis({ strategy: 'CREDIT_SPREAD', contracts: 2, commission: 2, values: { short_strike: 100, short_premium: 3, long_strike: 95, long_premium: 1 } })
    expect(r.netCredit).toBeCloseTo(400, 6)
    expect(r.totalRisk).toBeCloseTo(1000 - 400 + 2, 6)
    expect(r.maxProfit).toBeCloseTo(398, 6)
  })
  it('debit spread', () => {
    const r = optionEntryAnalysis({ strategy: 'DEBIT_SPREAD', contracts: 1, commission: 1, values: { long_strike: 100, long_premium: 4, short_strike: 105, short_premium: 1.5 } })
    expect(r.netDebit).toBeCloseTo(250, 6)
    expect(r.totalRisk).toBeCloseTo(251, 6)
    expect(r.maxProfit).toBeCloseTo(500 - 250 - 1, 6)
  })
  it('iron condor: risk is the wider wing less the total credit', () => {
    const r = optionEntryAnalysis({ strategy: 'IRON_CONDOR', contracts: 1, commission: 4, values: {
      short_call_strike: 110, short_call_premium: 1.5, long_call_strike: 115, long_call_premium: 0.5,
      short_put_strike: 90, short_put_premium: 1.5, long_put_strike: 80, long_put_premium: 0.5 } })
    expect(r.netCredit).toBeCloseTo(200, 6)
    expect(r.totalRisk).toBeCloseTo(1000 - 200 + 4, 6)
    expect(r.maxProfit).toBeCloseTo(196, 6)
  })
  it('DTE, RORC and ARORC from the dates', () => {
    const r = optionEntryAnalysis({ strategy: 'SELLING_PUT', contracts: 1, values: { strike_price: 50, premium: 1 }, tradeDate: '2026-01-01', expirationDate: '2026-01-31' })
    expect(r.dte).toBe(30)
    expect(r.rorc).toBeCloseTo((100 / 4900) * 100, 6)
    expect(r.arorc).toBeCloseTo(r.rorc! * (365 / 30), 6)
  })
  it('no dates, no DTE; same-day trade has RORC but no ARORC', () => {
    expect(optionEntryAnalysis({ strategy: 'SELLING_PUT', contracts: 1, values: { strike_price: 50, premium: 1 } }).dte).toBeNull()
    const r = optionEntryAnalysis({ strategy: 'SELLING_PUT', contracts: 1, values: { strike_price: 50, premium: 1 }, tradeDate: '2026-01-01', expirationDate: '2026-01-01' })
    expect(r.dte).toBe(0)
    expect(r.rorc).not.toBeNull()
    expect(r.arorc).toBeNull()
  })
  it('blank or partial input is treated as zero, never NaN', () => {
    const r = optionEntryAnalysis({ strategy: 'CREDIT_SPREAD', contracts: '', values: { short_strike: '', long_strike: 'x' } })
    expect(r.totalRisk).toBe(0)
    expect(r.maxProfit).toBe(0)
  })
  it('unknown strategy returns nothing', () => {
    expect(optionEntryAnalysis({ strategy: '', contracts: 1, values: {} })).toMatchObject({ totalRisk: null, maxProfit: null })
  })
})
