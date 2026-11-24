// Shares held when each recorded dividend was paid. A recorded dividend only stores the total cash received,
// so the share count has to come from the buy/sell history on the dividend's ex-date, never from today's count.

export interface ShareTxn { transaction_date: string; transaction_type: string; shares: number }
export interface RepoDividend { ex_date: string; pay_date: string | null }

/** Shares held at the end of a given day: every BUY up to and including it, less every SELL. */
export function sharesOnDate(txns: ShareTxn[], date: string): number {
  let shares = 0
  for (const t of txns) {
    if (t.transaction_date <= date) shares += t.transaction_type === 'BUY' ? Number(t.shares) : -Number(t.shares)
  }
  return shares
}

/** The ex-date written into a dividend's notes when it was added from the repository ("Ex-date: 2026-03-14"). */
export function exDateFromNotes(notes: string | null | undefined): string | null {
  const m = /Ex-date: (\d{4}-\d{2}-\d{2})/.exec(notes || '')
  return m ? m[1] : null
}

/**
 * Adds shares_held, amount_per_share and shares_date to each recorded dividend row.
 * Ex-date order of preference: the date in the notes, the repository dividend paid on that date, the recorded date itself.
 * A holding with no transactions at all (legacy data) falls back to its current share count; a date with no shares gives null.
 */
export function addSharesToDividends<T extends { amount: number; adjustment_date: string; notes?: string | null }>(
  rows: T[], txns: ShareTxn[], repo: RepoDividend[], fallbackShares: number
): Array<T & { shares_held: number | null; amount_per_share: number | null; shares_date: string }> {
  return rows.map(row => {
    const exDate = exDateFromNotes(row.notes)
      || repo.find(r => r.pay_date && r.pay_date === row.adjustment_date)?.ex_date
      || row.adjustment_date
    let shares = txns.length ? sharesOnDate(txns, exDate) : fallbackShares
    if (txns.length && shares <= 0) shares = sharesOnDate(txns, row.adjustment_date)   // ex-date guess was off: try the pay date
    const held = shares > 0 ? shares : null
    return { ...row, shares_held: held, amount_per_share: held ? Number(row.amount) / held : null, shares_date: exDate }
  })
}
