// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as Calc from '../lib/calc'

const w = () => window as any
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../public/static/' + f), 'utf8')
const flush = () => new Promise(r => setTimeout(r, 0))
const $ = (sel: string) => document.querySelector(sel) as any
const set = (name: string, v: string) => { const el = $(`#editCoveredCallForm [name="${name}"]`); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })) }
const submit = async () => { $('#editCoveredCallForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await flush() }
const text = () => $('#cc-edit-analysis').textContent.replace(/\s+/g, ' ')
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0]

const openCC = (over: any = {}) => ({ id: 31, ticker: 'ABC', strike_price: 55, premium: 0.85, quantity: 2, commission: 1.3, trade_date: '2026-10-01',
  expiration_date: inDays(60), is_open: 1, notes: 'hello <b>', ...over })

function mock(cc: any) {
  w().api = {
    get: vi.fn(async (url: string) => url === '/api/stocks' ? { data: [{ id: 7 }, { id: 8 }] } : { data: url === '/api/stocks/8/covered-calls' ? [cc] : [] }),
    put: vi.fn(async () => ({ data: {} }))
  }
}

beforeEach(() => {
  document.body.innerHTML = '<div id="stock-details-modal"></div>'
  w().Calc = Calc
  w().eval(read('modal-kit.js')); w().eval(read('modal-cc-manage.js'))
  w().alert = vi.fn(); w().showStockDetails = vi.fn(); w().loadStocks = vi.fn(); w().loadDashboard = vi.fn(); w().closeCoveredCall = vi.fn()
})

describe('covered call details', () => {
  it('finds the call on any holding and shows an amber open-position view', async () => {
    mock(openCC())
    await w().viewCoveredCallDetails(31); await flush()
    const m = $('#covered-call-details-modal')
    expect(m.querySelector('[data-mk="header"]').className).toContain('from-amber-600')
    expect(m.textContent).toContain('Open Position'); expect(m.textContent).toContain('$170.00')
    expect(m.textContent).toContain('hello <b>')            // notes are escaped, not injected
    expect(m.querySelector('[data-mk="expiry"]').textContent).not.toContain('URGENT')
    expect(m.querySelector('[data-mk="edit"]')).not.toBeNull()
  })
  it('flags calls expiring within two weeks as urgent and within a month as soon', async () => {
    mock(openCC({ expiration_date: inDays(5) })); await w().viewCoveredCallDetails(31); await flush()
    expect($('[data-mk="expiry"]').textContent).toContain('URGENT')
    mock(openCC({ expiration_date: inDays(25) })); await w().viewCoveredCallDetails(31); await flush()
    expect($('[data-mk="expiry"]').textContent).toContain('SOON')
  })
  it('a closed call shows its closing details and no edit or close buttons', async () => {
    mock(openCC({ is_open: 0, close_date: '2026-11-15', close_price: 0.1, close_commission: 1, profit_loss: 150.5 }))
    await w().viewCoveredCallDetails(31); await flush()
    const m = $('#covered-call-details-modal')
    expect(m.textContent).toContain('Closing Details'); expect(m.textContent).toContain('+$150.50'); expect(m.textContent).toContain('2026-11-15')
    expect(m.querySelector('[data-mk="edit"]')).toBeNull(); expect(m.querySelector('[data-mk="close-position"]')).toBeNull()
  })
  it('Edit Details and Close Position hand over to their modals', async () => {
    mock(openCC()); w().editCoveredCall = vi.fn()
    await w().viewCoveredCallDetails(31); await flush()
    $('[data-mk="edit"]').click(); expect(w().editCoveredCall).toHaveBeenCalledWith(31); expect($('#covered-call-details-modal')).toBeNull()
    await w().viewCoveredCallDetails(31); await flush()
    $('[data-mk="close-position"]').click(); expect(w().closeCoveredCall).toHaveBeenCalledWith(31, 8)
  })
  it('says so when the call does not exist', async () => {
    mock(openCC()); await w().viewCoveredCallDetails(999); await flush()
    expect(w().alert).toHaveBeenCalledWith('Covered call not found'); expect($('#covered-call-details-modal')).toBeNull()
  })
})

describe('edit covered call', () => {
  it('loads the call, replaces the stock details modal and shows the premium analysis', async () => {
    mock(openCC()); await w().editCoveredCall(31); await flush()
    expect($('#stock-details-modal')).toBeNull()
    expect($('[data-mk="header"]').className).toContain('from-amber-600')
    expect($('#editCoveredCallForm [name="strike_price"]').value).toBe('55')
    expect($('#editCoveredCallForm [name="close_date"]')).toBeNull()
    expect(text()).toContain('$170.00'); expect(text()).toContain('$168.70'); expect(text()).toContain('200')
    set('premium', '1'); set('quantity', '3')
    expect(text()).toContain('$300.00'); expect(text()).toContain('$298.70')
  })
  it('saves the open call with the holding id and no close fields, then reopens stock details', async () => {
    mock(openCC()); await w().editCoveredCall(31); await flush()
    set('strike_price', '56.5'); set('notes', 'n2')
    await submit()
    const [url, body] = w().api.put.mock.calls[0]
    expect(url).toBe('/api/covered-calls/31')
    expect(body).toMatchObject({ strike_price: 56.5, premium: 0.85, quantity: 2, commission: 1.3, notes: 'n2', holding_id: 8 })
    expect(body.close_date).toBeUndefined()
    expect(w().showStockDetails).toHaveBeenCalledWith(8); expect(w().loadStocks).toHaveBeenCalled(); expect($('#edit-covered-call-modal')).toBeNull()
  })
  it('a closed call shows realized P/L live and keeps a close price of 0', async () => {
    mock(openCC({ is_open: 0, close_date: '2026-11-15', close_price: 0.25, close_commission: 1 }))
    await w().editCoveredCall(31); await flush()
    expect(text()).toContain('+$117.70')               // 170 - 50 - 1.3 - 1 = 117.70
    set('close_price', '0')
    expect(text()).toContain('+$167.70')
    await submit()
    const body = w().api.put.mock.calls[0][1]
    expect(body.close_price).toBe(0); expect(body.close_date).toBe('2026-11-15'); expect(body.close_commission).toBe(1)
  })
  it('cancel and X return to the stock details; server errors keep the form open', async () => {
    mock(openCC()); await w().editCoveredCall(31); await flush()
    $('[data-mk="cancel"]').click()
    expect(w().showStockDetails).toHaveBeenCalledWith(8); expect($('#edit-covered-call-modal')).toBeNull()
    mock(openCC()); w().api.put = vi.fn(async () => { throw { response: { data: { error: 'nope' } } } })
    await w().editCoveredCall(31); await flush(); await submit()
    expect(w().alert).toHaveBeenCalledWith('nope'); expect($('#edit-covered-call-modal')).not.toBeNull()
  })
})
