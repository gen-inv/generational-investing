/* Edit one stock sale (date, price, commission). Shared ModalKit look (Stock = blue header). The live realized P/L comes
 * from Calc.previewSellEdit, the same replay the server uses, so the preview equals what the save books. Shares are fixed. */

async function editStockSell(holdingId, txId) {
  const K = ModalKit
  const S = 'STOCK'
  let stock
  try {
    stock = (await api.get(`/api/stocks/${holdingId}`)).data
  } catch (error) {
    console.error('Error loading sale:', error)
    alert('Failed to load the sale')
    return
  }
  const tx = (stock.transactions || []).find(t => t.id === txId && t.transaction_type === 'SELL')
  if (!tx) { alert('Sale not found'); return }
  if (tx.option_trade_id) { alert('This sale came from an option assignment; edit the option trade instead'); return }

  const m = K.open({
    id: 'edit-sell-modal',
    strategy: S,
    icon: 'fa-pen',
    title: 'Edit Sale',
    subtitle: `${stock.ticker} - ${tx.shares} shares`,
    size: '3xl',
    body: `
      ${K.summary('Original Sale', [
        K.stat('Shares', String(tx.shares)),
        K.stat('Sale date', tx.transaction_date),
        K.stat('Price', '$' + Number(tx.price_per_share).toFixed(3)),
        K.stat('Commission', K.fmt.money(Number(tx.commission) || 0))
      ])}
      <form id="editSellForm">
        ${K.grid(3,
          K.field({ strategy: S, label: 'Sale Date', name: 'transaction_date', type: 'date', value: tx.transaction_date, required: true }) +
          K.field({ strategy: S, label: 'Sale Price Per Share', name: 'price_per_share', type: 'number', step: '0.001', min: 0, value: tx.price_per_share, required: true }) +
          K.field({ strategy: S, label: 'Commission', name: 'commission', type: 'number', step: '0.01', min: 0, value: Number(tx.commission) || 0 }), 0)}
        ${K.analysisPanel('sell-edit-analysis', S, 'Realized P/L After This Change')}
        ${K.buttons({ strategy: S, submitLabel: 'Save Sale', submitIcon: 'fa-save' })}
      </form>`
  })

  const form = m.qs('#editSellForm')
  const panel = m.qs('#sell-edit-analysis')
  const read = () => ({
    date: form.elements.transaction_date.value,
    price: parseFloat(form.elements.price_per_share.value),
    commission: parseFloat(form.elements.commission.value) || 0
  })
  function update() {
    const r = Calc.previewSellEdit(stock.transactions, txId, read())
    if (!r.ok) { K.renderAnalysis(panel, [], r.status === 409 ? [r.error] : [], r.status === 409 ? null : 'Enter a valid date and price'); return }
    K.renderAnalysis(panel, [
      { label: 'This sale (net P/L)', value: K.fmt.money(r.sell.realized_pl, { plus: true }), sub: `was ${K.fmt.money(r.beforeSell.realized_pl, { plus: true })}`, tone: r.sell.realized_pl >= 0 ? 'good' : 'bad' },
      { label: 'Average cost at the time', value: '$' + r.sell.avg_cost.toFixed(3) },
      { label: 'Buy commission carried', value: K.fmt.money(r.sell.buy_commission) },
      { label: 'All sales on this holding', value: K.fmt.money(r.totalRealized, { plus: true }), sub: `was ${K.fmt.money(r.beforeTotal, { plus: true })}`, tone: r.totalRealized >= 0 ? 'good' : 'bad' }
    ], [], 'Shares sold are fixed here; to change them, remove the sale and enter it again')
  }
  form.addEventListener('input', update)
  update()
  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const v = read()
    const r = Calc.previewSellEdit(stock.transactions, txId, v)
    if (!r.ok) { alert(r.error); return }
    try {
      await api.put(`/api/stocks/${holdingId}/sells/${txId}`, { transaction_date: v.date, price_per_share: v.price, commission: v.commission })
      m.el.remove()
      loadStocks(); loadDashboard(); loadClosedTrades()
      if (document.getElementById('stock-details-modal')) showStockDetails(holdingId)
      showNotification('Sale updated', 'success')
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update the sale')
    }
  })
}
