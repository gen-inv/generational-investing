// Recorded dividends show the shares held at the time instead of today's share count.
// Run from the repo root:  node dividend_shares_fix.mjs
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

const HELPER = "// Shares held when each recorded dividend was paid. A recorded dividend only stores the total cash received,\n// so the share count has to come from the buy/sell history on the dividend's ex-date, never from today's count.\n\nexport interface ShareTxn { transaction_date: string; transaction_type: string; shares: number }\nexport interface RepoDividend { ex_date: string; pay_date: string | null }\n\n/** Shares held at the end of a given day: every BUY up to and including it, less every SELL. */\nexport function sharesOnDate(txns: ShareTxn[], date: string): number {\n  let shares = 0\n  for (const t of txns) {\n    if (t.transaction_date <= date) shares += t.transaction_type === 'BUY' ? Number(t.shares) : -Number(t.shares)\n  }\n  return shares\n}\n\n/** The ex-date written into a dividend's notes when it was added from the repository (\"Ex-date: 2026-03-14\"). */\nexport function exDateFromNotes(notes: string | null | undefined): string | null {\n  const m = /Ex-date: (\\d{4}-\\d{2}-\\d{2})/.exec(notes || '')\n  return m ? m[1] : null\n}\n\n/**\n * Adds shares_held, amount_per_share and shares_date to each recorded dividend row.\n * Ex-date order of preference: the date in the notes, the repository dividend paid on that date, the recorded date itself.\n * A holding with no transactions at all (legacy data) falls back to its current share count; a date with no shares gives null.\n */\nexport function addSharesToDividends<T extends { amount: number; adjustment_date: string; notes?: string | null }>(\n  rows: T[], txns: ShareTxn[], repo: RepoDividend[], fallbackShares: number\n): Array<T & { shares_held: number | null; amount_per_share: number | null; shares_date: string }> {\n  return rows.map(row => {\n    const exDate = exDateFromNotes(row.notes)\n      || repo.find(r => r.pay_date && r.pay_date === row.adjustment_date)?.ex_date\n      || row.adjustment_date\n    let shares = txns.length ? sharesOnDate(txns, exDate) : fallbackShares\n    if (txns.length && shares <= 0) shares = sharesOnDate(txns, row.adjustment_date)   // ex-date guess was off: try the pay date\n    const held = shares > 0 ? shares : null\n    return { ...row, shares_held: held, amount_per_share: held ? Number(row.amount) / held : null, shares_date: exDate }\n  })\n}\n"
const TEST = "import { describe, it, expect } from 'vitest'\nimport { sharesOnDate, exDateFromNotes, addSharesToDividends } from './dividend-shares'\n\n// A position built up over time, like FTN.TO: 1000 shares in January, 1000 more in June, 500 sold in October\nconst txns = [\n  { transaction_date: '2026-01-10', transaction_type: 'BUY', shares: 1000 },\n  { transaction_date: '2026-06-05', transaction_type: 'BUY', shares: 1000 },\n  { transaction_date: '2026-10-20', transaction_type: 'SELL', shares: 500 },\n]\nconst row = (amount: number, adjustment_date: string, notes: string | null = null) => ({ id: 1, amount, adjustment_date, notes })\n\ndescribe('shares held on a date', () => {\n  it('follows buys and sells, counting a trade on the day itself', () => {\n    expect(sharesOnDate(txns, '2026-01-09')).toBe(0)\n    expect(sharesOnDate(txns, '2026-01-10')).toBe(1000)\n    expect(sharesOnDate(txns, '2026-06-04')).toBe(1000)\n    expect(sharesOnDate(txns, '2026-06-05')).toBe(2000)\n    expect(sharesOnDate(txns, '2026-11-01')).toBe(1500)\n  })\n  it('reads the ex-date out of the notes', () => {\n    expect(exDateFromNotes('Added 03/20/2026. Ex-date: 2026-03-14')).toBe('2026-03-14')\n    expect(exDateFromNotes('typed by hand')).toBeNull()\n    expect(exDateFromNotes(null)).toBeNull()\n  })\n})\n\ndescribe('recorded dividends use the shares held at the time, not today', () => {\n  const [feb, aug, none] = addSharesToDividends(\n    [row(60, '2026-03-20', 'Added 03/21/2026. Ex-date: 2026-03-14'), row(150, '2026-09-18', 'Added 09/20/2026. Ex-date: 2026-09-12'), row(10, '2026-12-01')],\n    txns, [], 1500)\n  it('a March dividend counts 1000 shares, not today\\'s 1500', () => {\n    expect(feb.shares_held).toBe(1000); expect(feb.amount_per_share).toBeCloseTo(0.06, 10)\n  })\n  it('a September dividend counts the 2000 held after the June purchase', () => {\n    expect(aug.shares_held).toBe(2000); expect(aug.amount_per_share).toBeCloseTo(0.075, 10)\n  })\n  it('a hand-typed dividend falls back to the date it was recorded', () => {\n    expect(none.shares_held).toBe(1500); expect(none.shares_date).toBe('2026-12-01')\n  })\n  it('keeps the original fields', () => { expect(feb.amount).toBe(60); expect(feb.notes).toContain('Ex-date') })\n})\n\ndescribe('finding the ex-date and edge cases', () => {\n  it('uses the repository dividend that was paid on the recorded date', () => {\n    const [d] = addSharesToDividends([row(90, '2026-06-10')], txns, [{ ex_date: '2026-06-03', pay_date: '2026-06-10' }], 2000)\n    expect(d.shares_date).toBe('2026-06-03'); expect(d.shares_held).toBe(1000)   // second purchase was after the ex-date\n  })\n  it('no transactions at all falls back to the current share count', () => {\n    const [d] = addSharesToDividends([row(50, '2026-03-20')], [], [], 500)\n    expect(d.shares_held).toBe(500); expect(d.amount_per_share).toBeCloseTo(0.1, 10)\n  })\n  it('no shares held on that date gives null instead of dividing by zero', () => {\n    const [d] = addSharesToDividends([row(5, '2025-12-01')], txns, [], 1500)\n    expect(d.shares_held).toBeNull(); expect(d.amount_per_share).toBeNull()\n  })\n})\n"

const helperPath = path.join(root, 'src/lib/dividend-shares.ts')
const testPath = path.join(root, 'src/lib/dividend-shares.test.ts')

const stocks = read('src/routes/stocks.ts')
edit(stocks, 'import', "import { syncCoveredCallAdjustment } from '../lib/cc-adjustment'\n",
  "import { syncCoveredCallAdjustment } from '../lib/cc-adjustment'\nimport { addSharesToDividends } from '../lib/dividend-shares'\n", 'addSharesToDividends')
edit(stocks, 'dividends route',
  "    return c.json(dividends.results || [])\n  } catch (error) {\n    console.error('Get dividends error:', error)",
  "    // Shares held when each dividend was paid, from the buy/sell history (never today's share count)\n" +
  "    const holdingRow = await DB.prepare(`SELECT ticker, total_shares FROM stock_holdings WHERE id = ?`).bind(holdingId).first() as any\n" +
  "    const txns = await DB.prepare(`\n      SELECT transaction_date, transaction_type, shares FROM stock_transactions\n      WHERE holding_id = ? ORDER BY transaction_date ASC\n    `).bind(holdingId).all()\n" +
  "    const repo = await DB.prepare(`SELECT ex_date, pay_date FROM dividend_repository WHERE ticker = ?`).bind(holdingRow?.ticker || '').all()\n" +
  "    return c.json(addSharesToDividends(\n      (dividends.results || []) as any[], (txns.results || []) as any[], (repo.results || []) as any[], Number(holdingRow?.total_shares) || 0\n    ))\n" +
  "  } catch (error) {\n    console.error('Get dividends error:', error)",
  'addSharesToDividends(\n')

const app = read('public/static/app.js')
if (app && !app.text.includes('div.amount_per_share != null')) {
  const re = /\$\$\{\(div\.amount \/ stock\.quantity\)\.toFixed\(4\)\}<\/td>(\n[ \t]*)<td class="px-4 py-2 text-center">\$\{stock\.quantity\}<\/td>/g
  const n = (app.text.match(re) || []).length
  if (n !== 2) misses.push('public/static/app.js: the Per Share / Shares cells matched ' + n + ' times (needs exactly 2: the modal and its refresh copy)')
  else {
    app.text = app.text.replace(re, (_m, gap) =>
      "${div.amount_per_share != null ? '$' + div.amount_per_share.toFixed(4) : '-'}</td>" + gap +
      '<td class="px-4 py-2 text-center">${div.shares_held != null ? div.shares_held : \'-\'}</td>')
    app.changed = true
  }
}

if (fs.existsSync(helperPath) && fs.readFileSync(helperPath, 'utf8').replace(/\r\n/g, '\n') !== HELPER) misses.push('src/lib/dividend-shares.ts already exists with different content')
if (misses.length) { console.log('NOTHING WRITTEN. Problems:'); misses.forEach(m => console.log('  - ' + m)); process.exit(1) }

for (const f of [stocks, app].filter(f => f && f.changed)) {
  fs.copyFileSync(f.p, f.p + '.bak-divshares-' + stamp)
  fs.writeFileSync(f.p, f.crlf ? f.text.replace(/\n/g, '\r\n') : f.text)
  console.log('updated ' + f.rel)
}
if (!fs.existsSync(helperPath)) { fs.writeFileSync(helperPath, HELPER); console.log('created src/lib/dividend-shares.ts') }
if (!fs.existsSync(testPath)) { fs.writeFileSync(testPath, TEST); console.log('created src/lib/dividend-shares.test.ts') }
console.log('\nDone. Backups are *.bak-divshares-' + stamp + ' (delete them after you commit).')
