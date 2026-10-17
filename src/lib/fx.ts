// USD/CAD exchange rate lookup, shared by the dashboard, account snapshot and reports routes.
// Rates are cached monthly in the exchange_rates table (see fetchAndCacheExchangeRate in index.tsx).

export const FALLBACK_USD_CAD = 1.35

export interface UsdCadRates {
  usd_to_cad: number
  cad_to_usd: number
  /** true when no rate was cached for that month and the fallback was used */
  is_default: boolean
}

export function fallbackRates(): UsdCadRates {
  return { usd_to_cad: FALLBACK_USD_CAD, cad_to_usd: 1 / FALLBACK_USD_CAD, is_default: true }
}

export async function getRates(DB: any, month: number, year: number): Promise<UsdCadRates> {
  const row = await DB.prepare(`
    SELECT usd_to_cad, cad_to_usd FROM exchange_rates
    WHERE month = ? AND year = ?
  `).bind(month, year).first() as { usd_to_cad: number; cad_to_usd: number } | null
  if (row && row.usd_to_cad) {
    return { usd_to_cad: row.usd_to_cad, cad_to_usd: row.cad_to_usd || 1 / row.usd_to_cad, is_default: false }
  }
  return fallbackRates()
}