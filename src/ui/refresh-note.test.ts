// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

const w = () => window as any
const src = fs.readFileSync(path.resolve(__dirname, '../../public/static/research-merge.js'), 'utf8')
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../..', p), 'utf8')

beforeEach(() => {
  w().eval(src)
  document.body.innerHTML = '<div id="card"><div id="wrap"><table><tbody id="companies-table"></tbody></table></div></div>'
})

describe('roster note for failed refreshes', () => {
  it('shows nothing when every company refreshed', () => {
    expect(w().refreshNoteHtml([{ ticker: 'AAA' }, { ticker: 'BBB', data_refresh_error: null }])).toBe('')
  })
  it('names the companies that failed, with the reasons on hover', () => {
    const html = w().refreshNoteHtml([{ ticker: 'BAC', data_refresh_error: 'no market cap found' }, { ticker: 'AAA' }, { ticker: 'MU', data_refresh_error: 'no earnings date found' }])
    expect(html).toContain('BAC, MU')
    expect(html).toContain('BAC: no market cap found')
    expect(html).not.toContain('AAA')
  })
  it('escapes anything odd in the error text', () => {
    expect(w().refreshNoteHtml([{ ticker: 'X', data_refresh_error: '<b>"x"</b>' }])).not.toContain('<b>')
  })
  it('puts the note above the roster table, and replaces it on the next visit instead of stacking', () => {
    w().showRefreshNote([{ ticker: 'BAC', data_refresh_error: 'no market cap found' }])
    w().showRefreshNote([{ ticker: 'BAC', data_refresh_error: 'no market cap found' }])
    expect(document.querySelectorAll('#companies-refresh-note')).toHaveLength(1)
    expect(document.getElementById('wrap')!.previousElementSibling!.id).toBe('companies-refresh-note')
    w().showRefreshNote([{ ticker: 'BAC' }])
    expect(document.getElementById('companies-refresh-note')).toBeNull()
  })
  it('the roster calls it when it loads, and an estimated earnings date is marked with ~', () => {
    expect(read('public/static/app.js')).toContain('showRefreshNote(companies)')
    expect(w().earningsCellHtml({ next_earnings_date: '2099-01-01', earnings_estimated: 1 })).toContain('~')
    expect(w().earningsCellHtml({ next_earnings_date: '2099-01-01', earnings_estimated: 0 })).not.toContain('~')
  })
})

describe('nightly job wiring', () => {
  it('the workflow runs every night and can be started by hand', () => {
    const wf = read('.github/workflows/refresh-company-data.yml')
    expect(wf).toContain("cron: '17 9 * * *'")
    expect(wf).toContain('workflow_dispatch')
    expect(wf).toContain('/api/cron/refresh-company-data')
  })
  it('the route checks the secret before doing anything', () => {
    const route = read('src/routes/companies.ts')
    expect(route).toContain("'/api/cron/refresh-company-data'")
    expect(route.indexOf('safeEqual(given')).toBeLessThan(route.indexOf('refreshCompanyData({'))
  })
  it('the migration adds the three columns', () => {
    const m = read('migrations/0035_company_data_refresh.sql')
    for (const c of ['data_refreshed_at', 'data_refresh_error', 'earnings_estimated']) expect(m).toContain(c)
  })
})
