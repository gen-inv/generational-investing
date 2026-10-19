// Step 4g: view / edit covered call move to public/static/modal-cc-manage.js (shared amber look, live analysis).
// Also fixes PUT /api/covered-calls/:id so a close price of 0 (expired worthless) is kept instead of saved as blank.
// Aborts without writing if any anchor is not found exactly once.
import fs from 'fs'
const load = p => { const raw = fs.readFileSync(p, 'utf8'); return { raw, crlf: raw.includes('\r\n'), t: raw.replace(/\r\n/g, '\n') } }
const save = (p, f, t) => { fs.writeFileSync(p + '.bak-ccmanage', f.raw); fs.writeFileSync(p, f.crlf ? t.replace(/\n/g, '\r\n') : t); console.log('patched ' + p) }
const once = (t, s, l) => { const n = t.split(s).length - 1; if (n !== 1) { console.error('ABORT: ' + l + ' found ' + n + ' times'); process.exit(1) } }

const idx = load('src/index.tsx'), app = load('public/static/app.js')
if (idx.t.includes('/static/modal-cc-manage.js')) { console.error('ABORT: already patched'); process.exit(1) }

const tag = '        <script src="/static/modal-stock.js"></script>\n'
once(idx.t, tag, 'modal-stock script tag')
let newIdx = idx.t.replace(tag, () => tag + '        <script src="/static/modal-cc-manage.js"></script>\n')

// server: keep a 0 close price on covered call edit
const rs = "app.put('/api/covered-calls/:id', authMiddleware", re = '// Get details of a specific covered call\n'
once(newIdx, rs, 'covered call edit route'); once(newIdx, re, 'covered call details marker')
const i = newIdx.indexOf(rs), j = newIdx.indexOf(re)
if (!(i < j) || j - i > 8000) { console.error('ABORT: covered call route shape (' + (j - i) + ' chars)'); process.exit(1) }
const seg = newIdx.slice(i, j)
const old = 'data.close_price || null,'
const n = seg.split(old).length - 1
if (n !== 2) { console.error('ABORT: expected 2 close_price bindings in covered call route, found ' + n); process.exit(1) }
newIdx = newIdx.slice(0, i) + seg.split(old).join('data.close_price ?? null,') + newIdx.slice(j)

let a = app.t
const s = '// View covered call details\nasync function viewCoveredCallDetails(ccId) {\n'
const e = '// Close covered call\n// closeCoveredCall now lives in /static/modal-close.js'
once(a, s, 'viewCoveredCallDetails start'); once(a, e, 'closeCoveredCall marker')
once(a, 'async function editCoveredCall(ccId) {\n', 'editCoveredCall')
const p = a.indexOf(s), q = a.indexOf(e)
if (!(p < q) || q - p > 40000) { console.error('ABORT: covered call block shape (' + (q - p) + ' chars)'); process.exit(1) }
a = a.slice(0, p) + '// viewCoveredCallDetails and editCoveredCall now live in /static/modal-cc-manage.js (shared ModalKit look + live analysis)\n\n' + a.slice(q)

save('src/index.tsx', idx, newIdx); save('public/static/app.js', app, a)
