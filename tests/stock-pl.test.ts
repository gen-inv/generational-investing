import { describe, it, expect } from 'vitest'
import { replayHolding, sumRealized, type StockTx } from '../src/lib/stock-pl'

let nextId = 1
const buy = (shares: number, price: number, date: string, commission = 0): StockTx => ({
  id: nextId++, holding_id: 1, transaction_type: 'BUY', shares, price_per_share: price,
  transaction_date: date, commission
})
const sell = (shares: number, price: number, date: string, commission = 0): StockTx => ({
  id: nextId++, holding_id: 1, transaction_type: 'SELL', shares, price_per_share: price,
  transaction_date: date, commission
})

describe('replayHolding - per-sell realized P/L', () => {
  it('partial sell: 500 of 2000 shares uses average cost and 25% of buy commissions', () => {
    const rows = replayHolding([
      buy(2000, 100, '2026-01-05', 20),
      sell(500, 120, '2026-03-10', 1)
    ])
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.avg_cost).toBe(100)
    expect(r.buy_commission).toBe(5) // 25% of 20
    expect(r.sell_commission).toBe(1)
    expect(r.realized_pl).toBe(500 * 20 - 5 - 1) // 9994
    expect(r.shares_remaining).toBe(1500)
    expect(r.is_full_close).toBe(false)
  })

  it('final sell to zero carries only the remaining buy commissions and its own gain', () => {
    const rows = replayHolding([
      buy(2000, 100, '2026-01-05', 20),
      sell(500, 120, '2026-03-10', 1),
      sell(1500, 90, '2026-06-01', 2)
    ])
    expect(rows[1].buy_commission).toBe(15) // the other 75%
    expect(rows[1].realized_pl).toBe(1500 * -10 - 15 - 2) // -15017
    expect(rows[1].is_full_close).toBe(true)
  })

  it('per-sell results add up to total sells - total buys - all commissions', () => {
    const txs = [
      buy(2000, 100, '2026-01-05', 20),
      sell(500, 120, '2026-03-10', 1),
      sell(1500, 90, '2026-06-01', 2)
    ]
    const total = sumRealized(replayHolding(txs))
    const legacy = (500 * 120 + 1500 * 90) - 2000 * 100 - 20 - 1 - 2
    expect(total).toBe(legacy)
  })

  it('a later buy does not change an earlier sell, and re-averages the remainder', () => {
    const rows = replayHolding([
      buy(1000, 100, '2026-01-05'),
      sell(500, 110, '2026-02-01'),
      buy(500, 130, '2026-03-01'),
      sell(1000, 140, '2026-04-01')
    ])
    expect(rows[0].avg_cost).toBe(100)
    expect(rows[0].realized_pl).toBe(5000)
    // 500 @100 + 500 @130 = avg 115
    expect(rows[1].avg_cost).toBe(115)
    expect(rows[1].realized_pl).toBe(1000 * 25)
  })

  it('orders by date regardless of input order and lets a same-day buy be sold', () => {
    const rows = replayHolding([
      sell(100, 55, '2026-02-02'),
      buy(100, 50, '2026-02-02')
    ])
    expect(rows[0].realized_pl).toBe(500)
    expect(rows[0].warning).toBeUndefined()
  })

  it('flags overselling instead of silently inventing shares', () => {
    const rows = replayHolding([buy(100, 10, '2026-01-01'), sell(150, 12, '2026-02-01')])
    expect(rows[0].warning).toBeDefined()
    expect(rows[0].realized_pl).toBe(100 * 2) // only the 100 held shares count
  })

  it('returns no rows when there are no sells', () => {
    expect(replayHolding([buy(10, 5, '2026-01-01')])).toEqual([])
  })
})
