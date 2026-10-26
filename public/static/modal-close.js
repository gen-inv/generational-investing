/* Close modals: covered call and option trades. Shared ModalKit look (header colour = strategy),
 * live analysis from Calc.optionPLBreakdown (the same tested code the server uses). */

var CLOSE_COLS = ['', '_2', '_3', '_4']   // leg i -> strike_price / premium / close_price + CLOSE_COLS[i]

// Today as YYYY-MM-DD in the user's own time zone (toISOString would already say tomorrow in the evening).
function closeModalToday() {
  const d = new Date(), p = n => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

async function closeCoveredCall(ccId, stockId) {
  let cc
  try {
    const response = await api.get(`/api/stocks/${stockId}/covered-calls`)
    cc = response.data.find(o => o.id === ccId)
  } catch (error) {
    console.error('Error:', error)
    alert('Failed to load covered call details')
    return
  }
  if (!cc) { alert('Covered call not found'); return }

  const detailsModal = document.getElementById('stock-details-modal')
  if (detailsModal) detailsModal.remove()

  const K = ModalKit
  const S = 'COVERED_CALL'
  // Close date: today, unless the expiration date has already passed (then the expiration date).
  const expDate = String(cc.expiration_date || '').slice(0, 10)
  const expired = !!expDate && expDate < closeModalToday()
  const m = K.open({
    id: 'close-covered-call-modal',
    strategy: S,
    icon: 'fa-check-circle',
    title: 'Close Covered Call',
    subtitle: `${cc.ticker} - Finalize Position`,
    account: K.accountLabel(cc.account_name, cc.account_type_name),
    onClose: () => showStockDetails(stockId),
    body: `
      ${K.summary('Position Summary', [
        K.stat('Strike', K.fmt.money(Number(cc.strike_price))),
        K.stat('Premium received', K.fmt.money(Calc.grossPremium(cc.premium, cc.quantity)), 'text-green-600'),
        K.stat('Contracts', String(cc.quantity)),
        K.stat('Expires', cc.expiration_date)
      ])}
      <form id="closeCoveredCallForm">
        ${K.grid(3,
          K.field({ strategy: S, label: 'Close Date', name: 'close_date', type: 'date', value: expired ? expDate : closeModalToday(), required: true, hint: expired ? 'Defaults to expiration date (exp date has passed)' : 'Defaults to current date' }) +
          K.field({ strategy: S, label: 'Close Price/Share', name: 'close_price', type: 'number', step: '0.001', value: 0, placeholder: '0.000', required: true }) +
          K.field({ strategy: S, label: 'Commission', name: 'commission', type: 'number', step: '0.01', value: 0, placeholder: '0.00', required: true }))}
        ${K.analysisPanel('close-analysis', S, 'P/L Calculation')}
        ${K.buttons({ strategy: S, submitLabel: 'Close Position', submitIcon: 'fa-check-circle' })}
      </form>`
  })

  const form = m.qs('#closeCoveredCallForm')
  const panel = m.qs('#close-analysis')

  const breakdown = () => Calc.optionPLBreakdown({
    strategy: S, contracts: cc.quantity,
    open: { premium: cc.premium }, close: { close_price: parseFloat(form.elements.close_price.value) || 0 },
    openCommission: cc.commission || 0, closeCommission: parseFloat(form.elements.commission.value) || 0
  })

  function update() {
    const b = breakdown()
    K.renderAnalysis(panel, [
      { label: 'Premium received', value: K.fmt.money(b.openingCredit, { plus: true }), tone: 'good' },
      { label: 'Close cost', value: K.fmt.money(-b.closingCost, { plus: true }), tone: b.closingCost > 0 ? 'bad' : 'neutral' },
      { label: 'Opening commission', value: K.fmt.money(-b.openCommission), tone: 'bad' },
      { label: 'Closing commission', value: K.fmt.money(-b.closeCommission), tone: 'bad' },
      { label: 'Net profit / loss', value: K.fmt.money(b.netPL, { plus: true }), tone: b.netPL >= 0 ? 'good' : 'bad', total: true }
    ], [], "Net P/L updates your stock's cost basis")
  }
  form.addEventListener('input', update)
  update()

  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const b = breakdown()
    try {
      await api.put(`/api/covered-calls/${ccId}/close`, {
        close_date: form.elements.close_date.value,
        close_price: parseFloat(form.elements.close_price.value),
        close_commission: parseFloat(form.elements.commission.value) || 0
      })
      m.el.remove()
      alert(`Covered call closed successfully!\n\n${b.netPL >= 0 ? 'Profit' : 'Loss'}: ${K.fmt.money(Math.abs(b.netPL))}\n\nThis has been applied to the stock's cost basis.`)
      showStockDetails(stockId)
      loadStocks()
      loadDashboard()
    } catch (error) {
      console.error('Error closing covered call:', error)
      alert(error.response?.data?.error || 'Failed to close covered call')
    }
  })
}

async function closeOption(optionId) {
  let option
  try {
    const response = await api.get('/api/options')
    option = response.data.find(o => o.id === optionId)
  } catch (error) {
    console.error('Error loading option:', error)
    alert('Failed to load option details')
    return
  }
  if (!option) { alert('Option trade not found'); return }

  const K = ModalKit
  const S = option.strategy_type
  const spec = K.STRATEGIES[S] || { label: String(S).replace(/_/g, ' '), legs: ['Option'], credit: true }
  const multi = spec.legs.length > 1

  const legField = (label, i) => K.field({
    strategy: S, label: multi ? `${label} - Close Price/Share` : 'Close Price per Share',
    name: 'close_price' + CLOSE_COLS[i], type: 'number', step: '0.001', placeholder: '0.00', required: true,
    hint: `Original: strike ${K.fmt.money(Number(option['strike_price' + CLOSE_COLS[i]]))}, premium ${K.fmt.money(Number(option['premium' + CLOSE_COLS[i]]))}`
  })

  const m = K.open({
    id: 'close-option-modal',
    strategy: S,
    icon: 'fa-check-circle',
    title: 'Close Option Trade',
    subtitle: `${option.ticker} - ${spec.label}`,
    account: K.accountLabel(option.account_name, option.account_type_name),
    size: '3xl',
    body: `
      ${K.summary('Position Summary', [
        K.stat('Trade date', option.trade_date),
        K.stat('Expiration', option.expiration_date),
        K.stat('Contracts', String(option.quantity)),
        K.stat('Open commission', K.fmt.money(parseFloat(option.commission || 0)))
      ])}
      <form id="closeOptionForm">
        ${K.grid(2, K.field({ strategy: S, label: 'Close Date', name: 'close_date', type: 'date', value: closeModalToday(), required: true }) +
                    K.field({ strategy: S, label: 'Close Commission', name: 'close_commission', type: 'number', step: '0.01', value: 0, placeholder: '0.00' }))}
        ${K.grid(2, spec.legs.map(legField).join(''))}
        ${K.analysisPanel('close-analysis', S, 'Trade Analysis')}
        ${K.buttons({ strategy: S, submitLabel: 'Close Position', submitIcon: 'fa-check-circle' })}
      </form>`
  })

  const form = m.qs('#closeOptionForm')
  const panel = m.qs('#close-analysis')
  const closePrices = () => {
    const c = {}
    spec.legs.forEach((_, i) => { c['close_price' + CLOSE_COLS[i]] = parseFloat(form.elements['close_price' + CLOSE_COLS[i]].value) || 0 })
    return c
  }
  const breakdown = () => Calc.optionPLBreakdown({
    strategy: S, contracts: option.quantity,
    open: { premium: option.premium, premium_2: option.premium_2, premium_3: option.premium_3, premium_4: option.premium_4 },
    close: closePrices(),
    openCommission: parseFloat(option.commission || 0),
    closeCommission: parseFloat(form.elements.close_commission.value) || 0
  })

  function update() {
    const b = breakdown()
    K.renderAnalysis(panel, [
      { label: 'Opening premium', value: K.fmt.money(b.openingCredit, { plus: true }), tone: b.openingCredit >= 0 ? 'good' : 'bad' },
      { label: 'Closing cost', value: K.fmt.money(-b.closingCost, { plus: true }), tone: b.closingCost <= 0 ? 'good' : 'bad' },
      { label: 'Opening commission', value: K.fmt.money(-b.openCommission), tone: 'bad' },
      { label: 'Closing commission', value: K.fmt.money(-b.closeCommission), tone: 'bad' },
      { label: 'Net profit / loss', value: K.fmt.money(b.netPL, { plus: true }), tone: b.netPL >= 0 ? 'good' : 'bad', total: true }
    ], [], b.netPL >= 0 ? 'Profitable trade' : 'Loss on trade')
  }
  form.addEventListener('input', update)
  update()

  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const b = breakdown()
    try {
      await api.put(`/api/options/${optionId}`, {
        close_date: form.elements.close_date.value,
        close_commission: parseFloat(form.elements.close_commission.value) || 0,
        ...closePrices()
      })
      m.el.remove()
      alert(`Option closed successfully!\n\nNet P/L: ${K.fmt.money(b.netPL)}\n${b.netPL >= 0 ? 'Profitable trade' : 'Loss on trade'}`)
      loadOptions()
      loadDashboard()
    } catch (error) {
      console.error('Error closing option:', error)
      alert(error.response?.data?.error || 'Failed to close option trade. Please try again.')
    }
  })
}
