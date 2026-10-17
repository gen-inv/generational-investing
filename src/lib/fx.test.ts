import { describe, it, expect } from 'vitest'
import { getRates, fallbackRates, FALLBACK_USD_CAD } from './fx'

const fakeDB = (row: any, seen: any = {}) => ({
  prepare: (sql: string) => ({ bind: (...p: any[]) => { seen.sql = sql; seen.params = p; return { first: async () => row } } }),
})

describe('getRates', () => {
  it('returns the cached rate for the month and year asked for', async () => {
    const seen: any = {}
    const r = await getRates(fakeDB({ usd_to_cad: 1.25, cad_to_usd: 0.8 }, seen), 3, 2026)
    expect(r).toEqual({ usd_to_cad: 1.25, cad_to_usd: 0.8, is_default: false })
    expect(seen.params).toEqual([3, 2026])
  })
  it('falls back to 1.35 and flags it when nothing is cached', async () => {
    const r = await getRates(fakeDB(null), 3, 2026)
    expect(r.usd_to_cad).toBe(FALLBACK_USD_CAD)
    expect(r.cad_to_usd).toBeCloseTo(1 / 1.35, 10)
    expect(r.is_default).toBe(true)
    expect(fallbackRates()).toEqual(r)
  })
  it('derives the inverse if only usd_to_cad is stored', async () => {
    expect((await getRates(fakeDB({ usd_to_cad: 1.25, cad_to_usd: null }), 1, 2026)).cad_to_usd).toBeCloseTo(0.8, 10)
  })
  it('treats a zero or missing usd_to_cad as not cached', async () => {
    expect((await getRates(fakeDB({ usd_to_cad: 0, cad_to_usd: 0 }), 1, 2026)).is_default).toBe(true)
  })
})