import { describe, it, expect } from 'vitest'
import { cleanHidden, getHiddenSections, saveHiddenSections, getFeatures } from './user-prefs'

const fakeDB = (row: any, opts: { throws?: boolean } = {}) => {
  const runs: any[][] = []
  const DB = {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => ({
        first: async () => { if (opts.throws) throw new Error('no such table'); return row },
        run: async () => { runs.push([sql, ...args]) },
      }),
    }),
  }
  return { DB, runs }
}

describe('menu preferences', () => {
  it('keeps only known areas, once each, in menu order, and never the dashboard', () => {
    expect(cleanHidden(['reports', 'stocks', 'stocks', 'dashboard', 'bogus', 42])).toEqual(['stocks', 'reports'])
    expect(cleanHidden('stocks')).toEqual([])
    expect(cleanHidden(null)).toEqual([])
  })
  it('reads the saved list, and treats missing, broken or unreadable data as nothing hidden', async () => {
    expect(await getHiddenSections(fakeDB({ menu_hidden: '["stocks","daily-trade"]' }).DB, 1)).toEqual(['stocks', 'daily-trade'])
    expect(await getHiddenSections(fakeDB(null).DB, 1)).toEqual([])
    expect(await getHiddenSections(fakeDB({ menu_hidden: '{not json' }).DB, 1)).toEqual([])
    expect(await getHiddenSections(fakeDB(null, { throws: true }).DB, 1)).toEqual([])
  })
  it('saves the cleaned list as JSON', async () => {
    const { DB, runs } = fakeDB(null)
    await saveHiddenSections(DB, 7, ['reports', 'dashboard', 'stocks'])
    expect(runs).toHaveLength(1)
    expect(runs[0][0]).toContain('ON CONFLICT(user_id)')
    expect(runs[0][1]).toBe(7); expect(runs[0][2]).toBe('["stocks","reports"]')
  })
  it('turns the list into report switches: everything on by default', async () => {
    expect(await getFeatures(fakeDB(null).DB, 1)).toEqual({ stocks: true, options: true, daily: true })
    expect(await getFeatures(fakeDB({ menu_hidden: '["stocks","daily-trade"]' }).DB, 1)).toEqual({ stocks: false, options: true, daily: false })
    expect(await getFeatures(fakeDB({ menu_hidden: '["companies","reports"]' }).DB, 1)).toEqual({ stocks: true, options: true, daily: true })
  })
})
