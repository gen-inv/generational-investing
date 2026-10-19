/* Add / edit option trade. Shared ModalKit look: the header colour follows the selected strategy and changes with it.
 * Live analysis comes from Calc.optionEntryAnalysis (risk, max profit, RORC/ARORC) and, for a closed trade,
 * Calc.optionPLBreakdown (the same tested P/L code the server uses). Covered calls are created from the stock
 * details modal only; editing one here keeps its strategy locked. */

var OPTION_CLOSE_COLS = ['', '_2', '_3', '_4']   // leg i -> close_price + OPTION_CLOSE_COLS[i]

// Field names per strategy, in leg order (must match ModalKit.STRATEGIES[strategy].legs). The server maps the
// named multi-leg fields (short_strike, long_premium, ...) onto strike_price_2.. / premium_2.. columns.
function optionLegFields(strategy) {
  const legs = ModalKit.STRATEGIES[strategy].legs
  if (legs.length === 1) return [{ label: '', strike: 'strike_price', premium: 'premium' }]
  return legs.map(label => {
    const key = label.toLowerCase().replace(' leg', '').replace(' ', '_')   // 'Short Leg' -> short, 'Short Call' -> short_call
    return { label, strike: `${key}_strike`, premium: `${key}_premium`, long: /^Long/.test(label) }
  })
}

async function showOptionForm(optionId = null) {
  const K = ModalKit
  const isEdit = optionId !== null
  let companies, accounts, option = null
  try {
    companies = await fetchCompaniesWithResearch()
    const accountsResponse = await api.get('/api/accounts')
    accounts = accountsResponse.data.accounts || accountsResponse.data
    if (companies.length === 0) { alert('Please add companies first before creating option trades.'); showSection('companies'); return }
    if (accounts.length === 0) { alert('Please create an account first before adding option trades.'); showSection('accounts'); return }
    if (isEdit) option = (await api.get('/api/options')).data.find(o => o.id === optionId)
  } catch (error) {
    console.error('Error loading option form:', error)
    alert('Failed to load option form')
    return
  }
  if (isEdit && !option) { alert('Option trade not found'); return }

  const isClosed = !!option && option.is_open === 0
  const isCoveredCall = !!option && option.strategy_type === 'COVERED_CALL'
  const creatable = Object.keys(K.STRATEGIES).filter(s => s !== 'COVERED_CALL')

  // New trades start on the strategy tab you are looking at (covered calls are created from the stock details modal).
  const tab = typeof currentStrategyFilter !== 'undefined' ? currentStrategyFilter : 'SELLING_PUT'
  let strategy = isEdit ? option.strategy_type : (creatable.includes(tab) ? tab : 'SELLING_PUT')

  const inputCls = t => `w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none transition text-sm ${t.input}`
  const select = (name, label, optionsHtml, extra) => `
    <div>
      <label class="block text-gray-700 font-semibold mb-1 text-sm">${K.esc(label)} *</label>
      <select name="${name}" ${extra || ''} class="${inputCls(K.theme(strategy))}" required>${optionsHtml}</select>
    </div>`
  const today = new Date().toISOString().split('T')[0]
  const T = K.theme(strategy)

  const m = K.open({
    id: 'option-form-modal',
    strategy,
    icon: 'fa-chart-line',
    title: isEdit ? 'Edit Option Trade' : 'Add Option Trade',
    subtitle: 'Configure Option Strategy',
    body: `
      <form id="optionForm">
        <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-300 mb-4">
          <h4 class="text-sm font-bold text-gray-800 mb-3">Basic Information</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              ${select('company_id', 'Company', `<option value="">Select company...</option>` + companies.map(c =>
                `<option value="${c.id}" data-buy-price="${c.buy_price || ''}">${K.esc(c.ticker)} - ${K.esc(c.company_name)}</option>`).join(''), 'id="option_company_select"')}
              <div id="option-buy-price-info" class="mt-1 text-xs hidden"><span class="text-gray-600">Target Buy Price: </span><span class="font-semibold text-brand-gold"></span></div>
            </div>
            ${select('account_id', 'Account', `<option value="">Select account...</option>` + accounts.map(a => `<option value="${a.id}">${K.esc(a.account_name)}</option>`).join(''))}
            <div>
              ${isCoveredCall
                ? `<label class="block text-gray-700 font-semibold mb-1 text-sm">Strategy Type *</label>
                   <input type="text" value="Covered Call" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm" disabled>
                   <input type="hidden" name="strategy_type" value="COVERED_CALL">`
                : select('strategy_type', 'Strategy Type', creatable.map(s => `<option value="${s}">${K.esc(K.STRATEGIES[s].label)}</option>`).join(''), 'id="strategy_type_select"')}
            </div>
            ${K.field({ strategy, label: 'Open Date', name: 'trade_date', type: 'date', value: today, required: true })}
            ${K.field({ strategy, label: 'Expiration Date', name: 'expiration_date', type: 'date', required: true })}
            ${K.field({ strategy, label: 'Quantity (Contracts)', name: 'quantity', type: 'number', min: 1, step: 1, required: true })}
          </div>
        </div>

        <div id="strategy_fields_container"></div>
        ${K.analysisPanel('option-analysis', strategy, 'Trade Analysis')}

        ${isClosed ? `
        <div class="bg-gradient-to-br from-red-50 to-red-100 p-3 rounded-lg border border-red-300 mb-4">
          <h4 class="text-sm font-bold text-red-800 mb-3">Closing Details</h4>
          <div id="close_fields_container"></div>
        </div>` : ''}

        <div class="mb-4">${K.field({ strategy, label: 'Notes', name: 'notes', type: 'textarea', rows: 2 })}</div>
        ${K.buttons({ strategy, submitLabel: 'Save Option Trade', submitIcon: 'fa-save' })}
      </form>`
  })

  const form = m.qs('#optionForm')
  const container = m.qs('#strategy_fields_container')
  const closeBox = m.qs('#close_fields_container')
  const panel = m.qs('#option-analysis')

  // ---- header colour follows the strategy ----
  let shown = K.theme(strategy)
  function retheme(newStrategy) {
    const from = shown, to = K.theme(newStrategy)
    const swap = (el, key) => { if (!el) return; from[key].split(' ').forEach(c => el.classList.remove(c)); to[key].split(' ').forEach(c => el.classList.add(c)) }
    swap(m.qs('[data-mk="header"]'), 'header')
    swap(m.qs('[data-mk="header"] p'), 'sub')
    swap(m.qs('[data-mk="x"]'), 'closeHover')
    swap(m.qs('button[type="submit"]'), 'button')
    swap(panel.parentElement, 'panel')
    swap(panel.parentElement.querySelector('h4'), 'panelTitle')
    form.querySelectorAll('input, select, textarea').forEach(el => swap(el, 'input'))
    shown = to
  }

  // ---- strategy-specific fields ----
  function renderFields(s) {
    const saved = {}
    form.querySelectorAll('.strategy-field').forEach(i => { saved[i.name] = i.value })
    const legs = optionLegFields(s)
    const cfg = K.STRATEGIES[s]
    const multi = legs.length > 1
    const num = (name, label) => `
      <div>
        <label class="block text-gray-700 font-semibold mb-1 text-xs">${K.esc(label)} *</label>
        <input type="number" step="0.001" min="0" name="${name}" required placeholder="0.00" class="strategy-field ${inputCls(K.theme(s))}">
      </div>`
    container.innerHTML = `
      <div class="${K.theme(s).panel} p-3 rounded-lg border mb-4">
        <h4 class="text-sm font-bold ${K.theme(s).panelTitle} mb-3">Strategy Details (${legs.length} Leg${multi ? 's' : ''})</h4>
        ${legs.map((leg, i) => `
          ${leg.label ? `<div class="text-xs font-semibold ${K.theme(s).panelText} mb-1${i ? ' mt-2' : ''}">${K.esc(leg.label)}</div>` : ''}
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
            ${num(leg.strike, multi ? 'Strike' : 'Strike Price')}
            ${num(leg.premium, 'Premium/Share' + ((multi ? leg.long : !cfg.credit) ? ' (Paid)' : ''))}
          </div>`).join('')}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          <div>
            <label class="block text-gray-700 font-semibold mb-1 text-xs">Open Commission</label>
            <input type="number" step="0.01" min="0" name="commission" value="0" placeholder="0.00" class="strategy-field ${inputCls(K.theme(s))}">
          </div>
        </div>
      </div>`
    Object.keys(saved).forEach(n => { if (form.elements[n] && saved[n] !== '') form.elements[n].value = saved[n] })

    if (closeBox) {
      const savedClose = {}
      closeBox.querySelectorAll('input').forEach(i => { savedClose[i.name] = i.value })
      closeBox.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
          <div><label class="block text-gray-700 font-semibold mb-1 text-sm">Close Date *</label><input type="date" name="close_date" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></div>
          <div><label class="block text-gray-700 font-semibold mb-1 text-sm">Close Commission</label><input type="number" step="0.01" min="0" name="close_commission" value="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          ${legs.map((leg, i) => `<div><label class="block text-gray-700 font-semibold mb-1 text-xs">${K.esc(leg.label ? leg.label + ' ' : '')}Close Price *</label>
            <input type="number" step="0.001" min="0" name="close_price${OPTION_CLOSE_COLS[i]}" required class="close-field w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></div>`).join('')}
        </div>`
      Object.keys(savedClose).forEach(n => { if (form.elements[n] && savedClose[n] !== '') form.elements[n].value = savedClose[n] })
    }
    update()
  }

  const val = name => (form.elements[name] ? form.elements[name].value : '')

  function update() {
    const s = form.elements.strategy_type.value
    if (!s || !K.STRATEGIES[s]) { K.renderAnalysis(panel, [], [], 'Select a strategy to see calculations'); return }
    const legs = optionLegFields(s)
    const values = {}
    legs.forEach(l => { values[l.strike] = val(l.strike); values[l.premium] = val(l.premium) })
    const a = Calc.optionEntryAnalysis({
      strategy: s, contracts: val('quantity'), commission: val('commission'), values,
      tradeDate: val('trade_date'), expirationDate: val('expiration_date')
    })
    const rows = []
    if (a.netCredit !== null) rows.push({ label: a.netCredit >= 0 ? 'Net credit' : 'Net debit', value: K.fmt.money(a.netCredit, { plus: true }), tone: a.netCredit >= 0 ? 'good' : 'bad' })
    if (a.netDebit !== null) rows.push({ label: 'Net debit', value: K.fmt.money(-a.netDebit), tone: 'bad' })
    if (a.totalRisk !== null) rows.push({ label: 'Total risk', value: K.fmt.money(a.totalRisk), tone: 'bad' })
    if (a.maxProfit !== null) rows.push({ label: 'Max profit', value: K.fmt.money(a.maxProfit), tone: 'good' })
    if (a.dte !== null && a.dte > 0) rows.push({ label: 'DTE (days to expiration)', value: `${a.dte} days` })
    if (a.rorc !== null && a.dte !== null && a.dte > 0) rows.push({ label: 'RORC', value: a.rorc.toFixed(2) + '%' })
    if (a.arorc !== null) rows.push({ label: 'ARORC', value: a.arorc.toFixed(2) + '%' })

    if (isClosed && form.elements.close_price) {
      const premiums = legs.map(l => parseFloat(val(l.premium)) || 0)
      const closes = legs.map((l, i) => parseFloat(val('close_price' + OPTION_CLOSE_COLS[i])) || 0)
      const b = Calc.optionPLBreakdown({
        strategy: s, contracts: parseInt(val('quantity')) || 0,
        open: { premium: premiums[0], premium_2: premiums[1], premium_3: premiums[2], premium_4: premiums[3] },
        close: { close_price: closes[0], close_price_2: closes[1], close_price_3: closes[2], close_price_4: closes[3] },
        openCommission: parseFloat(val('commission')) || 0, closeCommission: parseFloat(val('close_commission')) || 0
      })
      rows.push({ label: 'Realized profit / loss', value: K.fmt.money(b.netPL, { plus: true }), tone: b.netPL >= 0 ? 'good' : 'bad', total: true })
    }
    K.renderAnalysis(panel, rows, [], null)
  }

  // ---- wiring ----
  const stratSelect = m.qs('#strategy_type_select')
  if (stratSelect) {
    stratSelect.value = strategy
    stratSelect.addEventListener('change', e => { strategy = e.target.value; retheme(strategy); renderFields(strategy) })
  }
  renderFields(strategy)
  retheme(strategy)

  form.addEventListener('input', update)
  form.addEventListener('change', update)

  m.qs('#option_company_select').addEventListener('change', e => {
    const buyPrice = e.target.options[e.target.selectedIndex].dataset.buyPrice
    const info = m.qs('#option-buy-price-info')
    if (buyPrice && buyPrice !== 'null') {
      info.classList.remove('hidden')
      info.querySelector('.font-semibold').textContent = '$' + parseFloat(buyPrice).toFixed(2)
    } else info.classList.add('hidden')
  })

  m.qs('[data-mk="cancel"]').addEventListener('click', m.close)

  // ---- load existing values when editing ----
  if (isEdit) {
    form.elements.company_id.value = option.company_id
    form.elements.company_id.dispatchEvent(new Event('change'))
    const legs = optionLegFields(strategy)
    const get = (o, name) => (o[name] != null ? o[name] : '')
    legs.forEach((l, i) => {
      // GET /api/options returns single legs as strike_price/premium and multi-leg trades under their leg names
      form.elements[l.strike].value = get(option, l.strike) || (i === 0 ? get(option, 'strike_price') : '')
      form.elements[l.premium].value = get(option, l.premium) || (i === 0 ? get(option, 'premium') : '')
    })
    form.elements.commission.value = option.commission || 0
    form.elements.quantity.value = option.quantity
    form.elements.expiration_date.value = option.expiration_date
    form.elements.trade_date.value = option.trade_date
    form.elements.notes.value = option.notes || ''
    if (option.account_id) form.elements.account_id.value = option.account_id
    else {
      const match = accounts.find(a => a.account_type === option.account_type)
      if (match) form.elements.account_id.value = match.id
    }
    if (isClosed && option.close_date) {
      form.elements.close_date.value = option.close_date
      form.elements.close_commission.value = option.close_commission || 0
      legs.forEach((l, i) => {
        const v = option['close_price' + OPTION_CLOSE_COLS[i]]
        form.elements['close_price' + OPTION_CLOSE_COLS[i]].value = v != null ? v : ''
      })
    }
    update()
  }

  // ---- save ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const s = form.elements.strategy_type.value
    const legs = optionLegFields(s)
    const company = companies.find(c => c.id === parseInt(form.elements.company_id.value))
    const data = {
      company_id: parseInt(form.elements.company_id.value),
      ticker: company.ticker,
      strategy_type: s,
      quantity: parseInt(form.elements.quantity.value),
      expiration_date: form.elements.expiration_date.value,
      account_id: parseInt(form.elements.account_id.value),
      trade_date: form.elements.trade_date.value,
      commission: parseFloat(form.elements.commission.value) || 0,
      is_open: true,
      notes: form.elements.notes.value || null
    }
    legs.forEach(l => { data[l.strike] = parseFloat(form.elements[l.strike].value); data[l.premium] = parseFloat(form.elements[l.premium].value) })
    if (isClosed && form.elements.close_date) {
      data.close_date = form.elements.close_date.value
      data.close_commission = parseFloat(form.elements.close_commission.value) || 0
      legs.forEach((l, i) => {
        const n = parseFloat(form.elements['close_price' + OPTION_CLOSE_COLS[i]].value)
        data['close_price' + OPTION_CLOSE_COLS[i]] = Number.isFinite(n) ? n : null   // 0 is a real close price (expired / assigned)
      })
    }
    try {
      if (isEdit) await api.put(`/api/options/${optionId}`, data)
      else await api.post('/api/options', data)
      m.el.remove()
      loadOptions()
      loadDashboard()
      loadClosedTrades()
      alert(isEdit ? 'Option trade updated successfully!' : 'Option trade added successfully!')
    } catch (error) {
      alert(error.response?.data?.error || 'Operation failed')
    }
  })
}
