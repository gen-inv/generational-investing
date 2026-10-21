// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(path.resolve(__dirname, '../../public/static/discovery.js'), 'utf8')
const w = () => window as any
w().eval(src)
const V = () => w().DiscoveryView
const NOW = Date.parse('2026-10-20T12:00:00Z')

describe('discovery view', () => {
  it('escapes agent-written text everywhere', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const out = V().render({ scans: [{ scan_type: 'guru', last_run_at: '2026-10-18T00:00:00Z', note: evil }],
      findings: [{ scan_type: 'guru', ticker: 'AAA', company_name: evil, headline: evil, tier: evil, details: evil, data: { k: evil }, found_at: '2026-10-18T00:00:00Z' }] }, 'guru', NOW)
    expect(out.status + out.list).not.toContain('<img')
    expect(out.list).toContain('&lt;img')
  })
  it('shows only the selected tab and an empty state', () => {
    const state = { scans: [], findings: [{ scan_type: 'maturing', ticker: 'ZZZ', headline: 'h', found_at: '2026-10-18T00:00:00Z' }] }
    expect(V().render(state, 'guru', NOW).list).toContain('No guru purchases')
    expect(V().render(state, 'maturing', NOW).list).toContain('ZZZ')
    expect(V().render(state, 'guru', NOW).status).toContain('not reported in yet')
  })
  it('shows last run and flags an overdue scan', () => {
    const fresh = V().statusLine({ scan_type: 'guru', last_run_at: '2026-10-18T12:00:00Z', gurus_scanned: 70, candidates_found: 4 }, 'guru', NOW)
    expect(fresh).toContain('2 days ago'); expect(fresh).toContain('70 gurus'); expect(fresh).not.toContain('overdue')
    expect(V().statusLine({ scan_type: 'guru', last_run_at: '2026-09-20T12:00:00Z' }, 'guru', NOW)).toContain('overdue')
  })
  it('shows a status badge for added and override findings, none for plain alerts', () => {
    const mk = (status: string) => V().render({ scans: [], findings: [{ scan_type: 'guru', ticker: 'MCO', headline: 'h', status, found_at: '2026-10-18T00:00:00Z' }] }, 'guru', NOW).list
    expect(mk('added')).toContain('Added to roster')
    expect(mk('potential_override')).toContain('Potential override')
    expect(mk('alerted')).not.toContain('rounded text-xs')
    expect(mk('<b>x</b>')).not.toContain('<b>')
  })
  it('page wires the Discovery tab and script', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../routes/frontend.ts'), 'utf8')
    expect(html).toContain('id="discovery-utility"'); expect(html).toContain('/static/discovery.js'); expect(html).toContain("loadDiscovery()")
  })
})
