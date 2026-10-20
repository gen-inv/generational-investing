// Adding to / reducing an existing position. Pure functions, no database.
// Stocks follow the same model as stock-close.ts (average cost, buy commissions carried pro rata until sold).
// Options: adding contracts averages each leg's premium by contracts; reducing closes some contracts as their own
// closed trade and takes a pro rata share of the opening commission with it (the server route uses the same split).

import { stockClosePL } from './stock-close'

const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0 }
const r6 = (n: number) => Math.round(n * 1e6) / 1e6

export interface StockAddInput { heldShares: number; avgCost: number; quantity: number | string; price: number | string; commission?: number | string | null }

export function addToStockPosition(a: StockAddInput) {
  const held = Math.max(0, Math.trunc(num(a.heldShares)))
  const q = Math.max(0, Math.trunc(num(a.quantity)))
  const price = num(a.price)
  const commission = num(a.commission)
  const cost = q * price
  const newShares = held + q
  const newAvgCost = newShares > 0 ? (held * num(a.avgCost) + cost) / newShares : 0
  return { ready: q > 0 && price > 0, cost, commission, totalOutlay: cost + commission, newShares, newAvgCost: r6(newAvgCost) }
}

export interface StockSellInput extends StockAddInput { pendingBuyCommission?: number | null }

/** Realized P/L of selling part of a holding: (price - avg cost) x shares, less the sell commission and the buy commissions
 *  carried by those shares (pro rata of the commissions not yet attributed to an earlier sell). */
export function sellFromStockPosition(a: StockSellInput) {
  const held = Math.max(0, Math.trunc(num(a.heldShares)))
  const q = Math.max(0, Math.trunc(num(a.quantity)))
  const carried = held > 0 ? (num(a.pendingBuyCommission) * Math.min(q, held)) / held : 0
  const pl = stockClosePL({ shares: q, avgCost: num(a.avgCost), pendingBuyCommission: carried, closePrice: num(a.price), closeCommission: num(a.commission) })
  return { ...pl, ready: q > 0 && num(a.price) > 0, overSell: q > held, sellsAll: q === held && held > 0, remainingShares: Math.max(0, held - q) }
}

export interface OptionAddInput {
  contracts: number; premiums: Array<number | null | undefined>; commission?: number | null
  addContracts: number | string; addPremiums: Array<number | string | null | undefined>; addCommission?: number | string | null
}

export function addToOptionPosition(a: OptionAddInput) {
  const have = Math.max(0, Math.trunc(num(a.contracts)))
  const add = Math.max(0, Math.trunc(num(a.addContracts)))
  const total = have + add
  const avgPremiums = a.premiums.map((p, i) => total > 0 ? r6((have * num(p) + add * num(a.addPremiums[i])) / total) : 0)
  return { ready: add > 0, totalContracts: total, avgPremiums, totalCommission: r6(num(a.commission) + num(a.addCommission)) }
}

/** Splitting `reduce` contracts off an open position: how the opening commission is divided. */
export function splitOptionCommission(contracts: number, commission: number | null | undefined, reduce: number) {
  const q = Math.trunc(num(contracts)), c = num(commission)
  const closedShare = q > 0 ? r6(c * reduce / q) : 0
  return { closedCommission: closedShare, remainingCommission: r6(c - closedShare), remainingContracts: q - reduce }
}
