/* Covered call ENTRY modal. Covered calls are created only from a stock's details modal.
 * Uses ModalKit (look) and Calc (maths - the same tested code the server uses, built from src/lib/calc.ts). */

async function initiateCoveredCall(stockId) {
  let stock
  try {
    const response = await api.get('/api/stocks')
    stock = response.data.find(s => s.id === stockId)
  } catch (error) {
    console.error('Error:', error)
    alert('Failed to load stock information')
    return
  }

  if (!stock) { alert('Stock not found'); return }

  const maxContracts = Math.floor(stock.quantity / 100)
  if (maxContracts === 0) { alert('You need at least 100 shares to sell a covered call'); return }

  // adjusted cost basis per share (premiums and dividends already taken off); fall back to average price
  const costBasis = Number.isFinite(stock.cost_basis) && stock.cost_basis > 0 ? stock.cost_basis : Number(stock.avg_price) || 0

  const detailsModal = document.getElementById('stock-details-modal')
  if (detailsModal) detailsModal.remove()

  const K = ModalKit
  const S = 'COVERED_CALL'
  const pad = n => String(n).padStart(2, '0')
  const nowLocal = new Date()
  const today = `${nowLocal.getFullYear()}-${pad(nowLocal.getMonth() + 1)}-${pad(nowLocal.getDate())}`

  const m = K.open({
    id: 'covered-call-modal',
    strategy: S,
    icon: 'fa-file-contract',
    title: 'Sell Covered Call',
    subtitle: `${stock.ticker} - ${stock.account_name || 'Account'}`,
    onClose: () => { if (typeof showStockDetails === 'function') showStockDetails(stockId) },
    body: `
      ${K.summary('Position', [
        K.stat('Shares', String(stock.quantity)),
        K.stat('Account', stock.account_name || '-'),
        K.stat('Cost basis / share', K.fmt.money(costBasis)),
        K.stat('Max contracts', String(maxContracts))
      ])}
      <form id="coveredCallForm">
        ${K.grid(3,
          K.field({ strategy: S, label: 'Strike Price', name: 'strike_price', type: 'number', step: '0.001', required: true }) +
          K.field({ strategy: S, label: 'Premium Per Share', name: 'premium', type: 'number', step: '0.001', required: true, hint: '1 contract = 100 shares' }) +
          K.field({ strategy: S, label: 'Contracts', name: 'quantity', type: 'number', min: 1, max: maxContracts, value: 1, required: true, hint: `Max: ${maxContracts}` }))}
        ${K.grid(3,
          K.field({ strategy: S, label: 'Expiration Date', name: 'expiration_date', type: 'date', required: true }) +
          K.field({ strategy: S, label: 'Trade Date', name: 'trade_date', type: 'date', value: today, required: true }) +
          K.field({ strategy: S, label: 'Commission', name: 'commission', type: 'number', step: '0.01', value: 0, placeholder: '0.00', hint: 'Opening cost' }))}
        ${K.analysisPanel('cc-analysis', S, 'Live Analysis')}
        <div class="mb-4">${K.field({ strategy: S, label: 'Notes', name: 'notes', type: 'textarea', placeholder: 'Optional notes' })}</div>
        ${K.buttons({ strategy: S, submitLabel: 'Save Covered Call' })}
      </form>`
  })

  const form = m.qs('#coveredCallForm')
  const panel = m.qs('#cc-analysis')
  const num = name => parseFloat(form.elements[name].value)

  function update() {
    const strike = num('strike_price'), premium = num('premium')
    if (!(strike > 0) || !(premium > 0)) {
      panel.innerHTML = '<p class="text-gray-500 text-xs">Enter a strike and premium to see the analysis.</p>'
      return
    }
    const contracts = parseInt(form.elements.quantity.value) || 0
    const a = Calc.coveredCallAnalysis({
      contracts, strike, premium,
      commission: num('commission') || 0,
      costBasisPerShare: costBasis,
      daysToExpiry: Calc.daysBetween(form.elements.trade_date.value, form.elements.expiration_date.value)
    })
    const ann = r => (r == null ? '' : `${K.fmt.pct(r, 1)} annualized`)
    const warnings = []
    if (contracts > maxContracts) warnings.push(`You only hold enough shares for ${maxContracts} contract${maxContracts === 1 ? '' : 's'}.`)
    if (a.lockedInLoss) warnings.push(`Strike is below your cost basis of ${K.fmt.money(costBasis)}. If called away, you will have a cumulative ${a.gainIfCalled < 0 ? 'loss' : 'profit'} of ${K.fmt.money(Math.abs(a.gainIfCalled))} (including premium).`)

    K.renderAnalysis(panel, [
      { label: 'Net premium income', value: K.fmt.money(a.netPremium, { plus: true }), tone: a.netPremium >= 0 ? 'good' : 'bad' },
      { label: 'Return if unchanged', value: K.fmt.pct(a.returnIfUnchanged), sub: ann(a.annualizedIfUnchanged), tone: 'good' },
      { label: 'If called away: gain', value: K.fmt.money(a.gainIfCalled, { plus: true }), sub: `${K.fmt.pct(a.returnIfCalled)} ${ann(a.annualizedIfCalled)}`.trim(), tone: a.gainIfCalled >= 0 ? 'good' : 'bad' },
      { label: 'Break-even price', value: K.fmt.money(a.breakeven) + ' / share' },
      { label: 'Downside protection', value: K.fmt.pct(a.downsideProtection), sub: 'of cost basis' },
      { label: 'Days to expiry', value: a.daysToExpiry == null ? '-' : String(a.daysToExpiry) }
    ], warnings)
  }

  form.addEventListener('input', update)
  update()

  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(form)
    const quantity = parseInt(fd.get('quantity'))
    if (quantity > maxContracts) {
      alert(`Maximum ${maxContracts} contracts allowed for this position`)
      return
    }
    try {
      await api.post(`/api/stocks/${stockId}/covered-calls`, {
        strike_price: parseFloat(fd.get('strike_price')),
        premium: parseFloat(fd.get('premium')),
        quantity,
        expiration_date: fd.get('expiration_date'),
        trade_date: fd.get('trade_date'),
        commission: parseFloat(fd.get('commission')) || 0,
        notes: fd.get('notes') || null
      })
      m.el.remove()
      alert('Covered call recorded successfully!')
      showStockDetails(stockId)
      loadStocks()
      loadDashboard()
    } catch (error) {
      console.error('Error recording covered call:', error)
      alert(error.response?.data?.error || 'Failed to record covered call')
    }
  })
}