// Kit v2: one STRATEGIES registry (label, legs, colour), analysis rows can be a "total" row and carry a note.
import fs from 'fs'
const P = 'public/static/modal-kit.js'
const raw = fs.readFileSync(P, 'utf8'), crlf = raw.includes('\r\n')
let s = raw.replace(/\r\n/g, '\n')
const once = (str, l) => { const n = s.split(str).length - 1; if (n !== 1) { console.error('ABORT: ' + l + ' found ' + n + ' times'); process.exit(1) } }
const rep = (a, b, l) => { once(a, l); s = s.replace(a, () => b) }
if (s.includes('STRATEGIES')) { console.error('ABORT: kit already patched'); process.exit(1) }

const a = "  // Approved header colours (Tailwind colour names). Keys match option_trades.strategy_type, plus STOCK.\n"
const b = "    IRON_CONDOR: 'fuchsia'\n  }\n"
once(a, 'colours start'); once(b, 'colours end')
const i = s.indexOf(a), j = s.indexOf(b) + b.length
if (!(i < j) || j - i > 900) { console.error('ABORT: colours block shape'); process.exit(1) }
s = s.slice(0, i) + `  // Everything that varies by strategy, in one place. Keys match option_trades.strategy_type.
  //  legs   = leg labels in column order (strike_price, strike_price_2 ..., premium, premium_2 ..., close_price, close_price_2 ...)
  //  colour = approved header colour (Tailwind colour name)
  const STRATEGIES = {
    SELLING_PUT:           { label: 'Short Put (Stockpiling)', colour: 'emerald', credit: true,  legs: ['Short Put'] },
    SELLING_PUT_WHEEL:     { label: 'Short Put (Wheel)',       colour: 'teal',    credit: true,  legs: ['Short Put'] },
    SELLING_PUT_LONG_TERM: { label: 'Short Put (Long Term)',   colour: 'cyan',    credit: true,  legs: ['Short Put'] },
    BUYING_PUT:            { label: 'Long Put',                colour: 'rose',    credit: false, legs: ['Long Put'] },
    LONG_CALL:             { label: 'Long Call',               colour: 'sky',     credit: false, legs: ['Long Call'] },
    COVERED_CALL:          { label: 'Covered Call',            colour: 'amber',   credit: true,  legs: ['Short Call'] },
    CREDIT_SPREAD:         { label: 'Credit Spread',           colour: 'indigo',  credit: true,  legs: ['Short Leg', 'Long Leg'] },
    DEBIT_SPREAD:          { label: 'Debit Spread',            colour: 'violet',  credit: false, legs: ['Short Leg', 'Long Leg'] },
    IRON_CONDOR:           { label: 'Iron Condor',             colour: 'fuchsia', credit: true,  legs: ['Short Call', 'Long Call', 'Short Put', 'Long Put'] }
  }
  const COLOURS = { STOCK: 'blue' }
  Object.keys(STRATEGIES).forEach(k => { COLOURS[k] = STRATEGIES[k].colour })
` + s.slice(j)

// analysis rows: optional "total" row styling and a note under the rows
rep("  // rows: [{ label, value, sub?, tone? }]; warnings: [string]\n  function renderAnalysis(container, rows, warnings) {\n    container.innerHTML =\n      rows.map(r => `\n        <div class=\"flex items-center justify-between\">",
    "  // rows: [{ label, value, sub?, tone?, total? }]; warnings: [string]; note: optional line under the rows\n  function renderAnalysis(container, rows, warnings, note) {\n    container.innerHTML =\n      rows.map(r => `\n        <div class=\"flex items-center justify-between${r.total ? ' pt-2 mt-2 border-t border-gray-300 text-base font-bold' : ''}\">", 'renderAnalysis head')
rep("          <i class=\"fas fa-exclamation-triangle mr-1\"></i>${esc(w)}\n        </div>`).join('')\n  }",
    "          <i class=\"fas fa-exclamation-triangle mr-1\"></i>${esc(w)}\n        </div>`).join('') +\n      (note ? `<p class=\"text-xs text-gray-600 mt-2\" data-mk=\"note\"><i class=\"fas fa-lightbulb mr-1\"></i>${esc(note)}</p>` : '')\n  }", 'renderAnalysis tail')
rep("global.ModalKit = { COLOURS,", "global.ModalKit = { STRATEGIES, COLOURS,", 'export')

fs.writeFileSync(P + '.bak-kit2', raw)
fs.writeFileSync(P, crlf ? s.replace(/\n/g, '\r\n') : s)
console.log('patched ' + P)
