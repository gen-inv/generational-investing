// Step 4h: add/reduce position modals (stocks and options) move to public/static/modal-position.js (shared look, live analysis).
// Server: new POST /api/options/:id/reduce books the closed contracts as their own closed trade WITH close date, close prices
// and P/L (the old modal created it through POST /api/options, which discards those fields) and shrinks the open trade.
// Aborts without writing if any anchor is not found exactly once.
import fs from 'fs'
const load = p => { const raw = fs.readFileSync(p, 'utf8'); return { raw, crlf: raw.includes('\r\n'), t: raw.replace(/\r\n/g, '\n') } }
const save = (p, f, t) => { fs.writeFileSync(p + '.bak-positions', f.raw); fs.writeFileSync(p, f.crlf ? t.replace(/\n/g, '\r\n') : t); console.log('patched ' + p) }
const once = (t, s, l) => { const n = t.split(s).length - 1; if (n !== 1) { console.error('ABORT: ' + l + ' found ' + n + ' times'); process.exit(1) } }

const idx = load('src/index.tsx'), app = load('public/static/app.js'), calc = load('src/lib/calc.ts')
if (idx.t.includes('/static/modal-position.js')) { console.error('ABORT: already patched'); process.exit(1) }

// ---- index.tsx: script tag, import, new route
const tag = '        <script src="/static/modal-cc-manage.js"></script>\n'
once(idx.t, tag, 'modal-cc-manage script tag')
let newIdx = idx.t.replace(tag, () => tag + '        <script src="/static/modal-position.js"></script>\n')

const imp = "import { optionPL, assignmentPL, grossPremium as calcGrossPremium } from './lib/calc'"
once(newIdx, imp, 'calc import')
newIdx = newIdx.replace(imp, () => "import { optionPL, assignmentPL, grossPremium as calcGrossPremium, splitOptionCommission } from './lib/calc'")

const routeAnchor = "app.put('/api/options/:id/reopen', authMiddleware"
once(newIdx, routeAnchor, 'reopen route')
const route = `// Close some contracts of an open option position. The closed contracts become their own closed trade (with close date,
// close prices and P/L); the open trade keeps the rest and its share of the opening commission.
app.post('/api/options/:id/reduce', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env

    const t = await DB.prepare(\`SELECT * FROM option_trades WHERE id = ? AND user_id = ?\`).bind(tradeId, userId).first() as any
    if (!t) return c.json({ error: 'Option trade not found' }, 404)
    if (!t.is_open) return c.json({ error: 'Option trade is already closed' }, 400)
    if (t.strategy_type === 'COVERED_CALL') return c.json({ error: 'Covered calls are closed from the stock details' }, 400)

    const contracts = Number(data.contracts)
    if (!Number.isInteger(contracts) || contracts < 1) return c.json({ error: 'Contracts to close must be a whole number of at least 1' }, 400)
    if (contracts >= t.quantity) return c.json({ error: 'Cannot close all contracts here. Use Close Position instead' }, 400)
    if (!data.close_date) return c.json({ error: 'Close date is required' }, 400)

    const legCount = t.strategy_type === 'IRON_CONDOR' ? 4 : (t.strategy_type === 'CREDIT_SPREAD' || t.strategy_type === 'DEBIT_SPREAD') ? 2 : 1
    const keys = ['close_price', 'close_price_2', 'close_price_3', 'close_price_4']
    const closes: Array<number | null> = []
    for (let i = 0; i < 4; i++) {
      if (i >= legCount) { closes.push(null); continue }
      const raw = data[keys[i]]
      const v = raw === null || raw === undefined || raw === '' ? NaN : Number(raw)
      if (!Number.isFinite(v) || v < 0) return c.json({ error: 'A close price is required for every leg' }, 400)
      closes.push(v)
    }
    const closeCommission = Math.max(0, Number(data.close_commission) || 0)

    const split = splitOptionCommission(t.quantity, t.commission, contracts)
    const profitLoss = optionPL({
      strategy: t.strategy_type, contracts,
      open: { premium: t.premium, premium_2: t.premium_2, premium_3: t.premium_3, premium_4: t.premium_4 },
      close: { close_price: closes[0], close_price_2: closes[1], close_price_3: closes[2], close_price_4: closes[3] },
      openCommission: split.closedCommission, closeCommission
    })

    const results = await DB.batch([
      DB.prepare(\`
        INSERT INTO option_trades (
          user_id, company_id, account_id, ticker, strategy_type, strike_price, strike_price_2, strike_price_3, strike_price_4,
          premium, premium_2, premium_3, premium_4, quantity, expiration_date, account_type, trade_date, commission,
          is_open, close_date, close_price, close_price_2, close_price_3, close_price_4, close_commission, profit_loss, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
      \`).bind(
        userId, t.company_id, t.account_id ?? null, t.ticker, t.strategy_type, t.strike_price, t.strike_price_2 ?? null, t.strike_price_3 ?? null, t.strike_price_4 ?? null,
        t.premium, t.premium_2 ?? null, t.premium_3 ?? null, t.premium_4 ?? null, contracts, t.expiration_date, t.account_type, t.trade_date, split.closedCommission,
        data.close_date, closes[0], closes[1], closes[2], closes[3], closeCommission, profitLoss, t.notes ?? null
      ),
      DB.prepare(\`UPDATE option_trades SET quantity = ?, commission = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?\`)
        .bind(split.remainingContracts, split.remainingCommission, tradeId, userId)
    ])

    return c.json({ success: true, closed_id: results[0].meta.last_row_id, remaining_contracts: split.remainingContracts, profit_loss: profitLoss })
  } catch (error) {
    console.error('Reduce option position error:', error)
    return c.json({ error: 'Failed to reduce position' }, 500)
  }
})

`
newIdx = newIdx.replace(routeAnchor, () => route + routeAnchor)

// ---- app.js: remove the four old functions
let a = app.t
const cut = (startMarker, endMarker, label, max) => {
  once(a, startMarker, label + ' start'); once(a, endMarker, label + ' end')
  const i = a.indexOf(startMarker), j = a.indexOf(endMarker)
  if (!(i < j) || j - i > max) { console.error('ABORT: ' + label + ' block shape (' + (j - i) + ' chars)'); process.exit(1) }
  a = a.slice(0, i) + '// ' + label + ' now live in /static/modal-position.js (shared ModalKit look + live analysis)\n\n' + a.slice(j)
}
cut('// Add to existing position\nasync function addStockToPosition(stockId) {\n', '// Record dividend payment\nasync function recordDividend(', 'addStockToPosition and sellStockFromPosition', 30000)
cut('// Add To Position - adds more contracts to an existing open position\nasync function addToOptionPosition(optionId) {\n', '// (renderCloseLegFields, updateCloseAnalysis, calculateOptionPL removed', 'addToOptionPosition and reduceFromOptionPosition', 30000)

// ---- calc.ts export
const exp = "export { addToStockPosition, sellFromStockPosition, addToOptionPosition, splitOptionCommission } from './position-change'\n"
if (calc.t.includes(exp)) { console.error('ABORT: calc.ts already exports position-change'); process.exit(1) }
const c = calc.t.endsWith('\n') ? calc.t + exp : calc.t + '\n' + exp

save('src/index.tsx', idx, newIdx); save('public/static/app.js', app, a); save('src/lib/calc.ts', calc, c)
