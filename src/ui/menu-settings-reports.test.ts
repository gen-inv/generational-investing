// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const w = () => window as any
w().eval(fs.readFileSync(path.resolve(__dirname, '../../public/static/menu-settings.js'), 'utf8'))
const M = () => w().MenuSettings

const TABS = ['overview', 'pl-summary', 'performance', 'strategy', 'positions', 'dividends', 'monthly-income', 'closed-trades']
const tab = (t: string) => document.querySelector(`.report-tab[data-tab="${t}"]`) as HTMLElement
const hiddenTab = (t: string) => tab(t).classList.contains('hidden')
const opt = (v: string) => document.querySelector(`#closed-trade-type option[value="${v}"]`) as HTMLOptionElement
const sel = () => document.getElementById('closed-trade-type') as HTMLSelectElement
const hide = async (list: string[]) => { w().api = { get: vi.fn(async () => ({ data: { hidden: list } })) }; await M().load() }

beforeEach(() => {
  document.body.innerHTML = TABS.map((t) => `<button class="report-tab" data-tab="${t}">${t}</button>`).join('') +
    '<select id="closed-trade-type"><option value="all">All</option><option value="stocks">Stocks</option><option value="options">Options</option></select>'
  localStorage.clear()
  M().reset()
})

describe('menu settings in the reports screen', () => {
  it('with everything on, every report tab and filter choice is there', () => {
    TABS.forEach((t) => expect(hiddenTab(t)).toBe(false))
    ;['all', 'stocks', 'options'].forEach((v) => expect(opt(v).disabled).toBe(false))
  })
  it('Stock Trades off hides the position and dividend reports and the stock filter choice', async () => {
    await hide(['stocks'])
    expect(hiddenTab('positions')).toBe(true); expect(hiddenTab('dividends')).toBe(true)
    expect(hiddenTab('strategy')).toBe(false); expect(hiddenTab('closed-trades')).toBe(false); expect(hiddenTab('overview')).toBe(false)
    expect(opt('stocks').disabled).toBe(true); expect(opt('stocks').hidden).toBe(true); expect(opt('options').disabled).toBe(false)
  })
  it('the strategy report stays while either Options Trades or 0DTE SPX is on, and goes when both are off', async () => {
    await hide(['daily-trade']); expect(hiddenTab('strategy')).toBe(false)
    await hide(['options']); expect(hiddenTab('strategy')).toBe(false)
    await hide(['options', 'daily-trade']); expect(hiddenTab('strategy')).toBe(true)
  })
  it('closed trades goes when both Stock Trades and Options Trades are off', async () => {
    await hide(['stocks']); expect(hiddenTab('closed-trades')).toBe(false)
    await hide(['stocks', 'options']); expect(hiddenTab('closed-trades')).toBe(true)
  })
  it('a closed-trades filter that was on a now-unavailable choice falls back to All', async () => {
    sel().value = 'stocks'
    await hide(['stocks'])
    expect(sel().value).toBe('all')
  })
  it('switching everything back on restores the tabs and choices', async () => {
    await hide(['stocks', 'options', 'daily-trade'])
    await hide([])
    TABS.forEach((t) => expect(hiddenTab(t)).toBe(false))
    expect(opt('stocks').disabled).toBe(false); expect(opt('options').disabled).toBe(false)
  })
})
