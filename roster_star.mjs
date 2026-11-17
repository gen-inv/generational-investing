// Company Roster: gold star in front of the company name (instead of a pill after it) + a legend under the table.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const T = (s) => s.replaceAll('@{', '${')
const P = { merge: 'public/static/research-merge.js', app: 'public/static/app.js', front: 'src/routes/frontend.ts', test: 'src/ui/roster-columns.test.ts' }
const die = (m) => { console.error('\nABORT: ' + m + '\nNothing was changed.'); process.exit(1) }
for (const f of Object.values(P)) if (!fs.existsSync(f)) die(f + ' not found -- run this from the repo root, after roster_columns.mjs has been installed')
for (const f of fs.readdirSync('public/static').filter((x) => x.endsWith('.js'))) {
  if (/function wonderfulStarHtml\b/.test(fs.readFileSync('public/static/' + f, 'utf8'))) die('wonderfulStarHtml already exists in ' + f + ' -- this installer looks already applied')
}

const load = (f) => { const raw = fs.readFileSync(f, 'utf8'); return { f, eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') } }
const files = { merge: load(P.merge), app: load(P.app), front: load(P.front), test: load(P.test) }

const STAR_FN = T(String.raw`// A small gold star put in front of the company name of a Wonderful company (research score 80% or higher).
// It goes in front, not after, so a long name wraps and the star stays beside the first word. The roster legend explains it.
function wonderfulStarHtml(company) {
    if (!company || !company.is_wonderful) return ''
    return '<i class="fas fa-star text-brand-gold mr-1" title="Wonderful company: research score of 80% or higher"></i>'
}

`)

const LEGEND = (ind) => [
  '<div class="px-4 py-3 text-sm text-gray-600 border-t border-gray-200 space-y-1">',
  '    <p><i class="fas fa-star text-brand-gold mr-1"></i> Wonderful company: research score of 80% or higher, considered worthy of long-term investment.</p>',
  '    <p>Next Earnings: <span class="text-red-600 font-semibold">red</span> = within 10 days, <span class="text-orange-600 font-semibold">orange</span> = within 30 days, <span class="text-gray-400">grey</span> = the date has passed and needs a refresh.</p>',
  '</div>',
].map((l) => ind + l).join('\n') + '\n'

const edits = []
const E = (file, what, find, rep) => edits.push({ file, what, find, rep })
E('merge', 'star helper', '// Where a "YYYY-MM-DD" earnings date sits relative to today', (m) => STAR_FN + m)
E('app', 'roster: star in front of the name', ': company.company_name + wonderfulBadgeHtml(company)}', ': wonderfulStarHtml(company) + company.company_name}')
E('front', 'legend under the roster table', /(<tbody id="companies-table">\s*<!-- Dynamic content -->\s*<\/tbody>\s*<\/table>\s*\n([ \t]*)<\/div>\n)/, (m, whole, ind) => whole + LEGEND(ind))
E('test', 'test: name assertion', "expect(appSrc).toContain('company.company_name + wonderfulBadgeHtml(company)')", "expect(appSrc).toContain('wonderfulStarHtml(company) + company.company_name')")
E('test', 'test: title', "it('the roster puts it beside the company name and the popup uses the same badge'", "it('the roster puts a star in front of the company name and the popup uses the badge'")

const count = (text, find) => typeof find === 'string' ? text.split(find).length - 1 : [...text.matchAll(new RegExp(find.source, 'g'))].length
const misses = edits.map((e) => ({ e, n: count(files[e.file].text, e.find) })).filter((x) => x.n !== 1)
if (misses.length) die(misses.map((x) => '"' + x.e.what + '" in ' + files[x.e.file].f + ': expected exactly 1 match, found ' + x.n).join('\n') + '\n(the file differs from what I was shown)')
const next = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.text]))
for (const e of edits) next[e.file] = next[e.file].replace(e.find, typeof e.rep === 'function' ? e.rep : () => e.rep)

next.test = next.test.replace(/\s*$/, '\n') + T(String.raw`
describe('Wonderful star and roster legend', () => {
  const starLib = new Function(mergeSrc + '\nreturn { wonderfulStarHtml }')()
  it('a Wonderful company gets a gold star, others get nothing', () => {
    expect(starLib.wonderfulStarHtml({ is_wonderful: true })).toContain('fa-star')
    expect(starLib.wonderfulStarHtml({ is_wonderful: true })).toContain('text-brand-gold')
    expect(starLib.wonderfulStarHtml({ is_wonderful: false })).toBe('')
    expect(starLib.wonderfulStarHtml({ is_wonderful: 0 })).toBe('')
    expect(starLib.wonderfulStarHtml(null)).toBe('')
  })
  it('a company at 75% with an old manual star is not Wonderful once it has research at 75%', () => {
    const merged = lib.mergeResearchIntoCompanies([{ ticker: 'AAA', research_score: 60, is_wonderful: 1 }], { AAA: { scoresheet_pct: 75 } })[0]
    expect(starLib.wonderfulStarHtml(merged)).toBe('')
  })
  it('the legend explains the star and the earnings colours', () => {
    expect(frontSrc).toContain('considered worthy of long-term investment')
    expect(frontSrc).toContain('the date has passed and needs a refresh')
  })
})
`)

const syntax = (code) => { const tmp = path.join(os.tmpdir(), 'star-check-' + process.pid + '.js'); fs.writeFileSync(tmp, code); const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' }); fs.unlinkSync(tmp); return r }
for (const k of ['merge', 'app']) {
  const before = syntax(files[k].text), after = syntax(next[k])
  if (before.status === 0 && after.status !== 0) die(files[k].f + ' would no longer parse:\n' + after.stderr.split('\n').slice(0, 6).join('\n'))
}
for (const v of Object.values(files)) fs.writeFileSync(v.f + '.bak-star', v.eol === '\r\n' ? v.text.replace(/\n/g, '\r\n') : v.text)
for (const [k, v] of Object.entries(files)) fs.writeFileSync(v.f, v.eol === '\r\n' ? next[k].replace(/\n/g, '\r\n') : next[k])
console.log('ok: star now in front of the company name, legend added under the roster table (4 files patched, backups *.bak-star)')
console.log('next: npm test, then npm run deploy')
