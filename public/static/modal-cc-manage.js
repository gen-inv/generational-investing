/* View and edit a covered call. Shared ModalKit look (Covered Call = amber header). The edit form's live analysis comes
 * from Calc.optionEntryAnalysis (open call) and Calc.optionPLBreakdown (closed call), the same tested code the server books with. */

// Covered calls hang off a stock holding; find the call and the holding it belongs to.
async function findCoveredCall(ccId) {
  const stocks = (await api.get('/api/stocks')).data
  for (const stock of stocks) {
    const calls = (await api.get(`/api/stocks/${stock.id}/covered-calls`)).data
    const cc = calls.find(o => o.id === ccId)
    if (cc) return { cc, stockId: stock.id }
  }
  return { cc: null, stockId: null }
}

async function viewCoveredCallDetails(ccId) {
  let cc, stockId
  try {
    ({ cc, stockId } = await findCoveredCall(ccId))
  } catch (error) {
    console.error('Error viewing covered call:', error)
    alert('Failed to load covered call details')
    return
  }
  if (!cc) { alert('Covered call not found'); return }

  const K = ModalKit
  const S = 'COVERED_CALL'
  const isOpen = !!cc.is_open
  const daysUntil = Math.ceil((new Date(cc.expiration_date) - new Date()) / (1000 * 60 * 60 * 24))
  const urgency = isOpen && daysUntil <= 14 ? 'urgent' : isOpen && daysUntil <= 30 ? 'soon' : ''
  const expiryBox = {
    urgent: 'bg-red-50 border-2 border-red-300 text-red-700',
    soon: 'bg-orange-50 border-2 border-orange-300 text-orange-700',
    '': 'bg-gray-50 border border-gray-200 text-gray-900'
  }[urgency]
  const badge = urgency === 'urgent'
    ? '<span class="ml-2 px-2 py-1 bg-red-600 text-white text-xs rounded-full font-semibold">URGENT</span>'
    : urgency === 'soon' ? '<span class="ml-2 px-2 py-1 bg-orange-600 text-white text-xs rounded-full">SOON</span>' : ''
  const num = v => Number(v) || 0
  const pl = num(cc.profit_loss)

  const m = K.open({
    id: 'covered-call-details-modal',
    strategy: S,
    icon: 'fa-file-contract',
    title: 'Covered Call Details',
    subtitle: `${cc.ticker} - ${isOpen ? 'Open Position' : 'Closed Position'}`,
    body: `
      ${K.summary('Position Summary', [
        K.stat('Status', isOpen ? 'OPEN' : 'CLOSED', isOpen ? 'text-blue-700' : 'text-gray-700'),
        K.stat('Strike', K.fmt.money(num(cc.strike_price))),
        K.stat('Premium received', K.fmt.money(Calc.grossPremium(num(cc.premium), num(cc.quantity))), 'text-green-600'),
        K.stat('Contracts', `${cc.quantity} (${cc.quantity * 100} shares)`)
      ])}
      <p class="text-xs text-gray-500 -mt-2 mb-4">$${num(cc.premium).toFixed(3)}/share x ${cc.quantity} contract${cc.quantity === 1 ? '' : 's'} x 100 shares</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
          <p class="text-xs text-gray-600 mb-1">Trade Date</p>
          <p class="font-semibold text-gray-900">${K.esc(cc.trade_date)}</p>
        </div>
        <div class="${expiryBox} p-3 rounded-lg" data-mk="expiry">
          <p class="text-xs mb-1 flex items-center">Expiration Date${badge}</p>
          <p class="font-semibold">${K.esc(cc.expiration_date)}</p>
          ${isOpen ? `<p class="text-xs mt-1 font-semibold">${daysUntil} day${daysUntil !== 1 ? 's' : ''} remaining</p>` : ''}
        </div>
      </div>
      ${!isOpen ? `
      <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-300 mb-4">
        <h4 class="text-sm font-bold text-gray-800 mb-2">Closing Details</h4>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          ${K.stat('Close date', cc.close_date || 'N/A')}
          ${K.stat('Close price', `$${num(cc.close_price).toFixed(3)}/share`)}
          ${K.stat('Commission in', K.fmt.money(num(cc.commission)), 'text-red-600')}
          ${K.stat('Commission out', K.fmt.money(num(cc.close_commission)), 'text-red-600')}
          ${K.stat('Net profit / loss', K.fmt.money(pl, { plus: true }), pl >= 0 ? 'text-green-700' : 'text-red-700')}
        </div>
      </div>` : ''}
      ${cc.notes ? `
      <div class="bg-yellow-50 p-3 rounded-lg border border-yellow-300 mb-4">
        <p class="text-xs text-yellow-800 mb-1 font-medium">Notes</p>
        <p class="text-sm text-gray-700">${K.esc(cc.notes)}</p>
      </div>` : ''}
      <div class="grid grid-cols-1 ${isOpen ? 'md:grid-cols-3' : ''} gap-3">
        ${isOpen ? `
        <button type="button" data-mk="edit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition shadow-lg"><i class="fas fa-edit mr-2"></i>Edit Details</button>
        <button type="button" data-mk="close-position" class="w-full ${m_button()} text-white font-bold py-3 px-6 rounded-lg transition shadow-lg"><i class="fas fa-check-circle mr-2"></i>Close Position</button>` : ''}
        <button type="button" data-mk="cancel" class="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition shadow-lg"><i class="fas fa-times mr-2"></i>Close Window</button>
      </div>`
  })

  function m_button() { return K.theme(S).button }

  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)
  if (isOpen) {
    m.qs('[data-mk="edit"]').addEventListener('click', () => { m.el.remove(); editCoveredCall(ccId) })
    m.qs('[data-mk="close-position"]').addEventListener('click', () => { m.el.remove(); closeCoveredCall(ccId, stockId) })
  }
}

async function editCoveredCall(ccId) {
  let cc, stockId
  try {
    ({ cc, stockId } = await findCoveredCall(ccId))
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
  const isClosed = !cc.is_open

  const m = K.open({
    id: 'edit-covered-call-modal',
    strategy: S,
    icon: 'fa-edit',
    title: 'Edit Covered Call',
    subtitle: `${cc.ticker}${isClosed ? ' - Closed Position' : ''}`,
    onClose: () => { if (stockId) showStockDetails(stockId) },
    body: `
      <form id="editCoveredCallForm">
        ${K.grid(2,
          K.field({ strategy: S, label: 'Strike Price', name: 'strike_price', type: 'number', step: '0.001', value: cc.strike_price, required: true }) +
          K.field({ strategy: S, label: 'Premium Per Share', name: 'premium', type: 'number', step: '0.001', value: cc.premium, required: true, hint: 'Premium per share (1 contract = 100 shares)' }) +
          K.field({ strategy: S, label: 'Number of Contracts', name: 'quantity', type: 'number', min: 1, step: 1, value: cc.quantity, required: true }) +
          K.field({ strategy: S, label: 'Expiration Date', name: 'expiration_date', type: 'date', value: cc.expiration_date, required: true }) +
          K.field({ strategy: S, label: 'Open Date', name: 'trade_date', type: 'date', value: cc.trade_date, required: true }) +
          K.field({ strategy: S, label: 'Open Commission', name: 'commission', type: 'number', step: '0.01', min: 0, value: cc.commission || 0 }))}
        ${isClosed ? `
        <div class="bg-gradient-to-br from-red-50 to-red-100 p-3 rounded-lg border border-red-300 mb-4">
          <h4 class="text-sm font-bold text-red-800 mb-3">Closing Details</h4>
          ${K.grid(3,
            K.field({ strategy: S, label: 'Close Date', name: 'close_date', type: 'date', value: cc.close_date || '', required: true }) +
            K.field({ strategy: S, label: 'Close Price (per share)', name: 'close_price', type: 'number', step: '0.001', min: 0, value: cc.close_price != null ? cc.close_price : '', required: true }) +
            K.field({ strategy: S, label: 'Close Commission', name: 'close_commission', type: 'number', step: '0.01', min: 0, value: cc.close_commission || 0 }), 0)}
        </div>` : ''}
        ${K.analysisPanel('cc-edit-analysis', S, isClosed ? 'Realized P/L' : 'Premium Analysis')}
        <div class="mb-4">${K.field({ strategy: S, label: 'Notes', name: 'notes', type: 'textarea', rows: 2, value: cc.notes || '' })}</div>
        ${K.buttons({ strategy: S, submitLabel: 'Save Changes', submitIcon: 'fa-save' })}
      </form>`
  })

  const form = m.qs('#editCoveredCallForm')
  const panel = m.qs('#cc-edit-analysis')
  const val = name => (form.elements[name] ? parseFloat(form.elements[name].value) || 0 : 0)

  function update() {
    if (isClosed) {
      const b = Calc.optionPLBreakdown({
        strategy: S, contracts: Math.trunc(val('quantity')),
        open: { premium: val('premium') }, close: { close_price: val('close_price') },
        openCommission: val('commission'), closeCommission: val('close_commission')
      })
      K.renderAnalysis(panel, [
        { label: 'Premium received', value: K.fmt.money(b.openingCredit, { plus: true }), tone: 'good' },
        { label: 'Close cost', value: K.fmt.money(-b.closingCost, { plus: true }), tone: b.closingCost > 0 ? 'bad' : 'neutral' },
        { label: 'Opening commission', value: K.fmt.money(-b.openCommission), tone: 'bad' },
        { label: 'Closing commission', value: K.fmt.money(-b.closeCommission), tone: 'bad' },
        { label: 'Net profit / loss', value: K.fmt.money(b.netPL, { plus: true }), tone: b.netPL >= 0 ? 'good' : 'bad', total: true }
      ], [], "Saving re-books this call's effect on your stock's cost basis")
    } else {
      const a = Calc.optionEntryAnalysis({
        strategy: S, contracts: form.elements.quantity.value, commission: form.elements.commission.value,
        values: { strike_price: form.elements.strike_price.value, premium: form.elements.premium.value },
        tradeDate: form.elements.trade_date.value, expirationDate: form.elements.expiration_date.value
      })
      const rows = [
        { label: 'Premium received', value: K.fmt.money(Calc.grossPremium(val('premium'), Math.trunc(val('quantity'))), { plus: true }), tone: 'good' },
        { label: 'Max profit (after commission)', value: K.fmt.money(a.maxProfit), tone: 'good' },
        { label: 'Shares covered', value: String(Math.trunc(val('quantity')) * 100) }
      ]
      if (a.dte !== null && a.dte > 0) rows.push({ label: 'DTE (days to expiration)', value: `${a.dte} days` })
      K.renderAnalysis(panel, rows, [], null)
    }
  }
  form.addEventListener('input', update)
  update()

  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const data = {
      strike_price: parseFloat(form.elements.strike_price.value),
      premium: parseFloat(form.elements.premium.value),
      quantity: parseInt(form.elements.quantity.value),
      expiration_date: form.elements.expiration_date.value,
      trade_date: form.elements.trade_date.value,
      commission: parseFloat(form.elements.commission.value) || 0,
      notes: form.elements.notes.value || null,
      holding_id: stockId   // keeps the call on the right account
    }
    if (form.elements.close_date && form.elements.close_date.value) {
      const cp = parseFloat(form.elements.close_price.value)
      data.close_date = form.elements.close_date.value
      data.close_price = Number.isFinite(cp) ? cp : null   // 0 is a real close price (expired worthless)
      data.close_commission = parseFloat(form.elements.close_commission.value) || 0
    }
    try {
      await api.put(`/api/covered-calls/${ccId}`, data)
      m.el.remove()
      alert('Covered call updated successfully!')
      if (stockId) showStockDetails(stockId)
      loadStocks()
      loadDashboard()
    } catch (error) {
      console.error('Error updating covered call:', error)
      alert(error.response?.data?.error || 'Failed to update covered call')
    }
  })
}
