// Step 3c: covered-call adjustments stay in step with the covered call (close / edit / re-open / delete).
// Needs migration 0032 applied first. Run from the repo root: node patch-cc.mjs
import fs from 'fs'
const P = 'src/index.tsx'
const raw = fs.readFileSync(P, 'utf8'), crlf = raw.includes('\r\n')
let s = raw.replace(/\r\n/g, '\n')
const once = (str, label) => { const n = s.split(str).length - 1; if (n !== 1) { console.error('ABORT: ' + label + ' found ' + n + ' times'); process.exit(1) } }
const rep = (a, b, label) => { once(a, label); s = s.replace(a, () => b) }

// import (after the calc import)
rep("import { optionPL, assignmentPL, grossPremium as calcGrossPremium } from './lib/calc'\n",
    "import { optionPL, assignmentPL, grossPremium as calcGrossPremium } from './lib/calc'\nimport { syncCoveredCallAdjustment } from './lib/cc-adjustment'\n", 'calc import')

// close route: plain select, and the sync replaces the hand-written INSERT
rep("      SELECT ot.*, sh.id as holding_id\n      FROM option_trades ot\n      LEFT JOIN stock_holdings sh ON sh.ticker = ot.ticker AND sh.user_id = ot.user_id AND sh.is_open = 1\n        AND (ot.account_id IS NULL OR sh.account_id = ot.account_id)\n      WHERE ot.id = ?",
    "      SELECT ot.*\n      FROM option_trades ot\n      WHERE ot.id = ?", 'cc close select')
const a = "    // Create cost basis adjustment when closing the covered call\n"
const bEnd = "closed @ $${data.close_price})`\n      ).run()\n    }\n"
once(a, 'cc close adjustment start'); once(bEnd, 'cc close adjustment end')
const i = s.indexOf(a), j = s.indexOf(bEnd) + bEnd.length
if (!(i < j) || j - i > 1200) { console.error('ABORT: cc close adjustment block shape'); process.exit(1) }
s = s.slice(0, i) + "    // The covered call's P/L becomes (or updates) its one cost-basis adjustment\n    await syncCoveredCallAdjustment(DB, userId, ccId)\n" + s.slice(j)

// covered-call edit
rep("    return c.json({ success: true, message: 'Covered call updated successfully' })\n",
    "    await syncCoveredCallAdjustment(DB, userId, ccId)\n    \n    return c.json({ success: true, message: 'Covered call updated successfully' })\n", 'cc edit return')

// generic option update (when the trade is a covered call)
rep("    return c.json({ success: true })\n  } catch (error) {\n    console.error('Update option trade error:', error)",
    "    if (mergedData.strategy_type === 'COVERED_CALL') await syncCoveredCallAdjustment(DB, userId, tradeId)\n    \n    return c.json({ success: true })\n  } catch (error) {\n    console.error('Update option trade error:', error)", 'options update return')

// re-open
rep("    return c.json({ success: true, message: 'Trade re-opened successfully' })\n",
    "    await syncCoveredCallAdjustment(DB, userId, tradeId)\n    \n    return c.json({ success: true, message: 'Trade re-opened successfully' })\n", 'reopen return')

// delete
rep("  await c.env.DB.prepare(`\n    DELETE FROM option_trades WHERE id = ? AND user_id = ?\n  `).bind(tradeId, userId).run()\n",
    "  await c.env.DB.prepare(`\n    DELETE FROM option_trades WHERE id = ? AND user_id = ?\n  `).bind(tradeId, userId).run()\n  // a deleted covered call takes its cost-basis adjustment with it\n  await syncCoveredCallAdjustment(c.env.DB, userId, tradeId)\n", 'delete')

fs.writeFileSync(P + '.bak-cc', raw)
fs.writeFileSync(P, crlf ? s.replace(/\n/g, '\r\n') : s)
console.log('patched ' + P)