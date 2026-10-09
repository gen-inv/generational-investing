/**
 * Realized P/L for stock sells, calculated per SELL transaction.
 *
 * Model (agreed with the owner):
 *  - Every SELL stands on its own: realized P/L = (sell price - average purchase price)
 *    x shares sold - sell commission - the matching share of buy commissions.
 *  - The average purchase price is the weighted average of BUYs held at the time of the
 *    sale (replayed in date order), so later buys never change an earlier sell's result.
 *  - Buy commissions are attributed to sells in proportion to the shares sold
 *    (selling 500 of 2,000 shares carries 25% of the buy commissions not yet attributed).
 *  - Dividends, covered-call premiums and put premiums are NOT part of a stock sell's P/L.
 *    They are their own income transactions (cost_basis_adjustments / option_trades) and
 *    only reduce the theoretical cost basis while the shares are held.
 *
 * For a holding that reaches 0 shares, the per-sell results add up to
 * total sells - total buys - all commissions, the same total the old full-close math gave.
 */

export interface StockTx {
  id: number
  holding_id: number
  transaction_type: 'BUY' | 'SELL' | string
  shares: number
  price_per_share: number
  transaction_date: string
  commission?: number | null
}

export interface RealizedSell {
  transaction_id: number
  holding_id: number
  sell_date: string
  shares: number
  sell_price: number
  avg_cost: number
  buy_commission: number
  sell_commission: number
  realized_pl: number
  shares_remaining: number
  is_full_close: boolean
  /** Set when the data is inconsistent, e.g. more shares sold than were held. */
  warning?: string
}

export interface RealizedSellDetail extends RealizedSell {
  ticker: string
  account_id: number
  account_name: string | null
  account_type: string | null
  strategy_type: string | null
  opened_date: string | null
  holding_is_open: boolean
}

const round = (n: number) => Math.round(n * 1e6) / 1e6

/** Replay one holding's transactions and return a realized-P/L row for each SELL. */
export function replayHolding(transactions: StockTx[]): RealizedSell[] {
  // Date order; BUY before SELL on the same day so a same-day buy can be sold; then id.
  const txs = [...transactions].sort((a, b) => {
    if (a.transaction_date !== b.transaction_date) {
      return a.transaction_date < b.transaction_date ? -1 : 1
    }
    if (a.transaction_type !== b.transaction_type) {
      return a.transaction_type === 'BUY' ? -1 : 1
    }
    return a.id - b.id
  })

  let held = 0
  let costTotal = 0 // total purchase cost of the shares currently held
  let commissionPool = 0 // buy commissions not yet attributed to a sell
  const rows: RealizedSell[] = []

  for (const tx of txs) {
    const shares = Number(tx.shares) || 0
    const price = Number(tx.price_per_share) || 0
    const commission = Number(tx.commission) || 0

    if (tx.transaction_type === 'BUY') {
      costTotal += shares * price
      held += shares
      commissionPool += commission
      continue
    }
    if (tx.transaction_type !== 'SELL') continue

    const effective = Math.min(shares, held)
    const avgCost = held > 0 ? costTotal / held : price
    const buyCommission = held > 0 ? (commissionPool * effective) / held : 0
    const realized = (price - avgCost) * effective - buyCommission - commission

    costTotal -= avgCost * effective
    commissionPool -= buyCommission
    held -= effective
    if (held <= 0) {
      held = 0
      costTotal = 0
      commissionPool = 0
    }

    rows.push({
      transaction_id: tx.id,
      holding_id: tx.holding_id,
      sell_date: tx.transaction_date,
      shares,
      sell_price: price,
      avg_cost: round(avgCost),
      buy_commission: round(buyCommission),
      sell_commission: round(commission),
      realized_pl: round(realized),
      shares_remaining: held,
      is_full_close: held === 0,
      ...(shares > effective
        ? { warning: `Sold ${shares} shares but only ${effective} were held at that date` }
        : {})
    })
  }

  return rows
}

export interface RealizedSellOptions {
  holdingId?: number
  accountId?: number
  /** Inclusive lower bound on sell date (YYYY-MM-DD). */
  from?: string
  /** Exclusive upper bound on sell date (YYYY-MM-DD). */
  to?: string
}

/**
 * Load the user's stock transactions and return realized-P/L rows for every SELL
 * (newest first). The replay always runs over each holding's full history; the date
 * and account filters only choose which resulting rows are returned.
 */
export async function loadRealizedSells(
  DB: any,
  userId: unknown, // c.get('userId') is untyped in this app; it is only ever bound as a SQL parameter
  opts: RealizedSellOptions = {}
): Promise<RealizedSellDetail[]> {
  let sql = `
    SELECT st.id, st.holding_id, st.transaction_type, st.shares, st.price_per_share,
           st.transaction_date, st.commission,
           sh.ticker, sh.account_id, sh.opened_date, sh.is_open, sh.strategy_type,
           a.account_name, a.account_type
    FROM stock_transactions st
    INNER JOIN stock_holdings sh ON st.holding_id = sh.id
    LEFT JOIN accounts a ON sh.account_id = a.id
    WHERE sh.user_id = ?
  `
  const params: any[] = [userId]
  if (opts.holdingId !== undefined) {
    sql += ' AND sh.id = ?'
    params.push(opts.holdingId)
  }
  if (opts.accountId !== undefined) {
    sql += ' AND sh.account_id = ?'
    params.push(opts.accountId)
  }
  sql += ' ORDER BY st.holding_id ASC, st.transaction_date ASC, st.id ASC'

  const result = await DB.prepare(sql).bind(...params).all()
  const byHolding = new Map<number, any[]>()
  for (const row of (result.results || []) as any[]) {
    const list = byHolding.get(row.holding_id)
    if (list) list.push(row)
    else byHolding.set(row.holding_id, [row])
  }

  const out: RealizedSellDetail[] = []
  for (const [, rows] of byHolding) {
    const meta = rows[0]
    for (const sell of replayHolding(rows)) {
      if (opts.from && sell.sell_date < opts.from) continue
      if (opts.to && sell.sell_date >= opts.to) continue
      out.push({
        ...sell,
        ticker: meta.ticker,
        account_id: meta.account_id,
        account_name: meta.account_name ?? null,
        account_type: meta.account_type ?? null,
        strategy_type: meta.strategy_type ?? null,
        opened_date: meta.opened_date ?? null,
        holding_is_open: meta.is_open === 1
      })
    }
  }

  out.sort((a, b) =>
    a.sell_date !== b.sell_date
      ? (a.sell_date < b.sell_date ? 1 : -1)
      : b.transaction_id - a.transaction_id
  )
  return out
}

export const sumRealized = (sells: { realized_pl: number }[]) =>
  round(sells.reduce((sum, s) => sum + s.realized_pl, 0))
