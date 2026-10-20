import fs from 'fs'
function edit(file, pairs) {
  let s = fs.readFileSync(file, 'utf8')
  const crlf = s.includes('\r\n')
  const fix = t => (crlf ? t.replace(/\r?\n/g, '\r\n') : t)
  for (let [a, b, all] of pairs) {
    a = fix(a); b = fix(b)
    if (!s.includes(a)) { console.error('PATCH FAILED in ' + file + ': anchor not found:\n' + a.slice(0, 120)); process.exit(1) }
    s = all ? s.split(a).join(b) : s.replace(a, () => b)
  }
  fs.writeFileSync(file + '.bak-4k', fs.readFileSync(file)); fs.writeFileSync(file, s); console.log('patched ' + file)
}

const route = `
// Edit one SELL (date, price, commission). P/L is always replayed from the transactions, so saving
// the corrected sell re-books realized P/L everywhere. Shares and sells created by an option
// assignment are not editable here.
app.put('/api/stocks/:id/sells/:txId', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = Number(c.req.param('id'))
    const txId = Number(c.req.param('txId'))
    const data = await c.req.json()
    const { DB } = c.env

    const holding = await DB.prepare(\`SELECT * FROM stock_holdings WHERE id = ? AND user_id = ?\`).bind(holdingId, userId).first() as any
    if (!holding) return c.json({ error: 'Stock holding not found' }, 404)

    const txs = await DB.prepare(\`
      SELECT id, holding_id, transaction_type, shares, price_per_share, transaction_date, commission, option_trade_id
      FROM stock_transactions WHERE holding_id = ?
    \`).bind(holdingId).all()
    const rows = (txs.results || []) as any[]
    const target = rows.find(t => t.id === txId)
    if (target && target.option_trade_id) {
      return c.json({ error: 'This sale came from an option assignment; edit the option trade instead' }, 409)
    }

    const preview = previewSellEdit(rows, txId, {
      date: data.transaction_date, price: data.price_per_share, commission: data.commission
    })
    if (!preview.ok) return c.json({ error: preview.error }, preview.status)

    await DB.prepare(\`UPDATE stock_transactions SET transaction_date = ?, price_per_share = ?, commission = ? WHERE id = ? AND holding_id = ?\`)
      .bind(data.transaction_date, Number(data.price_per_share), Number(data.commission) || 0, txId, holdingId).run()

    // A closed holding's closed date follows its latest sale.
    if (holding.is_open === 0) {
      const latest = preview.sells.reduce((d, s) => (s.sell_date > d ? s.sell_date : d), '')
      if (latest) await DB.prepare(\`UPDATE stock_holdings SET closed_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?\`).bind(latest, holdingId, userId).run()
    }

    return c.json({ success: true, realized_pl: preview.sell.realized_pl, total_realized_pl: preview.totalRealized })
  } catch (error) {
    console.error('Edit stock sell error:', error)
    return c.json({ error: 'Failed to update sell' }, 500)
  }
})

app.put('/api/stocks/:id/reopen',`
edit('src/index.tsx', [
  ["app.put('/api/stocks/:id/reopen',", route.trimStart()],
  ["import { loadRealizedSells, sumRealized } from './lib/stock-pl'", "import { loadRealizedSells, sumRealized } from './lib/stock-pl'\nimport { previewSellEdit } from './lib/sell-edit'"],
  ['<script src="/static/modal-position.js"></script>', '<script src="/static/modal-position.js"></script>\n        <script src="/static/modal-sell-edit.js"></script>'],
  ['        st.commission,\n        st.notes,\n        a.account_name,\n        1 as is_open', '        st.commission,\n        st.notes,\n        st.option_trade_id,\n        a.account_name,\n        1 as is_open']
])

edit('public/static/app.js', [
  [`                                                        <td class="px-4 py-3 text-center">
                                                            <span class="px-2 py-1 rounded \${statusColor} text-xs font-medium">
                                                                \${statusText}
                                                            </span>
                                                        </td>`,
   `                                                        <td class="px-4 py-3 text-center">
                                                            <span class="px-2 py-1 rounded \${statusColor} text-xs font-medium">
                                                                \${statusText}
                                                            </span>
                                                            \${trade.trade_type === 'SELL' && !trade.option_trade_id ? \`<button onclick="editStockSell(\${stock.id}, \${trade.id})" class="ml-2 text-indigo-700 hover:text-indigo-900" title="Edit this sale"><i class="fas fa-pen"></i></button>\` : ''}
                                                        </td>`]
])

edit('public/static/modal-stock.js', [
  [`        <div class="bg-gradient-to-br \${pl >= 0 ? 'from-green-50 to-green-100 border-green-300' : 'from-red-50 to-red-100 border-red-300'} p-3 rounded-lg border mb-4">
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold \${pl >= 0 ? 'text-green-900' : 'text-red-900'}">Net profit / loss</span>
            <span class="text-xl font-bold \${pl >= 0 ? 'text-green-700' : 'text-red-700'}">\${K.fmt.money(pl, { plus: true })}</span>
          </div>`,
   `        <div id="stock-pl-box" class="bg-gradient-to-br \${pl >= 0 ? 'from-green-50 to-green-100 border-green-300' : 'from-red-50 to-red-100 border-red-300'} p-3 rounded-lg border mb-4">
          <div class="flex items-center justify-between">
            <span id="stock-pl-label" class="text-sm font-bold \${pl >= 0 ? 'text-green-900' : 'text-red-900'}">Net profit / loss</span>
            <span id="stock-pl-value" class="text-xl font-bold \${pl >= 0 ? 'text-green-700' : 'text-red-700'}">\${K.fmt.money(pl, { plus: true })}</span>
          </div>`],
  [`  form.addEventListener('input', update)
  form.addEventListener('change', update)
`,
   `  // Closed trade: the closing sale is editable and the P/L box follows the corrected numbers (same replay the server books).
  const finalSell = isClosed && stock.transactions
    ? [...stock.transactions].filter(t => t.transaction_type === 'SELL')
        .sort((a, b) => a.transaction_date !== b.transaction_date ? (a.transaction_date < b.transaction_date ? -1 : 1) : a.id - b.id).pop()
    : null
  function updateClosedPL() {
    if (!finalSell || !form.elements.close_date) return
    const r = Calc.previewSellEdit(stock.transactions, finalSell.id, {
      date: form.elements.close_date.value, price: parseFloat(form.elements.close_price.value), commission: parseFloat(form.elements.close_commission.value) || 0
    })
    const box = m.qs('#stock-pl-box'), val = m.qs('#stock-pl-value'), label = m.qs('#stock-pl-label')
    if (!r.ok) { label.textContent = r.error; return }
    const v = r.totalRealized, good = v >= 0
    label.textContent = 'Net profit / loss'
    label.className = 'text-sm font-bold ' + (good ? 'text-green-900' : 'text-red-900')
    val.className = 'text-xl font-bold ' + (good ? 'text-green-700' : 'text-red-700')
    val.textContent = K.fmt.money(v, { plus: true })
    box.className = 'bg-gradient-to-br ' + (good ? 'from-green-50 to-green-100 border-green-300' : 'from-red-50 to-red-100 border-red-300') + ' p-3 rounded-lg border mb-4'
  }
  form.addEventListener('input', () => { update(); updateClosedPL() })
  form.addEventListener('change', () => { update(); updateClosedPL() })
`],
  [`    try {
      if (isEdit) await api.put(\`/api/stocks/\${stockId}\`, data)`,
   `    try {
      if (isEdit && finalSell && data.close_date) {
        const changed = data.close_date !== finalSell.transaction_date || data.close_price !== Number(finalSell.price_per_share) || data.close_commission !== (Number(finalSell.commission) || 0)
        if (changed) {
          await api.put(\`/api/stocks/\${stockId}/sells/\${finalSell.id}\`, {
            transaction_date: data.close_date, price_per_share: data.close_price, commission: data.close_commission
          })
        }
      }
      if (isEdit) await api.put(\`/api/stocks/\${stockId}\`, data)`]
])

{ // calc.ts: expose previewSellEdit to the browser bundle
  const f = 'src/lib/calc.ts'; let s = fs.readFileSync(f, 'utf8')
  if (!s.includes("previewSellEdit")) {
    const nl = s.includes('\r\n') ? '\r\n' : '\n'
    fs.writeFileSync(f + '.bak-4k', s); fs.writeFileSync(f, s.replace(/\s*$/, '') + nl + "export { previewSellEdit } from './sell-edit'" + nl); console.log('patched ' + f)
  }
}
