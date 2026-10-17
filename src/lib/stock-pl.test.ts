import { describe, it, expect } from 'vitest'
import { replayHolding, loadRealizedSells, sumRealized } from './stock-pl'

let nextId = 1
const tx = (type: string, shares: number, price: number, date: string, commission = 0, id = nextId++) => ({
  id, holding_id: 1, transaction_type: type, shares, price_per_share: price, transaction_date: date, commission,
})

describe('replayHolding: per-sell realized P/L', () => {
  it('partial sell then full close: 1,000 + 2,000 = 3,000', () => {
    const rows = replayHolding([
      tx('BUY', 200, 50, '2026-01-02'),
      tx('SELL', 100, 60, '2026-02-01'),
      tx('SELL', 100, 70, '2026-03-01'),
    ])
    expect(rows.map(r => r.realized_pl)).toEqual([1000, 2000])
    expect(rows[0].is_full_close).toBe(false)
    expect(rows[0].shares_remaining).toBe(100)
    expect(rows[1].is_full_close).toBe(true)
    expect(rows[1].avg_cost).toBe(50)
    expect(sumRealized(rows)).toBe(3000)
  })

  it('attributes buy commissions to sells in proportion to shares sold', () => {
    const rows = replayHolding([
      tx('BUY', 2000, 10, '2026-01-02', 100),
      tx('SELL', 500, 12, '2026-02-01', 5),
      tx('SELL', 1500, 11, '2026-03-01', 5),
    ])
    expect(rows[0].buy_commission).toBe(25)
    expect(rows[0].realized_pl).toBe(970)
    expect(rows[1].buy_commission).toBe(75)
    expect(rows[1].realized_pl).toBe(1420)
    expect(sumRealized(rows)).toBe(22500 - 20000 - 100 - 10)
  })

  it('uses the weighted average of buys held at the time of the sale', () => {
    const rows = replayHolding([
      tx('BUY', 100, 50, '2026-01-02'),
      tx('BUY', 100, 60, '2026-01-10'),
      tx('SELL', 100, 70, '2026-02-01'),
    ])
    expect(rows[0].avg_cost).toBe(55)
    expect(rows[0].realized_pl).toBe(1500)
  })

  it('a later buy never changes an earlier sell', () => {
    const before = replayHolding([tx('BUY', 100, 50, '2026-01-02'), tx('SELL', 50, 60, '2026-02-01')])
    const after = replayHolding([
      tx('BUY', 100, 50, '2026-01-02'), tx('SELL', 50, 60, '2026-02-01'), tx('BUY', 100, 80, '2026-03-01'),
    ])
    expect(after).toHaveLength(1)
    const { transaction_id: _a, ...a } = after[0]
    const { transaction_id: _b, ...b } = before[0]
    expect(a).toEqual(b)
    expect(after[0].realized_pl).toBe(500)
  })

  it('a same-day BUY is processed before a SELL, even when the SELL has the lower id', () => {
    const rows = replayHolding([
      tx('SELL', 100, 12, '2026-02-01', 0, 1),
      tx('BUY', 100, 10, '2026-02-01', 0, 2),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].realized_pl).toBe(200)
    expect(rows[0].warning).toBeUndefined()
  })

  it('flags selling more shares than were held, and values only the shares held', () => {
    const rows = replayHolding([tx('BUY', 100, 10, '2026-01-02'), tx('SELL', 150, 12, '2026-02-01')])
    expect(rows[0].warning).toMatch(/only 100 were held/)
    expect(rows[0].realized_pl).toBe(200)
    expect(rows[0].shares).toBe(150)
    expect(rows[0].shares_remaining).toBe(0)
  })

  it('a sell with nothing held realizes only the negative commission and is flagged', () => {
    const rows = replayHolding([tx('SELL', 10, 5, '2026-02-01', 1)])
    expect(rows[0].realized_pl).toBe(-1)
    expect(rows[0].warning).toBeDefined()
  })

  it('ignores transaction types other than BUY and SELL', () => {
    const rows = replayHolding([tx('BUY', 10, 10, '2026-01-02'), tx('DIVIDEND', 99, 99, '2026-01-05'), tx('SELL', 10, 11, '2026-02-01')])
    expect(rows).toHaveLength(1)
    expect(rows[0].realized_pl).toBe(10)
  })

  it('tolerates null commissions and string numbers from the database', () => {
    const rows = replayHolding([
      { id: 1, holding_id: 1, transaction_type: 'BUY', shares: '10' as any, price_per_share: '10' as any, transaction_date: '2026-01-02', commission: null },
      { id: 2, holding_id: 1, transaction_type: 'SELL', shares: '10' as any, price_per_share: '12' as any, transaction_date: '2026-02-01', commission: null },
    ])
    expect(rows[0].realized_pl).toBe(20)
  })
})

describe('loadRealizedSells', () => {
  const row = (id: number, holding: number, type: string, shares: number, price: number, date: string, commission = 0) => ({
    id, holding_id: holding, transaction_type: type, shares, price_per_share: price, transaction_date: date, commission,
    ticker: holding === 1 ? 'AAA' : 'BBB', account_id: 7, opened_date: '2026-01-02', is_open: holding === 1 ? 0 : 1,
    strategy_type: 'WHEEL', account_name: 'Margin', account_type: 'MARGIN',
  })
  const rows = [
    row(1, 1, 'BUY', 100, 10, '2026-01-02'),
    row(2, 1, 'SELL', 100, 12, '2026-02-10'),
    row(3, 2, 'BUY', 50, 20, '2026-01-05'),
    row(4, 2, 'SELL', 20, 25, '2026-03-15'),
  ]
  const fakeDB = (captured: { sql?: string; params?: any[] } = {}) => ({
    prepare: (sql: string) => ({
      bind: (...params: any[]) => { captured.sql = sql; captured.params = params; return { all: async () => ({ results: rows }) } },
    }),
  })

  it('returns sells newest first, with holding details attached', async () => {
    const out = await loadRealizedSells(fakeDB(), 1)
    expect(out.map(s => s.transaction_id)).toEqual([4, 2])
    expect(out[0]).toMatchObject({ ticker: 'BBB', realized_pl: 100, holding_is_open: true, account_name: 'Margin' })
    expect(out[1]).toMatchObject({ ticker: 'AAA', realized_pl: 200, holding_is_open: false })
    expect(sumRealized(out)).toBe(300)
  })

  it('date filters choose which rows come back; from is inclusive, to is exclusive', async () => {
    expect((await loadRealizedSells(fakeDB(), 1, { from: '2026-03-01' })).map(s => s.transaction_id)).toEqual([4])
    expect((await loadRealizedSells(fakeDB(), 1, { to: '2026-03-15' })).map(s => s.transaction_id)).toEqual([2])
    expect((await loadRealizedSells(fakeDB(), 1, { from: '2026-03-15', to: '2026-03-16' })).map(s => s.transaction_id)).toEqual([4])
  })

  it('binds the user id and optional holding / account filters as SQL parameters', async () => {
    const cap: any = {}
    await loadRealizedSells(fakeDB(cap), 42, { holdingId: 9, accountId: 7 })
    expect(cap.params).toEqual([42, 9, 7])
    expect(cap.sql).toContain('AND sh.id = ?')
    expect(cap.sql).toContain('AND sh.account_id = ?')
    const cap2: any = {}
    await loadRealizedSells(fakeDB(cap2), 42)
    expect(cap2.params).toEqual([42])
  })
})