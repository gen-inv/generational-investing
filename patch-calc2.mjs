// Step 4b-1: one function (optionPLBreakdown) for option P/L, so the close modals can show the breakdown AND the net
// from the same code the server uses. optionPL now delegates to it. Run from the repo root: node patch-calc2.mjs
import fs from 'fs'
const load = p => { const raw = fs.readFileSync(p, 'utf8'); return { raw, crlf: raw.includes('\r\n'), t: raw.replace(/\r\n/g, '\n') } }
const save = (p, f, t) => { fs.writeFileSync(p + '.bak-calc2', f.raw); fs.writeFileSync(p, f.crlf ? t.replace(/\n/g, '\r\n') : t); console.log('patched ' + p) }
const once = (t, s, l) => { const n = t.split(s).length - 1; if (n !== 1) { console.error('ABORT: ' + l + ' found ' + n + ' times'); process.exit(1) } }

const calc = load('src/lib/calc.ts'), test = load('src/lib/calc.test.ts')
if (calc.t.includes('optionPLBreakdown')) { console.error('ABORT: calc.ts already patched'); process.exit(1) }

const a = '// Net profit/loss of a closed option trade, per strategy.\nexport function optionPL('
const b = '// Gross premium collected when a short option is opened.'
once(calc.t, a, 'optionPL start'); once(calc.t, b, 'grossPremium comment')
const i = calc.t.indexOf(a), j = calc.t.indexOf(b)
if (!(i < j) || j - i > 3000) { console.error('ABORT: optionPL block shape'); process.exit(1) }

const block = `export interface OptionPLInput {
  strategy: string; contracts: number; open: OptionLegs; close: OptionCloseLegs
  openCommission?: number | null; closeCommission?: number | null
}

// Opening credit, closing cost, commissions and net P/L of a closed option trade, per strategy.
// Signs match the close-trade panel: credit strategies have openingCredit > 0 and closingCost = what you pay to close;
// long put / long call have both negative (you paid to open, you receive when you close). net = credit - cost - commissions.
export function optionPLBreakdown(a: OptionPLInput) {
  const oc = a.openCommission || 0
  const cc = a.closeCommission || 0
  const n = a.contracts
  const m = OPTION_MULTIPLIER
  const o = a.open, c = a.close
  let openingCredit: number
  let closingCost: number

  if (a.strategy === 'CREDIT_SPREAD' || a.strategy === 'DEBIT_SPREAD') {
    openingCredit = ((o.premium || 0) - (o.premium_2 || 0)) * n * m
    closingCost = ((c.close_price || 0) - (c.close_price_2 || 0)) * n * m
  } else if (a.strategy === 'IRON_CONDOR') {
    openingCredit = (((o.premium || 0) - (o.premium_2 || 0)) + ((o.premium_3 || 0) - (o.premium_4 || 0))) * n * m
    closingCost = (((c.close_price || 0) - (c.close_price_2 || 0)) + ((c.close_price_3 || 0) - (c.close_price_4 || 0))) * n * m
  } else if (isDebitSingleLeg(a.strategy)) {
    openingCredit = -((o.premium || 0) * n * m)
    closingCost = -((c.close_price || 0) * n * m)
  } else {
    // SELLING_PUT*, COVERED_CALL (credit, single leg)
    openingCredit = (o.premium || 0) * n * m
    closingCost = (c.close_price || 0) * n * m
  }
  return { openingCredit, closingCost, openCommission: oc, closeCommission: cc, netPL: openingCredit - closingCost - oc - cc }
}

// Net profit/loss of a closed option trade.
export function optionPL(a: OptionPLInput) {
  return optionPLBreakdown(a).netPL
}

`
const newCalc = calc.t.slice(0, i) + block + calc.t.slice(j)

const imp = '  optionPL, grossPremium, assignmentPL, assignmentDetails, coveredCallAnalysis, daysBetween,\n} from \'./calc\'\n'
once(test.t, imp, 'test import')
const newTest = test.t.replace(imp, () => '  optionPL, optionPLBreakdown, grossPremium, assignmentPL, assignmentDetails, coveredCallAnalysis, daysBetween,\n} from \'./calc\'\n') + `
describe('optionPLBreakdown (what the close modals show)', () => {
  const near = (v: number, e: number) => expect(v).toBeCloseTo(e, 6)

  it('short put: credit in, cost out, commissions, net', () => {
    const b = optionPLBreakdown({ strategy: 'SELLING_PUT', contracts: 3, open: { premium: 1.2 }, close: { close_price: 0.3 }, openCommission: 4, closeCommission: 4 })
    near(b.openingCredit, 360); near(b.closingCost, 90); expect(b.openCommission).toBe(4); expect(b.closeCommission).toBe(4); near(b.netPL, 262)
  })
  it('long call: both sides negative, net is close - open', () => {
    const b = optionPLBreakdown({ strategy: 'LONG_CALL', contracts: 1, open: { premium: 1.5 }, close: { close_price: 3 }, openCommission: 1, closeCommission: 1 })
    near(b.openingCredit, -150); near(b.closingCost, -300); near(b.netPL, 148)
  })
  it('credit spread and iron condor net the legs', () => {
    const s = optionPLBreakdown({ strategy: 'CREDIT_SPREAD', contracts: 2, open: { premium: 2.5, premium_2: 1 }, close: { close_price: 0.5, close_price_2: 0.2 }, openCommission: 1.3, closeCommission: 1.3 })
    near(s.openingCredit, 300); near(s.closingCost, 60); near(s.netPL, 237.4)
    const ic = optionPLBreakdown({
      strategy: 'IRON_CONDOR', contracts: 1, open: { premium: 1.0, premium_2: 0.3, premium_3: 0.9, premium_4: 0.2 },
      close: { close_price: 0.2, close_price_2: 0.05, close_price_3: 0.15, close_price_4: 0.05 }, openCommission: 2.6, closeCommission: 2.6,
    })
    near(ic.openingCredit, 140); near(ic.closingCost, 25); near(ic.netPL, 109.8)
  })
  it('optionPL is exactly the breakdown net for every strategy', () => {
    for (const strategy of ['SELLING_PUT', 'SELLING_PUT_WHEEL', 'SELLING_PUT_LONG_TERM', 'BUYING_PUT', 'LONG_CALL', 'COVERED_CALL', 'CREDIT_SPREAD', 'DEBIT_SPREAD', 'IRON_CONDOR']) {
      const a = { strategy, contracts: 3, open: { premium: 2.1, premium_2: 0.9, premium_3: 1.7, premium_4: 0.4 }, close: { close_price: 0.7, close_price_2: 0.1, close_price_3: 0.5, close_price_4: 0.2 }, openCommission: 3.1, closeCommission: 2.2 }
      expect(optionPL(a)).toBe(optionPLBreakdown(a).netPL)
    }
  })
})
`
save('src/lib/calc.ts', calc, newCalc); save('src/lib/calc.test.ts', test, newTest)
