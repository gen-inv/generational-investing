// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const w = () => window as any
w().eval(fs.readFileSync(path.resolve(__dirname, '../../public/static/menu-settings.js'), 'utf8'))
const M = () => w().MenuSettings

const NAV = ['dashboard', 'companies', 'accounts', 'stocks', 'options', 'daily-trade', 'utilities', 'reports']
const link = (k: string) => document.querySelector(`.nav-link[data-section="${k}"]`) as HTMLElement
const box = (k: string) => document.querySelector(`#menu-settings-modal [data-menu-key="${k}"]`) as HTMLInputElement
let api: any

beforeEach(() => {
  document.body.innerHTML = '<div id="user-dropdown"></div>' + NAV.map((k) => `<a class="nav-link${k === 'dashboard' ? ' active' : ''}" data-section="${k}">${k}</a>`).join('')
  api = { get: vi.fn(async () => ({ data: { hidden: [] } })), put: vi.fn(async (_u: string, b: any) => ({ data: { hidden: b.hidden } })) }
  w().api = api
  w().showSection = vi.fn()
  w().showNotification = vi.fn()
  localStorage.clear()
  M().reset()
})

describe('menu settings', () => {
  it('lists seven switchable areas, all on by default, and shows the dashboard as always on', () => {
    M().open()
    expect(document.querySelectorAll('#menu-settings-modal [data-menu-key]')).toHaveLength(7)
    expect(box('dashboard')).toBeNull()
    expect(document.querySelector('[data-menu-locked]')!.textContent).toContain('Always on')
    NAV.slice(1).forEach((k) => expect(box(k).checked).toBe(true))
  })
  it('saving sends the switched-off areas, hides them from the menu and closes the modal', async () => {
    M().open()
    box('stocks').click(); box('daily-trade').click()
    ;(document.querySelector('[data-menu-save]') as HTMLElement).click()
    await vi.waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(api.put).toHaveBeenCalledWith('/api/user/preferences', { hidden: ['stocks', 'daily-trade'] })
    await vi.waitFor(() => expect(document.getElementById('menu-settings-modal')).toBeNull())
    expect(link('stocks').classList.contains('hidden')).toBe(true)
    expect(link('daily-trade').classList.contains('hidden')).toBe(true)
    expect(link('options').classList.contains('hidden')).toBe(false)
    expect(link('dashboard').classList.contains('hidden')).toBe(false)
    expect(w().showNotification).toHaveBeenCalledWith('Menu settings saved')
  })
  it('reopening shows the saved choices as switched off', async () => {
    M().open(); box('reports').click()
    ;(document.querySelector('[data-menu-save]') as HTMLElement).click()
    await vi.waitFor(() => expect(document.getElementById('menu-settings-modal')).toBeNull())
    M().open()
    expect(box('reports').checked).toBe(false); expect(box('stocks').checked).toBe(true)
  })
  it('Cancel and the X close without saving', () => {
    M().open(); box('stocks').click()
    ;(document.querySelector('[data-menu-close]') as HTMLElement).click()
    expect(document.getElementById('menu-settings-modal')).toBeNull()
    expect(api.put).not.toHaveBeenCalled(); expect(link('stocks').classList.contains('hidden')).toBe(false)
  })
  it('if the open page is switched off, saving returns to the dashboard', async () => {
    link('dashboard').classList.remove('active'); link('options').classList.add('active')
    M().open(); box('options').click()
    ;(document.querySelector('[data-menu-save]') as HTMLElement).click()
    await vi.waitFor(() => expect(w().showSection).toHaveBeenCalledWith('dashboard'))
  })
  it('a failed save keeps the modal open, shows the error and changes nothing', async () => {
    api.put.mockRejectedValueOnce({ response: { data: { error: 'Unknown menu item: nope' } } })
    M().open(); box('stocks').click()
    ;(document.querySelector('[data-menu-save]') as HTMLElement).click()
    await vi.waitFor(() => expect(w().showNotification).toHaveBeenCalledWith('Unknown menu item: nope', 'error'))
    expect(document.getElementById('menu-settings-modal')).not.toBeNull()
    expect(link('stocks').classList.contains('hidden')).toBe(false)
  })
  it('guard sends a switched-off area to the dashboard and leaves the rest alone', async () => {
    api.get.mockResolvedValueOnce({ data: { hidden: ['stocks'] } })
    await M().load()
    expect(M().guard('stocks')).toBe('dashboard'); expect(M().guard('options')).toBe('options'); expect(M().guard('dashboard')).toBe('dashboard')
  })
  it('load paints the saved choice from the server, remembers it, and ignores junk', async () => {
    api.get.mockResolvedValueOnce({ data: { hidden: ['reports', 'dashboard', 'bogus'] } })
    await M().load()
    expect(link('reports').classList.contains('hidden')).toBe(true); expect(link('dashboard').classList.contains('hidden')).toBe(false)
    expect(JSON.parse(localStorage.getItem('menuHidden')!)).toEqual(['reports'])
  })
  it('if the server cannot be reached, the last remembered choice stays in place', async () => {
    localStorage.setItem('menuHidden', '["utilities"]')
    api.get.mockRejectedValueOnce(new Error('offline'))
    await M().load()
    expect(link('utilities').classList.contains('hidden')).toBe(true)
  })
  it('reset (sign-out) shows everything again and forgets the choice', async () => {
    api.get.mockResolvedValueOnce({ data: { hidden: ['stocks'] } })
    await M().load(); M().reset()
    expect(link('stocks').classList.contains('hidden')).toBe(false); expect(localStorage.getItem('menuHidden')).toBeNull()
  })
})
