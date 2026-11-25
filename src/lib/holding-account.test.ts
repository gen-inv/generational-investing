import { describe, it, expect } from 'vitest'
import { moveHoldingToAccount } from './holding-account'

function fakeDb(opts: { account?: any; clash?: any; ccMoved?: number; putsMoved?: number }) {
  const batched: { sql: string; params: any[] }[] = []
  const stmt = (sql: string) => ({
    bind: (...params: any[]) => ({
      sql, params,
      first: async () => (sql.includes('FROM accounts') ? (opts.account ?? null) : (opts.clash ?? null)),
    }),
  })
  return {
    batched,
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: any[]) => { stmts.forEach(s => batched.push({ sql: s.sql, params: s.params })); return [{ meta: { changes: 1 } }, { meta: { changes: opts.ccMoved ?? 0 } }, { meta: { changes: opts.putsMoved ?? 0 } }] },
  }
}
const holding = { id: 30, ticker: 'FTN.TO', account_id: 1, is_open: 1, opened_date: '2026-06-24', closed_date: null }
const IB = { id: 2, account_name: 'Interactive Brokers', account_type: 'Cash' }

describe('moving a stock position to another account', () => {
  it('moves the holding, its covered calls and its assigned puts together, in one batch', async () => {
    const db = fakeDb({ account: IB, ccMoved: 2, putsMoved: 1 })
    const r = await moveHoldingToAccount(db, 1, holding, 2)
    expect(r).toEqual({ ok: true, movedCoveredCalls: 2, movedPuts: 1 })
    expect(db.batched.length).toBe(3)
    expect(db.batched[0].sql).toContain('UPDATE stock_holdings SET account_id = ?'); expect(db.batched[0].params).toEqual([2, 30, 1])
    expect(db.batched[1].sql).toContain("strategy_type = 'COVERED_CALL'")
    // covered calls: new account, its type, user, ticker, OLD account, then the holding period
    expect(db.batched[1].params).toEqual([2, 'Cash', 1, 'FTN.TO', 1, '2026-06-24', '9999-12-31'])
    expect(db.batched[2].sql).toContain('option_trade_id IS NOT NULL'); expect(db.batched[2].params).toEqual([2, 'Cash', 1, 30])
  })
  it('a closed position only takes the covered calls from its own holding period', async () => {
    const db = fakeDb({ account: IB })
    await moveHoldingToAccount(db, 1, { ...holding, is_open: 0, opened_date: '2026-01-05', closed_date: '2026-03-01' }, 2)
    expect(db.batched[1].params.slice(-2)).toEqual(['2026-01-05', '2026-03-01'])
  })
  it('refuses when the destination already holds an open position in that ticker, and changes nothing', async () => {
    const db = fakeDb({ account: IB, clash: { id: 12 } })
    const r: any = await moveHoldingToAccount(db, 1, holding, 2)
    expect(r.ok).toBe(false); expect(r.status).toBe(409)
    expect(r.error).toContain('FTN.TO is already held in Interactive Brokers'); expect(r.error).toContain('Add To Position')
    expect(db.batched).toEqual([])
  })
  it('a closed position may move even if the destination holds that ticker now', async () => {
    const r = await moveHoldingToAccount(fakeDb({ account: IB, clash: { id: 12 } }), 1, { ...holding, is_open: 0, closed_date: '2026-03-01' }, 2)
    expect(r.ok).toBe(true)
  })
  it('an account that is not the user\'s is refused', async () => {
    const r: any = await moveHoldingToAccount(fakeDb({ account: null }), 1, holding, 99)
    expect(r).toMatchObject({ ok: false, status: 400 })
  })
})
