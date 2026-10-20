/* Add to / reduce an existing position: stocks (buy more, sell some) and options (add contracts, close some).
 * Adding option contracts records a separate open trade with its own date, premium and commission (the original trade keeps
 * its open date), the same way every stock purchase is its own transaction.
 * Shared ModalKit look: stocks use Stock Blue, options use their strategy colour. Live analysis comes from the tested
 * Calc position functions; closing part of an option position goes through POST /api/options/:id/reduce, which books the
 * closed contracts as their own closed trade (with close date, close prices and P/L) and shrinks the open one. */

var POSITION_COLS = ['', '_2', '_3', '_4']   // leg i -> premium / strike_price / close_price + POSITION_COLS[i]

// Per-leg numbers of an option trade, straight from the row's raw columns
function positionLegs(option) {
  const labels = ModalKit.STRATEGIES[option.strategy_type] ? ModalKit.STRATEGIES[option.strategy_type].legs : ['Leg']
  return labels.map((label, i) => ({
    label,
    premium: Number(option['premium' + POSITION_COLS[i]]) || 0,
    strike: option['strike_price' + POSITION_COLS[i]]
  }))
}

const positionToday = () => new Date().toISOString().split('T')[0]

// ---------------------------------------------------------------- stocks

async function addStockToPosition(stockId) {
  let stock
  try {
    stock = (await api.get('/api/stocks')).data.find(s => s.id === stockId)
  } catch (error) {
    console.error('Error:', error)
    alert('Failed to load stock information')
    return
  }
  if (!stock) { alert('Stock not found'); return }

  const detailsModal = document.getElementById('stock-details-modal')
  if (detailsModal) detailsModal.remove()

  const K = ModalKit
  const S = 'STOCK'
  const held = Number(stock.quantity) || 0
  const avg = Number(stock.avg_price || stock.price) || 0
  const m = K.open({
    id: 'add-position-modal',
    strategy: S,
    icon: 'fa-plus-circle',
    title: 'Add to Position',
    subtitle: `${stock.ticker} - Buy Additional Shares`,
    onClose: () => showStockDetails(stockId),
    body: `
      ${K.summary('Current Position', [
        K.stat('Shares held', `${held} shares`),
        K.stat('Average price', K.fmt.money(avg)),
        K.stat('Account', stock.account_name || 'N/A')
      ])}
      <form id="addPositionForm">
        ${K.grid(2,
          K.field({ strategy: S, label: 'Additional Shares', name: 'quantity', type: 'number', min: 1, step: 1, required: true, hint: 'Number of shares to purchase' }) +
          K.field({ strategy: S, label: 'Price per Share', name: 'price', type: 'number', min: '0.001', step: '0.001', required: true, hint: 'Purchase price per share' }) +
          K.field({ strategy: S, label: 'Trade Date', name: 'trade_date', type: 'date', value: positionToday(), required: true }) +
          K.field({ strategy: S, label: 'Commission', name: 'commission', type: 'number', min: 0, step: '0.01', value: 0 }))}
        ${K.analysisPanel('position-analysis', S, 'After This Purchase')}
        <div class="mb-4">${K.field({ strategy: S, label: 'Notes (Optional)', name: 'notes', type: 'textarea', rows: 2, placeholder: 'Optional notes about this purchase' })}</div>
        ${K.buttons({ strategy: S, submitLabel: 'Add to Position', submitIcon: 'fa-plus' })}
      </form>`
  })

  const form = m.qs('#addPositionForm')
  const panel = m.qs('#position-analysis')
  function update() {
    const r = Calc.addToStockPosition({ heldShares: held, avgCost: avg, quantity: form.elements.quantity.value, price: form.elements.price.value, commission: form.elements.commission.value })
    if (!r.ready) { K.renderAnalysis(panel, [], [], 'Enter shares and price to see the new position'); return }
    K.renderAnalysis(panel, [
      { label: 'Total outlay (incl. commission)', value: K.fmt.money(r.totalOutlay), tone: 'bad' },
      { label: 'Shares after purchase', value: `${r.newShares} shares` },
      { label: 'New average price', value: K.fmt.money(r.newAvgCost), sub: `was ${K.fmt.money(avg)}` }
    ], [], 'The commission is carried until these shares are sold')
  }
  form.addEventListener('input', update)
  update()
  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await api.post('/api/stocks', {
        company_id: stock.company_id, account_id: stock.account_id, ticker: stock.ticker, trade_type: 'BUY',
        quantity: parseInt(form.elements.quantity.value), price: parseFloat(form.elements.price.value),
        trade_date: form.elements.trade_date.value, commission: parseFloat(form.elements.commission.value) || 0,
        notes: form.elements.notes.value
      })
      m.el.remove()
      loadStocks()
      loadDashboard()
      alert('Successfully added to position!')
      showStockDetails(stockId)
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add to position')
    }
  })
}

async function sellStockFromPosition(stockId) {
  let stock, preview = null
  try {
    stock = (await api.get('/api/stocks')).data.find(s => s.id === stockId)
  } catch (error) {
    console.error('Error:', error)
    alert('Failed to load stock information')
    return
  }
  if (!stock) { alert('Stock not found'); return }
  try { preview = (await api.get(`/api/stocks/${stockId}/close-preview`)).data } catch (e) { preview = null }   // only refines the P/L estimate

  const detailsModal = document.getElementById('stock-details-modal')
  if (detailsModal) detailsModal.remove()

  const K = ModalKit
  const S = 'STOCK'
  const held = Number(stock.quantity) || 0
  const avg = preview ? Number(preview.avg_cost) || 0 : Number(stock.avg_price || stock.price) || 0
  const pendingBuyCommission = preview ? Number(preview.pending_buy_commission) || 0 : 0
  const m = K.open({
    id: 'sell-position-modal',
    strategy: S,
    icon: 'fa-minus-circle',
    title: 'Sell from Position',
    subtitle: `${stock.ticker} - Reduce Position Size`,
    onClose: () => showStockDetails(stockId),
    body: `
      ${K.summary('Current Position', [
        K.stat('Shares held', `${held} shares`),
        K.stat('Average price', K.fmt.money(Number(stock.avg_price || stock.price) || 0)),
        K.stat('Cost basis', K.fmt.money(Number(stock.cost_basis || stock.price) || 0)),
        K.stat('Account', stock.account_name || 'N/A')
      ])}
      <form id="sellPositionForm">
        ${K.grid(2,
          K.field({ strategy: S, label: 'Shares to Sell', name: 'quantity', type: 'number', min: 1, max: held, step: 1, required: true, hint: `Maximum: ${held} shares` }) +
          K.field({ strategy: S, label: 'Sale Price per Share', name: 'price', type: 'number', min: '0.001', step: '0.001', required: true, hint: 'Selling price per share' }) +
          K.field({ strategy: S, label: 'Trade Date', name: 'trade_date', type: 'date', value: positionToday(), required: true }) +
          K.field({ strategy: S, label: 'Commission', name: 'commission', type: 'number', min: 0, step: '0.01', value: 0 }))}
        ${K.analysisPanel('position-analysis', S, 'Realized P/L On This Sale')}
        <div class="mb-4">${K.field({ strategy: S, label: 'Notes (Optional)', name: 'notes', type: 'textarea', rows: 2, placeholder: 'e.g., Partial sale, profit-taking, rebalancing' })}</div>
        ${K.buttons({ strategy: S, submitLabel: 'Sell Shares', submitIcon: 'fa-minus' })}
      </form>`
  })

  const form = m.qs('#sellPositionForm')
  const panel = m.qs('#position-analysis')
  function update() {
    const r = Calc.sellFromStockPosition({ heldShares: held, avgCost: avg, pendingBuyCommission, quantity: form.elements.quantity.value, price: form.elements.price.value, commission: form.elements.commission.value })
    if (!r.ready) { K.renderAnalysis(panel, [], [], 'Enter shares and price to see the realized P/L'); return }
    const rows = [
      { label: 'Sale proceeds', value: K.fmt.money(r.saleProceeds, { plus: true }), tone: 'good' },
      { label: 'Cost basis (average cost)', value: K.fmt.money(-r.costBasis), tone: 'bad' },
      { label: 'Opening commissions carried', value: K.fmt.money(-r.buyCommission), tone: 'bad' },
      { label: 'Sale commission', value: K.fmt.money(-r.closeCommission), tone: 'bad' },
      { label: 'Net profit / loss', value: K.fmt.money(r.netPL, { plus: true }), tone: r.netPL >= 0 ? 'good' : 'bad', total: true },
      { label: 'Shares remaining', value: String(r.remainingShares) }
    ]
    const warnings = []
    if (r.overSell) warnings.push(`You only hold ${held} shares`)
    if (r.sellsAll) warnings.push('This sells every share. Use "Close Position" instead so the position is closed properly')
    K.renderAnalysis(panel, rows, warnings, 'Dividends and option premiums are separate income and are not part of this figure')
  }
  form.addEventListener('input', update)
  update()
  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const quantity = parseInt(form.elements.quantity.value)
    if (quantity > held) { alert(`Cannot sell more than ${held} shares`); return }
    try {
      await api.post('/api/stocks', {
        company_id: stock.company_id, account_id: stock.account_id, ticker: stock.ticker, trade_type: 'SELL',
        quantity, price: parseFloat(form.elements.price.value),
        trade_date: form.elements.trade_date.value, commission: parseFloat(form.elements.commission.value) || 0,
        notes: form.elements.notes.value
      })
      m.el.remove()
      loadStocks()
      loadDashboard()
      alert('Successfully sold shares from position!')
      showStockDetails(stockId)
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to sell from position')
    }
  })
}

// ---------------------------------------------------------------- options

async function addToOptionPosition(optionId) {
  let option
  try {
    option = (await api.get('/api/options')).data.find(o => o.id === optionId)
  } catch (error) {
    console.error('Error loading option:', error)
    alert('Failed to load option details')
    return
  }
  if (!option || !option.is_open) { alert('Option trade not found or already closed'); return }

  const K = ModalKit
  const S = option.strategy_type
  const cfg = K.STRATEGIES[S] || { label: S.replace(/_/g, ' '), legs: ['Leg'] }
  const legs = positionLegs(option)
  const multi = legs.length > 1
  const m = K.open({
    id: 'add-option-position-modal',
    strategy: S,
    icon: 'fa-plus-circle',
    title: 'Add To Position',
    subtitle: `${option.ticker} - ${cfg.label}`,
    size: '3xl',
    body: `
      ${K.summary('Current Position', [
        K.stat('Contracts', String(option.quantity)),
        ...legs.map(l => K.stat(multi ? `${l.label} premium` : 'Premium', '$' + l.premium.toFixed(3))),
        K.stat('Commission', K.fmt.money(Number(option.commission) || 0)),
        K.stat('Expires', option.expiration_date)
      ])}
      <form id="addToPositionForm">
        ${K.grid(2,
          K.field({ strategy: S, label: 'Trade Date', name: 'trade_date', type: 'date', value: positionToday(), required: true, hint: 'Recorded as its own trade with this date' }) +
          K.field({ strategy: S, label: 'Additional Contracts', name: 'add_contracts', type: 'number', min: 1, step: 1, value: 1, required: true }) +
          legs.map((l, i) => K.field({ strategy: S, label: `${multi ? l.label + ' ' : ''}Premium Per Share`, name: 'premium' + POSITION_COLS[i], type: 'number', step: '0.001', value: l.premium, required: true })).join('') +
          K.field({ strategy: S, label: 'Commission', name: 'add_commission', type: 'number', min: 0, step: '0.01', value: 0 }))}
        ${K.analysisPanel('position-analysis', S, 'Combined Position After This Addition')}
        ${K.buttons({ strategy: S, submitLabel: 'Add To Position', submitIcon: 'fa-plus' })}
      </form>`
  })

  const form = m.qs('#addToPositionForm')
  const panel = m.qs('#position-analysis')
  const addPremiums = () => legs.map((l, i) => form.elements['premium' + POSITION_COLS[i]].value)
  function update() {
    const r = Calc.addToOptionPosition({
      contracts: option.quantity, premiums: legs.map(l => l.premium), commission: option.commission,
      addContracts: form.elements.add_contracts.value, addPremiums: addPremiums(), addCommission: form.elements.add_commission.value
    })
    if (!r.ready) { K.renderAnalysis(panel, [], [], 'Enter the number of contracts to add'); return }
    K.renderAnalysis(panel, [
      { label: 'Combined contracts', value: String(r.totalContracts) },
      ...legs.map((l, i) => ({ label: `Combined average ${multi ? l.label.toLowerCase() + ' ' : ''}premium`, value: '$' + r.avgPremiums[i].toFixed(3), sub: `was $${l.premium.toFixed(3)}` })),
      { label: 'Combined commission', value: K.fmt.money(r.totalCommission) }
    ], [], 'Saved as a separate trade with the same strikes and expiration; the original trade keeps its open date')
  }
  form.addEventListener('input', update)
  update()
  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const n = parseInt(form.elements.add_contracts.value)
    const newTrade = {
      company_id: option.company_id, account_id: option.account_id, ticker: option.ticker, strategy_type: option.strategy_type,
      strike_price: option.strike_price, strike_price_2: option.strike_price_2 || null,
      strike_price_3: option.strike_price_3 || null, strike_price_4: option.strike_price_4 || null,
      quantity: n, expiration_date: option.expiration_date,
      trade_date: form.elements.trade_date.value, commission: parseFloat(form.elements.add_commission.value) || 0,
      is_open: true, notes: null
    }
    legs.forEach((l, i) => { newTrade['premium' + POSITION_COLS[i]] = parseFloat(form.elements['premium' + POSITION_COLS[i]].value) })
    try {
      await api.post('/api/options', newTrade)
      m.el.remove()
      loadOptions()
      if (typeof loadDashboard === 'function') loadDashboard()
      showNotification(`Added ${n} contract(s) as a separate trade dated ${newTrade.trade_date}`, 'success')
      document.getElementById('option-details-modal')?.remove()
    } catch (error) {
      console.error('Error adding to position:', error)
      alert(`Failed to add to position: ${error.response?.data?.error || error.message}`)
    }
  })
}

async function reduceFromOptionPosition(optionId) {
  let option
  try {
    option = (await api.get('/api/options')).data.find(o => o.id === optionId)
  } catch (error) {
    console.error('Error loading option:', error)
    alert('Failed to load option details')
    return
  }
  if (!option || !option.is_open) { alert('Option trade not found or already closed'); return }
  if (option.quantity <= 1) { alert('Cannot reduce position - only 1 contract remaining. Use "Close Position" instead.'); return }

  const K = ModalKit
  const S = option.strategy_type
  const cfg = K.STRATEGIES[S] || { label: S.replace(/_/g, ' '), legs: ['Leg'] }
  const legs = positionLegs(option)
  const multi = legs.length > 1
  const m = K.open({
    id: 'reduce-option-position-modal',
    strategy: S,
    icon: 'fa-minus-circle',
    title: 'Reduce From Position',
    subtitle: `${option.ticker} - ${cfg.label}`,
    size: '3xl',
    body: `
      ${K.summary('Current Position', [
        K.stat('Contracts', String(option.quantity)),
        ...legs.map(l => K.stat(multi ? `${l.label} premium` : 'Premium', '$' + l.premium.toFixed(3))),
        K.stat('Commission', K.fmt.money(Number(option.commission) || 0)),
        K.stat('Opened', option.trade_date)
      ])}
      <form id="reduceFromPositionForm">
        ${K.grid(2,
          K.field({ strategy: S, label: 'Close Date', name: 'close_date', type: 'date', value: positionToday(), required: true }) +
          K.field({ strategy: S, label: 'Contracts To Close', name: 'contracts', type: 'number', min: 1, max: option.quantity - 1, step: 1, value: 1, required: true, hint: `Maximum: ${option.quantity - 1} (must leave at least 1 contract open)` }) +
          legs.map((l, i) => K.field({ strategy: S, label: `${multi ? l.label + ' ' : ''}Close Price Per Share`, name: 'close_price' + POSITION_COLS[i], type: 'number', step: '0.001', min: 0, value: l.premium, required: true })).join('') +
          K.field({ strategy: S, label: 'Close Commission', name: 'close_commission', type: 'number', min: 0, step: '0.01', value: 0 }))}
        ${K.analysisPanel('position-analysis', S, 'Realized P/L On The Closed Contracts')}
        ${K.buttons({ strategy: S, submitLabel: 'Reduce Position', submitIcon: 'fa-minus' })}
      </form>`
  })

  const form = m.qs('#reduceFromPositionForm')
  const panel = m.qs('#position-analysis')
  const contractsToClose = () => parseInt(form.elements.contracts.value) || 0
  const closePrices = () => legs.map((l, i) => parseFloat(form.elements['close_price' + POSITION_COLS[i]].value) || 0)
  function update() {
    const n = contractsToClose()
    if (n < 1) { K.renderAnalysis(panel, [], [], 'Enter the number of contracts to close'); return }
    const split = Calc.splitOptionCommission(option.quantity, option.commission, n)
    const cp = closePrices()
    const b = Calc.optionPLBreakdown({
      strategy: S, contracts: n,
      open: { premium: legs[0].premium, premium_2: legs[1] && legs[1].premium, premium_3: legs[2] && legs[2].premium, premium_4: legs[3] && legs[3].premium },
      close: { close_price: cp[0], close_price_2: cp[1], close_price_3: cp[2], close_price_4: cp[3] },
      openCommission: split.closedCommission, closeCommission: parseFloat(form.elements.close_commission.value) || 0
    })
    const warnings = n >= option.quantity ? ['Cannot close every contract here. Use "Close Position" instead'] : []
    K.renderAnalysis(panel, [
      { label: 'Premium on closed contracts', value: K.fmt.money(b.openingCredit, { plus: true }), tone: b.openingCredit >= 0 ? 'good' : 'bad' },
      { label: 'Cost to close', value: K.fmt.money(-b.closingCost, { plus: true }), tone: b.closingCost > 0 ? 'bad' : 'neutral' },
      { label: 'Opening commission (share)', value: K.fmt.money(-b.openCommission), tone: 'bad' },
      { label: 'Closing commission', value: K.fmt.money(-b.closeCommission), tone: 'bad' },
      { label: 'Net profit / loss', value: K.fmt.money(b.netPL, { plus: true }), tone: b.netPL >= 0 ? 'good' : 'bad', total: true },
      { label: 'Contracts left open', value: String(split.remainingContracts), sub: `commission ${K.fmt.money(split.remainingCommission)}` }
    ], warnings, null)
  }
  form.addEventListener('input', update)
  update()
  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const n = contractsToClose()
    if (n >= option.quantity) { alert('Cannot close all contracts. Use "Close Position" instead.'); return }
    const body = {
      contracts: n, close_date: form.elements.close_date.value,
      close_commission: parseFloat(form.elements.close_commission.value) || 0
    }
    closePrices().forEach((p, i) => { body['close_price' + POSITION_COLS[i]] = p })
    try {
      const res = await api.post(`/api/options/${optionId}/reduce`, body)
      const left = res && res.data && res.data.remaining_contracts != null ? res.data.remaining_contracts : option.quantity - n
      m.el.remove()
      loadOptions()
      if (typeof loadDashboard === 'function') loadDashboard()
      if (typeof loadClosedTrades === 'function') loadClosedTrades()
      showNotification(`Closed ${n} contract(s). ${left} contract(s) remaining.`, 'success')
      document.getElementById('option-details-modal')?.remove()
    } catch (error) {
      console.error('Error reducing position:', error)
      alert(`Failed to reduce position: ${error.response?.data?.error || error.message}`)
    }
  })
}
