// Live "what am I getting into" numbers for the add/edit option form: net credit or debit, total risk, max profit,
// days to expiration, return on risk (RORC) and its annualised form (ARORC). Pure functions, no database, no imports.
// These are the formulas the form used inline in app.js, moved here so they can be tested.
// values: the form fields by name - strike_price/premium for single-leg strategies, short_strike/short_premium/
// long_strike/long_premium for spreads, short_call_*/long_call_*/short_put_*/long_put_* for the iron condor.

export interface OptionEntryInput {
  strategy: string
  contracts: number | string
  commission?: number | string | null
  values: Record<string, number | string | null | undefined>
  tradeDate?: string | null
  expirationDate?: string | null
}

export interface OptionEntryAnalysis {
  netCredit: number | null
  netDebit: number | null
  totalRisk: number | null
  maxProfit: number | null
  dte: number | null
  rorc: number | null
  arorc: number | null
}

const M = 100
const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0 }

export function optionEntryAnalysis(a: OptionEntryInput): OptionEntryAnalysis {
  const q = Math.trunc(num(a.contracts))
  const commission = num(a.commission)
  const v = (k: string) => num(a.values[k])
  let netCredit: number | null = null
  let netDebit: number | null = null
  let totalRisk: number | null = null
  let maxProfit: number | null = null

  switch (a.strategy) {
    case 'SELLING_PUT':
    case 'SELLING_PUT_WHEEL':
    case 'SELLING_PUT_LONG_TERM':
      totalRisk = v('strike_price') * q * M - v('premium') * q * M + commission
      maxProfit = v('premium') * q * M - commission
      break
    case 'BUYING_PUT':
    case 'LONG_CALL':
      totalRisk = v('premium') * q * M + commission
      break
    case 'COVERED_CALL':
      maxProfit = v('premium') * q * M - commission
      break
    case 'CREDIT_SPREAD': {
      netCredit = (v('short_premium') - v('long_premium')) * q * M
      const width = Math.abs(v('short_strike') - v('long_strike')) * q * M
      totalRisk = width - netCredit + commission
      maxProfit = netCredit - commission
      break
    }
    case 'DEBIT_SPREAD': {
      netDebit = (v('long_premium') - v('short_premium')) * q * M
      const width = Math.abs(v('long_strike') - v('short_strike')) * q * M
      totalRisk = netDebit + commission
      maxProfit = width - netDebit - commission
      break
    }
    case 'IRON_CONDOR': {
      const callCredit = (v('short_call_premium') - v('long_call_premium')) * q * M
      const callWidth = Math.abs(v('long_call_strike') - v('short_call_strike')) * q * M
      const putCredit = (v('short_put_premium') - v('long_put_premium')) * q * M
      const putWidth = Math.abs(v('short_put_strike') - v('long_put_strike')) * q * M
      netCredit = callCredit + putCredit
      totalRisk = Math.max(callWidth, putWidth) - netCredit + commission
      maxProfit = netCredit - commission
      break
    }
    default:
      break
  }

  let dte: number | null = null
  let rorc: number | null = null
  let arorc: number | null = null
  if (a.tradeDate && a.expirationDate) {
    const ms = new Date(a.expirationDate).getTime() - new Date(a.tradeDate).getTime()
    if (Number.isFinite(ms)) {
      dte = Math.ceil(ms / (1000 * 60 * 60 * 24))
      if (maxProfit !== null && totalRisk !== null && totalRisk > 0) {
        rorc = (maxProfit / totalRisk) * 100
        if (dte > 0) arorc = rorc * (365 / dte)
      }
    }
  }
  return { netCredit, netDebit, totalRisk, maxProfit, dte, rorc, arorc }
}
