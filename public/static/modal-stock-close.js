/* Close stock position modal. Shared ModalKit look (Stock = blue header); the live analysis uses
 * Calc.stockClosePL, tested against the same replay the server books the P/L with. */

async function closeStock(id) {
  let p
  try {
    p = (await api.get(`/api/stocks/${id}/close-preview`)).data
  } catch (error) {
    console.error('Error loading stock for close:', error)
    alert('Failed to load stock details')
    return
  }
  if (p.open_covered_calls > 0) {
    alert('Cannot close stock position while open covered calls exist. Please close the covered call(s) first.')
    return
  }

  const K = ModalKit
  const S = 'STOCK'
  const m = K.open({
    id: 'close-stock-modal',
    strategy: S,
    icon: 'fa-check-circle',
    title: 'Close Stock Position',
    subtitle: `${p.ticker} - Finalize Position`,
    body: `
      ${K.summary('Position Summary', [
        K.stat('Shares', String(p.shares)),
        K.stat('Avg cost', K.fmt.money(p.avg_cost)),
        K.stat('Account', p.account_name || p.account_type || 'N/A'),
        K.stat('Opened', p.opened_date || '-')
      ])}
      <form id="closeStockForm">
        ${K.grid(3,
          K.field({ strategy: S, label: 'Close Date', name: 'close_date', type: 'date', value: new Date().toISOString().split('T')[0], required: true }) +
          K.field({ strategy: S, label: 'Close Price/Share', name: 'close_price', type: 'number', step: '0.001', placeholder: '0.000', required: true }) +
          K.field({ strategy: S, label: 'Commission', name: 'commission', type: 'number', step: '0.01', value: 0, placeholder: '0.00', required: true }))}
        ${K.analysisPanel('close-analysis', S, 'P/L Calculation')}
        ${K.buttons({ strategy: S, submitLabel: 'Close Position', submitIcon: 'fa-check-circle' })}
      </form>`
  })

  const form = m.qs('#closeStockForm')
  const panel = m.qs('#close-analysis')

  const result = () => Calc.stockClosePL({
    shares: p.shares, avgCost: p.avg_cost, pendingBuyCommission: p.pending_buy_commission,
    closePrice: parseFloat(form.elements.close_price.value) || 0,
    closeCommission: parseFloat(form.elements.commission.value) || 0
  })

  function update() {
    const r = result()
    const rows = [
      { label: 'Sale proceeds', value: K.fmt.money(r.saleProceeds, { plus: true }), tone: 'good' },
      { label: 'Cost basis', value: K.fmt.money(-r.costBasis), tone: 'bad' },
      { label: 'Opening commissions', value: K.fmt.money(-r.buyCommission), tone: 'bad' },
      { label: 'Closing commission', value: K.fmt.money(-r.closeCommission), tone: 'bad' },
      { label: 'Net profit / loss', value: K.fmt.money(r.netPL, { plus: true }), tone: r.netPL >= 0 ? 'good' : 'bad', total: true }
    ]
    if (r.returnPct != null) rows.push({ label: 'Return on cost', value: K.fmt.pct(r.returnPct), tone: r.netPL >= 0 ? 'good' : 'bad' })
    const note = p.total_adjustments
      ? `Dividends and option premiums (${K.fmt.money(p.total_adjustments, { plus: true })}) are separate income and are not part of this figure`
      : 'Dividends and option premiums are separate income and are not part of this figure'
    K.renderAnalysis(panel, rows, [], note)
  }
  form.addEventListener('input', update)
  update()

  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await api.put(`/api/stocks/${id}/close`, {
        close_date: form.elements.close_date.value,
        close_price: parseFloat(form.elements.close_price.value),
        commission: parseFloat(form.elements.commission.value) || 0
      })
      m.el.remove()
      const detailsModal = document.getElementById('stock-details-modal')
      if (detailsModal) detailsModal.remove()
      loadStocks()
      loadDashboard()
      alert('Position closed successfully!')
    } catch (error) {
      console.error('Error closing position:', error)
      alert(error.response?.data?.error || 'Failed to close position')
    }
  })
}
