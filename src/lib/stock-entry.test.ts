import { describe, it, expect } from 'vitest'
import { stockEntryAnalysis } from './stock-entry'

describe('stockEntryAnalysis', () => {
  it('buy: capital required is price x shares plus commission', () => {
    const r = stockEntryAnalysis({ tradeType: 'BUY', quantity: 100, price: 50.25, commission: 5 })
    expect(r.ready).toBe(true)
    expect(r.gross).toBeCloseTo(5025)
    expect(r.totalRisk).toBeCloseTo(5030)
    expect(r.target).toBeNull()
  })
  it('target: sell at twice the research buy price, profit and ROI measured on cost incl. commission', () => {
    const r = stockEntryAnalysis({ quantity: 100, price: 50, commission: 10, targetBuyPrice: 40 })
    expect(r.target!.sellPrice).toBe(80)
    expect(r.target!.profit).toBeCloseTo(8000 - 5010)
    expect(r.target!.roiPct).toBeCloseTo((2990 / 5010) * 100)
  })
  it('sell: proceeds net of commission and no target', () => {
    const r = stockEntryAnalysis({ tradeType: 'SELL', quantity: 10, price: 20, commission: 1, targetBuyPrice: 30 })
    expect(r.isSell).toBe(true)
    expect(r.proceeds).toBeCloseTo(199)
    expect(r.target).toBeNull()
  })
  it('not ready until shares and price are both positive', () => {
    expect(stockEntryAnalysis({ quantity: '', price: 5 }).ready).toBe(false)
    expect(stockEntryAnalysis({ quantity: 5, price: 0 }).ready).toBe(false)
    expect(stockEntryAnalysis({ quantity: 'abc', price: 'x' }).totalRisk).toBe(0)
  })
  it('fractional share counts are truncated like the form does', () => {
    expect(stockEntryAnalysis({ quantity: '10.9', price: 1 }).gross).toBe(10)
  })
  it('target needs a positive research price', () => {
    expect(stockEntryAnalysis({ quantity: 1, price: 1, targetBuyPrice: 0 }).target).toBeNull()
    expect(stockEntryAnalysis({ quantity: 1, price: 1, targetBuyPrice: '' }).target).toBeNull()
  })
})
