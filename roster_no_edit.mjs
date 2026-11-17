// Remove the company edit screen (pencil), its manual score / star / date boxes, and the server's acceptance of manual scores.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const P = { app: 'public/static/app.js', comp: 'src/routes/companies.ts', test: 'src/ui/no-manual-entry.test.ts' }
const die = (m) => { console.error('\nABORT: ' + m + '\nNothing was changed.'); process.exit(1) }
for (const f of [P.app, P.comp]) if (!fs.existsSync(f)) die(f + ' not found -- run this from the repo root')
if (fs.existsSync(P.test)) die(P.test + ' already exists -- this installer looks already applied')
const load = (f) => { const raw = fs.readFileSync(f, 'utf8'); return { f, eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') } }
const files = { app: load(P.app), comp: load(P.comp) }

const edits = []
const E = (file, what, find, rep) => edits.push({ file, what, find, rep })

E('app', 'roster: pencil (edit) button', /[ \t]*<button onclick="editCompany\(\$\{company\.id\}\)"[^>]*>\s*<i class="fas fa-edit"><\/i>\s*<\/button>\n/, '')
E('app', 'editCompany function', /async function editCompany\(id\) \{\s*showCompanyForm\(id\)\s*\}\n+/, '')
E('app', 'edit form template (manual boxes)', /const formFields = isEdit \? `[\s\S]*?` : `/, 'const formFields = `')
E('app', 'edit form: load existing data', /[ \t]*\/\/ Load existing data if editing\n[ \t]*if \(isEdit\) \{[\s\S]*?form\.is_wonderful\.checked = company\.is_wonderful === 1\n[ \t]*\}\)\n[ \t]*\}\n/, '')
E('app', 'save: research score', /[ \t]*research_score: formData\.get\('research_score'\) \|\| null,\n/, '')
E('app', 'save: anti-fragile score', /[ \t]*anti_fragile_score: formData\.get\('anti_fragile_score'\) \|\| null,\n/, '')
E('app', 'save: wonderful tick', /,?\n[ \t]*is_wonderful: formData\.get\('is_wonderful'\) === 'on'\n/, '\n')
E('comp', 'server: is_wonderful update', /[ \t]*if \(data\.is_wonderful !== undefined\) \{\n[^\n]*\n[^\n]*\n[ \t]*\}\n/, '')
E('comp', 'server: research_score update', /[ \t]*if \(data\.research_score !== undefined\) \{\n[^\n]*\n[^\n]*\n[ \t]*\}\n/, '')
E('comp', 'server: anti_fragile_score update', /[ \t]*if \(data\.anti_fragile_score !== undefined\) \{\n[^\n]*\n[^\n]*\n[ \t]*\}\n/, '')

const count = (text, re) => [...text.matchAll(new RegExp(re.source, 'g'))].length
const misses = edits.map((e) => ({ e, n: count(files[e.file].text, e.find) })).filter((x) => x.n !== 1)
if (misses.length) die(misses.map((x) => '"' + x.e.what + '" in ' + files[x.e.file].f + ': expected exactly 1 match, found ' + x.n).join('\n') + '\n(the file differs from what I was shown)')
const next = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.text]))
for (const e of edits) next[e.file] = next[e.file].replace(e.find, () => e.rep)

// what is left must still hold together
if (/name="(research_score|anti_fragile_score|is_wonderful)"/.test(next.app)) die('a manual score box is still in app.js after the edit (unexpected markup) -- not applying')
const syntax = (code) => { const tmp = path.join(os.tmpdir(), 'noedit-check-' + process.pid + '.js'); fs.writeFileSync(tmp, code); const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' }); fs.unlinkSync(tmp); return r }
const before = syntax(files.app.text), after = syntax(next.app)
if (before.status === 0 && after.status !== 0) die('app.js would no longer parse:\n' + after.stderr.split('\n').slice(0, 6).join('\n'))

const TEST = String.raw`import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Companies are filled in automatically (Yahoo data, Kendry's research, Fetch Earnings Date). Nothing is typed in by hand.
const appSrc = readFileSync('public/static/app.js', 'utf8')
const compSrc = readFileSync('src/routes/companies.ts', 'utf8')

describe('no manual company entry', () => {
  it('the roster has no pencil (edit) button and no edit function', () => {
    expect(appSrc).not.toContain('editCompany')
  })
  it('there are no boxes for typing a research score, anti-fragile score or Wonderful tick', () => {
    expect(appSrc).not.toContain('name="research_score"')
    expect(appSrc).not.toContain('name="anti_fragile_score"')
    expect(appSrc).not.toContain('name="is_wonderful"')
    expect(appSrc).not.toContain("formData.get('research_score')")
    expect(appSrc).not.toContain("formData.get('is_wonderful')")
  })
  it('the server no longer accepts typed-in scores or a Wonderful flag', () => {
    expect(compSrc).not.toContain("'research_score = ?'")
    expect(compSrc).not.toContain("'anti_fragile_score = ?'")
    expect(compSrc).not.toContain("'is_wonderful = ?'")
  })
  it('Add Company (ticker only) and Delete are still there', () => {
    expect(appSrc).toContain('name="ticker"')
    expect(appSrc).toContain('deleteCompany(')
  })
})
`
for (const v of Object.values(files)) fs.writeFileSync(v.f + '.bak-noedit', v.eol === '\r\n' ? v.text.replace(/\n/g, '\r\n') : v.text)
for (const [k, v] of Object.entries(files)) fs.writeFileSync(v.f, v.eol === '\r\n' ? next[k].replace(/\n/g, '\r\n') : next[k])
fs.writeFileSync(P.test, TEST)
console.log('ok: company edit screen and manual score/star entry removed (2 files patched, backups *.bak-noedit; test added: ' + P.test + ')')
console.log('next: npm test, then npm run deploy')
