// Step 4c: stock close modal moves to public/static/modal-stock-close.js (shared look + live analysis).
// Adds GET /api/stocks/:id/close-preview (shares, average cost, unattributed buy commissions, open covered calls)
// so the preview uses the same replay as the close itself. Aborts without writing if any anchor is not found exactly once.
import fs from 'fs'
const load = p => { const raw = fs.readFileSync(p, 'utf8'); return { raw, crlf: raw.includes('\r\n'), t: raw.replace(/\r\n/g, '\n') } }
const save = (p, f, t) => { fs.writeFileSync(p + '.bak-stockclose', f.raw); fs.writeFileSync(p, f.crlf ? t.replace(/\n/g, '\r\n') : t); console.log('patched ' + p) }
const once = (t, s, l) => { const n = t.split(s).length - 1; if (n !== 1) { console.error('ABORT: ' + l + ' found ' + n + ' times'); process.exit(1) } }

const idx = load('src/index.tsx'), app = load('public/static/app.js'), calc = load('src/lib/calc.ts')
if (idx.t.includes('close-preview')) { console.error('ABORT: already patched'); process.exit(1) }

// 1. index.tsx: imports, preview route, script tag
let t = idx.t
const imp = "import { loadRealizedSells, sumRealized } from './lib/stock-pl'\n"
once(t, imp, 'stock-pl import')
t = t.replace(imp, () => imp + "import { holdingPosition } from './lib/stock-close'\n")

const route = "app.put('/api/stocks/:id/close', authMiddleware, async (c) => {\n"
once(t, route, 'close route')
const preview = `// What closing this position would sell: shares held now, average cost, and buy commissions not yet
// carried by an earlier partial sell (same replay the close itself uses), plus open covered calls.
app.get('/api/stocks/:id/close-preview', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    const holding = await DB.prepare(\`
      SELECT sh.id, sh.ticker, sh.account_id, sh.opened_date, sh.is_open, a.account_name, a.account_type
      FROM stock_holdings sh
      LEFT JOIN accounts a ON sh.account_id = a.id
      WHERE sh.id = ? AND sh.user_id = ?
    \`).bind(holdingId, userId).first() as any
    if (!holding) return c.json({ error: 'Stock holding not found' }, 404)

    const txs = await DB.prepare(\`
      SELECT id, transaction_type, shares, price_per_share, transaction_date, commission
      FROM stock_transactions WHERE holding_id = ?
    \`).bind(holdingId).all()
    const position = holdingPosition((txs.results || []) as any[])

    const adj = await DB.prepare(\`
      SELECT COALESCE(SUM(amount), 0) as total FROM cost_basis_adjustments
      WHERE holding_id = ? AND adjustment_type IN ('DIVIDEND', 'COVERED_CALL', 'SELLING_PUT')
    \`).bind(holdingId).first() as any
    const cc = await DB.prepare(\`
      SELECT COUNT(*) as n FROM option_trades
      WHERE user_id = ? AND ticker = ? AND account_id = ? AND strategy_type = 'COVERED_CALL' AND is_open = 1
    \`).bind(userId, holding.ticker, holding.account_id).first() as any

    return c.json({
      id: holding.id,
      ticker: holding.ticker,
      account_name: holding.account_name,
      account_type: holding.account_type,
      opened_date: holding.opened_date,
      is_open: holding.is_open,
      ...position,
      total_adjustments: adj?.total || 0,
      open_covered_calls: cc?.n || 0
    })
  } catch (error) {
    console.error('Close preview error:', error)
    return c.json({ error: 'Failed to load close preview' }, 500)
  }
})

`
t = t.replace(route, () => preview + route)

const tag = '        <script src="/static/modal-close.js"></script>\n'
once(t, tag, 'modal-close script tag')
t = t.replace(tag, () => tag + '        <script src="/static/modal-stock-close.js"></script>\n')

// 2. app.js: remove the old closeStock
let a = app.t
const s = 'async function closeStock(id) {\n', e = '// Close stock details modal and refresh stock trades view\nfunction closeStockDetailsModal() {\n'
once(a, s, 'closeStock start'); once(a, e, 'closeStock end')
const i = a.indexOf(s), j = a.indexOf(e)
if (!(i < j) || j - i > 14000) { console.error('ABORT: closeStock block shape (' + (j - i) + ' chars)'); process.exit(1) }
a = a.slice(0, i) + '// closeStock now lives in /static/modal-stock-close.js (shared ModalKit look + live analysis)\n\n' + a.slice(j)

// 3. calc.ts: expose stockClosePL to the browser bundle
let cc = calc.t
const exp = "export { stockClosePL } from './stock-close'\n"
if (cc.includes(exp)) { console.error('ABORT: calc.ts already exports stockClosePL'); process.exit(1) }
cc = cc.endsWith('\n') ? cc + exp : cc + '\n' + exp

save('src/index.tsx', idx, t); save('public/static/app.js', app, a); save('src/lib/calc.ts', calc, cc)
