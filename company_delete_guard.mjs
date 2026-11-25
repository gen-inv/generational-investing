// Stops "remove company" from deleting stock positions and their history. Run from the repo root:  node company_delete_guard.mjs
import fs from 'fs'
import path from 'path'
const root = process.cwd()
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const misses = []
const count = (s, sub) => s.split(sub).length - 1
const read = rel => {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) { misses.push(rel + ': file not found (run this from the repo root)'); return null }
  const raw = fs.readFileSync(p, 'utf8')
  return { rel, p, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n'), changed: false }
}
const edit = (f, name, oldS, newS, done) => {
  if (!f || f.text.includes(done)) return
  const n = count(f.text, oldS)
  if (n !== 1) { misses.push(f.rel + ': "' + name + '" matched ' + n + ' times (needs exactly 1)'); return }
  f.text = f.text.split(oldS).join(newS); f.changed = true
}
const HELPER = "// Removing a company from the roster must never take stock history with it.\n// stock_holdings.company_id is ON DELETE CASCADE, so a bare DELETE FROM companies also deletes every holding of that\n// company, and with it all buys, sells, dividends and premium adjustments (closed trades vanish from the reports).\n// Rules here: a company with an open stock position cannot be removed; a company with only closed positions is removed\n// after its holdings are detached (company_id set to NULL, like option_trades already does), so the history stays.\n\nexport type CompanyDeleteResult =\n  | { ok: true; detached: number }\n  | { ok: false; status: 404 | 409; error: string; openPositions?: number }\n\nexport async function deleteCompanySafely(DB: any, userId: unknown, companyId: unknown): Promise<CompanyDeleteResult> {\n  const company = await DB.prepare(`SELECT id, ticker FROM companies WHERE id = ? AND user_id = ?`).bind(companyId, userId).first() as any\n  if (!company) return { ok: false, status: 404, error: 'Company not found' }\n\n  const open = await DB.prepare(`\n    SELECT COUNT(*) AS n FROM stock_holdings WHERE company_id = ? AND user_id = ? AND is_open = 1\n  `).bind(companyId, userId).first() as any\n  const openCount = Number(open?.n) || 0\n  if (openCount > 0) {\n    return {\n      ok: false, status: 409, openPositions: openCount,\n      error: `${company.ticker} still has ${openCount} open stock position${openCount === 1 ? '' : 's'}. Close ${openCount === 1 ? 'it' : 'them'} first; removing the company would delete the position and its history.`\n    }\n  }\n\n  // Both statements run together: the history is detached and the company removed, or nothing changes.\n  const results = await DB.batch([\n    DB.prepare(`UPDATE stock_holdings SET company_id = NULL WHERE company_id = ? AND user_id = ?`).bind(companyId, userId),\n    DB.prepare(`DELETE FROM companies WHERE id = ? AND user_id = ?`).bind(companyId, userId),\n  ])\n  return { ok: true, detached: Number(results?.[0]?.meta?.changes) || 0 }\n}\n"
const TEST = "import { describe, it, expect } from 'vitest'\nimport { deleteCompanySafely } from './company-delete'\n\n// A tiny stand-in for D1 that records every statement and answers the three lookups\nfunction fakeDb(opts: { company?: any; openHoldings?: number; closedDetached?: number }) {\n  const ran: string[] = []\n  const stmt = (sql: string) => ({\n    sql,\n    bind: () => ({\n      sql,\n      first: async () => (sql.includes('FROM companies') ? (opts.company ?? null) : { n: opts.openHoldings ?? 0 }),\n      run: async () => { ran.push(sql); return { meta: { changes: 1 } } },\n    }),\n  })\n  return {\n    ran,\n    prepare: (sql: string) => stmt(sql),\n    batch: async (stmts: any[]) => { stmts.forEach(s => ran.push(s.sql)); return [{ meta: { changes: opts.closedDetached ?? 0 } }, { meta: { changes: 1 } }] },\n  }\n}\nconst GOOY = { id: 7, ticker: 'GOOY' }\n\ndescribe('removing a company from the roster', () => {\n  it('refuses while the company has an open position, and changes nothing', async () => {\n    const db = fakeDb({ company: GOOY, openHoldings: 1 })\n    const r: any = await deleteCompanySafely(db, 1, 7)\n    expect(r.ok).toBe(false); expect(r.status).toBe(409); expect(r.openPositions).toBe(1)\n    expect(r.error).toContain('GOOY still has 1 open stock position'); expect(r.error).toContain('Close it first')\n    expect(db.ran).toEqual([])\n  })\n  it('says positions in the plural for several', async () => {\n    const r: any = await deleteCompanySafely(fakeDb({ company: GOOY, openHoldings: 2 }), 1, 7)\n    expect(r.error).toContain('2 open stock positions'); expect(r.error).toContain('Close them first')\n  })\n  it('a company with only closed positions is removed, with its history detached first and in the same batch', async () => {\n    const db = fakeDb({ company: GOOY, openHoldings: 0, closedDetached: 3 })\n    const r: any = await deleteCompanySafely(db, 1, 7)\n    expect(r).toEqual({ ok: true, detached: 3 })\n    expect(db.ran.length).toBe(2)\n    expect(db.ran[0]).toContain('UPDATE stock_holdings SET company_id = NULL')\n    expect(db.ran[1]).toContain('DELETE FROM companies')\n    expect(db.ran.join(' ')).not.toContain('DELETE FROM stock_holdings')\n  })\n  it('a company with no positions at all is simply removed', async () => {\n    const r: any = await deleteCompanySafely(fakeDb({ company: GOOY, openHoldings: 0 }), 1, 7)\n    expect(r).toEqual({ ok: true, detached: 0 })\n  })\n  it('an unknown company is a 404', async () => {\n    const r: any = await deleteCompanySafely(fakeDb({ company: null }), 1, 99)\n    expect(r).toMatchObject({ ok: false, status: 404 })\n  })\n})\n"
const helperPath = path.join(root, 'src/lib/company-delete.ts')
const testPath = path.join(root, 'src/lib/company-delete.test.ts')

const comp = read('src/routes/companies.ts')
edit(comp, 'import', "import { addCompanyToRoster } from '../lib/add-company'\n",
  "import { addCompanyToRoster } from '../lib/add-company'\nimport { deleteCompanySafely } from '../lib/company-delete'\n", 'deleteCompanySafely')
edit(comp, 'delete route',
  "  await c.env.DB.prepare(`\n    DELETE FROM companies WHERE id = ? AND user_id = ?\n  `).bind(companyId, userId).run()\n  \n  return c.json({ success: true })",
  "  // Never a bare DELETE: stock_holdings cascades from companies, which would erase positions, sells and dividends\n" +
  "  const result = await deleteCompanySafely(c.env.DB, userId, companyId)\n" +
  "  if (!result.ok) return c.json({ error: result.error, open_positions: result.openPositions ?? 0 }, result.status)\n" +
  "  return c.json({ success: true, detached_closed_positions: result.detached })",
  'deleteCompanySafely(c.env.DB')

const app = read('public/static/app.js')
edit(app, 'delete company message',
  "        await api.delete(`/api/companies/${id}`)\n        loadCompanies()\n    } catch (error) {\n        alert('Delete failed')\n    }",
  "        await api.delete(`/api/companies/${id}`)\n        loadCompanies()\n    } catch (error) {\n        alert((error.response && error.response.data && error.response.data.error) || 'Delete failed')\n    }",
  "error.response.data.error) || 'Delete failed'")

if (fs.existsSync(helperPath) && fs.readFileSync(helperPath, 'utf8').replace(/\r\n/g, '\n') !== HELPER) misses.push('src/lib/company-delete.ts already exists with different content')
if (misses.length) { console.log('NOTHING WRITTEN. Problems:'); misses.forEach(m => console.log('  - ' + m)); process.exit(1) }

for (const f of [comp, app].filter(f => f && f.changed)) {
  fs.copyFileSync(f.p, f.p + '.bak-cdel-' + stamp)
  fs.writeFileSync(f.p, f.crlf ? f.text.replace(/\n/g, '\r\n') : f.text)
  console.log('updated ' + f.rel)
}
if (!fs.existsSync(helperPath)) { fs.writeFileSync(helperPath, HELPER); console.log('created src/lib/company-delete.ts') }
if (!fs.existsSync(testPath)) { fs.writeFileSync(testPath, TEST); console.log('created src/lib/company-delete.test.ts') }
console.log('\nDone. Backups are *.bak-cdel-' + stamp + ' (delete them after you commit).')
