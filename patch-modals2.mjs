// Step 4b: covered-call close and option close modals move to public/static/modal-close.js (shared look + live analysis).
// Their old helpers (renderCloseLegFields, updateCloseAnalysis, calculateOptionPL - a third copy of the P/L maths) go away.
// Run from the repo root: node patch-modals2.mjs   (aborts without writing if any anchor is not found exactly once)
import fs from 'fs'
const load = p => { const raw = fs.readFileSync(p, 'utf8'); return { raw, crlf: raw.includes('\r\n'), t: raw.replace(/\r\n/g, '\n') } }
const save = (p, f, t) => { fs.writeFileSync(p + '.bak-modals2', f.raw); fs.writeFileSync(p, f.crlf ? t.replace(/\n/g, '\r\n') : t); console.log('patched ' + p) }
const once = (t, s, l) => { const n = t.split(s).length - 1; if (n !== 1) { console.error('ABORT: ' + l + ' found ' + n + ' times'); process.exit(1) } }

const idx = load('src/index.tsx'), app = load('public/static/app.js')
if (idx.t.includes('/static/modal-close.js')) { console.error('ABORT: already patched'); process.exit(1) }

const tag = '<script src="/static/modal-covered-call.js"></script>\n'
once(idx.t, tag, 'modal-covered-call script tag')
const newIdx = idx.t.replace(tag, () => tag + '        <script src="/static/modal-close.js"></script>\n')

let a = app.t
const cut = (startMarker, endMarker, label, maxLen, replacement) => {
  once(a, startMarker, label + ' start'); once(a, endMarker, label + ' end')
  const i = a.indexOf(startMarker), j = a.indexOf(endMarker)
  if (!(i < j) || j - i > maxLen) { console.error('ABORT: ' + label + ' block shape (' + (j - i) + ' chars)'); process.exit(1) }
  a = a.slice(0, i) + replacement + a.slice(j)
}
const DIV = '// ============================================================================\n'
cut('async function closeCoveredCall(ccId, stockId) {\n', DIV + '// OPTION TRADE FUNCTIONS\n', 'closeCoveredCall', 14000,
    '// closeCoveredCall now lives in /static/modal-close.js (shared ModalKit look + live analysis)\n\n')
cut('async function closeOption(optionId) {\n', '// Add To Position - adds more contracts to an existing open position\n', 'closeOption', 14000,
    '// closeOption now lives in /static/modal-close.js\n\n')
cut('function renderCloseLegFields(option, strategyConfig) {\n', DIV + '// REPORT FUNCTIONS\n', 'close helpers', 20000,
    '// (renderCloseLegFields, updateCloseAnalysis, calculateOptionPL removed: the close modal uses Calc.optionPLBreakdown)\n\n\n')

save('src/index.tsx', idx, newIdx); save('public/static/app.js', app, a)
