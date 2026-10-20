import { replayHolding, sumRealized, type RealizedSell, type StockTx } from './stock-pl'

export interface SellEdit {
  date: string
  price: number
  commission: number
}

export type SellEditPreview =
  | { ok: true; sell: RealizedSell; sells: RealizedSell[]; totalRealized: number; beforeSell: RealizedSell; beforeTotal: number }
  | { ok: false; status: 400 | 404 | 409; error: string }

/**
 * Preview (and validate) editing one SELL's date, price and commission by replaying the holding's
 * full history with the change applied. Shares are not editable here. Rejects an edit that would
 * leave any sell larger than the shares held on its date (e.g. moving a sell before the buy).
 */
export function previewSellEdit(transactions: StockTx[], txId: number, edit: SellEdit): SellEditPreview {
  const tx = transactions.find(t => t.id === txId)
  if (!tx || tx.transaction_type !== 'SELL') return { ok: false, status: 404, error: 'Sell transaction not found' }
  const price = Number(edit.price)
  const commission = edit.commission === undefined || edit.commission === null || (edit.commission as any) === '' ? 0 : Number(edit.commission)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(edit.date || '')) || Number.isNaN(Date.parse(edit.date))) {
    return { ok: false, status: 400, error: 'A valid sell date is required' }
  }
  if (!Number.isFinite(price) || price < 0) return { ok: false, status: 400, error: 'Sell price must be zero or more' }
  if (!Number.isFinite(commission) || commission < 0) return { ok: false, status: 400, error: 'Commission must be zero or more' }

  const before = replayHolding(transactions)
  const beforeSell = before.find(s => s.transaction_id === txId)!
  const edited = transactions.map(t => t.id === txId
    ? { ...t, transaction_date: edit.date, price_per_share: price, commission }
    : t)
  const after = replayHolding(edited)
  const knownWarnings = new Set(before.filter(s => s.warning).map(s => s.transaction_id))
  const bad = after.find(s => s.warning && !knownWarnings.has(s.transaction_id))
  if (bad) {
    return { ok: false, status: 409, error: `This change would leave a sale on ${bad.sell_date} larger than the shares held then (${bad.warning}). Adjust the date or fix the other transactions first.` }
  }
  return {
    ok: true,
    sell: after.find(s => s.transaction_id === txId)!,
    sells: after,
    totalRealized: sumRealized(after),
    beforeSell,
    beforeTotal: sumRealized(before)
  }
}
