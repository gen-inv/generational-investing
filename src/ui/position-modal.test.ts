// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as Calc from '../lib/calc'

const w = () => window as any
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../public/static/' + f), 'utf8')
const flush = () => new Promise(r => setTimeout(r, 0))
const $ = (sel: string) => document.querySelector(sel) as any
const set = (form: string, name: string, v: string) => { const el = $(`#${form} [name="${name}"]`); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })) }
const submit = async (form: string) => { $('#' + form).dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await flush() }
const text = () => $('#position-analysis').textContent.replace(/\s+/g, ' ')

const stock = { id: 7, company_id: 3, account_id: 9, ticker: 'ABC', quantity: 100, avg_price: 50, price: 50, cost_basis: 48, account_name: 'Margin' }
const put = { id: 21, is_open: 1, strategy_type: 'SELLING_PUT_WHEEL', ticker: 'ABC', strike_price: 50, premium: 1, quantity: 4, commission: 4, trade_date: '2026-10-01', expiration_date: '2026-12-18', account_type: 'TFSA', account_id: 9, notes: 'n' }
const spread = { ...put, id: 22, strategy_type: 'CREDIT_SPREAD', strike_price: 100, strike_price_2: 95, premium: 3, premium_2: 1 }

function mock(options: any[] = [], preview: any = { avg_cost: 50, pending_buy_commission: 10 }) {
  w().api = {
    get: vi.fn(async (url: string) => {
      if (url === '/api/stocks') return { data: [stock] }
      if (url === '/api/options') return { data: options }
      if (url.endsWith('/close-preview')) { if (!preview) throw new Error('x'); return { data: preview } }
      return { data: [] }
    }),
    post: vi.fn(async () => ({ data: { remaining_contracts: 3 } })), put: vi.fn(async () => ({ data: {} }))
  }
}

beforeEach(() => {
  document.body.innerHTML = '<div id="stock-details-modal"></div><div id="option-details-modal"></div>'
  w().Calc = Calc
  w().eval(read('modal-kit.js')); w().eval(read('modal-position.js'))
  w().alert = vi.fn(); w().showStockDetails = vi.fn(); w().loadStocks = vi.fn(); w().loadDashboard = vi.fn(); w().loadClosedTrades = vi.fn()
  w().loadOptions = vi.fn(); w().showNotification = vi.fn()
  mock([put, spread])
})

describe('add shares to a stock position', () => {
  it('shows the blended average price live and buys through POST /api/stocks', async () => {
    await w().addStockToPosition(7); await flush()
    expect($('#stock-details-modal')).toBeNull()
    expect($('[data-mk="header"]').className).toContain('from-blue-600')
    set('addPositionForm', 'quantity', '100'); set('addPositionForm', 'price', '60'); set('addPositionForm', 'commission', '2')
    expect(text()).toContain('$6,002.00'); expect(text()).toContain('200 shares'); expect(text()).toContain('$55.00')
    set('addPositionForm', 'notes', 'more')
    await submit('addPositionForm')
    expect(w().api.post).toHaveBeenCalledWith('/api/stocks', expect.objectContaining({ company_id: 3, account_id: 9, ticker: 'ABC', trade_type: 'BUY', quantity: 100, price: 60, commission: 2, notes: 'more' }))
    expect(w().showStockDetails).toHaveBeenCalledWith(7)
  })
  it('cancel returns to the stock details; an unknown stock alerts', async () => {
    await w().addStockToPosition(7); await flush(); $('[data-mk="cancel"]').click()
    expect(w().showStockDetails).toHaveBeenCalledWith(7)
    await w().addStockToPosition(99); await flush(); expect(w().alert).toHaveBeenCalledWith('Stock not found')
  })
})

describe('sell shares from a stock position', () => {
  it('shows realized P/L at average cost with the pro rata buy commission', async () => {
    await w().sellStockFromPosition(7); await flush()
    set('sellPositionForm', 'quantity', '40'); set('sellPositionForm', 'price', '60'); set('sellPositionForm', 'commission', '1')
    expect(text()).toContain('+$2,400.00'); expect(text()).toContain('-$2,000.00'); expect(text()).toContain('-$4.00')
    expect(text()).toContain('+$395.00'); expect(text()).toContain('60')
    await submit('sellPositionForm')
    expect(w().api.post).toHaveBeenCalledWith('/api/stocks', expect.objectContaining({ trade_type: 'SELL', quantity: 40, price: 60 }))
  })
  it('previews the cost basis of the shares left: a loss raises it, premiums and earlier sales are spread over what remains', async () => {
    Object.assign(stock, { total_adjustments: 200, realized_pl: -500 })
    try {
      await w().sellStockFromPosition(7); await flush()
      set('sellPositionForm', 'quantity', '40'); set('sellPositionForm', 'price', '60'); set('sellPositionForm', 'commission', '1')
      expect(text()).toContain('Cost basis/share now $53.00')            // 50 - (200 - 500) / 100
      expect(text()).toContain('Cost basis/share after this sale $48.42') // 50 - (200 - 500 + 395) / 60
      set('sellPositionForm', 'quantity', '40'); set('sellPositionForm', 'price', '40')
      const after = text().match(/after this sale \$([\d.]+)/)![1]
      expect(Number(after)).toBeGreaterThan(53)                            // a losing sale raises it
      set('sellPositionForm', 'quantity', '100')
      expect(text()).not.toContain('after this sale')                      // nothing left to show
    } finally { delete (stock as any).total_adjustments; delete (stock as any).realized_pl }
  })
  it('warns when selling everything and blocks selling more than held', async () => {
    await w().sellStockFromPosition(7); await flush()
    set('sellPositionForm', 'quantity', '100'); set('sellPositionForm', 'price', '60')
    expect($('[data-mk="warning"]').textContent).toContain('Close Position')
    set('sellPositionForm', 'quantity', '101')
    await submit('sellPositionForm')
    expect(w().alert).toHaveBeenCalledWith('Cannot sell more than 100 shares'); expect(w().api.post).not.toHaveBeenCalled()
  })
  it('still works if the close preview is unavailable', async () => {
    mock([], null)
    await w().sellStockFromPosition(7); await flush()
    set('sellPositionForm', 'quantity', '10'); set('sellPositionForm', 'price', '60')
    expect(text()).toContain('+$100.00')
  })
})

describe('add contracts to an option position', () => {
  it('uses the strategy colour, averages the premium and sends the merged position', async () => {
    await w().addToOptionPosition(21); await flush()
    expect($('[data-mk="header"]').className).toContain('from-teal-600')
    set('addToPositionForm', 'add_contracts', '4'); set('addToPositionForm', 'premium', '2'); set('addToPositionForm', 'add_commission', '6')
    expect(text()).toContain('8'); expect(text()).toContain('$1.500'); expect(text()).toContain('$10.00')
    await submit('addToPositionForm')
    const [url, body] = w().api.put.mock.calls[0]
    expect(url).toBe('/api/options/21')
    expect(body).toMatchObject({ premium: 1.5, quantity: 8, commission: 10, strike_price: 50, account_id: 9, notes: 'n', trade_date: '2026-10-01' })
    expect(w().showNotification).toHaveBeenCalled(); expect($('#option-details-modal')).toBeNull()
  })
  it('a spread averages each leg separately', async () => {
    await w().addToOptionPosition(22); await flush()
    set('addToPositionForm', 'add_contracts', '4'); set('addToPositionForm', 'premium', '5'); set('addToPositionForm', 'premium_2', '3')
    await submit('addToPositionForm')
    const body = w().api.put.mock.calls[0][1]
    expect(body.premium).toBe(4); expect(body.premium_2).toBe(2); expect(body.strike_price_2).toBe(95); expect(body.quantity).toBe(8)
  })
  it('refuses a closed or missing trade', async () => {
    mock([{ ...put, is_open: 0 }]); await w().addToOptionPosition(21); await flush()
    expect(w().alert).toHaveBeenCalledWith('Option trade not found or already closed'); expect($('#add-option-position-modal')).toBeNull()
  })
})

describe('reduce an option position', () => {
  it('shows the realized P/L of the closed contracts and posts to the reduce route', async () => {
    await w().reduceFromOptionPosition(21); await flush()
    expect($('[data-mk="header"]').className).toContain('from-teal-600')
    set('reduceFromPositionForm', 'contracts', '1'); set('reduceFromPositionForm', 'close_price', '0.2'); set('reduceFromPositionForm', 'close_commission', '1')
    expect(text()).toContain('+$78.00'); expect(text()).toContain('3')
    await submit('reduceFromPositionForm')
    expect(w().api.post).toHaveBeenCalledWith('/api/options/21/reduce', { contracts: 1, close_date: expect.any(String), close_commission: 1, close_price: 0.2 })
    expect(w().showNotification).toHaveBeenCalledWith('Closed 1 contract(s). 3 contract(s) remaining.', 'success')
    expect(w().loadClosedTrades).toHaveBeenCalled()
  })
  it('a spread asks for both close prices and sends them per leg', async () => {
    await w().reduceFromOptionPosition(22); await flush()
    expect($('#reduceFromPositionForm [name="close_price_2"]')).not.toBeNull()
    set('reduceFromPositionForm', 'contracts', '2'); set('reduceFromPositionForm', 'close_price', '1'); set('reduceFromPositionForm', 'close_price_2', '0.25')
    expect(text()).toContain('+$248.00')       // (2 - 0.75) x 2 x 100 - 2 open commission share
    await submit('reduceFromPositionForm')
    expect(w().api.post.mock.calls[0][1]).toMatchObject({ contracts: 2, close_price: 1, close_price_2: 0.25 })
  })
  it('will not open for one contract or an already closed trade', async () => {
    mock([{ ...put, quantity: 1 }]); await w().reduceFromOptionPosition(21); await flush()
    expect(w().alert).toHaveBeenCalledWith('Cannot reduce position - only 1 contract remaining. Use "Close Position" instead.')
    mock([{ ...put, is_open: 0 }]); await w().reduceFromOptionPosition(21); await flush()
    expect(w().alert).toHaveBeenLastCalledWith('Option trade not found or already closed')
  })
  it('shows the server error and stays open', async () => {
    await w().reduceFromOptionPosition(21); await flush()
    w().api.post = vi.fn(async () => { throw { response: { data: { error: 'nope' } } } })
    set('reduceFromPositionForm', 'close_price', '0.2'); await submit('reduceFromPositionForm')
    expect(w().alert).toHaveBeenCalledWith('Failed to reduce position: nope'); expect($('#reduce-option-position-modal')).not.toBeNull()
  })
})
