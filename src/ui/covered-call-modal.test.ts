// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as Calc from '../lib/calc'

const load = (f: string) => (window as any).eval(fs.readFileSync(path.resolve(__dirname, '../../public/static/' + f), 'utf8'))

const stock = { id: 7, ticker: 'ABC', quantity: 250, account_name: 'Margin', cost_basis: 50, avg_price: 52 }
let api: any

const type = (name: string, value: string) => {
  const el = document.querySelector(`#coveredCallForm [name="${name}"]`) as HTMLInputElement
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const analysis = () => document.getElementById('cc-analysis')!.textContent!.replace(/\s+/g, ' ')
const open = async () => { await (window as any).initiateCoveredCall(7) }

beforeEach(() => {
  document.body.innerHTML = '<div id="stock-details-modal"></div>'
  const w = window as any
  api = { get: vi.fn(async () => ({ data: [stock] })), post: vi.fn(async () => ({ data: {} })) }
  w.api = api
  w.Calc = Calc
  w.alert = vi.fn()
  w.showStockDetails = vi.fn()
  w.loadStocks = vi.fn()
  w.loadDashboard = vi.fn()
  if (!w.ModalKit) load('modal-kit.js')
  load('modal-covered-call.js')
})

describe('covered call entry modal', () => {
  it('opens with the amber covered-call header and the position summary, replacing the details modal', async () => {
    await open()
    const modal = document.getElementById('covered-call-modal')!
    expect(modal).toBeTruthy()
    expect(document.getElementById('stock-details-modal')).toBeNull()
    expect(modal.querySelector('[data-mk="header"]')!.className).toContain('from-amber-600')
    expect(modal.textContent).toContain('Sell Covered Call')
    expect(modal.textContent).toContain('ABC')
    expect(modal.textContent).toMatch(/Max contracts\s*2/)   // 250 shares -> 2 contracts
    expect(modal.textContent).toContain('$50.00')            // cost basis
  })

  it('refuses when fewer than 100 shares are held, and when the stock is missing', async () => {
    api.get.mockResolvedValueOnce({ data: [{ ...stock, quantity: 99 }] })
    await open()
    expect((window as any).alert).toHaveBeenCalledWith('You need at least 100 shares to sell a covered call')
    expect(document.getElementById('covered-call-modal')).toBeNull()
    api.get.mockResolvedValueOnce({ data: [] })
    await open()
    expect((window as any).alert).toHaveBeenCalledWith('Stock not found')
  })

  it('shows a prompt until strike and premium are entered', async () => {
    await open()
    expect(analysis()).toContain('Enter a strike and premium')
  })

  it('live analysis matches the tested calculation (2 contracts, strike 55, premium 1.00, commission 2, 30 days)', async () => {
    api.get.mockResolvedValue({ data: [{ ...stock, quantity: 200 }] })
    await open()
    type('quantity', '2'); type('strike_price', '55'); type('premium', '1'); type('commission', '2')
    type('trade_date', '2026-11-01'); type('expiration_date', '2026-12-01')
    const t = analysis()
    expect(t).toContain('Net premium income +$198.00')
    expect(t).toContain('If called away: gain +$1,198.00')
    expect(t).toContain('Break-even price $49.01 / share')
    expect(t).toContain('Days to expiry 30')
    expect(t).toMatch(/Return if unchanged 1\.98% 24\.1% annualized/)
  })

  it('updates as the inputs change', async () => {
    await open()
    type('strike_price', '55'); type('premium', '1')
    const first = analysis()
    type('premium', '2')
    expect(analysis()).not.toEqual(first)
    expect(analysis()).toContain('Net premium income +$200.00')
  })

  it('warns when the strike is below cost basis, and when asking for more contracts than held', async () => {
    await open()
    type('strike_price', '45'); type('premium', '1'); type('quantity', '3')
    const warnings = [...document.querySelectorAll('[data-mk="warning"]')].map(e => e.textContent)
    expect(warnings.some(w => /only hold enough shares for 2 contracts/.test(w!))).toBe(true)
    expect(warnings.some(w => /below your cost basis of \$50\.00/.test(w!))).toBe(true)
  })

  it('below cost basis, states the cumulative loss if called away (premium included)', async () => {
    await open()
    type('strike_price', '45'); type('premium', '1'); type('quantity', '2'); type('commission', '0')
    const warnings = [...document.querySelectorAll('[data-mk="warning"]')].map(e => e.textContent!)
    expect(warnings.some(w => /If called away, you will have a cumulative loss of \$800\.00/.test(w))).toBe(true)
    expect(warnings.some(w => /realise|on the shares/.test(w))).toBe(false)
  })

  it('below cost basis but covered by premium, states a cumulative profit instead', async () => {
    await open()
    type('strike_price', '49.5'); type('premium', '3'); type('quantity', '2'); type('commission', '0')
    const warnings = [...document.querySelectorAll('[data-mk="warning"]')].map(e => e.textContent!)
    expect(warnings.some(w => /below your cost basis of \$50\.00/.test(w) && /cumulative profit of \$500\.00/.test(w))).toBe(true)
  })

  it('defaults the trade date to the local date, not the UTC date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 26, 20, 30))
    try {
      await open()
      expect((document.querySelector('#coveredCallForm [name="trade_date"]') as HTMLInputElement).value).toBe('2026-10-26')
    } finally { vi.useRealTimers() }
  })

  it('saves the covered call with the right payload, then returns to the stock details', async () => {
    await open()
    type('strike_price', '55'); type('premium', '0.85'); type('quantity', '2'); type('commission', '1.3')
    type('expiration_date', '2026-12-18'); type('trade_date', '2026-10-01'); type('notes', 'test')
    document.getElementById('coveredCallForm')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await vi.waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith('/api/stocks/7/covered-calls', {
      strike_price: 55, premium: 0.85, quantity: 2, expiration_date: '2026-12-18', trade_date: '2026-10-01', commission: 1.3, notes: 'test',
    })
    await vi.waitFor(() => expect((window as any).showStockDetails).toHaveBeenCalledWith(7))
    expect(document.getElementById('covered-call-modal')).toBeNull()
  })

  it('blocks saving more contracts than the position allows', async () => {
    await open()
    type('strike_price', '55'); type('premium', '1'); type('quantity', '5'); type('expiration_date', '2026-12-18')
    document.getElementById('coveredCallForm')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve()
    expect(api.post).not.toHaveBeenCalled()
    expect((window as any).alert).toHaveBeenCalledWith('Maximum 2 contracts allowed for this position')
  })

  it('Cancel and the X close the modal and go back to the stock details', async () => {
    await open()
    ;(document.querySelector('[data-mk="cancel"]') as HTMLElement).click()
    expect(document.getElementById('covered-call-modal')).toBeNull()
    expect((window as any).showStockDetails).toHaveBeenCalledWith(7)
    await open()
    ;(document.querySelector('[data-mk="x"]') as HTMLElement).click()
    expect(document.getElementById('covered-call-modal')).toBeNull()
  })

  it('shows an error from the server instead of closing', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { error: 'Insufficient shares' } } })
    await open()
    type('strike_price', '55'); type('premium', '1'); type('expiration_date', '2026-12-18')
    document.getElementById('coveredCallForm')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await vi.waitFor(() => expect((window as any).alert).toHaveBeenCalledWith('Insufficient shares'))
    expect(document.getElementById('covered-call-modal')).not.toBeNull()
  })
})