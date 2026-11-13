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
