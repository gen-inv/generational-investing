// Utilities > Discovery: what the weekly scans found, and when they last ran.
// Everything shown comes from an AI agent, so every value is escaped before it touches the page.
(function (root) {
  var TABS = {
    guru: { label: 'Guru purchases', emptyText: 'No guru purchases have been reported yet. The scan runs weekly and only reports companies that pass the Quick-5.', every: 7 },
    maturing: { label: "Gov't contracts", emptyText: "No government-contract candidates have been reported yet.", every: 7 }
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }

  function fmtDate(iso) {
    var d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  function daysAgo(iso, now) {
    var t = Date.parse(iso)
    if (isNaN(t)) return null
    return Math.floor(((now || Date.now()) - t) / 86400000)
  }

  function statusLine(scan, tab, now) {
    if (!scan) return '<span class="text-gray-500">This scan has not reported in yet.</span>'
    var ago = daysAgo(scan.last_run_at, now)
    var when = fmtDate(scan.last_run_at) + (ago === null ? '' : ago <= 0 ? ' (today)' : ' (' + ago + (ago === 1 ? ' day' : ' days') + ' ago)')
    var stale = ago !== null && ago > TABS[tab].every * 2
    var bits = ['<strong>Last ran:</strong> ' + escapeHtml(when)]
    if (scan.gurus_scanned != null) bits.push(escapeHtml(scan.gurus_scanned) + ' gurus scanned')
    if (scan.candidates_found != null) bits.push(escapeHtml(scan.candidates_found) + ' candidates examined')
    var out = bits.join(' &middot; ')
    if (scan.note) out += '<div class="text-gray-500">' + escapeHtml(scan.note) + '</div>'
    if (stale) out += '<div class="text-red-600 font-semibold">This scan is overdue &mdash; it should run about every ' + TABS[tab].every + ' days.</div>'
    return out
  }

  var STATUS = {
    alerted: ['Alerted', 'bg-gray-200 text-gray-700'],
    added: ['Added to roster', 'bg-green-100 text-green-800'],
    declined: ['Passed on', 'bg-gray-100 text-gray-500'],
    potential_override: ['Potential override', 'bg-amber-100 text-amber-800']
  }

  function statusBadge(status) {
    if (!status || status === 'alerted') return ''
    var s = STATUS[status] || [String(status).replace(/_/g, ' '), 'bg-gray-100 text-gray-600']
    return '<span class="ml-2 px-2 py-0.5 rounded text-xs ' + s[1] + '">' + escapeHtml(s[0]) + '</span>'
  }

  function detailHtml(f) {
    var h = ''
    if (f.details) h += '<div class="whitespace-pre-wrap text-sm text-gray-700">' + escapeHtml(f.details) + '</div>'
    if (f.data && typeof f.data === 'object') {
      var rows = Object.keys(f.data).map(function (k) {
        var v = f.data[k]
        return '<tr><td class="pr-4 text-gray-500 align-top">' + escapeHtml(k) + '</td><td>' + escapeHtml(typeof v === 'object' ? JSON.stringify(v) : v) + '</td></tr>'
      }).join('')
      if (rows) h += '<table class="text-sm mt-2">' + rows + '</table>'
    }
    return h || '<div class="text-sm text-gray-500">No further details were recorded.</div>'
  }

  function renderFindings(findings) {
    return findings.map(function (f, i) {
      var tier = f.tier ? '<span class="ml-2 px-2 py-0.5 rounded bg-brand-teal text-white text-xs">' + escapeHtml(f.tier) + '</span>' : ''
      return '<div class="border-b border-gray-200">' +
        '<button type="button" data-discovery-row="' + i + '" class="w-full text-left py-3 hover:bg-gray-50 flex items-start gap-3">' +
        '<span class="font-bold w-20 shrink-0">' + escapeHtml(f.ticker) + '</span>' +
        '<span class="flex-1"><span class="text-gray-800">' + escapeHtml(f.headline) + '</span>' + tier + statusBadge(f.status) +
        (f.company_name ? '<div class="text-xs text-gray-500">' + escapeHtml(f.company_name) + '</div>' : '') + '</span>' +
        '<span class="text-sm text-gray-500 shrink-0">' + escapeHtml(fmtDate(f.found_at)) + '</span></button>' +
        '<div id="discovery-detail-' + i + '" class="hidden pb-3 pl-24">' + detailHtml(f) + '</div></div>'
    }).join('')
  }

  function render(state, tab, now) {
    var scan = (state.scans || []).filter(function (s) { return s.scan_type === tab })[0]
    var list = (state.findings || []).filter(function (f) { return f.scan_type === tab })
    return {
      status: statusLine(scan, tab, now),
      list: list.length ? renderFindings(list) : '<div class="text-gray-500 py-6 text-center">' + escapeHtml(TABS[tab].emptyText) + '</div>'
    }
  }

  var current = { tab: 'guru', data: { scans: [], findings: [] } }

  function paint() {
    var doc = root.document
    var out = render(current.data, current.tab)
    doc.getElementById('discovery-status').innerHTML = out.status
    var list = doc.getElementById('discovery-list')
    list.innerHTML = out.list
    list.querySelectorAll('[data-discovery-row]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var d = doc.getElementById('discovery-detail-' + btn.getAttribute('data-discovery-row'))
        if (d) d.classList.toggle('hidden')
      })
    })
    doc.querySelectorAll('[data-discovery-tab]').forEach(function (b) {
      var on = b.getAttribute('data-discovery-tab') === current.tab
      b.className = 'px-4 py-2 rounded font-semibold text-sm ' + (on ? 'bg-brand-teal text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
    })
  }

  function setDiscoveryTab(tab) {
    if (!TABS[tab]) return
    current.tab = tab
    paint()
  }

  // RESEARCH_API_BASE is a top-level const in app.js (not a window property); read it by bare name when called.
  function base() { return typeof RESEARCH_API_BASE !== 'undefined' ? RESEARCH_API_BASE : '' }

  async function loadDiscovery() {
    var list = root.document.getElementById('discovery-list')
    if (!list) return
    list.innerHTML = '<div class="text-gray-500 py-6 text-center">Loading...</div>'
    try {
      var res = await root.axios.get(base() + '/api/research/discovery')
      current.data = res.data || { scans: [], findings: [] }
      paint()
    } catch (e) {
      list.innerHTML = '<div class="text-red-600 py-6 text-center">Could not load discovery results.</div>'
    }
  }

  var api = { escapeHtml: escapeHtml, render: render, statusLine: statusLine, loadDiscovery: loadDiscovery, setDiscoveryTab: setDiscoveryTab, TABS: TABS }
  root.escapeHtmlDiscovery = escapeHtml
  root.loadDiscovery = loadDiscovery
  root.setDiscoveryTab = setDiscoveryTab
  root.DiscoveryView = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
