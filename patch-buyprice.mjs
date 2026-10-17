// The Add Option / Add Stock modals and the stock details header showed companies.buy_price (an old column).
// They now use the research's blended buy price, same as the company list, via one shared helper.
// Run from the repo root: node patch-buyprice.mjs   (aborts without writing if any anchor is not found as expected)
import fs from 'fs'
const load = p => { const raw = fs.readFileSync(p, 'utf8'); return { raw, crlf: raw.includes('\r\n'), t: raw.replace(/\r\n/g, '\n') } }
const save = (p, f, t) => { fs.writeFileSync(p + '.bak-buyprice', f.raw); fs.writeFileSync(p, f.crlf ? t.replace(/\n/g, '\r\n') : t); console.log('patched ' + p) }
const idx = load('src/index.tsx'), app = load('public/static/app.js')
let a = app.t
if (idx.t.includes('/static/research-merge.js')) { console.error('ABORT: already patched'); process.exit(1) }

// 1. company list: replace the inline fetch + merge with the shared helper
const s1 = "        const response = await api.get('/api/companies')\n        let companies = response.data.companies || response.data\n"
const e1 = "            return company\n        })\n"
if (a.split(s1).length - 1 !== 1) { console.error('ABORT: loadCompanies start not unique'); process.exit(1) }
const i = a.indexOf(s1), j = a.indexOf(e1, i)
if (j < 0 || j - i > 1500 || !a.slice(i, j).includes('fetchResearchFindings')) { console.error('ABORT: loadCompanies block shape'); process.exit(1) }
a = a.slice(0, i) + "        let companies = await fetchCompaniesWithResearch()\n" + a.slice(j + e1.length)

// 2. Add Stock modal, stock details, Add Option modal: same helper
const s2 = "        const companiesResponse = await api.get('/api/companies')\n        const companies = companiesResponse.data.companies || companiesResponse.data\n"
const n = a.split(s2).length - 1
if (n !== 3) { console.error('ABORT: expected 3 company fetches, found ' + n); process.exit(1) }
a = a.split(s2).join("        const companies = await fetchCompaniesWithResearch()\n")

// 3. load the helper before app.js
const tag = '<script src="/static/app.js"></script>'
if (idx.t.split(tag).length - 1 !== 1) { console.error('ABORT: app.js script tag'); process.exit(1) }
const newIdx = idx.t.replace(tag, () => '<script src="/static/research-merge.js"></script>\n        ' + tag)

save('src/index.tsx', idx, newIdx); save('public/static/app.js', app, a)
