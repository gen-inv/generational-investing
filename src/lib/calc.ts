// Shared money math for stock and option trades. Pure functions, no database, no imports.
//
// Every function in sections 1-3 reproduces, exactly, a formula that was previously written inline in
// src/index.tsx (the route noted next to each). They are pinned by src/lib/calc.test.ts. Section 4 is new
// (live covered-call analysis for the entry modal). 0DTE SPX trades are a separate strategy and are NOT here.

export const OPTION_MULTIPLIER = 100

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------------
// 1. Stock leftovers (realized P/L itself lives in src/lib/stock-pl.ts)
// ---------------------------------------------------------------------------

// PUT /api/stocks/:id (legacy stock_trades rows): simple price difference.
export function legacyStockTradePL(a: {
  openPrice: number; closePrice: number; shares: number; openCommission: number; closeCommission: number
}) {
  return (a.closePrice - a.openPrice) * a.shares - a.openCommission - a.closeCommission
}

// Cost basis per share after adjustments (GET /api/stocks): average price minus adjustments per share.
export function adjustedCostBasisPerShare(averagePrice: number, totalAdjustments: number, totalShares: number) {
  return averagePrice - (totalAdjustments / totalShares || 0)
}

// ---------------------------------------------------------------------------
// 2. Option P/L (PUT /api/options/:id, PUT /api/covered-calls/:id/close)
// ---------------------------------------------------------------------------

export type OptionStrategy =
  | 'SELLING_PUT' | 'SELLING_PUT_WHEEL' | 'SELLING_PUT_LONG_TERM'
  | 'BUYING_PUT' | 'LONG_CALL' | 'COVERED_CALL'
  | 'CREDIT_SPREAD' | 'DEBIT_SPREAD' | 'IRON_CONDOR'

export interface OptionLegs {
  premium: number          // leg 1 (short call for iron condor; short leg for spreads)
  premium_2?: number | null
  premium_3?: number | null
  premium_4?: number | null
}
export interface OptionCloseLegs {
  close_price: number
  close_price_2?: number | null
  close_price_3?: number | null
  close_price_4?: number | null
}

export function isDebitSingleLeg(s: string) {
  return s === 'BUYING_PUT' || s === 'LONG_CALL'
}

export interface OptionPLInput {
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

// Gross premium collected when a short option is opened.
export function grossPremium(premium: number, contracts: number) {
  return premium * contracts * OPTION_MULTIPLIER
}

// ---------------------------------------------------------------------------
// 3. Short-put assignment (POST /api/options/:id/assign)
// ---------------------------------------------------------------------------

// Assignment closes the put at 0, so the trade keeps all premium less the opening commission.
export function assignmentPL(a: { premium: number; contracts: number; openCommission?: number | null }) {
  return grossPremium(a.premium, a.contracts) - (a.openCommission || 0)
}

export function assignmentDetails(a: {
  premium: number; contracts: number; strike: number; openCommission?: number | null
  existing?: { totalShares: number; averagePrice: number } | null
}) {
  const shares = a.contracts * OPTION_MULTIPLIER
  const netProceeds = grossPremium(a.premium, a.contracts) - (a.openCommission || 0)
  const adjustedCostBasis = a.strike - netProceeds / shares
  let totalShares = shares
  let averagePrice = a.strike
  if (a.existing) {
    totalShares = a.existing.totalShares + shares
    averagePrice = (a.existing.totalShares * a.existing.averagePrice + shares * a.strike) / totalShares
  }
  return { shares, netProceeds, adjustedCostBasis, profitLoss: netProceeds, totalShares, averagePrice }
}

// ---------------------------------------------------------------------------
// 4. NEW: live covered-call analysis (entry modal). Not previously in the app.
// ---------------------------------------------------------------------------

export interface CoveredCallInput {
  contracts: number
  strike: number
  premium: number              // per share
  commission?: number | null   // opening commission
  costBasisPerShare: number    // adjusted cost basis of the stock position
  daysToExpiry: number | null  // null/<=0 when dates are not both set
}

export function coveredCallAnalysis(a: CoveredCallInput) {
  const shares = a.contracts * OPTION_MULTIPLIER
  const commission = a.commission || 0
  const gross = grossPremium(a.premium, a.contracts)
  const netPremium = gross - commission
  const capital = a.costBasisPerShare * shares

  const returnIfUnchanged = capital > 0 ? netPremium / capital : null
  const gainIfCalled = netPremium + (a.strike - a.costBasisPerShare) * shares
  const returnIfCalled = capital > 0 ? gainIfCalled / capital : null

  const annualize = (r: number | null) =>
    r !== null && a.daysToExpiry && a.daysToExpiry > 0 ? r * (365 / a.daysToExpiry) : null

  const breakeven = shares > 0 ? a.costBasisPerShare - netPremium / shares : null
  const downsideProtection =
    shares > 0 && a.costBasisPerShare > 0 ? (netPremium / shares) / a.costBasisPerShare : null

  return {
    shares, grossPremium: gross, netPremium,
    returnIfUnchanged, annualizedIfUnchanged: annualize(returnIfUnchanged),
    gainIfCalled, returnIfCalled, annualizedIfCalled: annualize(returnIfCalled),
    breakeven, downsideProtection,
    lockedInLoss: a.strike < a.costBasisPerShare, // strike below cost basis: assignment realises a loss on the shares
    daysToExpiry: a.daysToExpiry && a.daysToExpiry > 0 ? a.daysToExpiry : null,
  }
}

// Whole days between two YYYY-MM-DD dates (same rule as the option entry panel: ceil of the day difference).
export function daysBetween(fromISO: string, toISO: string): number | null {
  if (!fromISO || !toISO) return null
  const ms = new Date(toISO).getTime() - new Date(fromISO).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}
export { stockClosePL } from './stock-close'
export { optionEntryAnalysis } from './option-entry'
export { stockEntryAnalysis } from './stock-entry'
