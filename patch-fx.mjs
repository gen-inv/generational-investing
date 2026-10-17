// Step 3b: one shared USD/CAD rate lookup (src/lib/fx.ts) instead of five copies in index.tsx,
// and the positions report uses it instead of a hardcoded 1.4.
// Run from the repo root: node patch-fx.mjs   (aborts without writing if any count is not what is expected)
import fs from 'fs'
const P = 'src/index.tsx'
const raw = fs.readFileSync(P, 'utf8'), crlf = raw.includes('\r\n')
let s = raw.replace(/\r\n/g, '\n')
const need = (re, n, label) => { const m = s.match(re); const c = m ? m.length : 0; if (c !== n) { console.error('ABORT: ' + label + ' expected ' + n + ' found ' + c); process.exit(1) } }

// import
const imp = "import { optionPL, assignmentPL, grossPremium as calcGrossPremium } from './lib/calc'\n"
if (s.split(imp).length - 1 !== 1) { console.error('ABORT: calc import anchor'); process.exit(1) }
s = s.replace(imp, () => imp + "import { getRates } from './lib/fx'\n")

// the lookup itself (4 route sites: snapshot, totals, ytd-performance, dashboard)
const lookup = /let rates = await DB\.prepare\(`\s*SELECT usd_to_cad, cad_to_usd FROM exchange_rates\s*WHERE month = \? AND year = \?\s*`\)\.bind\((\w+), (\w+)\)\.first\(\) as any;?/g
need(lookup, 4, 'rate lookups')
s = s.replace(lookup, (_m, a, b) => `const rates = await getRates(DB, ${a}, ${b});`)

// plain fallback blocks (snapshot, ytd-performance, dashboard)
const fb = /\n[ \t]*(?:\/\/ If not cached, use fallback rate\n[ \t]*)?if \(!rates\) \{\s*rates = \{ usd_to_cad: 1\.35, cad_to_usd: 1 \/ 1\.35 \};\s*\}\n/g
need(fb, 3, 'fallback blocks')
s = s.replace(fb, '\n')

// totals route keeps its isDefaultRate flag
const flag = /\n[ \t]*\/\/ If not cached, use fallback rate\n[ \t]*let isDefaultRate = false;\n[ \t]*if \(!rates\) \{\s*rates = \{ usd_to_cad: 1\.35, cad_to_usd: 1 \/ 1\.35 \};\s*isDefaultRate = true;\s*\}\n/g
need(flag, 1, 'isDefaultRate block')
s = s.replace(flag, '\n    const isDefaultRate = rates.is_default;\n')

// dashboard route returned the raw row; keep the response shape exactly the same
const ex = "      exchange_rate: rates,\n"
if (s.split(ex).length - 1 !== 1) { console.error('ABORT: exchange_rate anchor'); process.exit(1) }
s = s.replace(ex, () => "      exchange_rate: { usd_to_cad: rates.usd_to_cad, cad_to_usd: rates.cad_to_usd },\n")

// reports/portfolio-overview
const rep = /const rates = await DB\.prepare\(`\s*SELECT usd_to_cad, cad_to_usd FROM exchange_rates\s*WHERE month = \? AND year = \?\s*`\)\.bind\(currentMonth, currentYear\)\.first\(\) as any\n\s*\n\s*const usdToCad = rates\?\.usd_to_cad \|\| 1\.35\n\s*const cadToUsd = rates\?\.cad_to_usd \|\| 0\.74\n/g
need(rep, 1, 'portfolio-overview lookup')
s = s.replace(rep, () => "const rates = await getRates(DB, currentMonth, currentYear)\n    \n    const usdToCad = rates.usd_to_cad\n    const cadToUsd = rates.cad_to_usd\n")

// concentration / diversification report: hardcoded 1.4 -> the same cached monthly rate as everything else
const hc = "    // Calculate total portfolio value (using 1.4 as CAD/USD rate)\n    const exchangeRate = 1.4\n"
if (s.split(hc).length - 1 !== 1) { console.error('ABORT: hardcoded 1.4 anchor'); process.exit(1) }
s = s.replace(hc, () => "    // Calculate total portfolio value using this month's cached USD/CAD rate (same lookup as the dashboard)\n    const fxNow = new Date()\n    const exchangeRate = (await getRates(DB, fxNow.getMonth() + 1, fxNow.getFullYear())).usd_to_cad\n")

fs.writeFileSync(P + '.bak-fx', raw)
fs.writeFileSync(P, crlf ? s.replace(/\n/g, '\r\n') : s)
console.log('patched ' + P)