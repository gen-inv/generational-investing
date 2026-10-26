// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as Calc from '../lib/calc'

const load = (f: string) => (window as any).eval(fs.readFileSync(path.resolve(__dirname, '../../public/static/' + f), 'utf8'))
const w = () => window as any

const cc = { id: 5, ticker: 'ABC', strike_price: 55, premium: 0.85, quantity: 1, commission: 1.3, expiration_date: '2026-12-18', account_name: 'Interactive Brokers', account_type_name: 'Margin' }
const put = { id: 1, ticker: 'XYZ', strategy_type: 'SELLING_PUT', strike_price: 50, premium: 1.2, quantity: 3, commission: 4, trade_date: '2026-10-01', expiration_date: '2026-12-18', account_name: 'Questrade', account_type_name: 'RRSP' }
const spread = { id: 2, ticker: 'XYZ', strategy_type: 'CREDIT_SPREAD', strike_price: 50, strike_price_2: 45, premium: 2.5, premium_2: 1, quantity: 2, commission: 1.3, trade_date: '2026-10-01', expiration_date: '2026-12-18' }
const condor = { id: 3, ticker: 'XYZ', strategy_type: 'IRON_CONDOR', strike_price: 60, strike_price_2: 65, strike_price_3: 45, strike_price_4: 40, premium: 1.0, premium_2: 0.3, premium_3: 0.9, premium_4: 0.2, quantity: 1, commission: 2.6, trade_date: '2026-10-01', expiration_date: '2026-12-18' }
const longCall = { id: 4, ticker: 'XYZ', strategy_type: 'LONG_CALL', strike_price: 60, premium: 1.5, quantity: 1, commission: 1, trade_date: '2026-10-01', expiration_date: '2026-12-18' }
const options = [put, spread, condor, longCall]

let api: any
const type = (formId: string, name: string, value: string) => {
  const el = document.querySelector(`#${formId} [name="${name}"]`) as HTMLInputElement
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const analysis = () => document.getElementById('close-analysis')!.textContent!.replace(/\s+/g, ' ')
const submit = (formId: string) => document.getElementById(formId)!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
const priceInputs = () => document.querySelectorAll('#closeOptionForm input[name^="close_price"]')

beforeEach(() => {
  document.body.innerHTML = '<div id="stock-details-modal"></div>'
  api = {
    get: vi.fn(async (url: string) => ({ data: url.includes('covered-calls') ? [cc] : options })),
    put: vi.fn(async () => ({ data: {} })),
  }
  const g = w()
  g.api = api; g.Calc = Calc; g.alert = vi.fn()
  g.showStockDetails = vi.fn(); g.loadStocks = vi.fn(); g.loadDashboard = vi.fn(); g.loadOptions = vi.fn()
  if (!g.ModalKit) load('modal-kit.js')
  load('modal-close.js')
})

describe('close covered call modal', () => {
  const open = () => w().closeCoveredCall(5, 9)
  const dateField = () => document.querySelector('#closeCoveredCallForm [name="close_date"]') as HTMLInputElement
  const hint = () => dateField().closest('div')!.querySelector('small')!.textContent
  // 8:30 pm on Oct 26, local time: in a zone behind UTC the UTC date is already Oct 27, which must not leak into the default
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 26, 20, 30)) })
  afterEach(() => { vi.useRealTimers() })

  it('opens amber, replaces the details modal, defaults the close date to today, and shows the opening P/L', async () => {
    await open()
    const modal = document.getElementById('close-covered-call-modal')!
    expect(modal.querySelector('[data-mk="header"]')!.className).toContain('from-amber-600')
    expect(document.getElementById('stock-details-modal')).toBeNull()
    expect((modal.querySelector('[name="close_date"]') as HTMLInputElement).value).toBe('2026-10-26')
    expect(analysis()).toContain('Net profit / loss +$83.70')   // 0.85 x 100 - 1.30, close price 0
  })

  it('close date: today until the expiration date has passed, then the expiration date', async () => {
    await open()
    expect(dateField().value).toBe('2026-10-26'); expect(hint()).toBe('Defaults to current date')
    api.get.mockResolvedValueOnce({ data: [{ ...cc, expiration_date: '2026-10-26' }] })      // expires today: not passed yet
    await open()
    expect(dateField().value).toBe('2026-10-26'); expect(hint()).toBe('Defaults to current date')
    api.get.mockResolvedValueOnce({ data: [{ ...cc, expiration_date: '2026-10-23' }] })      // already expired
    await open()
    expect(dateField().value).toBe('2026-10-23'); expect(hint()).toBe('Defaults to expiration date (exp date has passed)')
    api.get.mockResolvedValueOnce({ data: [{ ...cc, expiration_date: '2026-10-27' }] })      // tomorrow
    await open()
    expect(dateField().value).toBe('2026-10-26')
  })

  it('shows the account in the header: name plus type, once, escaped, and nothing without an account', async () => {
    const acct = () => document.querySelector('#close-covered-call-modal [data-mk="account"]')
    await open()
    expect(acct()!.textContent).toContain('Account: Interactive Brokers (Margin)')
    expect(document.querySelector('#close-covered-call-modal [data-mk="header"]')!.contains(acct())).toBe(true)
    api.get.mockResolvedValueOnce({ data: [{ ...cc, account_name: 'Questrade RRSP', account_type_name: 'RRSP' }] })
    await open()
    expect(acct()!.textContent).toContain('Account: Questrade RRSP'); expect(acct()!.textContent).not.toContain('(RRSP)')
    api.get.mockResolvedValueOnce({ data: [{ ...cc, account_name: '<img src=x onerror=alert(1)>', account_type_name: null }] })
    await open()
    expect(document.querySelector('#close-covered-call-modal img')).toBeNull(); expect(acct()!.textContent).toContain('<img')
    api.get.mockResolvedValueOnce({ data: [{ ...cc, account_name: null, account_type_name: null }] })
    await open()
    expect(acct()).toBeNull()
  })

  it('live P/L follows close price and commission', async () => {
    await open()
    type('closeCoveredCallForm', 'close_price', '0.25'); type('closeCoveredCallForm', 'commission', '0.65')
    expect(analysis()).toContain('Net profit / loss +$58.05')   // (0.85 - 0.25) x 100 - 1.30 - 0.65
    expect(analysis()).toContain("Net P/L updates your stock's cost basis")
    type('closeCoveredCallForm', 'close_price', '1.5')
    expect(analysis()).toContain('Net profit / loss -$66.95')   // (0.85 - 1.5) x 100 - 1.30 - 0.65
  })

  it('saves the close and returns to the stock details', async () => {
    await open()
    type('closeCoveredCallForm', 'close_date', '2026-11-15'); type('closeCoveredCallForm', 'close_price', '0.25'); type('closeCoveredCallForm', 'commission', '0.65')
    submit('closeCoveredCallForm')
    await vi.waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(api.put).toHaveBeenCalledWith('/api/covered-calls/5/close', { close_date: '2026-11-15', close_price: 0.25, close_commission: 0.65 })
    await vi.waitFor(() => expect(w().showStockDetails).toHaveBeenCalledWith(9))
    expect(w().alert.mock.calls[0][0]).toContain('Profit: $58.05')
    expect(document.getElementById('close-covered-call-modal')).toBeNull()
  })

  it('Cancel goes back to the stock details; a server error keeps the modal open', async () => {
    await open()
    ;(document.querySelector('[data-mk="cancel"]') as HTMLElement).click()
    expect(w().showStockDetails).toHaveBeenCalledWith(9)
    api.put.mockRejectedValueOnce({ response: { data: { error: 'Covered call is already closed' } } })
    await open()
    submit('closeCoveredCallForm')
    await vi.waitFor(() => expect(w().alert).toHaveBeenCalledWith('Covered call is already closed'))
    expect(document.getElementById('close-covered-call-modal')).not.toBeNull()
  })

  it('alerts when the covered call cannot be found', async () => {
    api.get.mockResolvedValueOnce({ data: [] })
    await open()
    expect(w().alert).toHaveBeenCalledWith('Covered call not found')
  })
})

describe('ModalKit account line and label', () => {
  it('accountLabel combines name and type without repeating it', () => {
    const L = w().ModalKit.accountLabel
    expect(L('Interactive Brokers', 'Margin')).toBe('Interactive Brokers (Margin)')
    expect(L('Questrade RRSP', 'RRSP')).toBe('Questrade RRSP')
    expect(L('Questrade', 'rrsp')).toBe('Questrade (rrsp)')
    expect(L('Cash', null)).toBe('Cash'); expect(L(null, 'TFSA')).toBe('TFSA'); expect(L(null, null)).toBe(''); expect(L('  ', undefined)).toBe('')
  })
  it('any modal can show an account by passing account to ModalKit.open; none shown when omitted', () => {
    const m = w().ModalKit.open({ id: 'x', strategy: 'SELLING_PUT', title: 'T', subtitle: 'S', account: 'Cash', body: '' })
    expect(m.qs('[data-mk="account"]').textContent).toContain('Account: Cash')
    const n = w().ModalKit.open({ id: 'y', strategy: 'SELLING_PUT', title: 'T', body: '' })
    expect(n.qs('[data-mk="account"]')).toBeNull()
  })
})

describe('close option modal', () => {
  const open = (id: number) => w().closeOption(id)

  it.each([
    [1, 'from-emerald-600', 1], [2, 'from-indigo-600', 2], [3, 'from-fuchsia-600', 4], [4, 'from-sky-600', 1],
  ])('option %i: header colour %s and %i close-price field(s)', async (id, colour, legs) => {
    await open(id)
    const modal = document.getElementById('close-option-modal')!
    expect(modal.querySelector('[data-mk="header"]')!.className).toContain(colour)
    expect(priceInputs().length).toBe(legs)
  })

  it('short put: live analysis matches the tested P/L (3 contracts, 1.20 -> 0.30, commissions 4 + 4 = 262)', async () => {
    await open(1)
    type('closeOptionForm', 'close_price', '0.3'); type('closeOptionForm', 'close_commission', '4')
    const t = analysis()
    expect(t).toContain('Opening premium +$360.00')
    expect(t).toContain('Closing cost -$90.00')
    expect(t).toContain('Net profit / loss +$262.00')
    expect(t).toContain('Profitable trade')
  })

  it('long call: debit strategy shows the opening cost as negative', async () => {
    await open(4)
    type('closeOptionForm', 'close_price', '3'); type('closeOptionForm', 'close_commission', '1')
    const t = analysis()
    expect(t).toContain('Opening premium -$150.00')
    expect(t).toContain('Closing cost +$300.00')
    expect(t).toContain('Net profit / loss +$148.00')
  })

  it('credit spread and iron condor combine their legs', async () => {
    await open(2)
    type('closeOptionForm', 'close_price', '0.5'); type('closeOptionForm', 'close_price_2', '0.2'); type('closeOptionForm', 'close_commission', '1.3')
    expect(analysis()).toContain('Net profit / loss +$237.40')
    await open(3)
    ;['close_price', 'close_price_2', 'close_price_3', 'close_price_4'].forEach((n, i) => type('closeOptionForm', n, ['0.2', '0.05', '0.15', '0.05'][i]))
    type('closeOptionForm', 'close_commission', '2.6')
    expect(analysis()).toContain('Net profit / loss +$109.80')
  })

  it('shows the account in the header, and defaults the close date to today in local time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 26, 20, 30))   // 8:30 pm local: the UTC date may already be the 27th
    try {
      await open(1)
      expect(document.querySelector('#close-option-modal [data-mk="account"]')!.textContent).toContain('Account: Questrade (RRSP)')
      expect((document.querySelector('#closeOptionForm [name="close_date"]') as HTMLInputElement).value).toBe('2026-10-26')
      await open(2)   // this row carries no account
      expect(document.querySelector('#close-option-modal [data-mk="account"]')).toBeNull()
    } finally { vi.useRealTimers() }
  })

  it('shows a loss clearly', async () => {
    await open(1)
    type('closeOptionForm', 'close_price', '3')
    expect(analysis()).toContain('Loss on trade')
    expect(analysis()).toContain('Net profit / loss -$')
  })

  it('shows each leg\'s original strike and premium', async () => {
    await open(2)
    const text = document.getElementById('close-option-modal')!.textContent!
    expect(text).toContain('strike $50.00, premium $2.50')
    expect(text).toContain('strike $45.00, premium $1.00')
  })

  it('saves only the close fields, with prices in the stored column names', async () => {
    await open(3)
    type('closeOptionForm', 'close_date', '2026-11-20')
    ;['close_price', 'close_price_2', 'close_price_3', 'close_price_4'].forEach((n, i) => type('closeOptionForm', n, ['0.2', '0.05', '0.15', '0.05'][i]))
    type('closeOptionForm', 'close_commission', '2.6')
    submit('closeOptionForm')
    await vi.waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(api.put).toHaveBeenCalledWith('/api/options/3', {
      close_date: '2026-11-20', close_commission: 2.6, close_price: 0.2, close_price_2: 0.05, close_price_3: 0.15, close_price_4: 0.05,
    })
    await vi.waitFor(() => expect(w().loadOptions).toHaveBeenCalled())
    expect(w().alert.mock.calls[0][0]).toContain('Net P/L: $109.80')
    expect(document.getElementById('close-option-modal')).toBeNull()
  })

  it('Cancel just closes; a server error shows its message and keeps the modal', async () => {
    await open(1)
    ;(document.querySelector('[data-mk="cancel"]') as HTMLElement).click()
    expect(document.getElementById('close-option-modal')).toBeNull()
    expect(w().showStockDetails).not.toHaveBeenCalled()
    api.put.mockRejectedValueOnce({ response: { data: { error: 'Trade not found' } } })
    await open(1)
    type('closeOptionForm', 'close_price', '0.3')
    submit('closeOptionForm')
    await vi.waitFor(() => expect(w().alert).toHaveBeenCalledWith('Trade not found'))
    expect(document.getElementById('close-option-modal')).not.toBeNull()
  })

  it('alerts when the option cannot be found', async () => {
    await open(99)
    expect(w().alert).toHaveBeenCalledWith('Option trade not found')
  })
})
