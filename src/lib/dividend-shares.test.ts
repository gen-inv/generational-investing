import { describe, it, expect } from 'vitest'
import { sharesOnDate, exDateFromNotes, addSharesToDividends } from './dividend-shares'

// A position built up over time, like FTN.TO: 1000 shares in January, 1000 more in June, 500 sold in October
const txns = [
  { transaction_date: '2026-01-10', transaction_type: 'BUY', shares: 1000 },
  { transaction_date: '2026-06-05', transaction_type: 'BUY', shares: 1000 },
  { transaction_date: '2026-10-20', transaction_type: 'SELL', shares: 500 },
]
const row = (amount: number, adjustment_date: string, notes: string | null = null) => ({ id: 1, amount, adjustment_date, notes })

describe('shares held on a date', () => {
  it('follows buys and sells, counting a trade on the day itself', () => {
    expect(sharesOnDate(txns, '2026-01-09')).toBe(0)
    expect(sharesOnDate(txns, '2026-01-10')).toBe(1000)
    expect(sharesOnDate(txns, '2026-06-04')).toBe(1000)
    expect(sharesOnDate(txns, '2026-06-05')).toBe(2000)
    expect(sharesOnDate(txns, '2026-11-01')).toBe(1500)
  })
  it('reads the ex-date out of the notes', () => {
    expect(exDateFromNotes('Added 03/20/2026. Ex-date: 2026-03-14')).toBe('2026-03-14')
    expect(exDateFromNotes('typed by hand')).toBeNull()
    expect(exDateFromNotes(null)).toBeNull()
  })
})

describe('recorded dividends use the shares held at the time, not today', () => {
  const [feb, aug, none] = addSharesToDividends(
    [row(60, '2026-03-20', 'Added 03/21/2026. Ex-date: 2026-03-14'), row(150, '2026-09-18', 'Added 09/20/2026. Ex-date: 2026-09-12'), row(10, '2026-12-01')],
    txns, [], 1500)
  it('a March dividend counts 1000 shares, not today\'s 1500', () => {
    expect(feb.shares_held).toBe(1000); expect(feb.amount_per_share).toBeCloseTo(0.06, 10)
  })
  it('a September dividend counts the 2000 held after the June purchase', () => {
    expect(aug.shares_held).toBe(2000); expect(aug.amount_per_share).toBeCloseTo(0.075, 10)
  })
  it('a hand-typed dividend falls back to the date it was recorded', () => {
    expect(none.shares_held).toBe(1500); expect(none.shares_date).toBe('2026-12-01')
  })
  it('keeps the original fields', () => { expect(feb.amount).toBe(60); expect(feb.notes).toContain('Ex-date') })
})

describe('finding the ex-date and edge cases', () => {
  it('uses the repository dividend that was paid on the recorded date', () => {
    const [d] = addSharesToDividends([row(90, '2026-06-10')], txns, [{ ex_date: '2026-06-03', pay_date: '2026-06-10' }], 2000)
    expect(d.shares_date).toBe('2026-06-03'); expect(d.shares_held).toBe(1000)   // second purchase was after the ex-date
  })
  it('no transactions at all falls back to the current share count', () => {
    const [d] = addSharesToDividends([row(50, '2026-03-20')], [], [], 500)
    expect(d.shares_held).toBe(500); expect(d.amount_per_share).toBeCloseTo(0.1, 10)
  })
  it('no shares held on that date gives null instead of dividing by zero', () => {
    const [d] = addSharesToDividends([row(5, '2025-12-01')], txns, [], 1500)
    expect(d.shares_held).toBeNull(); expect(d.amount_per_share).toBeNull()
  })
})
