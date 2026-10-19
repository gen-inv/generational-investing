// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as Calc from '../lib/calc'

const w = () => window as any
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../public/static/' + f), 'utf8')
const flush = () => new Promise(r => setTimeout(r, 0))
const $ = (sel: string) => document.querySelector(sel) as any
const set = (name: string, v: string) => { const el = $(`#stockForm [name="${name}"]`); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })) }
const pick = (name: string, v: string) => { const el = $(`#stockForm [name="${name}"]`); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })) }
const submit = async () => { $('#stockForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await flush() }
const text = () => $('#stock-analysis').textContent

const companies = [{ id: 1, ticker: 'AAA', company_name: 'Alpha', buy_price: 40 }, { id: 2, ticker: 'BBB', company_name: 'Beta', buy_price: null }]
const accounts = [{ id: 9, account_name: 'Main', account_type: 'TFSA' }]

function mock(stock: any = null) {
  w().fetchCompaniesWithResearch = vi.fn(async () => companies)
  w().api = {
    get: vi.fn(async (url: string) => url === '/api/accounts' ? { data: { accounts } } : { data: stock }),
    post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} }))
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  w().Calc = Calc
  w().eval(read('modal-kit.js')); w().eval(read('modal-stock.js'))
  w().alert = vi.fn(); w().loadStocks = vi.fn(); w().loadDashboard = vi.fn(); w().loadClosedTrades = vi.fn(); w().showSection = vi.fn()
  mock()
})

describe('add stock modal', () => {
  it('opens with the Stock Blue header and today as the open date', async () => {
    await w().showStockForm(); await flush()
    expect($('[data-mk="header"]').className).toContain('from-blue-600')
    expect($('#stockForm [name="trade_date"]').value).toBe(new Date().toISOString().split('T')[0])
    expect($('#stockForm [name="strategy_type"]:checked').value).toBe('STOCKPILING')
    expect($('#stockForm [name="close_date"]')).toBeNull()
  })
  it('refuses to open without companies or accounts', async () => {
    w().fetchCompaniesWithResearch = vi.fn(async () => [])
    await w().showStockForm(); await flush()
    expect(w().alert).toHaveBeenCalled(); expect(w().showSection).toHaveBeenCalledWith('companies'); expect($('#stockForm')).toBeNull()
  })
  it('live analysis: capital required, and the target profit once a company with a research price is chosen', async () => {
    await w().showStockForm(); await flush()
    expect(text()).toContain('Enter shares and price')
    set('quantity', '100'); set('price', '50'); set('commission', '10')
    expect(text()).toContain('$5,010.00')
    expect(text()).not.toContain('Target sell price')
    pick('company_id', '1')
    expect($('#buy-price-info').classList.contains('hidden')).toBe(false)
    expect($('#target_buy_price').textContent).toBe('$40.00')
    expect(text()).toContain('$80.00'); expect(text()).toContain('+$2,990.00'); expect(text()).toContain('59.68%')
    pick('company_id', '2')
    expect($('#buy-price-info').classList.contains('hidden')).toBe(true)
    expect(text()).not.toContain('Target sell price')
  })
  it('a sell shows proceeds instead of capital required', async () => {
    await w().showStockForm(); await flush()
    pick('trade_type', 'SELL'); set('quantity', '10'); set('price', '20'); set('commission', '1')
    expect(text()).toContain('Sale proceeds'); expect(text()).toContain('+$199.00'); expect(text()).not.toContain('capital required')
  })
  it('saves a new trade with the chosen strategy', async () => {
    await w().showStockForm(); await flush()
    pick('company_id', '1'); pick('account_id', '9'); set('quantity', '25'); set('price', '12.345'); set('commission', '1.5'); set('notes', 'hi')
    $('#stockForm [name="strategy_type"][value="WHEEL"]').checked = true
    await submit()
    expect(w().api.post).toHaveBeenCalledWith('/api/stocks', expect.objectContaining({
      company_id: 1, ticker: 'AAA', trade_type: 'BUY', quantity: 25, price: 12.345, account_id: 9, commission: 1.5, strategy_type: 'WHEEL', notes: 'hi' }))
    expect(w().api.post.mock.calls[0][1].close_date).toBeUndefined()
    expect(w().loadStocks).toHaveBeenCalled(); expect($('#stock-form-modal')).toBeNull()
  })
  it('shows the server error instead of closing when save fails', async () => {
    w().api.post = vi.fn(async () => { throw { response: { data: { error: 'nope' } } } })
    await w().showStockForm(); await flush()
    pick('company_id', '1'); pick('account_id', '9'); set('quantity', '1'); set('price', '1')
    await submit()
    expect(w().alert).toHaveBeenCalledWith('nope'); expect($('#stock-form-modal')).not.toBeNull()
  })
  it('cancel and the X close it', async () => {
    await w().showStockForm(); await flush()
    $('[data-mk="cancel"]').click(); expect($('#stock-form-modal')).toBeNull()
    await w().showStockForm(); await flush()
    $('[data-mk="x"]').click(); expect($('#stock-form-modal')).toBeNull()
  })
})

describe('edit stock modal', () => {
  const open = { id: 5, company_id: 2, account_id: 9, trade_type: 'BUY', quantity: 30, price: 10, commission: 2, trade_date: '2026-01-02', strategy_type: 'DIVIDEND_ETFS', notes: 'n', is_open: 1 }
  it('loads an open trade', async () => {
    mock(open)
    await w().showStockForm(5); await flush()
    expect($('[data-mk="header"]').textContent).toContain('Edit Stock Trade')
    expect($('#stockForm [name="company_id"]').value).toBe('2')
    expect($('#stockForm [name="quantity"]').value).toBe('30')
    expect($('#stockForm [name="strategy_type"]:checked').value).toBe('DIVIDEND_ETFS')
    expect($('#stockForm [name="close_date"]')).toBeNull()
    expect(text()).toContain('$302.00')
    await submit()
    expect(w().api.put).toHaveBeenCalledWith('/api/stocks/5', expect.objectContaining({ quantity: 30, strategy_type: 'DIVIDEND_ETFS' }))
  })
  it('a closed trade shows its P/L and editable closing details; a 0 close price is kept', async () => {
    mock({ ...open, is_open: 0, profit_loss: -120.5, close_date: '2026-02-03', closed_date: '2026-02-03', close_price: 0, close_commission: 1 })
    await w().showStockForm(5); await flush()
    expect($('#stock-form-modal').textContent).toContain('-$120.50')
    expect($('#stockForm [name="close_date"]').value).toBe('2026-02-03')
    expect($('#stockForm [name="close_price"]').value).toBe('0')
    await submit()
    const sent = w().api.put.mock.calls[0][1]
    expect(sent.close_date).toBe('2026-02-03'); expect(sent.close_price).toBe(0); expect(sent.close_commission).toBe(1)
  })
})
