/* Add / edit stock trade. Shared ModalKit look (Stock = blue header). Live analysis comes from Calc.stockEntryAnalysis
 * (capital required, or proceeds for a sell, plus profit at the research target sell price). A closed trade keeps its
 * performance summary and editable closing details. */

async function showStockForm(stockId = null) {
  const K = ModalKit
  const S = 'STOCK'
  const isEdit = stockId !== null
  let companies, accounts, stock = null
  try {
    companies = await fetchCompaniesWithResearch()
    const accountsResponse = await api.get('/api/accounts')
    accounts = accountsResponse.data.accounts || accountsResponse.data
    if (companies.length === 0) { alert('Please add companies first before creating stock trades.'); showSection('companies'); return }
    if (accounts.length === 0) { alert('Please create an account first before adding stock trades.'); showSection('accounts'); return }
    if (isEdit) stock = (await api.get(`/api/stocks/${stockId}`)).data
  } catch (error) {
    console.error('Error in showStockForm:', error)
    alert('Error loading form: ' + (error.message || 'Please try again'))
    return
  }

  const isClosed = !!stock && stock.is_open === 0
  const T = K.theme(S)
  const inputCls = `w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none transition text-sm ${T.input}`
  const select = (name, label, optionsHtml, extra) => `
    <div>
      <label class="block text-gray-700 font-semibold mb-1 text-sm">${K.esc(label)} *</label>
      <select name="${name}" ${extra || ''} class="${inputCls}" required>${optionsHtml}</select>
    </div>`
  const radio = (value, label, checked) => `
    <label class="flex items-center cursor-pointer">
      <input type="radio" name="strategy_type" value="${value}" class="mr-2"${checked ? ' checked' : ''}>
      <span class="text-sm text-gray-700">${K.esc(label)}</span>
    </label>`
  const pl = isClosed ? parseFloat(stock.profit_loss) || 0 : 0
  const today = new Date().toISOString().split('T')[0]

  const m = K.open({
    id: 'stock-form-modal',
    strategy: S,
    icon: 'fa-chart-bar',
    title: isEdit ? 'Edit Stock Trade' : 'Add Stock Trade',
    subtitle: 'Configure Stock Position',
    body: `
      <form id="stockForm">
        <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-300 mb-4">
          <h4 class="text-sm font-bold text-gray-800 mb-3">Basic Information</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              ${select('company_id', 'Company', `<option value="">Select company...</option>` + companies.map(c =>
                `<option value="${c.id}" data-buy-price="${c.buy_price || ''}">${K.esc(c.ticker)} - ${K.esc(c.company_name)}</option>`).join(''), 'id="company_select"')}
              <div id="buy-price-info" class="mt-1 text-xs hidden"><span class="text-gray-600">Target Buy Price: </span><span class="font-semibold text-brand-gold" id="target_buy_price"></span></div>
            </div>
            ${select('account_id', 'Account', `<option value="">Select account...</option>` + accounts.map(a => `<option value="${a.id}">${K.esc(a.account_name)}</option>`).join(''))}
            ${select('trade_type', 'Trade Type', '<option value="BUY">BUY</option><option value="SELL">SELL</option>')}
            ${K.field({ strategy: S, label: 'Open Date', name: 'trade_date', type: 'date', value: today, required: true })}
          </div>
        </div>

        <div class="${T.panel} p-3 rounded-lg border mb-4">
          <h4 class="text-sm font-bold ${T.panelTitle} mb-3">Trade Details</h4>
          ${K.grid(3,
            K.field({ strategy: S, label: 'Shares', name: 'quantity', type: 'number', min: 1, step: 1, required: true }) +
            K.field({ strategy: S, label: 'Price per Share', name: 'price', type: 'number', step: '0.001', min: '0.001', required: true }) +
            K.field({ strategy: S, label: 'Open Commission', name: 'commission', type: 'number', step: '0.01', min: 0, value: 0 }), 0)}
        </div>

        <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-300 mb-4">
          <h4 class="text-sm font-bold text-gray-800 mb-2">Trading Strategy</h4>
          <div class="flex flex-wrap gap-6">
            ${radio('STOCKPILING', 'Stockpiling', true)}${radio('WHEEL', 'Wheel Strategy')}${radio('DIVIDEND_ETFS', 'Dividend ETFs')}
          </div>
          <p class="text-xs text-gray-600 mt-2">Pick "Wheel Strategy" for wheel trades (sell put, buy stock, sell covered call) or "Dividend ETFs" for dividend-focused holdings.</p>
        </div>

        ${K.analysisPanel('stock-analysis', S, 'Risk & Profit Analysis')}

        ${isClosed ? `
        <div id="stock-pl-box" class="bg-gradient-to-br ${pl >= 0 ? 'from-green-50 to-green-100 border-green-300' : 'from-red-50 to-red-100 border-red-300'} p-3 rounded-lg border mb-4">
          <div class="flex items-center justify-between">
            <span id="stock-pl-label" class="text-sm font-bold ${pl >= 0 ? 'text-green-900' : 'text-red-900'}">Net profit / loss</span>
            <span id="stock-pl-value" class="text-xl font-bold ${pl >= 0 ? 'text-green-700' : 'text-red-700'}">${K.fmt.money(pl, { plus: true })}</span>
          </div>
          <p class="text-xs text-gray-600 mt-1">Opened ${K.esc(stock.trade_date)}, closed ${K.esc(stock.closed_date || 'N/A')}</p>
        </div>
        <div class="bg-gradient-to-br from-red-50 to-red-100 p-3 rounded-lg border border-red-300 mb-4">
          <h4 class="text-sm font-bold text-red-800 mb-3">Closing Details</h4>
          ${K.grid(3,
            K.field({ strategy: S, label: 'Close Date', name: 'close_date', type: 'date', required: true }) +
            K.field({ strategy: S, label: 'Close Price', name: 'close_price', type: 'number', step: '0.001', min: 0, required: true }) +
            K.field({ strategy: S, label: 'Close Commission', name: 'close_commission', type: 'number', step: '0.01', min: 0, value: 0 }), 0)}
        </div>` : ''}

        <div class="mb-4">${K.field({ strategy: S, label: 'Notes', name: 'notes', type: 'textarea', rows: 2 })}</div>
        ${K.buttons({ strategy: S, submitLabel: 'Save Trade', submitIcon: 'fa-save' })}
      </form>`
  })

  const form = m.qs('#stockForm')
  const panel = m.qs('#stock-analysis')
  let targetBuyPrice = 0

  function update() {
    const a = Calc.stockEntryAnalysis({
      tradeType: form.elements.trade_type.value, quantity: form.elements.quantity.value,
      price: form.elements.price.value, commission: form.elements.commission.value, targetBuyPrice
    })
    if (!a.ready) { K.renderAnalysis(panel, [], [], 'Enter shares and price to see the analysis'); return }
    const rows = a.isSell
      ? [{ label: 'Sale proceeds (after commission)', value: K.fmt.money(a.proceeds, { plus: true }), tone: 'good' },
         { label: 'Gross sale', value: K.fmt.money(a.gross) },
         { label: 'Commission', value: K.fmt.money(a.commission) }]
      : [{ label: 'Total capital required', value: K.fmt.money(a.totalRisk), tone: 'bad' },
         { label: 'Purchase cost', value: K.fmt.money(a.gross) },
         { label: 'Commission', value: K.fmt.money(a.commission) }]
    if (a.target) {
      rows.push({ label: 'Target sell price (buy x 2)', value: K.fmt.money(a.target.sellPrice) })
      rows.push({ label: 'Potential profit', value: K.fmt.money(a.target.profit, { plus: true }), tone: a.target.profit >= 0 ? 'good' : 'bad' })
      rows.push({ label: 'Potential ROI', value: a.target.roiPct.toFixed(2) + '%', tone: a.target.roiPct >= 0 ? 'good' : 'bad' })
    }
    K.renderAnalysis(panel, rows, [], null)
  }
  // Closed trade: the closing sale is editable and the P/L box follows the corrected numbers (same replay the server books).
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

  m.qs('#company_select').addEventListener('change', e => {
    const buyPrice = e.target.options[e.target.selectedIndex].dataset.buyPrice
    const info = m.qs('#buy-price-info')
    if (buyPrice && buyPrice !== 'null') {
      targetBuyPrice = parseFloat(buyPrice) || 0
      info.classList.remove('hidden')
      m.qs('#target_buy_price').textContent = '$' + targetBuyPrice.toFixed(2)
    } else { targetBuyPrice = 0; info.classList.add('hidden') }
    update()
  })

  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)

  if (isEdit) {
    form.elements.company_id.value = stock.company_id
    form.elements.company_id.dispatchEvent(new Event('change'))
    form.elements.trade_type.value = stock.trade_type
    form.elements.quantity.value = stock.quantity
    form.elements.price.value = stock.price
    form.elements.account_id.value = stock.account_id
    form.elements.trade_date.value = stock.trade_date
    form.elements.commission.value = stock.commission || 0
    form.elements.notes.value = stock.notes || ''
    const r = form.querySelector(`input[name="strategy_type"][value="${stock.strategy_type || 'STOCKPILING'}"]`)
    if (r) r.checked = true
    if (isClosed && stock.close_date) {
      form.elements.close_date.value = stock.close_date
      form.elements.close_price.value = stock.close_price != null ? stock.close_price : ''
      form.elements.close_commission.value = stock.close_commission || 0
    }
  }
  update()

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const company = companies.find(c => c.id === parseInt(form.elements.company_id.value))
    const checked = form.querySelector('input[name="strategy_type"]:checked')
    const data = {
      company_id: parseInt(form.elements.company_id.value),
      ticker: company.ticker,
      trade_type: form.elements.trade_type.value,
      quantity: parseInt(form.elements.quantity.value),
      price: parseFloat(form.elements.price.value),
      account_id: parseInt(form.elements.account_id.value),
      trade_date: form.elements.trade_date.value,
      commission: parseFloat(form.elements.commission.value) || 0,
      strategy_type: checked ? checked.value : 'STOCKPILING',
      notes: form.elements.notes.value || null
    }
    if (form.elements.close_date && form.elements.close_date.value) {
      const cp = parseFloat(form.elements.close_price.value)
      data.close_date = form.elements.close_date.value
      data.close_price = Number.isFinite(cp) ? cp : null
      data.close_commission = parseFloat(form.elements.close_commission.value) || 0
    }
    try {
      if (isEdit && finalSell && data.close_date) {
        const changed = data.close_date !== finalSell.transaction_date || data.close_price !== Number(finalSell.price_per_share) || data.close_commission !== (Number(finalSell.commission) || 0)
        if (changed) {
          await api.put(`/api/stocks/${stockId}/sells/${finalSell.id}`, {
            transaction_date: data.close_date, price_per_share: data.close_price, commission: data.close_commission
          })
        }
      }
      if (isEdit) await api.put(`/api/stocks/${stockId}`, data)
      else await api.post('/api/stocks', data)
      m.el.remove()
      loadStocks()
      loadDashboard()
      loadClosedTrades()
      alert(isEdit ? 'Stock trade updated successfully!' : 'Stock trade added successfully!')
    } catch (error) {
      alert(error.response?.data?.error || 'Operation failed')
    }
  })
}
