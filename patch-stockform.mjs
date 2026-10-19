// Step 4f: add/edit stock form moves to public/static/modal-stock.js (shared Stock Blue look, live analysis from
// Calc.stockEntryAnalysis). Its inline analysis maths and old modal markup leave app.js. Also exposes stockEntryAnalysis
// to the browser bundle. Aborts without writing if any anchor is not found exactly once.
import fs from 'fs'
const load = p => { const raw = fs.readFileSync(p, 'utf8'); return { raw, crlf: raw.includes('\r\n'), t: raw.replace(/\r\n/g, '\n') } }
const save = (p, f, t) => { fs.writeFileSync(p + '.bak-stockform', f.raw); fs.writeFileSync(p, f.crlf ? t.replace(/\n/g, '\r\n') : t); console.log('patched ' + p) }
const once = (t, s, l) => { const n = t.split(s).length - 1; if (n !== 1) { console.error('ABORT: ' + l + ' found ' + n + ' times'); process.exit(1) } }

const idx = load('src/index.tsx'), app = load('public/static/app.js'), calc = load('src/lib/calc.ts')
if (idx.t.includes('/static/modal-stock.js')) { console.error('ABORT: already patched'); process.exit(1) }

const tag = '        <script src="/static/modal-option.js"></script>\n'
once(idx.t, tag, 'modal-option script tag')
const newIdx = idx.t.replace(tag, () => tag + '        <script src="/static/modal-stock.js"></script>\n')

let a = app.t
const s = 'async function showStockForm(stockId = null) {\n', e = '// closeStock now lives in /static/modal-stock-close.js'
once(a, s, 'showStockForm start'); once(a, e, 'closeStock marker')
const i = a.indexOf(s), j = a.indexOf(e)
if (!(i < j) || j - i > 40000) { console.error('ABORT: showStockForm block shape (' + (j - i) + ' chars)'); process.exit(1) }
a = a.slice(0, i) + '// showStockForm now lives in /static/modal-stock.js (shared ModalKit look + live analysis)\n\n' + a.slice(j)

const exp = "export { stockEntryAnalysis } from './stock-entry'\n"
if (calc.t.includes(exp)) { console.error('ABORT: calc.ts already exports stockEntryAnalysis'); process.exit(1) }
const c = calc.t.endsWith('\n') ? calc.t + exp : calc.t + '\n' + exp

save('src/index.tsx', idx, newIdx); save('public/static/app.js', app, a); save('src/lib/calc.ts', calc, c)
