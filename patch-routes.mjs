// Step 3a: option P/L in the routes now comes from src/lib/calc.ts (one formula, not four).
// Also fixes the covered-call close holding lookup (match the call's own account).
// Run from the repo root: node patch-routes.mjs   (aborts without writing if any anchor is not found exactly once)
import fs from 'fs'
const P = 'src/index.tsx', T = 'test/options.test.ts'
const load = p => { const raw = fs.readFileSync(p, 'utf8'); return { raw, crlf: raw.includes('\r\n'), t: raw.replace(/\r\n/g, '\n') } }
const idx = load(P), tst = load(T)
let s = idx.t
const once = (str, label) => { const n = s.split(str).length - 1; if (n !== 1) { console.error('ABORT: ' + label + ' found ' + n + ' times'); process.exit(1) } }
const rep = (a, b, label) => { once(a, label); s = s.replace(a, () => b) }

// 1. imports
rep("import { loadRealizedSells, sumRealized } from './lib/stock-pl'\n",
    "import { loadRealizedSells, sumRealized } from './lib/stock-pl'\nimport { optionPL, assignmentPL, grossPremium as calcGrossPremium } from './lib/calc'\n", 'import line')

// 2. covered call close: formula + holding lookup by account
rep("    // P/L = (Open Premium - Close Premium) * Contracts * 100 - Open Commission - Close Commission\n    const profitLoss = (openPremium - closePremium) * contracts * 100 - openCommission - closeCommission\n",
    "    const profitLoss = optionPL({ strategy: 'COVERED_CALL', contracts, open: { premium: openPremium }, close: { close_price: closePremium }, openCommission, closeCommission })\n", 'cc close formula')
rep("LEFT JOIN stock_holdings sh ON sh.ticker = ot.ticker AND sh.user_id = ot.user_id AND sh.is_open = 1\n",
    "LEFT JOIN stock_holdings sh ON sh.ticker = ot.ticker AND sh.user_id = ot.user_id AND sh.is_open = 1\n        AND (ot.account_id IS NULL OR sh.account_id = ot.account_id)\n", 'cc close join')

// 3. covered call edit
rep("      // P/L = (Open Premium - Close Premium) * Contracts * 100 - Open Commission - Close Commission\n      const profitLoss = (openPremium - closePremium) * contracts * 100 - openCommission - closeCommission\n",
    "      const profitLoss = optionPL({ strategy: 'COVERED_CALL', contracts, open: { premium: openPremium }, close: { close_price: closePremium }, openCommission, closeCommission })\n", 'cc edit formula')

// 4. PUT /api/options/:id - replace the whole per-strategy block
const a = "      let profitLoss = 0\n"
const bEnd = "      await DB.prepare(`\n        UPDATE option_trades SET\n          profit_loss = ?,\n          is_open = 0\n        WHERE id = ? AND user_id = ?\n      `).bind(profitLoss, tradeId, userId).run()\n"
once(a, 'options block start'); once(bEnd, 'options block end')
const i = s.indexOf(a), j = s.indexOf(bEnd)
if (!(i < j) || j - i > 3500) { console.error('ABORT: options block shape unexpected'); process.exit(1) }
s = s.slice(0, i)
  + "      const profitLoss = optionPL({\n"
  + "        strategy: strategyType,\n"
  + "        contracts,\n"
  + "        open: { premium: mergedData.premium, premium_2: mergedData.premium_2, premium_3: mergedData.premium_3, premium_4: mergedData.premium_4 },\n"
  + "        close: { close_price: mergedData.close_price, close_price_2: mergedData.close_price_2, close_price_3: mergedData.close_price_3, close_price_4: mergedData.close_price_4 },\n"
  + "        openCommission, closeCommission\n"
  + "      })\n      \n"
  + s.slice(j)

// 5. assignment
rep("    const grossPremium = option.premium * option.quantity * 100\n", "    const grossPremium = calcGrossPremium(option.premium, option.quantity)\n", 'assign gross')
rep("    const profitLoss = grossPremium - openCommission // Max profit: premium collected minus commission paid\n",
    "    const profitLoss = assignmentPL({ premium: option.premium, contracts: option.quantity, openCommission }) // premium collected minus commission paid\n", 'assign P/L')

// test file: the account bug is fixed, so the known-bug test now has to pass
let u = tst.t
const f1 = "  // KNOWN BUG (found while reading the code): closing looks up the holding by ticker + user only,\n  // so with the same ticker in two accounts the adjustment can land on the wrong account's holding.\n  // `it.fails` passes while the bug exists and turns red the day it is fixed - then remove `.fails`.\n  it.fails('records"
if (u.split(f1).length - 1 !== 1) { console.error('ABORT: test anchor'); process.exit(1) }
u = u.replace(f1, () => "  // Fixed: closing used to pick the holding by ticker + user only, so with the same ticker in two\n  // accounts the adjustment could land on the wrong account's holding.\n  it('records")

const out = (f, t) => f.crlf ? t.replace(/\n/g, '\r\n') : t
fs.writeFileSync(P + '.bak-routes', idx.raw); fs.writeFileSync(P, out(idx, s))
fs.writeFileSync(T + '.bak-routes', tst.raw); fs.writeFileSync(T, out(tst, u))
console.log('patched ' + P + ' and ' + T)