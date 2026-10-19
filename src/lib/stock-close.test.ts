import { describe, it, expect } from 'vitest'
import { holdingPosition, stockClosePL } from './stock-close'
import { replayHolding } from './stock-pl'

const buy = (id: number, date: string, shares: number, price: number, commission = 0) =>
  ({ id, holding_id: 1, transaction_type: 'BUY', shares, price_per_share: price, transaction_date: date, commission })
const sell = (id: number, date: string, shares: number, price: number, commission = 0) =>
  ({ id, holding_id: 1, transaction_type: 'SELL', shares, price_per_share: price, transaction_date: date, commission })

describe('holdingPosition', () => {
  it('single buy', () => {
    expect(holdingPosition([buy(1, '2026-01-01', 100, 50, 5)])).toEqual({ shares: 100, avg_cost: 50, pending_buy_commission: 5 })
  })
  it('weighted average across buys, commissions pooled', () => {
    expect(holdingPosition([buy(1, '2026-01-01', 100, 50, 5), buy(2, '2026-02-01', 300, 60, 7)]))
      .toEqual({ shares: 400, avg_cost: 57.5, pending_buy_commission: 12 })
  })
  it('after a partial sell: avg cost is unchanged and the sold share of commissions is used up', () => {
    const p = holdingPosition([buy(1, '2026-01-01', 400, 50, 8), sell(2, '2026-02-01', 100, 55, 1)])
    expect(p).toEqual({ shares: 300, avg_cost: 50, pending_buy_commission: 6 })
  })
  it('fully sold position holds nothing', () => {
    expect(holdingPosition([buy(1, '2026-01-01', 10, 5, 1), sell(2, '2026-01-02', 10, 6)]))
      .toEqual({ shares: 0, avg_cost: 0, pending_buy_commission: 0 })
  })
  it('order of input does not matter; same-day buy is available to a sell', () => {
    const a = holdingPosition([sell(3, '2026-01-01', 5, 9), buy(1, '2026-01-01', 10, 8, 2)])
    expect(a).toEqual({ shares: 5, avg_cost: 8, pending_buy_commission: 1 })
  })
})

describe('stockClosePL', () => {
  it('proceeds - cost - pending buy commission - close commission', () => {
    const r = stockClosePL({ shares: 100, avgCost: 50, pendingBuyCommission: 5, closePrice: 60, closeCommission: 2 })
    expect(r).toMatchObject({ saleProceeds: 6000, costBasis: 5000, netPL: 993 })
    expect(r.returnPct).toBeCloseTo(993 / 5000, 10)
  })
  it('a loss is negative', () => {
    expect(stockClosePL({ shares: 10, avgCost: 10, pendingBuyCommission: 0, closePrice: 9, closeCommission: 1 }).netPL).toBe(-11)
  })
  it('zero cost basis gives no return %', () => {
    expect(stockClosePL({ shares: 0, avgCost: 0, pendingBuyCommission: 0, closePrice: 1, closeCommission: 0 }).returnPct).toBeNull()
  })
  it('agrees with the server-side replay for a full close (the number the route books)', () => {
    const txs = [buy(1, '2026-01-01', 100, 50, 5), buy(2, '2026-02-01', 300, 60, 7), sell(3, '2026-03-01', 150, 65, 3)]
    const pos = holdingPosition(txs)
    const preview = stockClosePL({ shares: pos.shares, avgCost: pos.avg_cost, pendingBuyCommission: pos.pending_buy_commission, closePrice: 70, closeCommission: 4 })
    const replayed = replayHolding([...txs, sell(4, '2026-04-01', pos.shares, 70, 4)]).pop()!
    expect(preview.netPL).toBeCloseTo(replayed.realized_pl, 5)
  })
})
