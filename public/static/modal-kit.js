/* ModalKit - one look for every trade modal (entry, close, assign, edit).
 * Header colour follows the strategy. Plain global script (no build step); safe to load before app.js.
 *
 *   const m = ModalKit.open({ id, strategy: 'COVERED_CALL', icon: 'fa-file-contract', title, subtitle, body, size: '4xl' })
 *   m.close()   m.el   m.qs('form')
 */
(function (global) {
  'use strict'

  // Approved header colours (Tailwind colour names). Keys match option_trades.strategy_type, plus STOCK.
  const COLOURS = {
    STOCK: 'blue',
    SELLING_PUT: 'emerald',
    SELLING_PUT_WHEEL: 'teal',
    SELLING_PUT_LONG_TERM: 'cyan',
    BUYING_PUT: 'rose',
    LONG_CALL: 'sky',
    COVERED_CALL: 'amber',
    CREDIT_SPREAD: 'indigo',
    DEBIT_SPREAD: 'violet',
    IRON_CONDOR: 'fuchsia'
  }

  function theme(strategy) {
    const c = COLOURS[strategy] || 'gray'
    return {
      colour: c,
      header: `bg-gradient-to-r from-${c}-600 to-${c}-700`,
      sub: `text-${c}-100`,
      closeHover: `hover:text-${c}-200`,
      button: `bg-${c}-600 hover:bg-${c}-700`,
      panel: `bg-${c}-50 border-${c}-200`,
      panelTitle: `text-${c}-900`,
      panelText: `text-${c}-800`,
      input: `focus:border-${c}-500 focus:ring-1 focus:ring-${c}-500`
    }
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
  }

  const fmt = {
    money(n, opts) {
      if (n == null || !Number.isFinite(n)) return '-'
      const sign = n < 0 ? '-' : (opts && opts.plus && n > 0 ? '+' : '')
      return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    },
    pct(r, digits) {
      if (r == null || !Number.isFinite(r)) return '-'
      return (r * 100).toFixed(digits == null ? 2 : digits) + '%'
    }
  }

  const SIZES = { '2xl': 'max-w-2xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl', '5xl': 'max-w-5xl' }
  const COLS = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }

  function open(o) {
    const t = theme(o.strategy)
    const existing = o.id && document.getElementById(o.id)
    if (existing) existing.remove()

    const el = document.createElement('div')
    el.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
    if (o.id) el.id = o.id
    el.dataset.strategy = o.strategy || ''
    el.innerHTML = `
      <div class="bg-white rounded-lg shadow-2xl ${SIZES[o.size] || SIZES['4xl']} w-full max-h-[90vh] overflow-y-auto">
        <div data-mk="header" class="${t.header} text-white p-4 sticky top-0 z-10">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-2xl font-bold flex items-center">
                ${o.icon ? `<i class="fas ${esc(o.icon)} mr-2"></i>` : ''}${esc(o.title)}
              </h3>
              ${o.subtitle ? `<p class="${t.sub} text-sm">${esc(o.subtitle)}</p>` : ''}
            </div>
            <button type="button" data-mk="x" class="text-white ${t.closeHover} text-xl" aria-label="Close">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div class="p-4">${o.body || ''}</div>
      </div>`
    document.body.appendChild(el)

    const api = {
      el,
      theme: t,
      qs: sel => el.querySelector(sel),
      close() { el.remove(); if (o.onClose) o.onClose() }
    }
    el.querySelector('[data-mk="x"]').addEventListener('click', api.close)
    return api
  }

  // ---- building blocks (return HTML strings) ----

  function field(f) {
    const t = theme(f.strategy)
    const attrs = [
      `type="${f.type || 'text'}"`, `name="${esc(f.name)}"`,
      f.step != null ? `step="${esc(f.step)}"` : '', f.min != null ? `min="${esc(f.min)}"` : '',
      f.max != null ? `max="${esc(f.max)}"` : '', f.required ? 'required' : '',
      f.placeholder != null ? `placeholder="${esc(f.placeholder)}"` : '',
      f.value != null ? `value="${esc(f.value)}"` : ''
    ].filter(Boolean).join(' ')
    const control = f.type === 'textarea'
      ? `<textarea name="${esc(f.name)}" rows="${f.rows || 2}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none transition text-sm ${t.input}" ${f.placeholder != null ? `placeholder="${esc(f.placeholder)}"` : ''}>${esc(f.value || '')}</textarea>`
      : `<input ${attrs} class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none transition text-sm ${t.input}">`
    return `
      <div>
        <label class="block text-gray-700 font-semibold mb-1 text-sm">${esc(f.label)}${f.required ? ' *' : ''}</label>
        ${control}
        ${f.hint ? `<small class="text-gray-500 text-xs">${esc(f.hint)}</small>` : ''}
      </div>`
  }

  function grid(cols, html, mb) {
    return `<div class="grid grid-cols-1 ${COLS[cols] || COLS[3]} gap-3 ${mb === 0 ? '' : 'mb-4'}">${html}</div>`
  }

  function stat(label, value, cls) {
    return `<div><p class="text-xs text-gray-600">${esc(label)}</p><p class="font-semibold ${cls || 'text-gray-900'}">${esc(value)}</p></div>`
  }

  // Grey "what am I working on" box at the top of every modal.
  function summary(title, stats) {
    return `
      <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-300 mb-4">
        <h4 class="text-sm font-bold text-gray-800 mb-2">${esc(title)}</h4>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">${stats.join('')}</div>
      </div>`
  }

  // Empty live-analysis panel; fill it with renderAnalysis().
  function analysisPanel(id, strategy, title) {
    const t = theme(strategy)
    return `
      <div class="${t.panel} p-3 rounded-lg border mb-4">
        <h4 class="text-xs font-bold ${t.panelTitle} mb-2 flex items-center">
          <i class="fas fa-calculator mr-1"></i>${esc(title || 'Live Analysis')}
        </h4>
        <div id="${esc(id)}" class="space-y-1 text-sm"></div>
      </div>`
  }

  const TONES = { good: 'text-green-700', bad: 'text-red-700', neutral: 'text-gray-900' }

  // rows: [{ label, value, sub?, tone? }]; warnings: [string]
  function renderAnalysis(container, rows, warnings) {
    container.innerHTML =
      rows.map(r => `
        <div class="flex items-center justify-between">
          <span class="text-gray-700">${esc(r.label)}</span>
          <span class="font-semibold ${TONES[r.tone] || TONES.neutral}">${esc(r.value)}${r.sub ? ` <span class="text-xs font-normal text-gray-500">${esc(r.sub)}</span>` : ''}</span>
        </div>`).join('') +
      (warnings || []).map(w => `
        <div class="mt-2 p-2 rounded bg-yellow-50 border border-yellow-300 text-yellow-900 text-xs" data-mk="warning">
          <i class="fas fa-exclamation-triangle mr-1"></i>${esc(w)}
        </div>`).join('')
  }

  function buttons(o) {
    const t = theme(o.strategy)
    return `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
        <button type="submit" class="w-full ${t.button} text-white font-bold py-3 px-6 rounded-lg transition shadow-lg">
          <i class="fas ${esc(o.submitIcon || 'fa-save')} mr-2"></i>${esc(o.submitLabel || 'Save')}
        </button>
        <button type="button" data-mk="cancel" class="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition shadow-lg">
          <i class="fas fa-times mr-2"></i>${esc(o.cancelLabel || 'Cancel')}
        </button>
      </div>`
  }

  global.ModalKit = { COLOURS, theme, esc, fmt, open, field, grid, stat, summary, analysisPanel, renderAnalysis, buttons }
})(typeof window !== 'undefined' ? window : globalThis)