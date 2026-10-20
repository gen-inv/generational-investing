import { describe, it, expect } from 'vitest'
import { addToStockPosition, sellFromStockPosition, addToOptionPosition, splitOptionCommission } from './position-change'

describe('addToStockPosition', () => {
  it('blends the average cost by shares', () => {
    const r = addToStockPosition({ heldShares: 100, avgCost: 50, quantity: 100, price: 60, commission: 2 })
    expect(r.newShares).toBe(200); expect(r.newAvgCost).toBe(55); expect(r.cost).toBe(6000); expect(r.totalOutlay).toBe(6002)
  })
  it('is not ready without shares and price; handles an empty holding', () => {
    expect(addToStockPosition({ heldShares: 10, avgCost: 5, quantity: '', price: 3 }).ready).toBe(false)
    expect(addToStockPosition({ heldShares: 0, avgCost: 0, quantity: 10, price: 4 }).newAvgCost).toBe(4)
  })
})

describe('sellFromStockPosition', () => {
  it('books (price - avg) x shares less sell commission and the pro rata buy commission', () => {
    const r = sellFromStockPosition({ heldShares: 100, avgCost: 50, pendingBuyCommission: 10, quantity: 40, price: 60, commission: 1 })
    expect(r.saleProceeds).toBe(2400); expect(r.costBasis).toBe(2000)
    expect(r.buyCommission).toBeCloseTo(4); expect(r.netPL).toBeCloseTo(2400 - 2000 - 4 - 1)
    expect(r.remainingShares).toBe(60); expect(r.sellsAll).toBe(false); expect(r.overSell).toBe(false)
  })
  it('flags selling everything and selling more than is held', () => {
    expect(sellFromStockPosition({ heldShares: 10, avgCost: 1, quantity: 10, price: 2 }).sellsAll).toBe(true)
    const o = sellFromStockPosition({ heldShares: 10, avgCost: 1, quantity: 11, price: 2 })
    expect(o.overSell).toBe(true); expect(o.remainingShares).toBe(0)
  })
})

describe('option add / reduce', () => {
  it('averages each leg premium by contracts and adds the commissions', () => {
    const r = addToOptionPosition({ contracts: 2, premiums: [3, 1], commission: 4, addContracts: 3, addPremiums: [2, 0.5], addCommission: 6 })
    expect(r.totalContracts).toBe(5); expect(r.avgPremiums).toEqual([2.4, 0.7]); expect(r.totalCommission).toBe(10)
  })
  it('splits the opening commission pro rata when contracts are closed', () => {
    const r = splitOptionCommission(4, 10, 1)
    expect(r.closedCommission).toBe(2.5); expect(r.remainingCommission).toBe(7.5); expect(r.remainingContracts).toBe(3)
    expect(splitOptionCommission(3, 1, 1).closedCommission + splitOptionCommission(3, 1, 1).remainingCommission).toBeCloseTo(1, 9)
    expect(splitOptionCommission(0, 5, 1).closedCommission).toBe(0)
  })
})
