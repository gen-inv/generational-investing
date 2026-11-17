// Company Roster: scores match the popup, Wonderful becomes a badge, Next Earnings replaces Wonderful, Exchange column removed.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const T = (s) => s.replaceAll('@{', '${')          // the source below writes ${ as @{ so this file's own template strings don't evaluate it
const P = { merge: 'public/static/research-merge.js', app: 'public/static/app.js', front: 'src/routes/frontend.ts', test: 'src/ui/roster-columns.test.ts' }
const die = (m) => { console.error('\nABORT: ' + m + '\nNothing was changed.'); process.exit(1) }
for (const f of [P.merge, P.app, P.front]) if (!fs.existsSync(f)) die(f + ' not found -- run this from the repo root (C:\\Users\\oilfa\\generational-investing)')
if (fs.existsSync(P.test)) die(P.test + ' already exists -- this installer looks already applied')

const load = (f) => { const raw = fs.readFileSync(f, 'utf8'); return { f, eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') } }
const files = { merge: load(P.merge), app: load(P.app), front: load(P.front) }

for (const name of ['formatResearchScore', 'formatAntiFragile', 'wonderfulBadgeHtml', 'earningsStatus', 'earningsCellHtml', 'scoresheetGrade']) {
  for (const f of fs.readdirSync('public/static').filter((x) => x.endsWith('.js'))) {
    if (new RegExp('function ' + name + '\\b').test(fs.readFileSync('public/static/' + f, 'utf8'))) die('function ' + name + ' already exists in ' + f)
  }
}

const HELPERS = T(String.raw`

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
    var text = new Date(s.year, s.month - 1, s.day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    if (s.state === 'passed') return '<span class="text-gray-400" title="This date has passed. Open the company and use Fetch Earnings Date to refresh it.">' + text + '</span>'
    var when = s.days === 0 ? 'Earnings today' : 'Earnings in ' + s.days + (s.days === 1 ? ' day' : ' days')
    var cls = s.state === 'red' ? 'text-red-600 font-semibold' : s.state === 'orange' ? 'text-orange-600 font-semibold' : 'text-gray-700'
    return '<span class="' + cls + '" title="' + when + '">' + text + '</span>'
}
`)

const edits = []   // {file, what, find (string|RegExp), rep}
const E = (file, what, find, rep) => edits.push({ file, what, find, rep })

E('app', 'popup loads the research-merged company',
  /([ \t]*)const company = response\.data\.company([ \t]*\n[ \t]*\n[ \t]*\/\/ Check if company exists on research site)/,
  (_m, ind, tail) => ind + 'let company = response.data.company\n' +
    ind + 'try {\n' +
    ind + '    // Same merge the Company Roster uses, so the popup shows the same scores as the list\n' +
    ind + '    company = mergeResearchIntoCompanies([company], await fetchResearchFindings())[0]\n' +
    ind + '} catch (mergeError) {\n' +
    ind + "    console.warn('Could not merge research data into the company popup:', mergeError.message)\n" +
    ind + '}' + tail)
E('app', 'popup research score', T('<p class="font-semibold">@{company.research_score || \'-\'}</p>'), T('<p class="font-semibold">@{formatResearchScore(company)}</p>'))
E('app', 'popup anti-fragile score', T('<p class="font-semibold">@{company.anti_fragile_score || \'-\'}</p>'), T('<p class="font-semibold">@{formatAntiFragile(company)}</p>'))
E('app', 'popup wonderful badge', /<p class="font-semibold">\$\{company\.is_wonderful \? '[^']*' : 'No'\}<\/p>/, T('<p class="font-semibold">@{company.is_wonderful ? wonderfulBadgeHtml(company) : \'No\'}</p>'))
E('app', 'research view: grade worked out from the score', T('Grade: @{scoresheet.grade}'), T('Grade: @{scoresheetGrade(scoresheet)}'))
E('app', 'roster research score', /const researchScoreDisplay = company\.research_score\s*\n\s*\? [^\n]*\n\s*: '-'/, 'const researchScoreDisplay = formatResearchScore(company)')
E('app', 'roster anti-fragile score', /const antiFragileDisplay = company\.anti_fragile_score !== null && company\.anti_fragile_score !== undefined\s*\n\s*\? [^\n]*\n\s*: '-'/, 'const antiFragileDisplay = formatAntiFragile(company)')
E('app', 'roster: badge beside company name', T(`<span class="text-gray-400">Fetching data...</span>' : company.company_name}`), T(`<span class="text-gray-400">Fetching data...</span>' : company.company_name + wonderfulBadgeHtml(company)}`))
E('app', 'roster: drop Exchange cell', /[ \t]*<td class="px-4 py-3">\$\{company\.exchange \|\| '-'\}<\/td>\n/, '')
E('app', 'roster: Wonderful cell becomes Next Earnings', /([ \t]*)<td class="px-4 py-3 text-center">\s*\$\{company\.is_wonderful \? '<i class="fas fa-star text-brand-gold"><\/i>' : '-'\}\s*<\/td>\n/,
  null /* built below, keeps indentation */)
E('app', 'roster: empty-state colspan (no companies)', 'colspan="11" class="text-center py-4 text-gray-500">No companies found', 'colspan="10" class="text-center py-4 text-gray-500">No companies found')
E('app', 'roster: empty-state colspan (filter)', 'colspan="11" class="text-center py-4 text-gray-500">No companies match', 'colspan="10" class="text-center py-4 text-gray-500">No companies match')
E('front', 'roster header: drop Exchange', /[ \t]*<th class="px-4 py-3 text-left">Exchange<\/th>[ \t]*\n/, '')
E('front', 'roster header: Wonderful becomes Next Earnings', '<th class="px-4 py-3 text-center">Wonderful</th>', '<th class="px-4 py-3 text-center">Next Earnings</th>')

const count = (text, find) => typeof find === 'string' ? text.split(find).length - 1 : [...text.matchAll(new RegExp(find.source, 'g'))].length
const misses = edits.map((e) => ({ e, n: count(files[e.file].text, e.find) })).filter((x) => x.n !== 1)
if (misses.length) die(misses.map((x) => '"' + x.e.what + '" in ' + files[x.e.file].f + ': expected exactly 1 match, found ' + x.n).join('\n') + '\n(the file differs from what I was shown)')
const next = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.text]))
for (const e of edits) {
  const rep = e.rep === null
    ? (_m, indent) => indent + T('<td class="px-4 py-3 text-center text-sm">@{earningsCellHtml(company)}</td>\n')
    : typeof e.rep === 'function' ? e.rep : () => e.rep
  next[e.file] = next[e.file].replace(e.find, rep)
}
next.merge = next.merge.replace(/\s*$/, '\n') + HELPERS

const syntax = (code) => { const tmp = path.join(os.tmpdir(), 'roster-check-' + process.pid + '.js'); fs.writeFileSync(tmp, code); const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' }); fs.unlinkSync(tmp); return r }
for (const k of ['merge', 'app']) {
  const before = syntax(files[k].text), after = syntax(next[k])
  if (before.status === 0 && after.status !== 0) die(files[k].f + ' would no longer parse:\n' + after.stderr.split('\n').slice(0, 6).join('\n'))
}

const TEST = T(String.raw`import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The roster list and the company popup both go through research-merge.js; these tests pin the shared behaviour.
const mergeSrc = readFileSync('public/static/research-merge.js', 'utf8')
const lib = new Function(mergeSrc + '\nreturn { mergeResearchIntoCompanies, formatResearchScore, formatAntiFragile, wonderfulBadgeHtml, earningsStatus, earningsCellHtml, scoresheetGrade }')()
const appSrc = readFileSync('public/static/app.js', 'utf8')
const frontSrc = readFileSync('src/routes/frontend.ts', 'utf8')

const NOW = new Date(2026, 10, 13, 23, 59) // Nov 13 2026, late evening local time

describe('Next Earnings colours', () => {
  const state = (d: string) => lib.earningsStatus(d, NOW).state
  it('today and the next 10 days are red', () => {
    expect(state('2026-11-13')).toBe('red')
    expect(state('2026-11-23')).toBe('red')
  })
  it('11 to 30 days out is orange', () => {
    expect(state('2026-11-24')).toBe('orange')
    expect(state('2026-12-13')).toBe('orange')
  })
  it('more than 30 days out is plain', () => {
    expect(state('2026-12-14')).toBe('later')
  })
  it('a date that has passed is grey and says how to refresh it', () => {
    expect(state('2026-11-12')).toBe('passed')
    const html = lib.earningsCellHtml({ next_earnings_date: '2026-11-12' }, NOW)
    expect(html).toContain('text-gray-400')
    expect(html).toContain('Fetch Earnings Date')
  })
  it('a missing or unreadable date shows a dash', () => {
    expect(lib.earningsCellHtml({ next_earnings_date: null }, NOW)).toBe('-')
    expect(lib.earningsCellHtml({}, NOW)).toBe('-')
    expect(lib.earningsCellHtml({ next_earnings_date: 'soon' }, NOW)).toBe('-')
  })
  it('a date with a time on the end is read by its date part', () => {
    expect(state('2026-11-20T00:00:00Z')).toBe('red')
  })
  it('uses the colours Rob asked for', () => {
    expect(lib.earningsCellHtml({ next_earnings_date: '2026-11-20' }, NOW)).toContain('text-red-600')
    expect(lib.earningsCellHtml({ next_earnings_date: '2026-12-01' }, NOW)).toContain('text-orange-600')
  })
})

describe('roster and popup show the same scores', () => {
  const research = { AAA: { scoresheet_pct: 88.44, anti_fragile_total: 27, blended_buy_price: 10, blended_sticker: 20, last_researched_date: '2026-11-01' } }
  const stale = { ticker: 'AAA', research_score: 12, anti_fragile_score: 3, is_wonderful: 0 }
  const merged = lib.mergeResearchIntoCompanies([stale], research)[0]
  it('a merged company shows the researched numbers, not the stale company row', () => {
    expect(lib.formatResearchScore(merged)).toBe('88.4%')
    expect(lib.formatAntiFragile(merged)).toBe('27/32')
    expect(lib.formatResearchScore(stale)).toBe('12.0%')
  })
  it('no score shows a dash', () => {
    expect(lib.formatResearchScore({})).toBe('-')
    expect(lib.formatAntiFragile({})).toBe('-')
    expect(lib.formatAntiFragile({ anti_fragile_score: 0 })).toBe('0/32')
  })
  it('the popup merges the research data and uses the shared formatters', () => {
    expect(appSrc).toContain('mergeResearchIntoCompanies([company], await fetchResearchFindings())')
    expect(appSrc.split('formatResearchScore(company)').length - 1).toBeGreaterThanOrEqual(2)
    expect(appSrc.split('formatAntiFragile(company)').length - 1).toBeGreaterThanOrEqual(2)
  })
})

describe('Wonderful badge', () => {
  const at = (pct: number) => lib.mergeResearchIntoCompanies([{ ticker: 'AAA' }], { AAA: { scoresheet_pct: pct } })[0]
  it('appears at 80% and above, not below', () => {
    expect(lib.wonderfulBadgeHtml(at(80))).toContain('Wonderful')
    expect(lib.wonderfulBadgeHtml(at(79.9))).toBe('')
  })
  it('the roster puts it beside the company name and the popup uses the same badge', () => {
    expect(appSrc).toContain('company.company_name + wonderfulBadgeHtml(company)')
    expect(appSrc).toContain('wonderfulBadgeHtml(company) : \'No\'')
  })
})

describe('scoresheet grade comes from the percentage', () => {
  it('80% and above is investable, 75% to 80% is tradeable via options, below that is below threshold', () => {
    expect(lib.scoresheetGrade({ total_pct: 80 })).toBe('A+ (investable)')
    expect(lib.scoresheetGrade({ total_pct: 79.9 })).toBe('A (tradeable via options)')
    expect(lib.scoresheetGrade({ total_pct: 75 })).toBe('A (tradeable via options)')
    expect(lib.scoresheetGrade({ total_pct: 74.9 })).toBe('Below threshold')
  })
  it('ignores a stale stored grade, and falls back to it only when there is no percentage', () => {
    expect(lib.scoresheetGrade({ total_pct: 82, grade: 'A (tradeable via options)' })).toBe('A+ (investable)')
    expect(lib.scoresheetGrade({ scoresheet_pct: 77 })).toBe('A (tradeable via options)')
    expect(lib.scoresheetGrade({ grade: 'Incomplete' })).toBe('Incomplete')
  })
  it('the research view uses it', () => {
    expect(appSrc).toContain('Grade: @{scoresheetGrade(scoresheet)}')
  })
})

describe('roster columns', () => {
  it('the roster no longer has Exchange or a Wonderful column, and has Next Earnings', () => {
    expect(frontSrc).not.toContain('>Exchange</th>')
    expect(frontSrc).not.toContain('>Wonderful</th>')
    expect(frontSrc).toContain('>Next Earnings</th>')
    expect(appSrc).not.toContain("<td class=\"px-4 py-3\">@{company.exchange || '-'}</td>")
    expect(appSrc).toContain('@{earningsCellHtml(company)}')
  })
  it('the company popup still shows the Exchange', () => {
    expect(appSrc).toContain('<p class="text-sm text-gray-500 mb-1">Exchange</p>')
  })
})
`)

for (const [k, v] of Object.entries(files)) fs.writeFileSync(v.f + '.bak-roster', v.eol === '\r\n' ? v.text.replace(/\n/g, '\r\n') : v.text)
for (const [k, v] of Object.entries(files)) fs.writeFileSync(v.f, v.eol === '\r\n' ? next[k].replace(/\n/g, '\r\n') : next[k])
fs.writeFileSync(P.test, TEST)
console.log('ok: Company Roster updated -- 3 files patched (backups *.bak-roster), 1 test file added (' + P.test + ')')
console.log('next: npm test, then npm run deploy')
