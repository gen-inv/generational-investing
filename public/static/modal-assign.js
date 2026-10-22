/* Short-put assignment modal. Shared ModalKit look (header colour = the put's strategy), live analysis from
 * Calc.assignmentDetails (the same tested code the server uses). */

async function assignStockPosition(optionId) {
  let option, account, existing = null
  try {
    option = (await api.get('/api/options')).data.find(o => o.id === optionId)
    if (!option) { alert('Option trade not found'); return }
    if (option.strategy_type !== 'SELLING_PUT' && option.strategy_type !== 'SELLING_PUT_WHEEL' && option.strategy_type !== 'SELLING_PUT_LONG_TERM') {
      alert('Assignment is only available for Short Put strategies')
      return
    }
    const accounts = (await api.get('/api/accounts')).data
    account = (accounts.accounts || accounts).find(a => a.id === option.account_id)
    try {
      const holdings = (await api.get('/api/stocks')).data
      const h = holdings.find(s => s.is_open === 1 && s.company_id === option.company_id && s.account_id === option.account_id)
      if (h) existing = { totalShares: Number(h.total_shares), averagePrice: Number(h.average_price) }
    } catch (e) { /* the preview just won't mention an existing position */ }
  } catch (error) {
    console.error('Error preparing assignment:', error)
    alert('Failed to prepare assignment')
    return
  }

  const K = ModalKit
  const S = option.strategy_type
  const wheel = S === 'SELLING_PUT_WHEEL'
  const longTerm = S === 'SELLING_PUT_LONG_TERM'
  const stratName = wheel ? 'Wheel' : longTerm ? 'Long Term' : 'Stockpiling'
  const accountDisplay = account ? `${account.account_name} (${account.account_type})` : option.account_type || 'N/A'
  const strike = parseFloat(option.strike_price)
  const d = Calc.assignmentDetails({
    premium: parseFloat(option.premium), contracts: option.quantity, strike,
    openCommission: parseFloat(option.commission || 0), existing
  })

  // default date: the earlier of expiration and today
  const today = new Date(), exp = new Date(option.expiration_date)
  const defaultDate = (exp < today ? exp : today).toISOString().split('T')[0]

  const m = K.open({
    id: 'assign-stock-modal',
    strategy: S,
    icon: 'fa-exchange-alt',
    title: 'Assign Stock Position',
    subtitle: `${option.ticker} - Close the put and create the stock position`,
    body: `
      ${K.summary('Assignment Summary', [
        K.stat('Ticker', option.ticker),
        K.stat('Strategy', stratName),
        K.stat('Shares', String(d.shares)),
        K.stat('Strike', K.fmt.money(strike)),
        K.stat('Account', accountDisplay),
        K.stat('Contracts', String(option.quantity))
      ])}
      <form id="assignmentForm">
        ${K.grid(1, K.field({ strategy: S, label: 'Assignment Date', name: 'assignment_date', type: 'date', value: defaultDate, required: true,
          hint: 'Date the put was assigned and the stock was bought' }), 0)}
        <div class="mt-3"></div>
        ${K.field({ strategy: S, label: 'Notes (Optional)', name: 'notes', type: 'textarea', rows: 2, placeholder: 'Anything to remember about this assignment...' })}
        <div class="mt-4"></div>
        ${K.analysisPanel('assign-analysis', S, 'What Will Happen')}
        ${K.buttons({ strategy: S, submitLabel: 'Confirm Assignment', submitIcon: 'fa-check' })}
      </form>`
  })

  const rows = [
    { label: `Put closed at $0 (max profit)`, value: K.fmt.money(d.profitLoss, { plus: true }), tone: 'good' },
    { label: `Stock bought: ${d.shares} @ ${K.fmt.money(strike)}`, value: K.fmt.money(d.shares * strike) },
    { label: 'Premium credit to cost basis', value: K.fmt.money(d.netProceeds, { plus: true }), tone: 'good' },
    { label: 'Adjusted cost basis per share', value: K.fmt.money(d.adjustedCostBasis), total: true }
  ]
  if (existing) {
    rows.push({ label: 'Position after assignment', value: `${d.totalShares} sh @ ${K.fmt.money(d.averagePrice)}`, sub: `(was ${existing.totalShares} @ ${K.fmt.money(existing.averagePrice)})` })
  }
  K.renderAnalysis(m.qs('#assign-analysis'), rows, [], longTerm
    ? `A position you already hold keeps its strategy (a new one starts as Stockpiling); the account stays ${accountDisplay}`
    : `Strategy will be set to ${wheel ? 'Wheel' : 'Stockpiling'}; the account stays ${accountDisplay}`)

  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)

  const form = m.qs('#assignmentForm')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      const response = await api.post(`/api/options/${optionId}/assign`, {
        assignment_date: form.elements.assignment_date.value,
        notes: form.elements.notes.value || ''
      })
      m.el.remove()
      const detailsModal = document.getElementById('option-details-modal')
      if (detailsModal) detailsModal.remove()
      await loadOptions()
      await loadStocks()
      await loadDashboard()
      const credit = response.data.premium_adjustment || 0
      alert(`Assignment completed successfully!\n\nOption closed and ${d.shares} shares of ${option.ticker} added to your portfolio.\n\nPurchase Price: ${K.fmt.money(strike)}/share\nPremium Credit: ${K.fmt.money(credit)} total\nAdjusted Cost Basis: ${K.fmt.money(strike - credit / d.shares)}/share`)
    } catch (error) {
      console.error('Assignment error:', error)
      alert(error.response?.data?.error || 'Failed to assign stock position')
    }
  })
}
