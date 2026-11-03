// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

// The monthly income report is drawn by functions in app.js; load just those, plus the Menu Settings script.
const w = () => window as any
const app = fs.readFileSync(path.resolve(__dirname, '../../public/static/app.js'), 'utf8')
const start = app.indexOf('// A switched-off area (Profile > Menu Settings)')
if (start < 0) throw new Error('monthly income report code not found in app.js')
w().eval("function formatCurrency(v) { return '$' + Number(v || 0).toFixed(2) }")
w().eval(app.slice(start))
w().eval(fs.readFileSync(path.resolve(__dirname, '../../public/static/menu-settings.js'), 'utf8'))

const none = { results: [] as any[] }
const strat = { closedPL: none, coveredCalls: none, dividends: none }
const data = () => ({
  year: 2026, month: 10, startDate: '2026-10-01', endDate: '2026-11-01',
  stockInvestments: { dividendETFs: strat, stockpiling: strat, wheel: strat },
  optionTrades: { shortPutsWheel: { results: [{ ticker: 'AAA', profit_loss: 120 }] }, shortPutsStockpiling: none, shortPutsLongTerm: none, dteTrades: { profitLoss: 300, tradeCount: 3 } },
})
const hide = async (list: string[]) => { w().api = { get: vi.fn(async () => ({ data: { hidden: list } })) }; await w().MenuSettings.load() }
const render = () => {
  document.body.innerHTML = '<div id="monthly-income-content"></div>'
  w().renderMonthlyIncomeReport(data())
  return document.getElementById('monthly-income-content')!.textContent!.replace(/\s+/g, ' ')
}

beforeEach(() => { localStorage.clear(); w().MenuSettings.reset() })

describe('monthly income report and Menu Settings', () => {
  it('shows every section with all areas on', () => {
    const t = render()
    expect(t).toContain('Stock Investments'); expect(t).toContain('Short Puts (Wheel)'); expect(t).toContain('0DTE SPX Trades'); expect(t).toContain('Option Trades Total')
  })
  it('leaves out the 0DTE SPX line when 0DTE SPX is switched off, and keeps the option lines', async () => {
    await hide(['daily-trade'])
    const t = render()
    expect(t).not.toContain('0DTE SPX'); expect(t).toContain('Short Puts (Wheel)'); expect(t).toContain('Option Trades Total')
  })
  it('leaves out the short-put lines when Options Trades is switched off, and keeps 0DTE', async () => {
    await hide(['options'])
    const t = render()
    expect(t).not.toContain('Short Puts'); expect(t).toContain('0DTE SPX Trades')
  })
  it('leaves out the whole Option Trades section when both Options Trades and 0DTE SPX are off', async () => {
    await hide(['options', 'daily-trade'])
    const t = render()
    expect(t).not.toContain('Option Trades'); expect(t).not.toContain('0DTE'); expect(t).toContain('Stock Investments'); expect(t).toContain('Total Income for October 2026')
  })
  it('leaves out Stock Investments only when both Stock Trades and Options Trades are off (covered calls are option trades)', async () => {
    await hide(['stocks']); expect(render()).toContain('Stock Investments')
    await hide(['stocks', 'options']); expect(render()).not.toContain('Stock Investments')
  })
  it('switching everything back on restores the report', async () => {
    await hide(['stocks', 'options', 'daily-trade']); await hide([])
    const t = render()
    expect(t).toContain('Stock Investments'); expect(t).toContain('0DTE SPX Trades')
  })
})
