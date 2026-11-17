// Cash-flow wording: money received = "proceeds", money paid = "cost", chosen by one shared helper (ModalKit.cashFlow).
// Run from the repo root:  node cash_flow_labels.mjs
import fs from 'fs'
import path from 'path'
import vm from 'vm'

const root = process.cwd()
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const misses = []
const plan = []   // { file, text, crlf, orig }

const read = rel => {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) { misses.push(`${rel}: file not found (run this from the repo root)`); return null }
  const raw = fs.readFileSync(p, 'utf8')
  const crlf = raw.includes('\r\n')
  return { rel, p, crlf, orig: raw, text: raw.replace(/\r\n/g, '\n') }
}
const count = (s, sub) => s.split(sub).length - 1
const edit = (f, name, oldS, newS) => {
  if (!f) return
  if (count(f.text, newS) >= 1) return   // already applied
  const n = count(f.text, oldS)
  if (n === 1) { f.text = f.text.replace(oldS, () => newS); f.changed = true; return }
  misses.push(`${f.rel}: "${name}" matched ${n} times (needs exactly 1)`)
}

// ---------------------------------------------------------------- modal-kit.js (shared helper)
const kit = read('public/static/modal-kit.js')
if (kit && !kit.text.includes('ModalKit.cashFlow')) {
  kit.text = kit.text.replace(/\n*$/, '\n') + `
/* Cash-flow wording shared by every option modal: money received is "proceeds", money paid is "cost".
 * Pass the opening amount (positive = you received money, negative = you paid). Amounts themselves stay signed. */
if (typeof ModalKit !== 'undefined') {
  ModalKit.cashFlow = function (openingAmount) {
    return Number(openingAmount) >= 0
      ? { opening: 'Opening proceeds', closing: 'Closing cost', total: 'Total proceeds' }
      : { opening: 'Opening cost', closing: 'Closing proceeds', total: 'Total cost' }
  }
}
`
  kit.changed = true
}

// ---------------------------------------------------------------- modal-close.js
const close = read('public/static/modal-close.js')
edit(close, 'covered call: Premium received row',
  "{ label: 'Premium received', value: K.fmt.money(b.openingCredit, { plus: true }), tone: 'good' },",
  "{ label: 'Opening proceeds', value: K.fmt.money(b.openingCredit, { plus: true }), tone: 'good' },")
edit(close, 'covered call: Close cost row',
  "{ label: 'Close cost', value: K.fmt.money(-b.closingCost, { plus: true }), tone: b.closingCost > 0 ? 'bad' : 'neutral' },",
  "{ label: 'Closing cost', value: K.fmt.money(-b.closingCost, { plus: true }), tone: b.closingCost > 0 ? 'bad' : 'neutral' },")
edit(close, 'option: opening row + helper',
  "    const b = breakdown()\n    K.renderAnalysis(panel, [\n      { label: 'Opening premium', value:",
  "    const b = breakdown()\n    const w = K.cashFlow(b.openingCredit)   // proceeds when money came in, cost when it went out\n    K.renderAnalysis(panel, [\n      { label: w.opening, value:")
edit(close, 'option: closing row',
  "{ label: 'Closing cost', value: K.fmt.money(-b.closingCost, { plus: true }), tone: b.closingCost <= 0 ? 'good' : 'bad' },",
  "{ label: w.closing, value: K.fmt.money(-b.closingCost, { plus: true }), tone: b.closingCost <= 0 ? 'good' : 'bad' },")

// ---------------------------------------------------------------- modal-cc-manage.js
const mgr = read('public/static/modal-cc-manage.js')
edit(mgr, 'closed call: Premium received row',
  "{ label: 'Premium received', value: K.fmt.money(b.openingCredit, { plus: true }), tone: 'good' },",
  "{ label: 'Opening proceeds', value: K.fmt.money(b.openingCredit, { plus: true }), tone: 'good' },")
edit(mgr, 'closed call: Close cost row',
  "{ label: 'Close cost', value: K.fmt.money(-b.closingCost, { plus: true }), tone: b.closingCost > 0 ? 'bad' : 'neutral' },",
  "{ label: 'Closing cost', value: K.fmt.money(-b.closingCost, { plus: true }), tone: b.closingCost > 0 ? 'bad' : 'neutral' },")
edit(mgr, 'open call: Premium received row',
  "{ label: 'Premium received', value: K.fmt.money(Calc.grossPremium(",
  "{ label: 'Opening proceeds', value: K.fmt.money(Calc.grossPremium(")

// ---------------------------------------------------------------- modal-position.js
const pos = read('public/static/modal-position.js')
edit(pos, 'reduce: helper',
  "    const warnings = n >= option.quantity ?",
  "    const w = K.cashFlow(b.openingCredit)   // proceeds when money came in, cost when it went out\n    const warnings = n >= option.quantity ?")
edit(pos, 'reduce: opening row',
  "{ label: 'Premium on closed contracts', value:",
  "{ label: w.opening + ' (closed contracts)', value:")
edit(pos, 'reduce: closing row',
  "{ label: 'Cost to close', value:",
  "{ label: w.closing + ' (closed contracts)', value:")

// ---------------------------------------------------------------- tests
const test = read('src/ui/close-modals.test.ts')
edit(test, 'test: short put opening label', "expect(t).toContain('Opening premium +$360.00')", "expect(t).toContain('Opening proceeds +$360.00')")
edit(test, 'test: long call opening label', "expect(t).toContain('Opening premium -$150.00')", "expect(t).toContain('Opening cost -$150.00')")
edit(test, 'test: long call closing label', "expect(t).toContain('Closing cost +$300.00')", "expect(t).toContain('Closing proceeds +$300.00')")
edit(test, 'test: fixtures',
  "const options = [put, spread, condor, longCall]",
  "// Debit spread: sold leg 10.20 -> 6.85 and bought leg 15.20 -> 10.68, 2 contracts (opening -$1,000, closing +$766)\n" +
  "const debitSpread = { id: 5, ticker: 'NVDA', strategy_type: 'DEBIT_SPREAD', strike_price: 168, strike_price_2: 158, premium: 10.2, premium_2: 15.2, quantity: 2, commission: 1.81, trade_date: '2026-10-01', expiration_date: '2026-12-18' }\n" +
  "const options = [put, spread, condor, longCall, debitSpread]")
edit(test, 'test: new wording tests',
  "  it('shows a loss clearly', async () => {",
  `  it('names the money by direction: proceeds when received, cost when paid', async () => {
    for (const id of [1, 2, 3]) {   // credit trades: you receive money to open and pay to close
      await open(id)
      const t = analysis()
      expect(t).toContain('Opening proceeds'); expect(t).toContain('Closing cost')
      expect(t).not.toContain('Opening premium'); expect(t).not.toContain('Closing proceeds')
    }
    for (const id of [4, 5]) {      // debit trades: you pay to open and receive money to close
      await open(id)
      const t = analysis()
      expect(t).toContain('Opening cost'); expect(t).toContain('Closing proceeds')
      expect(t).not.toContain('Opening premium'); expect(t).not.toContain('Closing cost')
    }
  })

  it('debit spread: opening cost and closing proceeds with the right amounts', async () => {
    await open(5)
    type('closeOptionForm', 'close_price', '6.85'); type('closeOptionForm', 'close_price_2', '10.68'); type('closeOptionForm', 'close_commission', '0')
    const t = analysis()
    expect(t).toContain('Opening cost -$1,000.00')
    expect(t).toContain('Closing proceeds +$766.00')
  })

  it('ModalKit.cashFlow picks the wording from the direction of the money', () => {
    const f = w().ModalKit.cashFlow
    expect(f(360)).toEqual({ opening: 'Opening proceeds', closing: 'Closing cost', total: 'Total proceeds' })
    expect(f(-150)).toEqual({ opening: 'Opening cost', closing: 'Closing proceeds', total: 'Total cost' })
  })

  it('shows a loss clearly', async () => {`)

// ---------------------------------------------------------------- report / write
if (misses.length) {
  console.log('NOTHING WRITTEN. These anchors did not match:')
  misses.forEach(m => console.log('  - ' + m))
  process.exit(1)
}
const files = [kit, close, mgr, pos, test].filter(f => f && f.changed)
// syntax check: abort if a file that parsed before no longer parses
for (const f of files.filter(f => f.rel.endsWith('.js'))) {
  const ok = s => { try { new vm.Script(s); return true } catch { return false } }
  if (ok(f.orig) && !ok(f.text)) { console.log(`ABORT: ${f.rel} would no longer parse. Nothing written.`); process.exit(1) }
}
for (const f of files) {
  fs.copyFileSync(f.p, f.p + '.bak-labels-' + stamp)
  fs.writeFileSync(f.p, f.crlf ? f.text.replace(/\n/g, '\r\n') : f.text)
  console.log('updated ' + f.rel)
}
if (!files.length) console.log('Already applied, nothing to do.')
console.log('\nDone. Backups are *.bak-labels-' + stamp + ' (delete them after you commit).')
