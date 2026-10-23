// Utilities > Discovery: what the weekly scans found, and when they last ran.
// Everything shown comes from an AI agent, so every value is escaped before it touches the page.
(function (root) {
  var TABS = {
    guru: { label: 'Guru purchases', emptyText: 'No guru purchases have been reported yet. The scan runs weekly and only reports companies that pass the Quick-5.', every: 7 },
    maturing: { label: "Gov't contracts", emptyText: "No government-contract candidates have been reported yet.", every: 7 },
    setup: { label: 'Trade setups', emptyText: 'No trade setups right now. The screen runs each weekday morning and shows reversal candles from the last two weeks.', every: 2, unit: 'setups' }
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
    if (scan.candidates_found != null) bits.push(escapeHtml(scan.candidates_found) + ' ' + (TABS[tab].unit || 'candidates examined'))
    var out = bits.join(' &middot; ')
    if (scan.note) out += '<div class="text-gray-500">' + escapeHtml(scan.note) + '</div>'
    if (stale) out += '<div class="text-red-600 font-semibold">This scan is overdue &mdash; it should run about every ' + TABS[tab].every + ' days.</div>'
    return out
  }

  var STATUS = {
    alerted: ['Alerted', 'bg-gray-200 text-gray-700'],
    added: ['Added to roster', 'bg-green-100 text-green-800'],
    declined: ['Passed on', 'bg-gray-100 text-gray-500'],
    potential_override: ['Potential override', 'bg-amber-100 text-amber-800'],
    candidate: ['Awaiting confirmation', 'bg-amber-100 text-amber-800'],
    confirmed: ['Confirmed', 'bg-green-100 text-green-800'],
    failed: ['Failed', 'bg-red-100 text-red-700'],
    expired: ['Expired', 'bg-gray-100 text-gray-500']
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

  // ---- Trade setups: one row per ticker, a chart per row ------------------------------------------------------------
  function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null }
  function money(v) { var n = num(v); return n === null ? '' : '$' + n.toFixed(2) }
  function fix(v, d) { var n = num(v); return n === null ? '-' : n.toFixed(d) }

  // A reversal candle that never resolved (the scan missed days) is shown as expired once it is a week old.
  function effectiveStatus(f, now) {
    var d = f.data || {}
    var t = Date.parse(d.candle_date || f.found_at)
    if (f.status === 'candidate' && !isNaN(t) && ((now || Date.now()) - t) / 86400000 > 6) return 'expired'
    return f.status
  }

  function activeSetups(list, now) {
    var cutoff = (now || Date.now()) - 14 * 86400000
    var order = { confirmed: 0, candidate: 1, failed: 2, expired: 3 }
    return list.map(function (f) { return Object.assign({}, f, { status: effectiveStatus(f, now) }) })
      .filter(function (f) { var t = Date.parse((f.data && f.data.candle_date) || f.found_at); return isNaN(t) || t >= cutoff })
      .sort(function (a, b) {
        var oa = order[a.status] === undefined ? 4 : order[a.status], ob = order[b.status] === undefined ? 4 : order[b.status]
        if (oa !== ob) return oa - ob
        return (Date.parse(b.found_at) - Date.parse(a.found_at)) || String(a.ticker).localeCompare(String(b.ticker))
      })
  }

  function stockChartsUrl(ticker) { return 'https://stockcharts.com/h-sc/ui?s=' + encodeURIComponent(String(ticker)) }

  // The setup drawn: candles, the support/resistance line, the reversal candle, the price that confirms it and the price that kills it, RSI below.
  function chartSvg(d) {
    var cs = (d && d.candles) || []
    if (cs.length < 5) return ''
    var ok = cs.every(function (c) { return c && c.length === 4 && c.every(function (x) { return num(x) !== null }) })
    if (!ok) return ''
    var W = 640, H = 230, RH = 56, L = 54, R = 76, T = 8, B = 18
    var n = cs.length, plotW = W - L - R, step = plotW / n, bw = Math.max(2, step * 0.62)
    var level = num(d.level), trig = num(d.trigger), inv = num(d.invalidation)
    var lo = Infinity, hi = -Infinity
    cs.forEach(function (c) { lo = Math.min(lo, Number(c[2])); hi = Math.max(hi, Number(c[1])) })
    ;[level, trig, inv].forEach(function (p) { if (p !== null) { lo = Math.min(lo, p); hi = Math.max(hi, p) } })
    var pad = (hi - lo) * 0.05 || 1
    lo -= pad; hi += pad
    function y(p) { return T + (hi - p) / (hi - lo) * (H - T - B) }
    function x(i) { return L + step * (i + 0.5) }
    var bull = d.direction !== 'bearish'
    var out = []
    for (var g = 0; g <= 4; g++) {
      var gp = lo + (hi - lo) * g / 4
      out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gp).toFixed(1) + '" y2="' + y(gp).toFixed(1) + '" stroke="#e5e7eb" stroke-width="1"/>')
      out.push('<text x="' + (L - 6) + '" y="' + (y(gp) + 3).toFixed(1) + '" text-anchor="end" font-size="10" fill="#6b7280">' + gp.toFixed(2) + '</text>')
    }
    var ci = num(d.candle_idx)
    if (ci !== null && ci >= 0 && ci < n) {
      out.push('<rect x="' + (L + step * ci).toFixed(1) + '" y="' + T + '" width="' + step.toFixed(1) + '" height="' + (H - T - B) + '" fill="#f59e0b" opacity="0.18"/>')
      out.push('<text x="' + x(ci).toFixed(1) + '" y="' + (T + 9) + '" text-anchor="middle" font-size="9" fill="#b45309">reversal</text>')
    }
    cs.forEach(function (c, i) {
      var o = Number(c[0]), h = Number(c[1]), l = Number(c[2]), cl = Number(c[3])
      var col = cl >= o ? '#16a34a' : '#dc2626'
      out.push('<line x1="' + x(i).toFixed(1) + '" x2="' + x(i).toFixed(1) + '" y1="' + y(h).toFixed(1) + '" y2="' + y(l).toFixed(1) + '" stroke="' + col + '"/>')
      var top = y(Math.max(o, cl)), hgt = Math.max(1, Math.abs(y(o) - y(cl)))
      out.push('<rect x="' + (x(i) - bw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hgt.toFixed(1) + '" fill="' + col + '"/>')
    })
    var labels = []
    function hline(p, color, dash, label) {
      if (p === null) return
      out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(p).toFixed(1) + '" y2="' + y(p).toFixed(1) + '" stroke="' + color + '" stroke-width="1.5"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>')
      labels.push({ y: y(p), color: color, text: label + ' ' + p.toFixed(2) })
    }
    hline(level, bull ? '#0d9488' : '#9333ea', '', bull ? 'Support' : 'Resistance')
    hline(trig, '#d97706', '6 4', 'Confirm')
    hline(inv, '#9ca3af', '2 3', 'Fails')
    labels.sort(function (a, b) { return a.y - b.y })
    for (var q = 1; q < labels.length; q++) if (labels[q].y - labels[q - 1].y < 11) labels[q].y = labels[q - 1].y + 11  // keep close levels readable
    labels.forEach(function (lb) {
      out.push('<text x="' + (W - R + 4) + '" y="' + (lb.y + 3).toFixed(1) + '" font-size="10" fill="' + lb.color + '">' + escapeHtml(lb.text) + '</text>')
    })
    var dates = d.dates || []
    ;[0, Math.floor((n - 1) / 2), n - 1].forEach(function (i, k) {
      if (dates[i] === undefined) return
      out.push('<text x="' + x(i).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="' + (k === 0 ? 'start' : k === 2 ? 'end' : 'middle') + '" font-size="10" fill="#6b7280">' + escapeHtml(dates[i]) + '</text>')
    })
    var rs = d.rsi_series || []
    if (rs.length === n) {
      var oy = H + 6
      function ry(v) { return oy + (100 - v) / 100 * RH }
      out.push('<rect x="' + L + '" y="' + oy + '" width="' + plotW + '" height="' + RH + '" fill="#f9fafb" stroke="#e5e7eb"/>')
      ;[30, 70].forEach(function (g2) {
        out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ry(g2).toFixed(1) + '" y2="' + ry(g2).toFixed(1) + '" stroke="#d1d5db" stroke-dasharray="3 3"/>')
        out.push('<text x="' + (L - 6) + '" y="' + (ry(g2) + 3).toFixed(1) + '" text-anchor="end" font-size="9" fill="#9ca3af">' + g2 + '</text>')
      })
      var pts = []
      rs.forEach(function (v, i) { if (num(v) !== null) pts.push(x(i).toFixed(1) + ',' + ry(Number(v)).toFixed(1)) })
      if (pts.length > 1) out.push('<polyline points="' + pts.join(' ') + '" fill="none" stroke="#2563eb" stroke-width="1.5"/>')
      out.push('<text x="' + (W - R + 4) + '" y="' + (oy + 10) + '" font-size="10" fill="#2563eb">RSI</text>')
    }
    return '<svg viewBox="0 0 ' + W + ' ' + (H + RH + 10) + '" class="w-full max-w-3xl" role="img" aria-label="Price chart with the reversal candle and key levels">' + out.join('') + '</svg>'
  }

  function setupMetrics(d) {
    var bits = []
    if (num(d.rsi) !== null) bits.push('RSI ' + fix(d.rsi, 1) + (num(d.rsi_at_candle) !== null ? ' (' + fix(d.rsi_at_candle, 1) + ' at the candle)' : ''))
    if (num(d.stoch_k) !== null) bits.push('Stochastic %K ' + fix(d.stoch_k, 1) + ' / %D ' + fix(d.stoch_d, 1))
    if (num(d.macd_hist) !== null) bits.push('MACD histogram ' + fix(d.macd_hist, 3) + (d.macd_turning ? ' (turning with the setup)' : ' (not turning yet)'))
    if (d.trend) bits.push(String(d.trend))
    if (num(d.touches) !== null) bits.push(num(d.touches) + ' touches of the level')
    if (num(d.avg_volume) !== null) bits.push('avg volume ' + Number(d.avg_volume).toLocaleString())
    return bits.map(escapeHtml).join(' &middot; ')
  }

  function renderSetups(list) {
    return list.map(function (f, i) {
      var d = f.data || {}
      var bull = d.direction !== 'bearish'
      var dir = d.direction ? '<span class="ml-2 px-2 py-0.5 rounded text-xs font-semibold ' + (bull ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700') + '">' + (bull ? '&#9650; Bullish' : '&#9660; Bearish') + '</span>' : ''
      var etf = d.kind === 'etf' ? '<span class="ml-2 px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">ETF</span>' : ''
      var dim = f.status === 'failed' || f.status === 'expired' ? ' opacity-60' : ''
      var chart = chartSvg(d)
      var detail = (chart ? '<div class="mb-2">' + chart + '</div>' : '') +
        '<div class="text-sm text-gray-700 mb-2">' + setupMetrics(d) + '</div>' +
        '<div class="text-sm text-gray-600 mb-2">Reversal candle: ' + escapeHtml(d.candle_date || '') + (num(d.trigger) !== null ? ' &middot; confirms on a close ' + (bull ? 'above ' : 'below ') + money(d.trigger) : '') + (num(d.invalidation) !== null ? ' &middot; fails on a close ' + (bull ? 'below ' : 'above ') + money(d.invalidation) : '') + '</div>' +
        '<a href="' + escapeHtml(stockChartsUrl(f.ticker)) + '" target="_blank" rel="noopener" class="text-sm text-brand-teal underline"><i class="fas fa-external-link-alt mr-1"></i>Open ' + escapeHtml(f.ticker) + ' on StockCharts</a>'
      return '<div class="border-b border-gray-200' + dim + '">' +
        '<button type="button" data-discovery-row="' + i + '" class="w-full text-left py-3 hover:bg-gray-50 flex items-start gap-3">' +
        '<span class="font-bold w-20 shrink-0">' + escapeHtml(f.ticker) + '</span>' +
        '<span class="flex-1"><span class="text-gray-800">' + escapeHtml(f.headline) + '</span>' + dir + statusBadge(f.status) + etf + '</span>' +
        '<span class="text-sm text-gray-500 shrink-0">' + escapeHtml(fmtDate(d.candle_date ? d.candle_date + 'T12:00:00Z' : f.found_at)) + '</span></button>' +
        '<div id="discovery-detail-' + i + '" class="hidden pb-4 pl-24">' + detail + '</div></div>'
    }).join('')
  }

  function render(state, tab, now) {
    var scan = (state.scans || []).filter(function (s) { return s.scan_type === tab })[0]
    var list = (state.findings || []).filter(function (f) { return f.scan_type === tab })
    if (tab === 'setup') list = activeSetups(list, now)
    return {
      status: statusLine(scan, tab, now),
      list: list.length ? (tab === 'setup' ? renderSetups(list) : renderFindings(list)) : '<div class="text-gray-500 py-6 text-center">' + escapeHtml(TABS[tab].emptyText) + '</div>'
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

  var api = { escapeHtml: escapeHtml, render: render, statusLine: statusLine, loadDiscovery: loadDiscovery, setDiscoveryTab: setDiscoveryTab, TABS: TABS, chartSvg: chartSvg, activeSetups: activeSetups }
  root.escapeHtmlDiscovery = escapeHtml
  root.loadDiscovery = loadDiscovery
  root.setDiscoveryTab = setDiscoveryTab
  root.DiscoveryView = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
