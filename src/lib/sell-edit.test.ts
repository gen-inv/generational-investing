import { describe, it, expect } from 'vitest'
import { replayHolding, type StockTx } from './stock-pl'
import { previewSellEdit } from './sell-edit'

const tx = (id: number, type: string, shares: number, price: number, date: string, commission = 0): StockTx =>
  ({ id, holding_id: 1, transaction_type: type, shares, price_per_share: price, transaction_date: date, commission })
const history = () => [tx(1, 'BUY', 100, 50, '2026-01-01', 5), tx(2, 'BUY', 300, 60, '2026-02-01', 7), tx(3, 'SELL', 100, 70, '2026-03-01', 1), tx(4, 'SELL', 300, 66, '2026-04-01', 2)]

describe('previewSellEdit', () => {
  it('re-books the closing sale: new price flows into its P/L and the total', () => {
    const base = replayHolding(history())
    const r = previewSellEdit(history(), 4, { date: '2026-04-01', price: 70, commission: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.beforeSell.realized_pl).toBe(base[1].realized_pl)
    expect(r.sell.realized_pl).toBeCloseTo(base[1].realized_pl + 300 * 4, 6)
    expect(r.totalRealized).toBeCloseTo(r.beforeTotal + 1200, 6)
  })
  it('commission changes move P/L one-for-one', () => {
    const r = previewSellEdit(history(), 3, { date: '2026-03-01', price: 70, commission: 11 })
    if (!r.ok) throw new Error(r.error)
    expect(r.sell.realized_pl).toBeCloseTo(r.beforeSell.realized_pl - 10, 6)
  })
  it('a sale moved before the buy it depends on is rejected', () => {
    const r = previewSellEdit(history(), 3, { date: '2025-12-01', price: 70, commission: 1 })
    expect(r).toMatchObject({ ok: false, status: 409 })
  })
  it('rejects bad input and unknown or non-sell transactions', () => {
    expect(previewSellEdit(history(), 99, { date: '2026-03-01', price: 1, commission: 0 })).toMatchObject({ ok: false, status: 404 })
    expect(previewSellEdit(history(), 1, { date: '2026-03-01', price: 1, commission: 0 })).toMatchObject({ ok: false, status: 404 })
    expect(previewSellEdit(history(), 3, { date: 'soon', price: 1, commission: 0 })).toMatchObject({ ok: false, status: 400 })
    expect(previewSellEdit(history(), 3, { date: '2026-03-01', price: -1, commission: 0 })).toMatchObject({ ok: false, status: 400 })
    expect(previewSellEdit(history(), 3, { date: '2026-03-01', price: NaN, commission: 0 })).toMatchObject({ ok: false, status: 400 })
    expect(previewSellEdit(history(), 3, { date: '2026-03-01', price: 1, commission: -2 })).toMatchObject({ ok: false, status: 400 })
  })
  it('a zero sale price is allowed (worthless shares)', () => {
    const r = previewSellEdit(history(), 4, { date: '2026-04-01', price: 0, commission: 0 })
    expect(r.ok).toBe(true)
  })
  it('does not mutate the input history', () => {
    const h = history(); previewSellEdit(h, 3, { date: '2026-03-05', price: 99, commission: 9 })
    expect(h[2]).toMatchObject({ price_per_share: 70, transaction_date: '2026-03-01', commission: 1 })
  })
})
