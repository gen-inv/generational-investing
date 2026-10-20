// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../public/static/' + f), 'utf8')

describe('one strategy registry', () => {
  const app = read('app.js')
  it('app.js derives its strategy list and config from ModalKit instead of repeating them', () => {
    expect(app).toContain('Object.keys(ModalKit.STRATEGIES)')
    expect(app).not.toMatch(/value: 'IRON_CONDOR', label:/)
    expect(app).not.toMatch(/'IRON_CONDOR': \{ legs: 4/)
  })
  it('the derived list keeps the order and labels the tabs rely on, and the config matches each strategy', () => {
    ;(window as any).eval(read('modal-kit.js'))
    const K = (window as any).ModalKit
    const types = Object.keys(K.STRATEGIES).map(value => ({ value, label: K.STRATEGIES[value].label }))
    expect(types.map(t => t.value)).toEqual(['SELLING_PUT', 'SELLING_PUT_WHEEL', 'SELLING_PUT_LONG_TERM', 'BUYING_PUT', 'LONG_CALL', 'COVERED_CALL', 'CREDIT_SPREAD', 'DEBIT_SPREAD', 'IRON_CONDOR'])
    expect(types[0].label).toBe('Short Put (Stockpiling)')
    const legs = Object.fromEntries(Object.entries(K.STRATEGIES).map(([k, v]: any) => [k, [v.legs.length, v.credit]]))
    expect(legs).toMatchObject({ SELLING_PUT: [1, true], BUYING_PUT: [1, false], LONG_CALL: [1, false], CREDIT_SPREAD: [2, true], DEBIT_SPREAD: [2, false], IRON_CONDOR: [4, true], COVERED_CALL: [1, true] })
  })
})
