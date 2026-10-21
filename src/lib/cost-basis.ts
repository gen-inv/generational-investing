/**
 * Cost basis per share of the shares still held ("break-even on the whole position").
 *
 *   cost basis = average price - (premiums and dividends collected + realized result on shares already sold) / shares held
 *
 * A realized LOSS on shares sold earlier raises the cost basis of the shares that remain (the loss has to be earned back),
 * a realized GAIN lowers it. Premiums and dividends lower it. Realized P/L comes from the per-sell replay in stock-pl.ts,
 * so editing a sell keeps this correct with nothing stored.
 */
export function costBasisPerShare(avgPrice: number, sharesHeld: number, adjustments: number, realizedSells: number): number {
  const avg = Number(avgPrice) || 0
  const shares = Number(sharesHeld) || 0
  if (shares <= 0) return avg
  return avg - ((Number(adjustments) || 0) + (Number(realizedSells) || 0)) / shares
}
