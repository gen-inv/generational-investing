// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as Calc from '../lib/calc'

const w = () => window as any
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../public/static/' + f), 'utf8')
const preview = { id: 7, ticker: 'AAA', shares: 400, avg_cost: 57.5, pending_buy_commission: 12, account_name: 'TFSA', opened_date: '2026-01-01', total_adjustments: 250, open_covered_calls: 0 }
const flush = () => new Promise(r => setTimeout(r, 0))
const $ = (sel: string) => document.querySelector(sel) as any
const type = (el: HTMLInputElement, v: string) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })) }

beforeEach(() => {
  document.body.innerHTML = '<div id="stock-details-modal"></div>'
  w().Calc = Calc
  w().eval(read('modal-kit.js')); w().eval(read('modal-stock-close.js'))
  w().api = { get: vi.fn(async () => ({ data: preview })), put: vi.fn(async () => ({ data: { success: true } })) }
  w().alert = vi.fn(); w().loadStocks = vi.fn(); w().loadDashboard = vi.fn()
})

describe('closeStock modal', () => {
  it('uses the Stock (blue) header and shows the position', async () => {
    await w().closeStock(7); await flush()
    expect($('#close-stock-modal').innerHTML).toContain('from-blue-600')
    expect($('#close-stock-modal').textContent).toContain('AAA')
    expect($('#close-stock-modal').textContent).toContain('400')
    expect($('#close-stock-modal').textContent).toContain('$57.50')
  })
  it('live analysis follows the price and commission', async () => {
    await w().closeStock(7); await flush()
    type($('input[name="close_price"]'), '66'); type($('input[name="commission"]'), '4')
    const t = $('#close-analysis').textContent
    expect(t).toContain('+$26,400.00')   // proceeds
    expect(t).toContain('-$23,000.00')   // cost
    expect(t).toContain('-$12.00')       // opening commissions
    expect(t).toContain('+$3,384.00')    // 26400 - 23000 - 12 - 4
  })
  it('says dividends/premiums are not part of the figure', async () => {
    await w().closeStock(7); await flush()
    expect($('#close-analysis').textContent).toContain('not part of this figure')
  })
  it('submits the same payload the route expects, then refreshes', async () => {
    await w().closeStock(7); await flush()
    type($('input[name="close_date"]'), '2026-10-19'); type($('input[name="close_price"]'), '66'); type($('input[name="commission"]'), '4')
    $('#closeStockForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await flush()
    expect(w().api.put).toHaveBeenCalledWith('/api/stocks/7/close', { close_date: '2026-10-19', close_price: 66, commission: 4 })
    expect($('#close-stock-modal')).toBeNull()
    expect($('#stock-details-modal')).toBeNull()
    expect(w().loadStocks).toHaveBeenCalled()
  })
  it('refuses while a covered call is open, with no modal', async () => {
    w().api.get = vi.fn(async () => ({ data: { ...preview, open_covered_calls: 1 } }))
    await w().closeStock(7); await flush()
    expect(w().alert).toHaveBeenCalledWith(expect.stringContaining('open covered calls'))
    expect($('#close-stock-modal')).toBeNull()
  })
  it('Cancel closes without calling the API', async () => {
    await w().closeStock(7); await flush()
    $('[data-mk="cancel"]').click()
    expect($('#close-stock-modal')).toBeNull()
    expect(w().api.put).not.toHaveBeenCalled()
  })
})
