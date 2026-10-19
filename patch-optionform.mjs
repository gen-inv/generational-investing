// Step 4e: add/edit option form moves to public/static/modal-option.js (shared look, header follows the strategy,
// live analysis from Calc.optionEntryAnalysis). Its inline per-strategy risk formulas and the old modal markup leave app.js.
// Also exposes optionEntryAnalysis to the browser bundle. Aborts without writing if any anchor is not found exactly once.
import fs from 'fs'
const load = p => { const raw = fs.readFileSync(p, 'utf8'); return { raw, crlf: raw.includes('\r\n'), t: raw.replace(/\r\n/g, '\n') } }
const save = (p, f, t) => { fs.writeFileSync(p + '.bak-optionform', f.raw); fs.writeFileSync(p, f.crlf ? t.replace(/\n/g, '\r\n') : t); console.log('patched ' + p) }
const once = (t, s, l) => { const n = t.split(s).length - 1; if (n !== 1) { console.error('ABORT: ' + l + ' found ' + n + ' times'); process.exit(1) } }

const idx = load('src/index.tsx'), app = load('public/static/app.js'), calc = load('src/lib/calc.ts')
if (idx.t.includes('/static/modal-option.js')) { console.error('ABORT: already patched'); process.exit(1) }

const tag = '        <script src="/static/modal-assign.js"></script>\n'
once(idx.t, tag, 'modal-assign script tag')
const newIdx = idx.t.replace(tag, () => tag + '        <script src="/static/modal-option.js"></script>\n')

let a = app.t
const s = 'async function showOptionForm(optionId = null) {\n', e = 'async function editOption(id) {\n'
once(a, s, 'showOptionForm start'); once(a, e, 'editOption start')
const i = a.indexOf(s), j = a.indexOf(e)
if (!(i < j) || j - i > 60000) { console.error('ABORT: showOptionForm block shape (' + (j - i) + ' chars)'); process.exit(1) }
a = a.slice(0, i) + '// showOptionForm now lives in /static/modal-option.js (shared ModalKit look + live analysis)\n\n' + a.slice(j)

const exp = "export { optionEntryAnalysis } from './option-entry'\n"
if (calc.t.includes(exp)) { console.error('ABORT: calc.ts already exports optionEntryAnalysis'); process.exit(1) }
const c = calc.t.endsWith('\n') ? calc.t + exp : calc.t + '\n' + exp

save('src/index.tsx', idx, newIdx); save('public/static/app.js', app, a); save('src/lib/calc.ts', calc, c)
