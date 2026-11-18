/* Companies with the research-driven fields merged in (buy price, sticker price, scores, last researched).
 * The research findings are the source of truth for these; the companies table only holds old values.
 * Every screen that shows a company's Buy Price must go through here (company list, Add Stock, Add Option, stock details). */

function mergeResearchIntoCompanies(companies, researchFindings) {
    return companies.map(company => {
        const research = researchFindings[company.ticker]
        if (!research) return company
        return {
            ...company,
            // Override with research data
            research_score: research.scoresheet_pct,
            anti_fragile_score: research.anti_fragile_total,
            buy_price: research.blended_buy_price,
            sticker_price: research.blended_sticker,
            last_researched: research.last_researched_date,
            // "Wonderful" is driven by research score >= 80
            is_wonderful: research.scoresheet_pct >= 80,
            // Lets the roster filter tell "has a scoresheet" apart from a stale number on the company row
            has_scoresheet: research.scoresheet_pct !== null && research.scoresheet_pct !== undefined
        }
    })
}

// Roster filter. 'scored' = has a research scoresheet; 'wonderful' = scoresheet 80%+ (or the manual star on a company with no research yet).
function filterCompaniesByResearch(companies, filter) {
    if (filter === 'scored') return companies.filter(c => c.has_scoresheet === true)
    if (filter === 'wonderful') return companies.filter(c => !!c.is_wonderful)
    return companies
}

async function fetchCompaniesWithResearch() {
    const response = await api.get('/api/companies')
    const companies = response.data.companies || response.data
    return mergeResearchIntoCompanies(companies, await fetchResearchFindings())
}


// ---- Shared by the Company Roster and the company popup, so the two can never disagree ----

function formatResearchScore(company) {
    var v = company ? Number(company.research_score) : 0
    return v ? v.toFixed(1) + '%' : '-'
}

function formatAntiFragile(company) {
    var v = company ? company.anti_fragile_score : null
    return v !== null && v !== undefined && v !== '' ? v + '/32' : '-'
}

// The gold "Wonderful" badge (research score 80% or higher). Empty text for a company that is not wonderful.
function wonderfulBadgeHtml(company) {
    if (!company || !company.is_wonderful) return ''
    return '<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-300" title="Research score 80% or higher"><i class="fas fa-star mr-1 text-brand-gold"></i>Wonderful</span>'
}

// A small gold star put in front of the company name of a Wonderful company (research score 80% or higher).
// It goes in front, not after, so a long name wraps and the star stays beside the first word. The roster legend explains it.
function wonderfulStarHtml(company) {
    if (!company || !company.is_wonderful) return ''
    return '<i class="fas fa-star text-brand-gold mr-1" title="Wonderful company: research score of 80% or higher"></i>'
}

// Where a "YYYY-MM-DD" earnings date sits relative to today, counted in local calendar days.
// passed = before today; red = today up to 10 days; orange = 11 to 30 days; later = further out.
function earningsStatus(dateText, now) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateText || ''))
    if (!m) return { state: 'none', days: null }
    var t = now || new Date()
    var today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())
    var due = Date.UTC(+m[1], +m[2] - 1, +m[3])
    var days = Math.round((due - today) / 86400000)
    var state = days < 0 ? 'passed' : days <= 10 ? 'red' : days <= 30 ? 'orange' : 'later'
    return { state: state, days: days, year: +m[1], month: +m[2], day: +m[3] }
}

// The scoresheet grade, worked out from the percentage so it never depends on what was stored when the research last ran.
// 80% and above = A+ (investable, same line as Wonderful); 75% to just under 80% = A (tradeable via options).
function scoresheetGrade(scoresheet) {
    var pct = scoresheet ? Number(scoresheet.total_pct !== undefined && scoresheet.total_pct !== null ? scoresheet.total_pct : scoresheet.scoresheet_pct) : NaN
    if (isNaN(pct)) return scoresheet && scoresheet.grade ? scoresheet.grade : '-'
    return pct >= 80 ? 'A+ (investable)' : pct >= 75 ? 'A (tradeable via options)' : 'Below threshold'
}

function earningsCellHtml(company, now) {
    var s = earningsStatus(company && company.next_earnings_date, now)
    if (s.state === 'none') return '-'
    var est = !!company && Number(company.earnings_estimated) === 1
    var text = new Date(s.year, s.month - 1, s.day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    if (est) text = '~' + text
    if (s.state === 'passed') return '<span class="text-gray-400" title="This date has passed. Open the company and use Fetch Earnings Date to refresh it.">' + text + '</span>'
    var when = s.days === 0 ? 'Earnings today' : 'Earnings in ' + s.days + (s.days === 1 ? ' day' : ' days')
    if (est) when += ' (estimated until the company announces its date)'
    var cls = s.state === 'red' ? 'text-red-600 font-semibold' : s.state === 'orange' ? 'text-orange-600 font-semibold' : 'text-gray-700'
    return '<span class="' + cls + '" title="' + when + '">' + text + '</span>'
}


// ---- Note above the roster when the nightly update could not refresh some companies ----

function refreshNoteHtml(companies) {
    var failed = (companies || []).filter(function (c) { return c && c.data_refresh_error })
    if (!failed.length) return ''
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
    var names = failed.map(function (c) { return esc(c.ticker) }).join(', ')
    var detail = failed.map(function (c) { return esc(c.ticker) + ': ' + esc(c.data_refresh_error) }).join('; ')
    return '<div id="companies-refresh-note" class="mb-3 px-4 py-3 rounded border border-amber-300 bg-amber-50 text-amber-800 text-sm" title="' + detail + '"><i class="fas fa-exclamation-triangle mr-2"></i>The nightly update could not refresh Market Cap or Next Earnings for ' + names + '. It will try again; hover for details.</div>'
}

function showRefreshNote(companies) {
    var old = document.getElementById('companies-refresh-note')
    if (old) old.remove()
    var html = refreshNoteHtml(companies)
    if (!html) return
    var body = document.getElementById('companies-table')
    var table = body && body.closest('table')
    if (table && table.parentElement) table.parentElement.insertAdjacentHTML('beforebegin', html)
}

/* ---- 10-year P/E range: "how the market has valued this company" (roster column and short-put modals).
 * Numbers come from the weekly job (pe_* columns). Display only: never used in the scoresheet or any valuation. ---- */

function peEsc(text) {
    return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function peHasRange(company) {
    return !!company && company.pe_current != null && company.pe_p5 != null && company.pe_p95 != null &&
        Number(company.pe_p5) > 0 && Number(company.pe_p95) > 0 && company.pe_percentile != null
}

// Rounded like the figures people quote: 36, 110, but 9.6 for single digits
function peFmt(value) {
    var n = Number(value)
    return n >= 10 ? String(Math.round(n)) : n.toFixed(1)
}

function peOrdinal(n) {
    var v = Math.round(Number(n)), tens = v % 100, last = v % 10
    var suffix = (tens >= 11 && tens <= 13) ? 'th' : (last === 1 ? 'st' : (last === 2 ? 'nd' : (last === 3 ? 'rd' : 'th')))
    return v + suffix
}

// Dot position (0 to 1) on a bar that runs from the 5th to the 95th percentile on a log scale: P/E moves by multiples
// (a 20 to 40 move matters as much as 50 to 100), and one freak year cannot flatten the bar.
function peBarPosition(company, value) {
    var lo = Math.log(Number(company.pe_p5)), hi = Math.log(Number(company.pe_p95))
    if (!(hi > lo)) return { pos: 0.5, outside: null }
    var raw = (Math.log(Math.max(Number(value), 0.0001)) - lo) / (hi - lo)
    return { pos: Math.min(1, Math.max(0, raw)), outside: raw < 0 ? 'below' : (raw > 1 ? 'above' : null) }
}

// Cheap / fair / rich compared with the company's own history (percentile = share of months at or below today's P/E)
function peTone(percentile) {
    var p = Number(percentile)
    return p <= 30 ? 'cheap' : (p <= 70 ? 'fair' : 'rich')
}

function peBandLabel(percentile) {
    var p = Number(percentile)
    if (p <= 20) return 'Low end'
    if (p <= 45) return 'Below median'
    if (p < 55) return 'Near median'
    if (p < 80) return 'Above median'
    return 'High end'
}

// What the P/E would be if a short put is assigned: the strike less the premium collected, over trailing EPS
function peIfAssigned(strike, premium, eps) {
    var net = (Number(strike) || 0) - (Number(premium) || 0), e = Number(eps)
    if (!(net > 0) || !(e > 0)) return null
    return net / e
}

function peTooltip(company) {
    var name = company.company_name || company.ticker || 'This company'
    var text = name + ': P/E now ' + peFmt(company.pe_current) + ' (trailing earnings).' +
        '&#10;Last ' + (company.pe_months || '?') + ' months: low ' + peFmt(company.pe_min) + ', median ' + peFmt(company.pe_median) + ', high ' + peFmt(company.pe_max) + '.' +
        '&#10;Today is higher than ' + company.pe_percentile + '% of those months (' + peBandLabel(company.pe_percentile).toLowerCase() + ').' +
        '&#10;The bar shows the 5th to 95th percentile (' + peFmt(company.pe_p5) + ' to ' + peFmt(company.pe_p95) + ') on a log scale; the tick is the median.'
    if (company.pe_updated_at) text += '&#10;Updated ' + String(company.pe_updated_at).slice(0, 10) + '.'
    return peEsc(text).replace(/&amp;#10;/g, '&#10;')
}

function peRangeCellHtml(company) {
    if (!peHasRange(company)) {
        var why = company && company.pe_error ? 'No 10-year P/E range: ' + company.pe_error : 'No 10-year P/E range yet (it is built weekly from SEC earnings and Yahoo prices)'
        return '<span class="text-gray-400" title="' + peEsc(why) + '">-</span>'
    }
    var dot = peBarPosition(company, company.pe_current).pos * 100
    var tick = peBarPosition(company, company.pe_median).pos * 100
    var colour = { cheap: '#16a34a', fair: '#f59e0b', rich: '#dc2626' }[peTone(company.pe_percentile)]
    return '<div class="inline-block text-left" title="' + peTooltip(company) + '">' +
        '<div class="flex items-center gap-1 text-xs text-gray-500">' +
        '<span>' + peFmt(company.pe_p5) + '</span>' +
        '<span class="relative inline-block rounded" style="width:96px;height:8px;margin:0 6px;background:linear-gradient(90deg,#bbf7d0,#fde68a,#fecaca)">' +
        '<i class="absolute" style="left:' + tick.toFixed(1) + '%;top:-2px;width:2px;height:12px;background:#6b7280"></i>' +
        '<i class="absolute rounded-full" data-pe-dot style="left:' + dot.toFixed(1) + '%;top:-4px;width:16px;height:16px;transform:translateX(-50%);background:' + colour + ';border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3)"></i>' +
        '</span>' +
        '<span>' + peFmt(company.pe_p95) + '</span>' +
        '</div>' +
        '<div class="text-xs text-gray-600" style="margin-top:2px"><b>P/E ' + peFmt(company.pe_current) + '</b> &middot; ' + peOrdinal(company.pe_percentile) + ' pct</div>' +
        '</div>'
}

/* ---- P/E if a short put is assigned (Short Put: Stockpiling, Wheel and Long Term). Display only: it never changes the saved
 * trade or any calculation. ---- */

// Roughly where a P/E sits in the company's own history, interpolated (log scale) between the stored 5th percentile, median and 95th percentile
function peApproxPercentile(company, value) {
    var p5 = Number(company.pe_p5), med = Number(company.pe_median), p95 = Number(company.pe_p95), v = Number(value)
    if (!(p5 > 0 && med > p5 && p95 > med && v > 0)) return { pct: Math.round(peBarPosition(company, value).pos * 100), beyond: null }
    if (v < p5) return { pct: 5, beyond: 'below' }
    if (v > p95) return { pct: 95, beyond: 'above' }
    var pct = v <= med
        ? 5 + 45 * (Math.log(v) - Math.log(p5)) / (Math.log(med) - Math.log(p5))
        : 50 + 45 * (Math.log(v) - Math.log(med)) / (Math.log(p95) - Math.log(med))
    return { pct: Math.round(pct), beyond: null }
}

var PE_NOT_AVAILABLE = 'n/a - this happens on companies with unavailable EPS reporting data, loss-making companies (which have no P/E), and non-US companies.'

// Block for the bottom of the Trade Analysis panel. '' until a company, a strike and a premium are entered.
function peAssignedHtml(company, strike, premium) {
    var s = Number(strike), p = Number(premium)
    if (!company || !(s > 0) || !(p > 0) || !(s - p > 0)) return ''
    var net = s - p, eps = Number(company.pe_eps_ttm)
    var head = '<div class="mt-3 pt-3 border-t border-gray-300" data-pe-assigned>'
    var label = '<span class="text-gray-700">P/E if assigned <span class="text-xs text-gray-500">(strike less premium)</span></span>'
    if (!(eps > 0)) {
        var why = company.pe_error ? ' title="' + peEsc(company.pe_error) + '"' : ''
        return head + '<div class="flex items-center justify-between">' + label + '</div>' +
            '<p class="text-xs text-gray-600 mt-1"' + why + '>' + peEsc(PE_NOT_AVAILABLE) + '</p></div>'
    }
    var assigned = net / eps
    var textClass = { cheap: 'text-green-700', fair: 'text-amber-600', rich: 'text-red-700' }
    var dotColour = { cheap: '#16a34a', fair: '#f59e0b', rich: '#dc2626' }
    var out = head + '<div class="flex items-center justify-between">' + label
    if (!peHasRange(company)) {
        return out + '<span class="font-semibold">' + peFmt(assigned) + '</span></div>' +
            '<p class="text-xs text-gray-600 mt-1">$' + net.toFixed(2) + ' &divide; trailing EPS $' + eps.toFixed(2) + '. No 10-year range yet to compare it with.</p></div>'
    }
    var approx = peApproxPercentile(company, assigned), tone = peTone(approx.pct)
    var where = approx.beyond === 'below' ? 'below its usual 10-year range' : (approx.beyond === 'above' ? 'above its usual 10-year range' : '&asymp; ' + peOrdinal(approx.pct) + ' percentile of its 10-year range')
    var dot = peBarPosition(company, assigned).pos * 100
    var today = peBarPosition(company, company.pe_current).pos * 100
    return out + '<span class="font-semibold ' + textClass[tone] + '">' + peFmt(assigned) + '</span></div>' +
        '<div class="flex items-center gap-1 text-xs text-gray-500 mt-2">' +
        '<span>' + peFmt(company.pe_p5) + '</span>' +
        '<span class="relative inline-block rounded" style="width:140px;height:8px;margin:0 6px;background:linear-gradient(90deg,#bbf7d0,#fde68a,#fecaca)">' +
        '<i class="absolute" style="left:' + (peBarPosition(company, company.pe_median).pos * 100).toFixed(1) + '%;top:-2px;width:2px;height:12px;background:#6b7280"></i>' +
        '<i class="absolute rounded-full" data-pe-today-dot title="Today\'s P/E" style="left:' + today.toFixed(1) + '%;top:-2px;width:12px;height:12px;transform:translateX(-50%);background:#fff;border:2px solid #6b7280"></i>' +
        '<i class="absolute rounded-full" data-pe-assigned-dot style="left:' + dot.toFixed(1) + '%;top:-4px;width:16px;height:16px;transform:translateX(-50%);background:' + dotColour[tone] + ';border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3)"></i>' +
        '</span><span>' + peFmt(company.pe_p95) + '</span></div>' +
        '<p class="text-xs text-gray-600 mt-1">' + where + '. $' + net.toFixed(2) + ' &divide; trailing EPS $' + eps.toFixed(2) +
        ' &middot; the hollow ring is today&#39;s P/E (' + peFmt(company.pe_current) + ').</p></div>'
}
