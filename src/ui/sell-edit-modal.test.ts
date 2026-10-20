// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as Calc from '../lib/calc'

const w = () => window as any
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../public/static/' + f), 'utf8')
const flush = () => new Promise(r => setTimeout(r, 0))
const $ = (sel: string) => document.querySelector(sel) as any
const set = (name: string, v: string) => { const el = $(`#editSellForm [name="${name}"]`); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })) }
const submit = async () => { $('#editSellForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await flush() }
const text = () => $('#sell-edit-analysis').textContent

const tx = (id: number, type: string, shares: number, price: number, date: string, commission = 0, opt: number | null = null) =>
  ({ id, holding_id: 5, transaction_type: type, shares, price_per_share: price, transaction_date: date, commission, option_trade_id: opt })
const stock = (extra: any[] = []) => ({ id: 5, ticker: 'AAA', transactions: [tx(1, 'BUY', 100, 50, '2026-01-01', 5), tx(2, 'SELL', 100, 60, '2026-02-03', 2), ...extra] })

beforeEach(() => {
  document.body.innerHTML = ''
  w().Calc = Calc
  w().eval(read('modal-kit.js')); w().eval(read('modal-sell-edit.js'))
  w().alert = vi.fn(); w().loadStocks = vi.fn(); w().loadDashboard = vi.fn(); w().loadClosedTrades = vi.fn()
  w().showStockDetails = vi.fn(); w().showNotification = vi.fn()
  w().api = { get: vi.fn(async () => ({ data: stock() })), put: vi.fn(async () => ({ data: { success: true } })) }
})

describe('edit sale modal', () => {
  it('opens in Stock Blue with the sale prefilled and the current P/L', async () => {
    await w().editStockSell(5, 2); await flush()
    expect($('[data-mk="header"]').className).toContain('from-blue-600')
    expect($('#editSellForm [name="price_per_share"]').value).toBe('60')
    expect($('#editSellForm [name="transaction_date"]').value).toBe('2026-02-03')
    expect(text()).toContain('+$993.00')
  })
  it('live P/L follows price and commission, showing was/now', async () => {
    await w().editStockSell(5, 2); await flush()
    set('price_per_share', '70'); set('commission', '4')
    expect(text()).toContain('+$1,991.00'); expect(text()).toContain('was +$993.00')
    set('price_per_share', '40')
    expect(text()).toContain('-$1,009.00')
  })
  it('warns instead of previewing when the date would sell shares before they were bought', async () => {
    await w().editStockSell(5, 2); await flush()
    set('transaction_date', '2025-12-01')
    expect($('#sell-edit-analysis [data-mk="warning"]')).not.toBeNull()
  })
  it('saves through the sell route and refreshes the lists and the open details', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="stock-details-modal"></div>')
    await w().editStockSell(5, 2); await flush()
    set('price_per_share', '70'); set('transaction_date', '2026-02-10'); set('commission', '4')
    await submit()
    expect(w().api.put).toHaveBeenCalledWith('/api/stocks/5/sells/2', { transaction_date: '2026-02-10', price_per_share: 70, commission: 4 })
    expect($('#edit-sell-modal')).toBeNull()
    expect(w().loadStocks).toHaveBeenCalled(); expect(w().loadClosedTrades).toHaveBeenCalled(); expect(w().showStockDetails).toHaveBeenCalledWith(5)
  })
  it('does not save an invalid change', async () => {
    await w().editStockSell(5, 2); await flush()
    set('transaction_date', '2025-12-01')
    await submit()
    expect(w().api.put).not.toHaveBeenCalled(); expect(w().alert).toHaveBeenCalled()
  })
  it('shows the server error when the save is refused', async () => {
    w().api.put = vi.fn(async () => { throw { response: { data: { error: 'nope' } } } })
    await w().editStockSell(5, 2); await flush()
    set('price_per_share', '61'); await submit()
    expect(w().alert).toHaveBeenCalledWith('nope'); expect($('#edit-sell-modal')).not.toBeNull()
  })
  it('refuses a missing sale, a BUY, and an assignment-created sale', async () => {
    await w().editStockSell(5, 99); await flush()
    expect(w().alert).toHaveBeenCalledWith('Sale not found')
    w().api.get = vi.fn(async () => ({ data: stock([tx(3, 'SELL', 10, 80, '2026-03-01', 0, 777)]) }))
    await w().editStockSell(5, 3); await flush()
    expect(w().alert).toHaveBeenLastCalledWith('This sale came from an option assignment; edit the option trade instead')
    expect($('#edit-sell-modal')).toBeNull()
    await w().editStockSell(5, 1); await flush()
    expect(w().alert).toHaveBeenLastCalledWith('Sale not found')
  })
})
