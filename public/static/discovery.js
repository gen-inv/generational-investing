// Utilities > Discovery: what the weekly scans found, and when they last ran.
// Everything shown comes from an AI agent, so every value is escaped before it touches the page.
(function (root) {
  var TABS = {
    guru: { label: 'Guru purchases', emptyText: 'No guru purchases have been reported yet. The scan runs weekly and only reports companies that pass the Quick-5.', every: 7 },
    maturing: { label: "Gov't contracts", emptyText: "No government-contract candidates have been reported yet.", every: 7 },
    setup: { label: 'Trade setups', emptyText: 'No trade setups right now. The screen runs each weekday morning; a confirmed setup stays listed for two more sessions.', every: 2, unit: 'setups' }
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

  // Time of day, in the viewer's own time zone. Only for timestamps that carry a time zone (a bare "2026-10-23 15:02:46" would be misread).
  function fmtTime(iso) {
    if (!/T.*(Z|[+-]\d\d:?\d\d)$/.test(String(iso || ''))) return ''
    var d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  }

  function daysAgo(iso, now) {
    var t = Date.parse(iso)
    if (isNaN(t)) return null
    return Math.floor(((now || Date.now()) - t) / 86400000)
  }

  // The last weekday before the day a scan ran (YYYY-MM-DD, UTC date of the run). A reversal candle on or after it is news; older ones are not.
  function prevTradingDay(iso) {
    var t = Date.parse(iso)
    if (isNaN(t)) return null
    var d = new Date(t)
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    do { d.setUTCDate(d.getUTCDate() - 1) } while (d.getUTCDay() === 0 || d.getUTCDay() === 6)
    return d.toISOString().slice(0, 10)
  }

  // Trade setups: say only whether the latest run found anything new, never what is still active. New = its reversal candle is from the latest
  // session (found_at is not used: the scanner re-stamps it when a setup changes status, e.g. waiting -> confirmed).
  function newSetupsText(scan, findings) {
    var since = prevTradingDay(scan.last_run_at)
    var seen = {}, names = []
    ;(findings || []).forEach(function (f) {
      var c = f.data && f.data.candle_date
      if (!since || typeof c !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c) || c < since || seen[f.ticker]) return
      seen[f.ticker] = true; names.push(f.ticker)
    })
    if (!names.length) return '<span data-new-setups="none">Nothing new</span>'
    return '<span data-new-setups="found" class="text-green-700 font-semibold">Found ' + names.length + ' new ' + (names.length === 1 ? 'setup' : 'setups') + ': ' + names.map(escapeHtml).join(', ') + '</span>'
  }

  function statusLine(scan, tab, now, findings) {
    if (!scan) return '<span class="text-gray-500">This scan has not reported in yet.</span>'
    var ago = daysAgo(scan.last_run_at, now)
    var when = fmtDate(scan.last_run_at) + (fmtTime(scan.last_run_at) ? ', ' + fmtTime(scan.last_run_at) : '')
    var stale = ago !== null && ago > TABS[tab].every * 2
    var bits = ['<strong>Last ran:</strong> ' + escapeHtml(when)]
    if (tab === 'setup') {
      bits.push(newSetupsText(scan, findings))
    } else {
      if (scan.gurus_scanned != null) bits.push(escapeHtml(scan.gurus_scanned) + ' gurus scanned')
      if (scan.candidates_found != null) bits.push(escapeHtml(scan.candidates_found) + ' ' + (TABS[tab].unit || 'candidates examined'))
    }
    var out = bits.join(' &middot; ')
    if (scan.note && tab !== 'setup') out += '<div class="text-gray-500">' + escapeHtml(scan.note) + '</div>'
    if (stale) out += '<div class="text-red-600 font-semibold">This scan is overdue &mdash; it should run about every ' + TABS[tab].every + ' days.</div>'
    return out
  }

  var STATUS = {
    alerted: ['Alerted', 'bg-gray-200 text-gray-700'],
    added: ['Added to roster', 'bg-green-100 text-green-800'],
    declined: ['Passed on', 'bg-gray-100 text-gray-500'],
    potential_override: ['Potential override', 'bg-amber-100 text-amber-800'],
    candidate: ['Awaiting trigger', 'bg-amber-100 text-amber-800'],
    triggered: ['Triggered', 'bg-blue-100 text-blue-800'],
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

  var MAX_CONFIRMED_AGE = 2

  // Trading sessions since a date (YYYY-MM-DD): the weekdays after it up to and including today (UTC date of now), less today's own, which has not closed.
  function sessionsSince(ymd, now) {
    if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
    var start = Date.parse(ymd + 'T00:00:00Z')
    var end = Date.parse(new Date(now || Date.now()).toISOString().slice(0, 10) + 'T00:00:00Z')
    if (isNaN(start)) return null
    var n = 0
    for (var t = start + 86400000; t <= end; t += 86400000) { var w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) n++ }
    return Math.max(0, n - 1)
  }

  // A reversal candle that never resolved (the scan missed days) is shown as expired once it is a week old, and so is a confirmed setup
  // whose confirming close is more than 2 sessions old (too late to act on).
  function effectiveStatus(f, now) {
    var d = f.data || {}
    var t = Date.parse(d.candle_date || f.found_at)
    if (f.status === 'candidate' && !isNaN(t) && ((now || Date.now()) - t) / 86400000 > 6) return 'expired'
    if (f.status === 'confirmed') {
      var age = sessionsSince(d.confirm_date, now)
      if (age !== null && age > MAX_CONFIRMED_AGE) return 'expired'
    }
    return f.status
  }

  function activeSetups(list, now) {
    var cutoff = (now || Date.now()) - 14 * 86400000
    var order = { confirmed: 0, triggered: 1, candidate: 2, failed: 3, expired: 4 }
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
      if (d.arrival_date) {
        out.push('<rect x="' + (L + step * (ci - 1)).toFixed(1) + '" y="' + T + '" width="' + step.toFixed(1) + '" height="' + (H - T - B) + '" fill="#9ca3af" opacity="0.2"/>')
        out.push('<text x="' + (L + step * ci).toFixed(1) + '" y="' + (T + 9) + '" text-anchor="end" font-size="9" fill="#6b7280">prior</text>')
      }
      out.push('<rect x="' + (L + step * ci).toFixed(1) + '" y="' + T + '" width="' + step.toFixed(1) + '" height="' + (H - T - B) + '" fill="#f59e0b" opacity="0.2"/>')
      out.push('<text x="' + (L + step * (ci + 1)).toFixed(1) + '" y="' + (T + 9) + '" text-anchor="start" font-size="9" fill="#b45309">signal</text>')
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
    hline(trig, '#d97706', '6 4', 'Trigger')
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
      ;[35, 65].forEach(function (g2) {
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

  // Which of the three oscillators confirmed (at least 1 of 3 is needed for a setup to be reported), then what the level is made of.
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
        part(!!c.rsi.ok, 'RSI ' + fix(c.rsi.value, 1), bull ? 'RSI(14) at or below 35 within the 3 sessions up to the signal candle' : 'RSI(14) at or above 65 within the 3 sessions up to the signal candle') + ' &middot; ' +
        part(!!c.stoch.ok, 'Stochastic %K ' + fix(c.stoch.k, 1), bull ? 'Slow %K at or below 20 within 5 sessions and turning up at the signal candle' : 'Slow %K at or above 80 within 5 sessions and turning down at the signal candle') + ' &middot; ' +
        part(!!c.macd.ok, 'MACD histogram ' + fix(c.macd.hist, 3), bull ? 'MACD histogram rising at the signal candle' : 'MACD histogram falling at the signal candle') +
        ' <span class="text-gray-500">(' + n3 + ' of 3 confirm; at least 1 is needed)</span></div>'
    }
    var bits = []
    if (num(d.touches) !== null) {
      var flips = (d.flip_pts || []).length
      if (num(d.own_touches) !== null) {
        bits.push((bull ? 'Support' : 'Resistance') + ': ' + num(d.touches) + ' touches' + (d.basis ? ' (' + d.basis + ')' : '') + (flips ? ', ' + flips + ' of them where it acted as ' + (bull ? 'resistance' : 'support') : ''))
      } else {
        bits.push((bull ? 'Support' : 'Resistance') + ': ' + num(d.touches) + ' touches' + (d.basis ? ' (' + d.basis + ')' : '') + (flips ? ', also acted as ' + (bull ? 'resistance' : 'support') + ' ' + flips + (flips === 1 ? ' time' : ' times') : ''))
      }
    }
    if (d.trend) bits.push(String(d.trend))
    if (num(d.avg_volume) !== null) bits.push('avg volume ' + Number(d.avg_volume).toLocaleString())
    return h + (bits.length ? '<div class="mt-1">' + bits.map(escapeHtml).join(' &middot; ') + '</div>' : '')
  }

  // Next earnings (stocks only; an ETF has none and already carries its own badge). Days are counted from the viewer's today.
  function earningsInfo(d, now) {
    if (!d || d.kind === 'etf') return null
    var unknown = { short: 'Earnings unknown', long: 'Next earnings date unavailable', cls: 'bg-gray-100 text-gray-500', days: null }
    var e = d.next_earnings
    if (!e || typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return unknown
    var base = Date.parse(e.date + 'T12:00:00Z')
    var t = new Date(now || Date.now())
    var days = Math.round((Date.parse(e.date + 'T00:00:00Z') - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000)
    if (isNaN(base) || isNaN(days) || days < 0) return unknown
    var est = !!e.estimate
    var short = new Date(base).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
    var full = new Date(base).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
    var when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days'
    return {
      short: 'Earnings ' + (est ? '~' : '') + short + ' (' + when + (est ? ', estimate' : '') + ')',
      long: 'Next earnings: ' + full + (est ? ' (estimated date)' : ' (confirmed date)') + ' - ' + when,
      cls: days <= 14 ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800',
      days: days
    }
  }

  // "Signal candle: Hammer on 2026-11-03 | triggers when price trades above $X | triggered <date> | confirmed <date> | fails on a close below $Y"
  function signalLine(d, bull) {
    var name = d.pattern ? String(d.pattern) : 'Reversal candle'
    name = name.charAt(0).toUpperCase() + name.slice(1)
    var parts = [(d.arrival_date ? 'First candle: ' + escapeHtml(d.arrival_date) + ' &middot; ' : '') + 'Signal candle: ' + escapeHtml(name) + ' on ' + escapeHtml(d.candle_date || '')]
    if (num(d.trigger) !== null) parts.push('triggers when price trades ' + (bull ? 'above ' : 'below ') + money(d.trigger))
    if (typeof d.trigger_date === 'string' && d.trigger_date) parts.push('triggered ' + escapeHtml(d.trigger_date))
    if (typeof d.confirm_date === 'string' && d.confirm_date) parts.push('confirmed ' + escapeHtml(d.confirm_date) + ' (closed ' + (bull ? 'above ' : 'below ') + money(d.trigger) + ')')
    if (num(d.invalidation) !== null) parts.push('fails on a close ' + (bull ? 'below ' : 'above ') + money(d.invalidation))
    return parts.join(' &middot; ')
  }

  function renderSetups(list, now) {
    return list.map(function (f, i) {
      var d = f.data || {}
      var bull = d.direction !== 'bearish'
      var dir = d.direction ? '<span class="ml-2 px-2 py-0.5 rounded text-xs font-semibold ' + (bull ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700') + '">' + (bull ? '&#9650; Bullish' : '&#9660; Bearish') + '</span>' : ''
      var etf = d.kind === 'etf' ? '<span class="ml-2 px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">ETF</span>' : ''
      var ei = earningsInfo(d, now)
      var earn = ei ? '<span data-earnings class="ml-2 px-2 py-0.5 rounded text-xs ' + ei.cls + '">' + escapeHtml(ei.short) + '</span>' : ''
      var vm = num(d.volume_multiple)
      var vol = vm !== null ? '<span data-volume class="ml-2 px-2 py-0.5 rounded text-xs ' + (d.high_volume ? 'bg-purple-100 text-purple-800 font-semibold' : 'bg-gray-100 text-gray-500') + '" title="Volume on the signal candle as a multiple of the previous 20-session average (information only)">Volume ' + vm.toFixed(1) + 'x</span>' : ''
      var dim = f.status === 'failed' || f.status === 'expired' ? ' opacity-60' : ''
      var chart = chartSvg(d)
      var detail = (chart ? '<div class="mb-2">' + chart + '</div>' : '') +
        '<div class="text-sm text-gray-700 mb-2">' + setupMetrics(d) + '</div>' +
        '<div class="text-sm text-gray-600 mb-2">' + signalLine(d, bull) + '</div>' +
        (ei ? '<div class="text-sm text-gray-600 mb-2">' + escapeHtml(ei.long) + '</div>' : '') +
        '<a href="' + escapeHtml(stockChartsUrl(f.ticker)) + '" target="_blank" rel="noopener" class="text-sm text-brand-teal underline"><i class="fas fa-external-link-alt mr-1"></i>Open ' + escapeHtml(f.ticker) + ' on StockCharts</a>'
      return '<div class="border-b border-gray-200' + dim + '">' +
        '<button type="button" data-discovery-row="' + i + '" class="w-full text-left py-3 hover:bg-gray-50 flex items-start gap-3">' +
        '<span class="font-bold w-20 shrink-0">' + escapeHtml(f.ticker) + '</span>' +
        '<span class="flex-1"><span class="text-gray-800">' + escapeHtml(f.headline) + '</span>' + dir + statusBadge(f.status) + vol + earn + etf + '</span>' +
        '<span class="text-sm text-gray-500 shrink-0">' + escapeHtml(fmtDate(d.candle_date ? d.candle_date + 'T12:00:00Z' : f.found_at)) + '</span></button>' +
        '<div id="discovery-detail-' + i + '" class="hidden pb-4 pl-24">' + detail + '</div></div>'
    }).join('')
  }

  // The rules, posted on the page. Both versions are in the page; the toggle only shows one (no repaint, so an opened panel stays open).
  var RULES = {
    bullish: {
      name: 'Bullish (bounce off support)',
      items: [
        ['Support level', 'At least 3 touches of one horizontal line, all before the signal candle. Each touch lies within 0.4 ATR of the line (so the band is at most 0.8 ATR wide) and the touches are at least 3 sessions apart. The chart covers 6 months and so does the search. A touch is a swing low (the lowest of the 4 sessions either side of it) followed by a bounce of at least 0.75 ATR within 5 sessions, and it can be a wick or a candle body, whichever fits. Earlier swing highs at the same price (old resistance that became support) count as touches too, but at least 2 touches must be real swing lows. A spring is allowed: a wick may poke up to 1 ATR below the level as long as the candle closes back at or above it.'],
        ['Run into support', 'At least 3 down closes in the 5 sessions before the signal candle, and the close just before it is lower than the close 6 sessions earlier. (For the two-candle reversal this is counted up to the arrival candle.)'],
        ['Signal candle', 'Any one of these. Two-candle reversal (the original rule): an arrival candle at the level, a down candle that is the lowest close of the last 5 sessions and closes in the lower half of its range (not a hammer), followed by an up candle that closes above the arrival close in the upper half of its range; the second candle is the signal candle. A hammer: a small body (35% of the range or less, any colour), a lower shadow at least twice the body and at least half the range, and a very small upper shadow, after a decline. Or a bullish engulfing: a green candle whose body covers the body of the previous red candle (shadows do not matter) and is larger than it. The low of the candle (of both candles, for an engulfing) must be at the support level. Its range must be at least 0.4 ATR, and it must close at or above the support line.'],
        ['Oscillators: at least 1 of 3', 'RSI(14) at or below 35 within the 3 sessions up to the signal candle. Slow Stochastic (14,3,3) %K at or below 20 within 5 sessions and turning up on the signal candle. MACD(12,26,9) histogram rising on the signal candle. Any one is enough (back-testing showed the level holds just as often with none, one or two), and each row says which ones confirmed.'],
        ['Alert', 'The alert fires on the signal candle itself, before any follow-through.'],
        ['Triggered', 'Within 3 sessions, price trades one cent above the high of the signal candle. The scan runs about an hour after the open, so the partial bar for today counts.'],
        ['Confirmed', 'A session after the signal candle closes above the high of the signal candle.'],
        ['Fails / lapses', 'It fails on a close below the low of the signal candle before it has confirmed. It lapses if 3 sessions pass with neither.'],
        ['Volume badge', 'Volume on the signal candle as a multiple of the previous 20-session average, highlighted at 1.5x or more. For a hammer or hanging man it is also a rule: it needs at least 1.5 times the average volume to count at all. For the other patterns it is information only and never removes a setup.']
      ]
    },
    bearish: {
      name: 'Bearish (rejection at resistance)',
      items: [
        ['Resistance level', 'At least 3 touches of one horizontal line, all before the signal candle. Each touch lies within 0.4 ATR of the line (so the band is at most 0.8 ATR wide) and the touches are at least 3 sessions apart. The chart covers 6 months and so does the search. A touch is a swing high (the highest of the 4 sessions either side of it) followed by a drop of at least 0.75 ATR within 5 sessions, and it can be a wick or a candle body, whichever fits. Earlier swing lows at the same price (old support that became resistance) count as touches too, but at least 2 touches must be real swing highs. A spring is allowed: a wick may poke up to 1 ATR above the level as long as the candle closes back at or below it.'],
        ['Run into resistance', 'At least 3 up closes in the 5 sessions before the signal candle, and the close just before it is higher than the close 6 sessions earlier. (For the two-candle reversal this is counted up to the arrival candle.)'],
        ['Signal candle', 'Any one of these. Two-candle reversal (the original rule): an arrival candle at the level, an up candle that is the highest close of the last 5 sessions and closes in the upper half of its range (not a shooting star), followed by a down candle that closes below the arrival close in the lower half of its range; the second candle is the signal candle. A hanging man: the same shape as a hammer (small body, lower shadow at least twice the body and half the range, very small upper shadow) but after a rally. Or a bearish engulfing: a red candle whose body covers the body of the previous green candle (shadows do not matter) and is larger than it. The high of the candle (of both candles, for an engulfing) must be at the resistance level. Its range must be at least 0.4 ATR, and it must close at or below the resistance line.'],
        ['Oscillators: at least 1 of 3', 'RSI(14) at or above 65 within the 3 sessions up to the signal candle. Slow Stochastic (14,3,3) %K at or above 80 within 5 sessions and turning down on the signal candle. MACD(12,26,9) histogram falling on the signal candle. Any one is enough (back-testing showed the level holds just as often with none, one or two), and each row says which ones confirmed.'],
        ['Alert', 'The alert fires on the signal candle itself, before any follow-through.'],
        ['Triggered', 'Within 3 sessions, price trades one cent below the low of the signal candle. The scan runs about an hour after the open, so the partial bar for today counts.'],
        ['Confirmed', 'A session after the signal candle closes below the low of the signal candle.'],
        ['Fails / lapses', 'It fails on a close above the high of the signal candle before it has confirmed. It lapses if 3 sessions pass with neither.'],
        ['Volume badge', 'Volume on the signal candle as a multiple of the previous 20-session average, highlighted at 1.5x or more. For a hammer or hanging man it is also a rule: it needs at least 1.5 times the average volume to count at all. For the other patterns it is information only and never removes a setup.']
      ]
    }
  }

  // ---- The ETFs the trade-setup scan covers besides the roster. They live on the site; the research machine reads them before every scan. ----
  var ETF_RE = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/
  var MAX_ETFS = 200

  function etfUrl() { return base() + '/api/research/discovery/etfs' }

  // The saved list, or null when it cannot be read (never throws).
  async function fetchEtfs() {
    try {
      var res = await root.axios.get(etfUrl())
      var t = res && res.data && res.data.tickers
      return Array.isArray(t) ? t.map(String) : null
    } catch (e) { return null }
  }

  // "spy, qqq  xle" -> { ok: ['SPY', 'QQQ', 'XLE'], bad: [] }
  function parseTickers(text) {
    var ok = [], bad = []
    String(text == null ? '' : text).toUpperCase().split(/[\s,;]+/).forEach(function (t) {
      if (!t) return
      if (ETF_RE.test(t)) { if (ok.indexOf(t) < 0) ok.push(t) } else if (bad.indexOf(t) < 0) bad.push(t)
    })
    return { ok: ok, bad: bad }
  }

  function universeHtml(etfs) {
    var n = Array.isArray(etfs) ? etfs.length : null
    return 'The scan covers every company on your Company Roster plus your list of liquid ETFs' + (n === null ? '' : ' (' + n + (n === 1 ? ' ETF' : ' ETFs') + ')') +
      '. An ETF is skipped when its average daily volume is under 250,000 shares. The scan runs on weekdays after 8:35 a.m. Edmonton time, and a change to the ETF list takes effect at the next run. ' +
      '<button type="button" data-etf-edit class="text-brand-teal underline font-semibold">Edit ETF list</button>'
  }

  function etfModalHtml(draft, msg) {
    var chips = draft.length ? draft.map(function (t) {
      return '<span class="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-800 text-sm border border-blue-200">' + escapeHtml(t) +
        '<button type="button" data-etf-remove="' + escapeHtml(t) + '" class="text-blue-500 hover:text-red-600 font-bold" aria-label="Remove ' + escapeHtml(t) + '">&times;</button></span>'
    }).join('') : '<span class="text-gray-500 text-sm">No ETFs on the list: the scan will cover only your Company Roster.</span>'
    return '<div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" role="dialog" aria-modal="true" aria-label="ETF list for trade setups">' +
      '<div class="px-5 py-3 bg-brand-teal text-white rounded-t-lg flex justify-between items-center"><span class="font-semibold">ETF list for trade setups</span>' +
      '<button type="button" data-etf-cancel class="text-xl leading-none" aria-label="Close">&times;</button></div>' +
      '<div class="p-5 overflow-y-auto text-sm text-gray-700">' +
      '<p class="mb-3">These ETFs are scanned along with your Company Roster. Add tickers separated by spaces or commas. An ETF with an average daily volume under 250,000 shares is skipped even when it is listed. Changes take effect at the next scan.</p>' +
      '<div class="flex gap-2 mb-2"><input type="text" data-etf-input class="flex-1 border border-gray-300 rounded px-3 py-2" placeholder="e.g. XME, KWEB" autocomplete="off" maxlength="200">' +
      '<button type="button" data-etf-add class="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 font-semibold">Add</button></div>' +
      '<div data-etf-msg class="mb-2 min-h-[1.25rem] ' + (msg && msg.error ? 'text-red-600' : 'text-gray-500') + '">' + escapeHtml(msg ? msg.text : '') + '</div>' +
      '<div class="flex flex-wrap gap-2">' + chips + '</div>' +
      '<div class="mt-3 text-gray-500" data-etf-count>' + draft.length + (draft.length === 1 ? ' ETF' : ' ETFs') + ' on the list</div></div>' +
      '<div class="px-5 py-3 border-t flex justify-end gap-2"><button type="button" data-etf-cancel class="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 font-semibold">Cancel</button>' +
      '<button type="button" data-etf-save class="px-4 py-2 rounded bg-brand-teal text-white font-semibold">Save list</button></div></div>'
  }

  async function openEtfModal() {
    var doc = root.document
    var old = doc.getElementById('etf-modal')
    if (old) old.remove()
    var overlay = doc.createElement('div')
    overlay.id = 'etf-modal'
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-40'
    overlay.innerHTML = '<div class="bg-white rounded-lg p-6 text-gray-600">Loading...</div>'
    doc.body.appendChild(overlay)
    function onKey(e) { if (e.key === 'Escape') close() }
    function close() { doc.removeEventListener('keydown', onKey); overlay.remove() }
    doc.addEventListener('keydown', onKey)
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close() })
    var draft = await fetchEtfs()
    if (draft === null) {
      overlay.innerHTML = '<div class="bg-white rounded-lg p-6 text-red-600">Could not load the ETF list. <button type="button" data-etf-cancel class="underline ml-2">Close</button></div>'
      overlay.querySelectorAll('[data-etf-cancel]').forEach(function (b) { b.addEventListener('click', close) })
      return
    }
    function draw(msg, keepText) {
      draft.sort()
      overlay.innerHTML = etfModalHtml(draft, msg)
      var input = overlay.querySelector('[data-etf-input]')
      if (input && keepText) input.value = keepText
      overlay.querySelectorAll('[data-etf-cancel]').forEach(function (b) { b.addEventListener('click', close) })
      overlay.querySelectorAll('[data-etf-remove]').forEach(function (b) {
        b.addEventListener('click', function () { var t = b.getAttribute('data-etf-remove'); draft = draft.filter(function (x) { return x !== t }); draw() })
      })
      function add() {
        var p = parseTickers(input.value)
        var fresh = p.ok.filter(function (t) { return draft.indexOf(t) < 0 })
        if (draft.length + fresh.length > MAX_ETFS) { draw({ error: true, text: 'The list can hold up to ' + MAX_ETFS + ' ETFs.' }, input.value); return }
        fresh.sort()
        draft = draft.concat(fresh)
        var text = (fresh.length ? 'Added ' + fresh.join(', ') + '. ' : (p.ok.length ? 'Already on the list. ' : '')) + (p.bad.length ? 'Not a ticker: ' + p.bad.join(', ') : '')
        draw(text ? { error: p.bad.length > 0, text: text.trim() } : null, p.bad.length ? p.bad.join(' ') : '')
        var again = overlay.querySelector('[data-etf-input]')
        if (again) again.focus()
      }
      overlay.querySelector('[data-etf-add]').addEventListener('click', add)
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add() } })
      overlay.querySelector('[data-etf-save]').addEventListener('click', async function (e) {
        var btn = e.currentTarget
        btn.disabled = true
        try {
          var res = await root.axios.put(etfUrl(), { tickers: draft })
          current.etfs = (res && res.data && Array.isArray(res.data.tickers)) ? res.data.tickers.map(String) : draft.slice()
          close()
          var el = doc.querySelector('[data-universe]')
          if (el) { el.innerHTML = universeHtml(current.etfs); bindUniverse(el) }
        } catch (err) {
          btn.disabled = false
          var why = err && err.response && err.response.data && err.response.data.error
          draw({ error: true, text: 'Could not save the list' + (why ? ': ' + why : '.') })
        }
      })
    }
    draw()
  }

  function bindUniverse(scope) {
    scope.querySelectorAll('[data-etf-edit]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); openEtfModal() })
    })
  }

  function rulesPanel(etfs) {
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
      '<div data-universe class="mb-3 text-gray-700">' + universeHtml(etfs) + '</div>' +
      '<div class="inline-flex rounded border border-gray-300 overflow-hidden mb-3">' + btn('bullish', true) + btn('bearish', false) + '</div>' +
      pane('bullish', true) + pane('bearish', false) +
      '<div class="mt-3 text-gray-500">ATR = average true range over 14 sessions. A signal candle within 3 sessions of an earlier one at the same level is treated as part of the same bounce. A confirmed setup stays listed for 2 more sessions after its confirming close, since it is too late to act on after that; failed and expired setups are hidden unless you choose to show them. The oscillators are on the StockCharts link for every row.</div>' +
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

  function render(state, tab, now, opts) {
    var scan = (state.scans || []).filter(function (s) { return s.scan_type === tab })[0]
    var list = (state.findings || []).filter(function (f) { return f.scan_type === tab })
    var reported = list
    var toggle = ''
    if (tab === 'setup') {
      var showPast = !!(opts && opts.showPast)
      list = activeSetups(list, now)
      var past = list.filter(function (f) { return f.status === 'failed' || f.status === 'expired' }).length
      if (!showPast) list = list.filter(function (f) { return f.status !== 'failed' && f.status !== 'expired' })
      if (past > 0) toggle = '<div class="mb-3 text-sm"><button type="button" data-show-past class="text-brand-teal underline">' + (showPast ? 'Hide failed and expired' : 'Show failed and expired (' + past + ')') + '</button></div>'
    }
    return {
      status: statusLine(scan, tab, now, reported),
      list: (tab === 'setup' ? rulesPanel(opts && opts.etfs) + toggle : '') + (list.length ? (tab === 'setup' ? renderSetups(list, now) : renderFindings(list)) : '<div class="text-gray-500 py-6 text-center">' + escapeHtml(TABS[tab].emptyText) + '</div>')
    }
  }

  var current = { tab: 'guru', showPast: false, etfs: null, data: { scans: [], findings: [] } }

  function paint() {
    var doc = root.document
    var out = render(current.data, current.tab, undefined, { showPast: current.showPast, etfs: current.etfs })
    doc.getElementById('discovery-status').innerHTML = out.status
    var list = doc.getElementById('discovery-list')
    list.innerHTML = out.list
    list.querySelectorAll('[data-rules-side]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); rulesSwitch(list, b.getAttribute('data-rules-side')) })
    })
    bindUniverse(list)
    list.querySelectorAll('[data-show-past]').forEach(function (b) {
      b.addEventListener('click', function () { current.showPast = !current.showPast; paint() })
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
      current.etfs = await fetchEtfs()
      paint()
    } catch (e) {
      list.innerHTML = '<div class="text-red-600 py-6 text-center">Could not load discovery results.</div>'
    }
  }

  var api = { escapeHtml: escapeHtml, render: render, statusLine: statusLine, loadDiscovery: loadDiscovery, setDiscoveryTab: setDiscoveryTab, TABS: TABS, chartSvg: chartSvg, activeSetups: activeSetups, rulesSwitch: rulesSwitch,
    parseTickers: parseTickers, universeHtml: universeHtml, bindUniverse: bindUniverse, openEtfModal: openEtfModal, etfModalHtml: etfModalHtml }
  root.escapeHtmlDiscovery = escapeHtml
  root.loadDiscovery = loadDiscovery
  root.setDiscoveryTab = setDiscoveryTab
  root.DiscoveryView = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
