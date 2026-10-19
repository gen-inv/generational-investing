// Step 4d: short-put assignment. (1) the BUY transaction and the premium adjustment created by an assignment are linked
// to the put (option_trade_id), (2) re-opening, deleting or editing the put reverses/follows them (refusing with 409 when
// that cannot be done safely), (3) the assignment modal moves to ModalKit with live analysis.
// Aborts without writing if any anchor is not found exactly once.
import fs from 'fs'
const load = p => { const raw = fs.readFileSync(p, 'utf8'); return { raw, crlf: raw.includes('\r\n'), t: raw.replace(/\r\n/g, '\n') } }
const save = (p, f, t) => { fs.writeFileSync(p + '.bak-assign', f.raw); fs.writeFileSync(p, f.crlf ? t.replace(/\n/g, '\r\n') : t); console.log('patched ' + p) }
const once = (t, s, l) => { const n = t.split(s).length - 1; if (n !== 1) { console.error('ABORT: ' + l + ' found ' + n + ' times'); process.exit(1) } }
const rep = (t, from, to, l) => { once(t, from, l); return t.replace(from, () => to) }

const idx = load('src/index.tsx'), app = load('public/static/app.js')
if (idx.t.includes('syncPutAssignment')) { console.error('ABORT: already patched'); process.exit(1) }
let t = idx.t

t = rep(t, "import { syncCoveredCallAdjustment } from './lib/cc-adjustment'\n",
  "import { syncCoveredCallAdjustment } from './lib/cc-adjustment'\nimport { syncPutAssignment } from './lib/put-assignment'\nimport type { PutAssignmentChange } from './lib/put-assignment'\n", 'import')

// assign route: link the BUY transaction and the adjustment to the put
t = rep(t, "        transaction_date, commission, notes\n      ) VALUES (?, ?, 'BUY', ?, ?, ?, 0, ?)\n",
           "        transaction_date, commission, notes, option_trade_id\n      ) VALUES (?, ?, 'BUY', ?, ?, ?, 0, ?, ?)\n", 'BUY insert')
t = rep(t, "      `Assigned from option: ${shares} shares @ $${strikePrice}`\n    ).run()\n",
           "      `Assigned from option: ${shares} shares @ $${strikePrice}`,\n      optionId\n    ).run()\n", 'BUY bind')
t = rep(t, "        user_id, holding_id, adjustment_type, amount, adjustment_date, notes\n      ) VALUES (?, ?, 'SELLING_PUT', ?, ?, ?)\n",
           "        user_id, holding_id, adjustment_type, amount, adjustment_date, notes, option_trade_id\n      ) VALUES (?, ?, 'SELLING_PUT', ?, ?, ?, ?)\n", 'adjustment insert')
t = rep(t, "commission = $${netProceeds.toFixed(2)}` : ''}`\n    ).run()\n",
           "commission = $${netProceeds.toFixed(2)}` : ''}`,\n      optionId\n    ).run()\n", 'adjustment bind')

// reopen: refuse first, then reverse
t = rep(t, "    // Re-open the trade and clear closing data\n",
  "    // An assigned short put owns a stock purchase and a premium adjustment: make sure they can be reversed before changing anything\n" +
  "    const putCheck = await syncPutAssignment(DB, userId, tradeId, { kind: 'undo' }, 'check')\n" +
  "    if (!putCheck.ok) return c.json({ error: putCheck.error }, 409)\n\n" +
  "    // Re-open the trade and clear closing data\n", 'reopen check')
t = rep(t, "    await syncCoveredCallAdjustment(DB, userId, tradeId)\n    \n    return c.json({ success: true, message: 'Trade re-opened successfully' })",
           "    await syncCoveredCallAdjustment(DB, userId, tradeId)\n    await syncPutAssignment(DB, userId, tradeId, { kind: 'undo' }, 'apply')\n    \n    return c.json({ success: true, message: 'Trade re-opened successfully' })", 'reopen apply')

// delete: refuse first, then reverse
const dStart = "app.delete('/api/options/:id', authMiddleware, async (c) => {\n"
once(t, dStart, 'delete route')
const di = t.indexOf(dStart), dj = t.indexOf("  return c.json({ success: true })\n})\n", di)
if (dj < 0 || dj - di > 1200) { console.error('ABORT: delete route shape'); process.exit(1) }
t = t.slice(0, di) + `app.delete('/api/options/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const tradeId = c.req.param('id')

  // an assigned short put owns a stock purchase and a premium adjustment: refuse if they cannot be reversed
  const putCheck = await syncPutAssignment(c.env.DB, userId, tradeId, { kind: 'undo' }, 'check')
  if (!putCheck.ok) return c.json({ error: putCheck.error }, 409)

  await c.env.DB.prepare(\`
    DELETE FROM option_trades WHERE id = ? AND user_id = ?
  \`).bind(tradeId, userId).run()
  // a deleted covered call takes its cost-basis adjustment with it; a deleted assigned put takes its shares and premium adjustment
  await syncCoveredCallAdjustment(c.env.DB, userId, tradeId)
  await syncPutAssignment(c.env.DB, userId, tradeId, { kind: 'undo' }, 'apply')

` + t.slice(dj)

// edit: pre-check, then follow
t = rep(t, "    // Build UPDATE query with only provided fields (PATCH-style)\n",
  "    // An assigned short put owns a stock purchase and a premium adjustment: check the edit can be applied before changing anything\n" +
  "    const putMergedStrategy = data.strategy_type !== undefined ? data.strategy_type : existingTrade.strategy_type\n" +
  "    const putMergedClose = data.close_date !== undefined ? data.close_date : existingTrade.close_date\n" +
  "    const putMergedClosePrice = data.close_price !== undefined ? data.close_price : existingTrade.close_price\n" +
  "    const putCloses = !!(putMergedClose && putMergedClosePrice !== null && putMergedClosePrice !== undefined)\n" +
  "    const putReopens = !putCloses && !data.close_date\n" +
  "    const putStillPut = putMergedStrategy === 'SELLING_PUT' || putMergedStrategy === 'SELLING_PUT_WHEEL'\n" +
  "    const putChange: PutAssignmentChange = (putReopens || !putStillPut) ? { kind: 'undo' } : { kind: 'keep', option: {\n" +
  "      quantity: data.quantity !== undefined ? data.quantity : existingTrade.quantity,\n" +
  "      strike_price: data.strike_price !== undefined ? data.strike_price : existingTrade.strike_price,\n" +
  "      premium: data.premium !== undefined ? data.premium : existingTrade.premium,\n" +
  "      commission: data.commission !== undefined ? data.commission : (existingTrade.commission || 0),\n" +
  "      close_date: putMergedClose\n" +
  "    } }\n" +
  "    const putCheck = await syncPutAssignment(DB, userId, tradeId, putChange, 'check')\n" +
  "    if (!putCheck.ok) return c.json({ error: putCheck.error }, 409)\n\n" +
  "    // Build UPDATE query with only provided fields (PATCH-style)\n", 'edit check')
t = rep(t, "    if (mergedData.strategy_type === 'COVERED_CALL') await syncCoveredCallAdjustment(DB, userId, tradeId)\n",
           "    if (mergedData.strategy_type === 'COVERED_CALL') await syncCoveredCallAdjustment(DB, userId, tradeId)\n    await syncPutAssignment(DB, userId, tradeId, putChange, 'apply')\n", 'edit apply')

const tag = '        <script src="/static/modal-stock-close.js"></script>\n'
t = rep(t, tag, tag + '        <script src="/static/modal-assign.js"></script>\n', 'script tag')

let a = app.t
const s = 'async function assignStockPosition(optionId) {\n', e = 'async function showOptionDetails(id) {\n'
once(a, s, 'assign start'); once(a, e, 'assign end')
const i = a.indexOf(s), j = a.indexOf(e)
if (!(i < j) || j - i > 16000) { console.error('ABORT: assign block shape (' + (j - i) + ' chars)'); process.exit(1) }
a = a.slice(0, i) + '// assignStockPosition now lives in /static/modal-assign.js (shared ModalKit look + live analysis)\n\n' + a.slice(j)

save('src/index.tsx', idx, t); save('public/static/app.js', app, a)
