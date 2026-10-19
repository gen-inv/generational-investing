// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as Calc from '../lib/calc'

const w = () => window as any
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../public/static/' + f), 'utf8')
const flush = () => new Promise(r => setTimeout(r, 0))
const $ = (sel: string) => document.querySelector(sel) as any
const set = (name: string, v: string) => { const el = $(`#optionForm [name="${name}"]`); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })) }
const choose = (v: string) => { const s = $('#strategy_type_select'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })) }
const submit = async () => { $('#optionForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await flush() }

const companies = [{ id: 1, ticker: 'AAA', company_name: 'Alpha', buy_price: 42.5 }, { id: 2, ticker: 'BBB', company_name: 'Beta', buy_price: null }]
const accounts = [{ id: 9, account_name: 'Main', account_type: 'TFSA' }]

function mock(options: any[] = []) {
  w().fetchCompaniesWithResearch = vi.fn(async () => companies)
  w().api = {
    get: vi.fn(async (url: string) => url === '/api/accounts' ? { data: { accounts } } : { data: options }),
    post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} }))
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  w().Calc = Calc
  w().eval(read('modal-kit.js')); w().eval(read('modal-option.js'))
  w().alert = vi.fn(); w().loadOptions = vi.fn(); w().loadDashboard = vi.fn(); w().loadClosedTrades = vi.fn(); w().showSection = vi.fn()
  w().currentStrategyFilter = 'SELLING_PUT'
  mock()
})

describe('add option modal', () => {
  it('starts on the strategy tab you are viewing, with that strategy header colour', async () => {
    w().currentStrategyFilter = 'IRON_CONDOR'
    await w().showOptionForm(); await flush()
    expect($('#strategy_type_select').value).toBe('IRON_CONDOR')
    expect($('[data-mk="header"]').className).toContain('from-fuchsia-600')
    expect(document.querySelectorAll('#strategy_fields_container input[name$="_strike"]').length).toBe(4)
  })
  it('a covered-call tab falls back to short put (covered calls are created from the stock modal)', async () => {
    w().currentStrategyFilter = 'COVERED_CALL'
    await w().showOptionForm(); await flush()
    expect($('#strategy_type_select').value).toBe('SELLING_PUT')
    expect([...document.querySelectorAll('#strategy_type_select option')].map((o: any) => o.value)).not.toContain('COVERED_CALL')
  })
  it('changing strategy swaps the header colour, the fields and keeps shared values', async () => {
    await w().showOptionForm(); await flush()
    expect($('[data-mk="header"]').className).toContain('from-emerald-600')
    set('commission', '1.5')
    choose('SELLING_PUT_WHEEL')
    expect($('[data-mk="header"]').className).toContain('from-teal-600')
    expect($('[data-mk="header"]').className).not.toContain('emerald')
    expect($('button[type="submit"]').className).toContain('bg-teal-600')
    expect($('#optionForm [name="commission"]').value).toBe('1.5')
    choose('CREDIT_SPREAD')
    expect($('[data-mk="header"]').className).toContain('from-indigo-600')
    expect($('#optionForm [name="short_strike"]')).not.toBeNull()
    expect($('#optionForm [name="strike_price"]')).toBeNull()
  })
  it('live analysis for a short put', async () => {
    await w().showOptionForm(); await flush()
    set('quantity', '2'); set('strike_price', '50'); set('premium', '2'); set('commission', '1.3')
    set('trade_date', '2026-10-01'); set('expiration_date', '2026-10-31')
    const t = $('#option-analysis').textContent
    expect(t).toContain('$9,601.30')   // risk 10000 - 400 + 1.30 ... 9601.30
    expect(t).toContain('$398.70')
    expect(t).toContain('30 days')
    expect(t).toContain('RORC')
    expect(t).toContain('ARORC')
  })
  it('iron condor analysis shows the net credit', async () => {
    w().currentStrategyFilter = 'IRON_CONDOR'
    await w().showOptionForm(); await flush()
    set('quantity', '1')
    ;[['short_call', 110, 1.5], ['long_call', 115, 0.5], ['short_put', 90, 1.5], ['long_put', 80, 0.5]].forEach(([k, s, p]) => { set(`${k}_strike`, String(s)); set(`${k}_premium`, String(p)) })
    expect($('#option-analysis').textContent).toContain('+$200.00')
  })
  it('shows the research buy price when a company is chosen', async () => {
    await w().showOptionForm(); await flush()
    const sel = $('#option_company_select'); sel.value = '1'; sel.dispatchEvent(new Event('change'))
    expect($('#option-buy-price-info').classList.contains('hidden')).toBe(false)
    expect($('#option-buy-price-info').textContent).toContain('$42.50')
    sel.value = '2'; sel.dispatchEvent(new Event('change'))
    expect($('#option-buy-price-info').classList.contains('hidden')).toBe(true)
  })
  it('saves a single-leg trade with the payload the route expects', async () => {
    await w().showOptionForm(); await flush()
    set('company_id', '1'); set('account_id', '9'); set('quantity', '2'); set('strike_price', '50'); set('premium', '2'); set('commission', '1.3')
    set('trade_date', '2026-10-01'); set('expiration_date', '2026-10-31')
    await submit()
    expect(w().api.post).toHaveBeenCalledWith('/api/options', expect.objectContaining({
      company_id: 1, ticker: 'AAA', strategy_type: 'SELLING_PUT', strike_price: 50, premium: 2, quantity: 2, commission: 1.3, account_id: 9, trade_date: '2026-10-01', expiration_date: '2026-10-31', is_open: true }))
    expect($('#option-form-modal')).toBeNull()
    expect(w().loadOptions).toHaveBeenCalled()
  })
  it('saves a spread with named leg fields and no single strike/premium', async () => {
    w().currentStrategyFilter = 'CREDIT_SPREAD'
    await w().showOptionForm(); await flush()
    set('company_id', '1'); set('account_id', '9'); set('quantity', '1'); set('expiration_date', '2026-10-31')
    set('short_strike', '100'); set('short_premium', '3'); set('long_strike', '95'); set('long_premium', '1')
    await submit()
    const body = w().api.post.mock.calls[0][1]
    expect(body).toMatchObject({ strategy_type: 'CREDIT_SPREAD', short_strike: 100, short_premium: 3, long_strike: 95, long_premium: 1 })
    expect(body.strike_price).toBeUndefined(); expect(body.premium).toBeUndefined()
  })
  it('Cancel closes without saving', async () => {
    await w().showOptionForm(); await flush()
    $('[data-mk="cancel"]').click()
    expect($('#option-form-modal')).toBeNull()
    expect(w().api.post).not.toHaveBeenCalled()
  })
})

describe('edit option modal', () => {
  const closedIC = { id: 7, company_id: 1, account_id: 9, strategy_type: 'IRON_CONDOR', quantity: 1, trade_date: '2026-10-01', expiration_date: '2026-10-31', commission: 4, notes: 'n',
    short_call_strike: 110, short_call_premium: 1.5, long_call_strike: 115, long_call_premium: 0.5, short_put_strike: 90, short_put_premium: 1.5, long_put_strike: 80, long_put_premium: 0.5,
    is_open: 0, close_date: '2026-10-20', close_price: 0.3, close_price_2: 0.1, close_price_3: 0.2, close_price_4: 0.05, close_commission: 4 }

  it('loads a closed iron condor with all four close prices and shows the realized P/L', async () => {
    mock([closedIC])
    await w().showOptionForm(7); await flush()
    expect($('#optionForm [name="short_put_strike"]').value).toBe('90')
    expect($('#optionForm [name="close_price_4"]').value).toBe('0.05')
    expect($('#optionForm [name="close_date"]').value).toBe('2026-10-20')
    // open credit 200, close cost (0.3-0.1)+(0.2-0.05)=0.35 -> 35, commissions 8 -> 157
    expect($('#option-analysis').textContent).toContain('+$157.00')
    expect($('[data-mk="header"]').className).toContain('from-fuchsia-600')
  })
  it('saves every close price, and a close price of 0 stays 0', async () => {
    mock([{ ...closedIC, strategy_type: 'SELLING_PUT', strike_price: 50, premium: 2, close_price: 0, close_price_2: null, close_price_3: null, close_price_4: null, quantity: 2, commission: 1.3 }])
    await w().showOptionForm(7); await flush()
    expect($('#optionForm [name="close_price"]').value).toBe('0')
    await submit()
    const body = w().api.put.mock.calls[0][1]
    expect(w().api.put.mock.calls[0][0]).toBe('/api/options/7')
    expect(body.close_price).toBe(0)
    expect(body.close_date).toBe('2026-10-20')
  })
  it('an open trade has no closing section', async () => {
    mock([{ ...closedIC, is_open: 1, close_date: null }])
    await w().showOptionForm(7); await flush()
    expect($('#close_fields_container')).toBeNull()
  })
  it('a covered call keeps its strategy locked and amber', async () => {
    mock([{ id: 8, company_id: 1, account_id: 9, strategy_type: 'COVERED_CALL', strike_price: 70, premium: 1, quantity: 1, trade_date: '2026-10-01', expiration_date: '2026-12-18', commission: 0, is_open: 1 }])
    await w().showOptionForm(8); await flush()
    expect($('#strategy_type_select')).toBeNull()
    expect($('#optionForm [name="strategy_type"]').value).toBe('COVERED_CALL')
    expect($('[data-mk="header"]').className).toContain('from-amber-600')
  })
  it('refuses to open for a trade that does not exist', async () => {
    mock([])
    await w().showOptionForm(99); await flush()
    expect(w().alert).toHaveBeenCalledWith('Option trade not found')
    expect($('#option-form-modal')).toBeNull()
  })
})
