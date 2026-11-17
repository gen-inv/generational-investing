// Part 2 of the cash-flow wording: details window, spread list header, iron condor summary, covered call summary stats.
// Run from the repo root:  node cash_flow_labels2.mjs
import fs from 'fs'
import path from 'path'
import vm from 'vm'

const root = process.cwd()
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const misses = []
const read = rel => {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) { misses.push(`${rel}: file not found (run from the repo root)`); return null }
  const raw = fs.readFileSync(p, 'utf8')
  return { rel, p, crlf: raw.includes('\r\n'), orig: raw, text: raw.replace(/\r\n/g, '\n') }
}
const count = (s, sub) => s.split(sub).length - 1
const edit = (f, name, oldS, newS) => {
  if (!f) return
  if (count(f.text, newS) >= 1) return   // already applied
  const n = count(f.text, oldS)
  if (n === 1) { f.text = f.text.replace(oldS, () => newS); f.changed = true; return }
  misses.push(`${f.rel}: "${name}" matched ${n} times (needs exactly 1)`)
}

const app = read('public/static/app.js')
edit(app, 'details window: Total Premium',
  '<span class="text-sm text-gray-600">Total Premium</span>',
  "<span class=\"text-sm text-gray-600\">${strategyConfig.isPremiumCredit ? 'Total proceeds' : 'Total cost'}</span>")
edit(app, 'list header: Net Premium',
  "hdrCells[4].textContent = (isSpreadTab || isCondorTab) ? 'Net Premium' : 'Premium'",
  "hdrCells[4].textContent = (isSpreadTab || isCondorTab) ? (currentStrategyFilter === 'DEBIT_SPREAD' ? 'Net Cost' : 'Net Proceeds') : 'Premium'")

const fe = read('src/routes/frontend.ts')
edit(fe, 'iron condor summary: Total Premium Credit',
  '<div class="text-sm text-gray-600">Total Premium Credit</div>',
  '<div class="text-sm text-gray-600">Total Proceeds</div>')

const mgr = read('public/static/modal-cc-manage.js')
edit(mgr, 'covered call details stat',
  "K.stat('Premium received', K.fmt.money(Calc.grossPremium(num(cc.premium)",
  "K.stat('Total proceeds', K.fmt.money(Calc.grossPremium(num(cc.premium)")
const close = read('public/static/modal-close.js')
edit(close, 'close covered call stat',
  "K.stat('Premium received', K.fmt.money(Calc.grossPremium(cc.premium, cc.quantity))",
  "K.stat('Total proceeds', K.fmt.money(Calc.grossPremium(cc.premium, cc.quantity))")

if (!fs.existsSync(path.join(root, 'src/ui'))) misses.push('src/ui: folder not found')

if (misses.length) {
  console.log('NOTHING WRITTEN. These anchors did not match:')
  misses.forEach(m => console.log('  - ' + m))
  process.exit(1)
}

const files = [app, fe, mgr, close].filter(f => f && f.changed)
for (const f of files.filter(f => f.rel.endsWith('.js'))) {
  const ok = s => { try { new vm.Script(s); return true } catch { return false } }
  if (ok(f.orig) && !ok(f.text)) { console.log(`ABORT: ${f.rel} would no longer parse. Nothing written.`); process.exit(1) }
}
for (const f of files) {
  fs.copyFileSync(f.p, f.p + '.bak-labels2-' + stamp)
  fs.writeFileSync(f.p, f.crlf ? f.text.replace(/\n/g, '\r\n') : f.text)
  console.log('updated ' + f.rel)
}

const tp = path.join(root, 'src/ui/cash-flow-wording.test.ts')
if (!fs.existsSync(tp)) {
  fs.writeFileSync(tp, `import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Money received is "proceeds", money paid is "cost" -- everywhere a person can see it.
const src = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../' + rel), 'utf8')

describe('cash-flow wording', () => {
  it('no screen still says "Total Premium" or "Net Premium"', () => {
    for (const f of ['public/static/app.js', 'src/routes/frontend.ts', 'public/static/modal-close.js', 'public/static/modal-cc-manage.js']) {
      expect(src(f), f).not.toMatch(/Total Premium|Net Premium/)
    }
  })
  it('option details window names the total by direction', () => {
    expect(src('public/static/app.js')).toContain("strategyConfig.isPremiumCredit ? 'Total proceeds' : 'Total cost'")
  })
  it('spread list header: Net Cost for debit spreads, Net Proceeds for credit spreads and condors', () => {
    expect(src('public/static/app.js')).toContain("currentStrategyFilter === 'DEBIT_SPREAD' ? 'Net Cost' : 'Net Proceeds'")
  })
  it('covered call summaries say Total proceeds, not Premium received', () => {
    for (const f of ['public/static/modal-close.js', 'public/static/modal-cc-manage.js']) {
      expect(src(f), f).toContain("K.stat('Total proceeds'")
      expect(src(f), f).not.toContain("K.stat('Premium received'")
    }
  })
})
`)
  console.log('created src/ui/cash-flow-wording.test.ts')
}

console.log('\nTests that mention the old wording (update these if npm test fails):')
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
for (const t of walk(path.join(root, 'src')).filter(p => /\.test\.(ts|js)$/.test(p) && !p.endsWith('cash-flow-wording.test.ts'))) {
  fs.readFileSync(t, 'utf8').split(/\r?\n/).forEach((l, i) => { if (/Total Premium|Net Premium|Premium received/.test(l)) console.log(`  ${path.relative(root, t)}:${i + 1}: ${l.trim().slice(0, 120)}`) })
}
console.log('\nDone. Backups are *.bak-labels2-' + stamp + ' (delete them after you commit).')
