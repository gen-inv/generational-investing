// Step 4a: covered-call entry modal moves to public/static/modal-covered-call.js (shared look + live analysis).
// Run from the repo root: node patch-modals.mjs   (aborts without writing if any anchor is not found exactly once)
import fs from 'fs'
const load = p => { const raw = fs.readFileSync(p, 'utf8'); return { raw, crlf: raw.includes('\r\n'), t: raw.replace(/\r\n/g, '\n') } }
const save = (p, f, t) => { fs.writeFileSync(p + '.bak-modals', f.raw); fs.writeFileSync(p, f.crlf ? t.replace(/\n/g, '\r\n') : t); console.log('patched ' + p) }
const once = (t, str, label) => { const n = t.split(str).length - 1; if (n !== 1) { console.error('ABORT: ' + label + ' found ' + n + ' times'); process.exit(1) } }

const idx = load('src/index.tsx'), app = load('public/static/app.js')

const tag = '<script src="/static/app.js"></script>'
once(idx.t, tag, 'app.js script tag')
if (idx.t.includes('/static/modal-kit.js')) { console.error('ABORT: already patched'); process.exit(1) }
const newIdx = idx.t.replace(tag, () =>
  '<script src="/static/calc.js"></script>\n        <script src="/static/modal-kit.js"></script>\n        <script src="/static/modal-covered-call.js"></script>\n        ' + tag)

const start = 'async function initiateCoveredCall(stockId) {\n'
const end = '// Edit stock trade\nasync function editStockTrade(stockId) {'
once(app.t, start, 'initiateCoveredCall start'); once(app.t, end, 'editStockTrade marker')
const i = app.t.indexOf(start), j = app.t.indexOf(end)
if (!(i < j) || j - i > 12000) { console.error('ABORT: function block shape unexpected (' + (j - i) + ' chars)'); process.exit(1) }
const newApp = app.t.slice(0, i) + '// initiateCoveredCall now lives in /static/modal-covered-call.js (shared ModalKit look + live analysis)\n\n' + app.t.slice(j)

save('src/index.tsx', idx, newIdx); save('public/static/app.js', app, newApp)