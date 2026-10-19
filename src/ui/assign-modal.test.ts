// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as Calc from '../lib/calc'

const w = () => window as any
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../public/static/' + f), 'utf8')
const flush = () => new Promise(r => setTimeout(r, 0))
const $ = (sel: string) => document.querySelector(sel) as any

const option = { id: 5, ticker: 'AAA', company_id: 1, account_id: 9, strategy_type: 'SELLING_PUT', strike_price: 50, premium: 2, quantity: 2, commission: 1.3, expiration_date: '2020-01-17' }
const accounts = [{ id: 9, account_name: 'Main', account_type: 'TFSA' }]

function mockApi(holdings: any[] = [], opt: any = option) {
  w().api = {
    get: vi.fn(async (url: string) => {
      if (url === '/api/options') return { data: [opt] }
      if (url === '/api/accounts') return { data: { accounts } }
      if (url === '/api/stocks') return { data: holdings }
      throw new Error('unexpected ' + url)
    }),
    post: vi.fn(async () => ({ data: { premium_adjustment: 398.7 } }))
  }
}

beforeEach(() => {
  document.body.innerHTML = '<div id="option-details-modal"></div>'
  w().Calc = Calc
  w().eval(read('modal-kit.js')); w().eval(read('modal-assign.js'))
  w().alert = vi.fn(); w().loadOptions = vi.fn(); w().loadStocks = vi.fn(); w().loadDashboard = vi.fn()
  mockApi()
})

describe('assignStockPosition modal', () => {
  it('header colour follows the put: Stockpiling is emerald, Wheel is teal', async () => {
    await w().assignStockPosition(5); await flush()
    expect($('#assign-stock-modal').innerHTML).toContain('from-emerald-600')
    document.body.innerHTML = ''
    mockApi([], { ...option, strategy_type: 'SELLING_PUT_WHEEL' })
    await w().assignStockPosition(5); await flush()
    expect($('#assign-stock-modal').innerHTML).toContain('from-teal-600')
  })
  it('analysis shows the stock bought, the premium credit and the adjusted cost basis', async () => {
    await w().assignStockPosition(5); await flush()
    const t = $('#assign-analysis').textContent
    expect(t).toContain('200 @ $50.00')
    expect(t).toContain('$10,000.00')
    expect(t).toContain('+$398.70')          // premium 2 x 2 x 100 - 1.30
    expect(t).toContain('$48.01')            // 50 - 398.7/200 = 48.0065
  })
  it('mentions the existing position and the new average when one is held', async () => {
    mockApi([{ is_open: 1, company_id: 1, account_id: 9, total_shares: 300, average_price: 40 }])
    await w().assignStockPosition(5); await flush()
    const t = $('#assign-analysis').textContent
    expect(t).toContain('500 sh @ $44.00')   // (300x40 + 200x50) / 500
    expect(t).toContain('was 300 @ $40.00')
  })
  it('submits the date and notes, then refreshes', async () => {
    await w().assignStockPosition(5); await flush()
    $('input[name="assignment_date"]').value = '2026-10-15'
    $('textarea[name="notes"]').value = 'hello'
    $('#assignmentForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await flush()
    expect(w().api.post).toHaveBeenCalledWith('/api/options/5/assign', { assignment_date: '2026-10-15', notes: 'hello' })
    expect($('#assign-stock-modal')).toBeNull()
    expect($('#option-details-modal')).toBeNull()
    expect(w().loadStocks).toHaveBeenCalled()
  })
  it('refuses a put that is not a short put', async () => {
    mockApi([], { ...option, strategy_type: 'COVERED_CALL' })
    await w().assignStockPosition(5); await flush()
    expect(w().alert).toHaveBeenCalledWith('Assignment is only available for Short Put strategies')
    expect($('#assign-stock-modal')).toBeNull()
  })
  it('Cancel closes without posting', async () => {
    await w().assignStockPosition(5); await flush()
    $('[data-mk="cancel"]').click()
    expect($('#assign-stock-modal')).toBeNull()
    expect(w().api.post).not.toHaveBeenCalled()
  })
})
