// Live "what am I getting into" numbers for the add/edit stock form: capital required (or proceeds for a sell),
// and the potential profit if the stock reaches the research target sell price (target buy price x 2).
// Pure functions, no database, no imports. These are the numbers the form calculated inline in app.js.

export interface StockEntryInput {
  tradeType?: string | null
  quantity: number | string | null | undefined
  price: number | string | null | undefined
  commission?: number | string | null
  targetBuyPrice?: number | string | null
}

export interface StockEntryAnalysis {
  ready: boolean
  isSell: boolean
  gross: number            // price x shares
  commission: number
  totalRisk: number        // BUY: capital required (gross + commission)
  proceeds: number         // SELL: gross - commission
  target: { sellPrice: number; profit: number; roiPct: number } | null
}

const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0 }

export function stockEntryAnalysis(a: StockEntryInput): StockEntryAnalysis {
  const q = Math.trunc(num(a.quantity))
  const price = num(a.price)
  const commission = num(a.commission)
  const isSell = String(a.tradeType || 'BUY').toUpperCase() === 'SELL'
  const gross = price * q
  const base: StockEntryAnalysis = {
    ready: q > 0 && price > 0, isSell, gross, commission,
    totalRisk: gross + commission, proceeds: gross - commission, target: null
  }
  if (!base.ready) return base
  const t = num(a.targetBuyPrice)
  if (!isSell && t > 0) {
    const sellPrice = t * 2
    const cost = base.totalRisk
    const profit = sellPrice * q - cost
    base.target = { sellPrice, profit, roiPct: cost > 0 ? (profit / cost) * 100 : 0 }
  }
  return base
}
