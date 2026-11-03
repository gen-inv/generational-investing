// Profile > Menu & Report Settings: which main-menu areas are switched on. The Dashboard is always on.
// Switched-off areas are hidden from the menu; nothing is deleted.
(function (root) {
  var SECTIONS = [
    { key: 'companies', label: 'Companies', icon: 'fa-building' },
    { key: 'accounts', label: 'Accounts', icon: 'fa-wallet' },
    { key: 'stocks', label: 'Stock Trades', icon: 'fa-chart-bar' },
    { key: 'options', label: 'Options Trades', icon: 'fa-layer-group' },
    { key: 'daily-trade', label: '0DTE SPX', icon: 'fa-chart-line' },
    { key: 'utilities', label: 'Utilities', icon: 'fa-tools' },
    { key: 'reports', label: 'Reports', icon: 'fa-file-alt' }
  ]
  var INTRO = "Switch off the areas you don't use. They disappear from the main menu, and the reports leave out their trades and numbers. Nothing is deleted: switch an area back on and it all returns. The Dashboard is always on."
  var CACHE_KEY = 'menuHidden'
  var hidden = []

  function clean(list) {
    if (!Array.isArray(list)) return []
    return SECTIONS.map(function (s) { return s.key }).filter(function (k) { return list.indexOf(k) !== -1 })
  }

  function client() { return typeof api !== 'undefined' ? api : null }

  function remember() { try { root.localStorage.setItem(CACHE_KEY, JSON.stringify(hidden)) } catch (e) { /* storage may be unavailable */ } }

  function isHidden(key) { return hidden.indexOf(key) !== -1 }

  // Where to go when asked for a section that is switched off.
  function guard(key) { return isHidden(key) ? 'dashboard' : key }

  // Reports: hide the tabs and filter choices that only make sense for an area that is switched off
  function applyReportAreas() {
    var doc = root.document
    var noStocks = isHidden('stocks'), noOptions = isHidden('options'), noDaily = isHidden('daily-trade')
    var tabs = { positions: noStocks, dividends: noStocks, strategy: noOptions && noDaily, 'closed-trades': noStocks && noOptions }
    Object.keys(tabs).forEach(function (t) {
      doc.querySelectorAll('.report-tab[data-tab="' + t + '"]').forEach(function (b) { b.classList.toggle('hidden', tabs[t]) })
    })
    var sel = doc.getElementById('closed-trade-type')
    if (sel) {
      Array.prototype.forEach.call(sel.options, function (o) {
        var off = (o.value === 'stocks' && noStocks) || (o.value === 'options' && noOptions)
        o.hidden = off
        o.disabled = off
      })
      if (sel.selectedOptions[0] && sel.selectedOptions[0].disabled) sel.value = 'all'
    }
  }

  function apply() {
    root.document.querySelectorAll('.nav-link[data-section]').forEach(function (a) {
      a.classList.toggle('hidden', isHidden(a.getAttribute('data-section')))
    })
    applyReportAreas()
  }

  function reset() {
    hidden = []
    try { root.localStorage.removeItem(CACHE_KEY) } catch (e) { /* ignore */ }
    apply()
  }

  // Paint the last known choice at once, then ask the server.
  async function load() {
    try { hidden = clean(JSON.parse(root.localStorage.getItem(CACHE_KEY) || '[]')); apply() } catch (e) { /* no cache */ }
    var c = client()
    if (!c) return
    try {
      var res = await c.get('/api/user/preferences')
      hidden = clean(res.data && res.data.hidden)
      remember()
      apply()
    } catch (e) { /* keep what we have */ }
  }

  function toggleRow(s) {
    return '<div class="flex items-center justify-between py-3">' +
      '<span class="text-gray-800"><i class="fas ' + s.icon + ' w-6 text-brand-teal"></i>' + s.label + '</span>' +
      '<label class="relative inline-flex items-center cursor-pointer">' +
      '<input type="checkbox" data-menu-key="' + s.key + '" class="sr-only peer"' + (isHidden(s.key) ? '' : ' checked') + '>' +
      '<div class="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-brand-teal after:content-[\'\'] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>' +
      '</label></div>'
  }

  function close() {
    var m = root.document.getElementById('menu-settings-modal')
    if (m) m.remove()
  }

  async function save() {
    var off = []
    root.document.querySelectorAll('#menu-settings-modal [data-menu-key]').forEach(function (box) {
      if (!box.checked) off.push(box.getAttribute('data-menu-key'))
    })
    var c = client()
    try {
      var res = await c.put('/api/user/preferences', { hidden: off })
      hidden = clean(res.data && res.data.hidden)
      remember()
      apply()
      close()
      var active = root.document.querySelector('.nav-link.active')
      if (active && isHidden(active.getAttribute('data-section')) && typeof root.showSection === 'function') root.showSection('dashboard')
      if (typeof root.showNotification === 'function') root.showNotification('Menu settings saved')
    } catch (e) {
      var msg = (e && e.response && e.response.data && e.response.data.error) || 'Could not save the menu settings'
      if (typeof root.showNotification === 'function') root.showNotification(msg, 'error'); else root.alert(msg)
    }
  }

  function open() {
    var dd = root.document.getElementById('user-dropdown')
    if (dd) dd.classList.add('hidden')
    close()
    var modal = root.document.createElement('div')
    modal.id = 'menu-settings-modal'
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
    modal.innerHTML =
      '<div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">' +
      '<div class="flex justify-between items-center mb-4">' +
      '<h2 class="text-2xl font-bold text-brand-teal"><i class="fas fa-sliders-h mr-2"></i>Menu Settings</h2>' +
      '<button type="button" data-menu-close class="text-gray-500 hover:text-gray-700"><i class="fas fa-times text-xl"></i></button></div>' +
      '<p class="text-sm text-gray-600 mb-3">' + INTRO + '</p>' +
      '<div class="divide-y divide-gray-200 border-t border-b border-gray-200">' +
      '<div class="flex items-center justify-between py-3"><span class="text-gray-800"><i class="fas fa-chart-line w-6 text-brand-teal"></i>Dashboard</span><span data-menu-locked class="text-xs text-gray-400"><i class="fas fa-lock mr-1"></i>Always on</span></div>' +
      SECTIONS.map(toggleRow).join('') + '</div>' +
      '<div class="flex gap-3 pt-4">' +
      '<button type="button" data-menu-save class="flex-1 bg-brand-teal text-white px-4 py-2 rounded-lg hover:bg-opacity-90 transition-colors"><i class="fas fa-save mr-2"></i>Save</button>' +
      '<button type="button" data-menu-close class="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors">Cancel</button></div></div>'
    root.document.body.appendChild(modal)
    modal.querySelectorAll('[data-menu-close]').forEach(function (b) { b.addEventListener('click', close) })
    modal.querySelector('[data-menu-save]').addEventListener('click', save)
  }

  var apiObj = { SECTIONS: SECTIONS, isHidden: isHidden, guard: guard, apply: apply, load: load, reset: reset, open: open, hiddenList: function () { return hidden.slice() } }
  root.MenuSettings = apiObj
  root.showMenuSettings = open
  if (typeof module !== 'undefined' && module.exports) module.exports = apiObj
})(typeof window !== 'undefined' ? window : globalThis)
