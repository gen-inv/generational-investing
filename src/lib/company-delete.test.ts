import { describe, it, expect } from 'vitest'
import { deleteCompanySafely } from './company-delete'

// A tiny stand-in for D1 that records every statement and answers the three lookups
function fakeDb(opts: { company?: any; openHoldings?: number; closedDetached?: number }) {
  const ran: string[] = []
  const stmt = (sql: string) => ({
    sql,
    bind: () => ({
      sql,
      first: async () => (sql.includes('FROM companies') ? (opts.company ?? null) : { n: opts.openHoldings ?? 0 }),
      run: async () => { ran.push(sql); return { meta: { changes: 1 } } },
    }),
  })
  return {
    ran,
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: any[]) => { stmts.forEach(s => ran.push(s.sql)); return [{ meta: { changes: opts.closedDetached ?? 0 } }, { meta: { changes: 1 } }] },
  }
}
const GOOY = { id: 7, ticker: 'GOOY' }

describe('removing a company from the roster', () => {
  it('refuses while the company has an open position, and changes nothing', async () => {
    const db = fakeDb({ company: GOOY, openHoldings: 1 })
    const r: any = await deleteCompanySafely(db, 1, 7)
    expect(r.ok).toBe(false); expect(r.status).toBe(409); expect(r.openPositions).toBe(1)
    expect(r.error).toContain('GOOY still has 1 open stock position'); expect(r.error).toContain('Close it first')
    expect(db.ran).toEqual([])
  })
  it('says positions in the plural for several', async () => {
    const r: any = await deleteCompanySafely(fakeDb({ company: GOOY, openHoldings: 2 }), 1, 7)
    expect(r.error).toContain('2 open stock positions'); expect(r.error).toContain('Close them first')
  })
  it('a company with only closed positions is removed, with its history detached first and in the same batch', async () => {
    const db = fakeDb({ company: GOOY, openHoldings: 0, closedDetached: 3 })
    const r: any = await deleteCompanySafely(db, 1, 7)
    expect(r).toEqual({ ok: true, detached: 3 })
    expect(db.ran.length).toBe(2)
    expect(db.ran[0]).toContain('UPDATE stock_holdings SET company_id = NULL')
    expect(db.ran[1]).toContain('DELETE FROM companies')
    expect(db.ran.join(' ')).not.toContain('DELETE FROM stock_holdings')
  })
  it('a company with no positions at all is simply removed', async () => {
    const r: any = await deleteCompanySafely(fakeDb({ company: GOOY, openHoldings: 0 }), 1, 7)
    expect(r).toEqual({ ok: true, detached: 0 })
  })
  it('an unknown company is a 404', async () => {
    const r: any = await deleteCompanySafely(fakeDb({ company: null }), 1, 99)
    expect(r).toMatchObject({ ok: false, status: 404 })
  })
})
