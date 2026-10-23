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

  // The setup drawn: candles, the support/resistance level as a band with every touch marked, the arrival and reversal candles, the price that
  // confirms it and the price that kills it, RSI below.
  function chartSvg(d) {
    var cs = (d && d.candles) || []
    if (cs.length < 5) return ''
    var ok = cs.every(function (c) { return c && c.length === 4 && c.every(function (x) { return num(x) !== null }) })
    if (!ok) return ''
    var W = 640, H = 230, RH = 56, L = 54, R = 76, T = 8, B = 18
    var n = cs.length, plotW = W - L - R, step = plotW / n, bw = Math.max(2, step * 0.62)
    var level = num(d.level), band = num(d.band), trig = num(d.trigger), inv = num(d.invalidation)
    var lo = Infinity, hi = -Infinity
    cs.forEach(function (c) { lo = Math.min(lo, Number(c[2])); hi = Math.max(hi, Number(c[1])) })
    ;[level, band, trig, inv].forEach(function (p) { if (p !== null) { lo = Math.min(lo, p); hi = Math.max(hi, p) } })
    var pad = (hi - lo) * 0.05 || 1
    lo -= pad; hi += pad
    function y(p) { return T + (hi - p) / (hi - lo) * (H - T - B) }
    function x(i) { return L + step * (i + 0.5) }
    var bull = d.direction !== 'bearish'
    var lineCol = bull ? '#0d9488' : '#9333ea'
    var out = []
    for (var g = 0; g <= 4; g++) {
      var gp = lo + (hi - lo) * g / 4
      out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gp).toFixed(1) + '" y2="' + y(gp).toFixed(1) + '" stroke="#e5e7eb" stroke-width="1"/>')
      out.push('<text x="' + (L - 6) + '" y="' + (y(gp) + 3).toFixed(1) + '" text-anchor="end" font-size="10" fill="#6b7280">' + gp.toFixed(2) + '</text>')
    }
    var ci = num(d.candle_idx)
    if (ci !== null && ci >= 1 && ci < n) {
      out.push('<rect x="' + (L + step * (ci - 1)).toFixed(1) + '" y="' + T + '" width="' + step.toFixed(1) + '" height="' + (H - T - B) + '" fill="#9ca3af" opacity="0.2"/>')
      out.push('<rect x="' + (L + step * ci).toFixed(1) + '" y="' + T + '" width="' + step.toFixed(1) + '" height="' + (H - T - B) + '" fill="#f59e0b" opacity="0.2"/>')
      out.push('<text x="' + (L + step * ci).toFixed(1) + '" y="' + (T + 9) + '" text-anchor="end" font-size="9" fill="#6b7280">arrival</text>')
      out.push('<text x="' + (L + step * (ci + 1)).toFixed(1) + '" y="' + (T + 9) + '" text-anchor="start" font-size="9" fill="#b45309">reversal</text>')
    }
    if (level !== null && band !== null) {
      out.push('<rect x="' + L + '" y="' + Math.min(y(level), y(band)).toFixed(1) + '" width="' + plotW + '" height="' + Math.max(2, Math.abs(y(level) - y(band))).toFixed(1) + '" fill="' + lineCol + '" opacity="0.13"/>')
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
    hline(level, lineCol, '', bull ? 'Support' : 'Resistance')
    hline(trig, '#d97706', '6 4', 'Confirm')
    hline(inv, '#9ca3af', '2 3', 'Fails')
    labels.sort(function (a, b) { return a.y - b.y })
    for (var q = 1; q < labels.length; q++) if (labels[q].y - labels[q - 1].y < 11) labels[q].y = labels[q - 1].y + 11  // keep close levels readable
    labels.forEach(function (lb) {
      out.push('<text x="' + (W - R + 4) + '" y="' + (lb.y + 3).toFixed(1) + '" font-size="10" fill="' + lb.color + '">' + escapeHtml(lb.text) + '</text>')
    })
    // every touch that built the level (filled), and earlier swing points of the opposite kind at the same level (hollow)
    function dots(list, filled) {
      ;(list || []).forEach(function (pt) {
        var k = num(pt && pt[0]), p = num(pt && pt[1])
        if (k === null || p === null || k < 0 || k >= n) return
        out.push('<circle cx="' + x(k).toFixed(1) + '" cy="' + y(p).toFixed(1) + '" r="' + (filled ? 3.6 : 3) + '" fill="' + (filled ? lineCol : '#ffffff') + '" stroke="' + (filled ? '#ffffff' : lineCol) + '" stroke-width="1.2"/>')
      })
    }
    dots(d.flip_pts, false)
    dots(d.touch_pts, true)
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
    return '<svg viewBox="0 0 ' + W + ' ' + (H + RH + 10) + '" class="w-full max-w-3xl" role="img" aria-label="Price chart with the support or resistance level, its touches, and the arrival and reversal candles">' + out.join('') + '</svg>'
  }

  // Which of the three oscillators confirmed (2 of 3 are needed for a setup to be reported), then what the level is made of.
  function setupMetrics(d) {
    var c = d.confirmations
    var h = ''
    var bull = d.direction !== 'bearish'
    if (c && c.rsi && c.stoch && c.macd) {
      var part = function (ok, text, tip) {
        return '<span title="' + escapeHtml(tip) + '" class="' + (ok ? 'text-green-700 font-semibold' : 'text-gray-400') + '">' + (ok ? '&#10003; ' : '&#10007; ') + escapeHtml(text) + '</span>'
      }
      var n3 = [c.rsi, c.stoch, c.macd].filter(function (x) { return x && x.ok }).length
      h += '<div><strong>Confirming:</strong> ' +
        part(!!c.rsi.ok, 'RSI ' + fix(c.rsi.value, 1), bull ? 'RSI(14) at or below 30 within the 3 sessions up to the reversal candle' : 'RSI(14) at or above 70 within the 3 sessions up to the reversal candle') + ' &middot; ' +
        part(!!c.stoch.ok, 'Stochastic %K ' + fix(c.stoch.k, 1), bull ? 'Slow %K at or below 20 within 5 sessions and turning up at the reversal candle' : 'Slow %K at or above 80 within 5 sessions and turning down at the reversal candle') + ' &middot; ' +
        part(!!c.macd.ok, 'MACD histogram ' + fix(c.macd.hist, 3), bull ? 'MACD histogram rising at the reversal candle' : 'MACD histogram falling at the reversal candle') +
        ' <span class="text-gray-500">(' + n3 + ' of 3 confirm; 2 are needed)</span></div>'
    }
    var bits = []
    if (num(d.touches) !== null) {
      var flips = (d.flip_pts || []).length
      bits.push((bull ? 'Support' : 'Resistance') + ': ' + num(d.touches) + ' touches' + (d.basis ? ' (' + d.basis + ')' : '') + (flips ? ', also acted as ' + (bull ? 'resistance' : 'support') + ' ' + flips + (flips === 1 ? ' time' : ' times') : ''))
    }
    if (d.trend) bits.push(String(d.trend))
    if (num(d.avg_volume) !== null) bits.push('avg volume ' + Number(d.avg_volume).toLocaleString())
    return h + (bits.length ? '<div class="mt-1">' + bits.map(escapeHtml).join(' &middot; ') + '</div>' : '')
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
        '<div class="text-sm text-gray-600 mb-2">' + (d.arrival_date ? 'Arrival candle: ' + escapeHtml(d.arrival_date) + ' &middot; ' : '') + 'Reversal candle: ' + escapeHtml(d.candle_date || '') + (num(d.trigger) !== null ? ' &middot; confirms when price trades ' + (bull ? 'above ' : 'below ') + money(d.trigger) : '') + (num(d.invalidation) !== null ? ' &middot; fails on a close ' + (bull ? 'below ' : 'above ') + money(d.invalidation) : '') + '</div>' +
        '<a href="' + escapeHtml(stockChartsUrl(f.ticker)) + '" target="_blank" rel="noopener" class="text-sm text-brand-teal underline"><i class="fas fa-external-link-alt mr-1"></i>Open ' + escapeHtml(f.ticker) + ' on StockCharts</a>'
      return '<div class="border-b border-gray-200' + dim + '">' +
        '<button type="button" data-discovery-row="' + i + '" class="w-full text-left py-3 hover:bg-gray-50 flex items-start gap-3">' +
        '<span class="font-bold w-20 shrink-0">' + escapeHtml(f.ticker) + '</span>' +
        '<span class="flex-1"><span class="text-gray-800">' + escapeHtml(f.headline) + '</span>' + dir + statusBadge(f.status) + etf + '</span>' +
        '<span class="text-sm text-gray-500 shrink-0">' + escapeHtml(fmtDate(d.candle_date ? d.candle_date + 'T12:00:00Z' : f.found_at)) + '</span></button>' +
        '<div id="discovery-detail-' + i + '" class="hidden pb-4 pl-24">' + detail + '</div></div>'
    }).join('')
  }

  // The rules, posted on the page. Both versions are in the page; the toggle only shows one (no repaint, so an opened panel stays open).
  var RULES = {
    bullish: {
      name: 'Bullish (bounce off support)',
      items: [
        ['Support level', 'At least 3 swing lows (each the lowest of the 4 sessions either side of it) that sit within 0.75 ATR of each other. Each must have been followed by a bounce of at least 0.75 ATR within 5 sessions, so it really acted as support, and all of them must come before the reversal candle. The chart covers 6 months and so does the search. Wicks or closes, whichever fits the line better. Earlier swing highs at the same price (old resistance) only add supporting evidence.'],
        ['Arrival candle', 'A down candle (closes below its open and below the prior close) that is the lowest close of the last 5 sessions, closes in the lower half of its range (not a hammer), and closes inside the support band.'],
        ['Run into support', 'At least 3 down closes in the last 5 sessions, and the arrival close is lower than the close 5 sessions earlier.'],
        ['Reversal candle', 'The next session: an up candle that closes above the arrival close and in the upper half of its range, has a range of at least 0.4 ATR, whose low held inside the support band, and which closes at or above the support line.'],
        ['Oscillators: 2 of 3', 'RSI(14) at or below 30 within the 3 sessions up to the reversal candle. Slow Stochastic (14,3,3) %K at or below 20 within 5 sessions and turning up on the reversal candle. MACD(12,26,9) histogram rising on the reversal candle. Any two are enough, and each row says which ones confirmed.'],
        ['Confirmation', 'Within 3 sessions, price trades one cent above the high of the reversal candle. The scan runs about an hour after the open, so the partial bar for today can confirm.'],
        ['Fails / lapses', 'It fails on a close below the low of the reversal candle before it has confirmed. It lapses if 3 sessions pass with neither. Within one session, confirming wins over the close of that session.']
      ]
    },
    bearish: {
      name: 'Bearish (rejection at resistance)',
      items: [
        ['Resistance level', 'At least 3 swing highs (each the highest of the 4 sessions either side of it) that sit within 0.75 ATR of each other. Each must have been followed by a drop of at least 0.75 ATR within 5 sessions, so it really acted as resistance, and all of them must come before the reversal candle. The chart covers 6 months and so does the search. Wicks or closes, whichever fits the line better. Earlier swing lows at the same price (old support) only add supporting evidence.'],
        ['Arrival candle', 'An up candle (closes above its open and above the prior close) that is the highest close of the last 5 sessions, closes in the upper half of its range (not a shooting star), and closes inside the resistance band.'],
        ['Run into resistance', 'At least 3 up closes in the last 5 sessions, and the arrival close is higher than the close 5 sessions earlier.'],
        ['Reversal candle', 'The next session: a down candle that closes below the arrival close and in the lower half of its range, has a range of at least 0.4 ATR, whose high held inside the resistance band, and which closes at or below the resistance line.'],
        ['Oscillators: 2 of 3', 'RSI(14) at or above 70 within the 3 sessions up to the reversal candle. Slow Stochastic (14,3,3) %K at or above 80 within 5 sessions and turning down on the reversal candle. MACD(12,26,9) histogram falling on the reversal candle. Any two are enough, and each row says which ones confirmed.'],
        ['Confirmation', 'Within 3 sessions, price trades one cent below the low of the reversal candle. The scan runs about an hour after the open, so the partial bar for today can confirm.'],
        ['Fails / lapses', 'It fails on a close above the high of the reversal candle before it has confirmed. It lapses if 3 sessions pass with neither. Within one session, confirming wins over the close of that session.']
      ]
    }
  }

  function rulesPanel() {
    var btn = function (side, on) {
      return '<button type="button" data-rules-side="' + side + '" class="px-3 py-1 text-sm font-semibold ' + (on ? RULES_ON : RULES_OFF) + '">' + (side === 'bullish' ? '&#9650; Bullish' : '&#9660; Bearish') + '</button>'
    }
    var pane = function (side, shown) {
      var r = RULES[side]
      return '<div data-rules-pane="' + side + '" class="' + (shown ? '' : 'hidden') + '"><div class="font-semibold text-gray-800 mb-2">' + escapeHtml(r.name) + '</div><ol class="list-decimal pl-5 space-y-2">' +
        r.items.map(function (it) { return '<li><span class="font-semibold">' + escapeHtml(it[0]) + '.</span> ' + escapeHtml(it[1]) + '</li>' }).join('') + '</ol></div>'
    }
    return '<details class="mb-4 border border-gray-200 rounded bg-gray-50" data-rules-panel>' +
      '<summary class="cursor-pointer px-4 py-2 font-semibold text-gray-700">How these setups are found</summary>' +
      '<div class="px-4 pb-4 text-sm text-gray-700">' +
      '<div class="inline-flex rounded border border-gray-300 overflow-hidden mb-3">' + btn('bullish', true) + btn('bearish', false) + '</div>' +
      pane('bullish', true) + pane('bearish', false) +
      '<div class="mt-3 text-gray-500">ATR = average true range over 14 sessions. The scan covers the companies on the research roster plus 30 liquid ETFs (average volume of 250,000 or more), on weekdays after 8:35 a.m. Edmonton time. A reversal candle that follows within 3 sessions of an earlier one at the same level is treated as part of the same bounce. The oscillators are on the StockCharts link for every row.</div>' +
      '</div></details>'
  }

  var RULES_ON = 'bg-brand-teal text-white', RULES_OFF = 'bg-white text-gray-700 hover:bg-gray-100'

  // Show one side's rules; used by the toggle buttons.
  function rulesSwitch(container, side) {
    container.querySelectorAll('[data-rules-pane]').forEach(function (p) { p.classList.toggle('hidden', p.getAttribute('data-rules-pane') !== side) })
    container.querySelectorAll('[data-rules-side]').forEach(function (b) {
      var on = b.getAttribute('data-rules-side') === side
      b.className = 'px-3 py-1 text-sm font-semibold ' + (on ? RULES_ON : RULES_OFF)
    })
  }

  function render(state, tab, now) {
    var scan = (state.scans || []).filter(function (s) { return s.scan_type === tab })[0]
    var list = (state.findings || []).filter(function (f) { return f.scan_type === tab })
    if (tab === 'setup') list = activeSetups(list, now)
    return {
      status: statusLine(scan, tab, now),
      list: (tab === 'setup' ? rulesPanel() : '') + (list.length ? (tab === 'setup' ? renderSetups(list) : renderFindings(list)) : '<div class="text-gray-500 py-6 text-center">' + escapeHtml(TABS[tab].emptyText) + '</div>')
    }
  }

  var current = { tab: 'guru', data: { scans: [], findings: [] } }

  function paint() {
    var doc = root.document
    var out = render(current.data, current.tab)
    doc.getElementById('discovery-status').innerHTML = out.status
    var list = doc.getElementById('discovery-list')
    list.innerHTML = out.list
    list.querySelectorAll('[data-rules-side]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); rulesSwitch(list, b.getAttribute('data-rules-side')) })
    })
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

  var api = { escapeHtml: escapeHtml, render: render, statusLine: statusLine, loadDiscovery: loadDiscovery, setDiscoveryTab: setDiscoveryTab, TABS: TABS, chartSvg: chartSvg, activeSetups: activeSetups, rulesSwitch: rulesSwitch }
  root.escapeHtmlDiscovery = escapeHtml
  root.loadDiscovery = loadDiscovery
  root.setDiscoveryTab = setDiscoveryTab
  root.DiscoveryView = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
