// Closing a whole stock position: what is held, and the realized P/L the close will book.
// Pure functions, no database. Uses the SAME model as stock-pl.ts (agreed with the owner):
// realized P/L = (sell price - average cost) x shares - sell commission - the buy commissions
// not yet attributed to an earlier sell. Dividends and option premiums are separate income.

export interface PositionTx {
  id: number
  transaction_type: string
  shares: number
  price_per_share: number
  transaction_date: string
  commission?: number | null
}

export interface HeldPosition {
  shares: number
  avg_cost: number
  /** Buy commissions not yet carried by an earlier (partial) sell. */
  pending_buy_commission: number
}

/** Replay a holding's transactions (same ordering as replayHolding) and return what is held now. */
export function holdingPosition(transactions: PositionTx[]): HeldPosition {
  const txs = [...transactions].sort((a, b) => {
    if (a.transaction_date !== b.transaction_date) return a.transaction_date < b.transaction_date ? -1 : 1
    if (a.transaction_type !== b.transaction_type) return a.transaction_type === 'BUY' ? -1 : 1
    return a.id - b.id
  })
  let held = 0, costTotal = 0, commissionPool = 0
  for (const tx of txs) {
    const shares = Number(tx.shares) || 0
    const price = Number(tx.price_per_share) || 0
    if (tx.transaction_type === 'BUY') {
      costTotal += shares * price
      held += shares
      commissionPool += Number(tx.commission) || 0
    } else if (tx.transaction_type === 'SELL') {
      const effective = Math.min(shares, held)
      const avg = held > 0 ? costTotal / held : price
      const buyCommission = held > 0 ? (commissionPool * effective) / held : 0
      costTotal -= avg * effective
      commissionPool -= buyCommission
      held -= effective
      if (held <= 0) { held = 0; costTotal = 0; commissionPool = 0 }
    }
  }
  const r = (n: number) => Math.round(n * 1e6) / 1e6
  return { shares: held, avg_cost: held > 0 ? r(costTotal / held) : 0, pending_buy_commission: r(commissionPool) }
}

export interface StockClosePLInput {
  shares: number
  avgCost: number
  pendingBuyCommission: number
  closePrice: number
  closeCommission: number
}

/** Realized P/L of selling the whole position. Matches what PUT /api/stocks/:id/close books. */
export function stockClosePL(a: StockClosePLInput) {
  const saleProceeds = a.closePrice * a.shares
  const costBasis = a.avgCost * a.shares
  const netPL = saleProceeds - costBasis - a.pendingBuyCommission - a.closeCommission
  return {
    saleProceeds,
    costBasis,
    buyCommission: a.pendingBuyCommission,
    closeCommission: a.closeCommission,
    netPL,
    returnPct: costBasis > 0 ? netPL / costBasis : null
  }
}
