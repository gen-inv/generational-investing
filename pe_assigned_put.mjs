// Adds "P/E if assigned" to the Trade Analysis panel of the option form, for the three short put strategies. Display only.
// Run from the repo root:  node pe_assigned_put.mjs
import fs from 'fs'
import path from 'path'
import vm from 'vm'

const root = process.cwd()
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const misses = []
const count = (s, sub) => s.split(sub).length - 1
const read = rel => {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) { misses.push(rel + ': file not found (run this from the repo root)'); return null }
  const raw = fs.readFileSync(p, 'utf8')
  return { rel, p, orig: raw, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n'), changed: false }
}
const edit = (f, name, oldS, newS, doneMarker) => {
  if (!f) return
  if (f.text.includes(doneMarker)) return
  const n = count(f.text, oldS)
  if (n !== 1) { misses.push(f.rel + ': "' + name + '" matched ' + n + ' times (needs exactly 1)'); return }
  f.text = f.text.replace(oldS, () => newS); f.changed = true
}
const append = (f, name, add, doneMarker) => {
  if (!f || f.text.includes(doneMarker)) return
  f.text = f.text.replace(/\n*$/, '\n') + add; f.changed = true
}

const BLOCK = String.raw`
/* ---- P/E if a short put is assigned (Short Put: Stockpiling, Wheel and Long Term). Display only: it never changes the saved
 * trade or any calculation. ---- */

// Roughly where a P/E sits in the company's own history, interpolated (log scale) between the stored 5th percentile, median and 95th percentile
function peApproxPercentile(company, value) {
    var p5 = Number(company.pe_p5), med = Number(company.pe_median), p95 = Number(company.pe_p95), v = Number(value)
    if (!(p5 > 0 && med > p5 && p95 > med && v > 0)) return { pct: Math.round(peBarPosition(company, value).pos * 100), beyond: null }
    if (v < p5) return { pct: 5, beyond: 'below' }
    if (v > p95) return { pct: 95, beyond: 'above' }
    var pct = v <= med
        ? 5 + 45 * (Math.log(v) - Math.log(p5)) / (Math.log(med) - Math.log(p5))
        : 50 + 45 * (Math.log(v) - Math.log(med)) / (Math.log(p95) - Math.log(med))
    return { pct: Math.round(pct), beyond: null }
}

var PE_NOT_AVAILABLE = 'n/a - this happens on loss-making companies (which have no P/E), and non-US companies.'

// Block for the bottom of the Trade Analysis panel. '' until a company, a strike and a premium are entered.
function peAssignedHtml(company, strike, premium) {
    var s = Number(strike), p = Number(premium)
    if (!company || !(s > 0) || !(p > 0) || !(s - p > 0)) return ''
    var net = s - p, eps = Number(company.pe_eps_ttm)
    var head = '<div class="mt-3 pt-3 border-t border-gray-300" data-pe-assigned>'
    var label = '<span class="text-gray-700">P/E if assigned <span class="text-xs text-gray-500">(strike less premium)</span></span>'
    if (!(eps > 0)) {
        var why = company.pe_error ? ' title="' + peEsc(company.pe_error) + '"' : ''
        return head + '<div class="flex items-center justify-between">' + label + '</div>' +
            '<p class="text-xs text-gray-600 mt-1"' + why + '>' + peEsc(PE_NOT_AVAILABLE) + '</p></div>'
    }
    var assigned = net / eps
    var textClass = { cheap: 'text-green-700', fair: 'text-amber-600', rich: 'text-red-700' }
    var dotColour = { cheap: '#16a34a', fair: '#f59e0b', rich: '#dc2626' }
    var out = head + '<div class="flex items-center justify-between">' + label
    if (!peHasRange(company)) {
        return out + '<span class="font-semibold">' + peFmt(assigned) + '</span></div>' +
            '<p class="text-xs text-gray-600 mt-1">$' + net.toFixed(2) + ' &divide; trailing EPS $' + eps.toFixed(2) + '. No 10-year range yet to compare it with.</p></div>'
    }
    var approx = peApproxPercentile(company, assigned), tone = peTone(approx.pct)
    var where = approx.beyond === 'below' ? 'below its usual 10-year range' : (approx.beyond === 'above' ? 'above its usual 10-year range' : '&asymp; ' + peOrdinal(approx.pct) + ' percentile of its 10-year range')
    var dot = peBarPosition(company, assigned).pos * 100
    var today = peBarPosition(company, company.pe_current).pos * 100
    return out + '<span class="font-semibold ' + textClass[tone] + '">' + peFmt(assigned) + '</span></div>' +
        '<div class="flex items-center gap-1 text-xs text-gray-500 mt-2">' +
        '<span>' + peFmt(company.pe_p5) + '</span>' +
        '<span class="relative inline-block rounded" style="width:140px;height:8px;margin:0 6px;background:linear-gradient(90deg,#bbf7d0,#fde68a,#fecaca)">' +
        '<i class="absolute" style="left:' + (peBarPosition(company, company.pe_median).pos * 100).toFixed(1) + '%;top:-2px;width:2px;height:12px;background:#6b7280"></i>' +
        '<i class="absolute rounded-full" data-pe-today-dot title="Today\'s P/E" style="left:' + today.toFixed(1) + '%;top:-2px;width:12px;height:12px;transform:translateX(-50%);background:#fff;border:2px solid #6b7280"></i>' +
        '<i class="absolute rounded-full" data-pe-assigned-dot style="left:' + dot.toFixed(1) + '%;top:-4px;width:16px;height:16px;transform:translateX(-50%);background:' + dotColour[tone] + ';border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3)"></i>' +
        '</span><span>' + peFmt(company.pe_p95) + '</span></div>' +
        '<p class="text-xs text-gray-600 mt-1">' + where + '. $' + net.toFixed(2) + ' &divide; trailing EPS $' + eps.toFixed(2) +
        ' &middot; the hollow ring is today&#39;s P/E (' + peFmt(company.pe_current) + ').</p></div>'
}
`
const PE_TESTS = String.raw`
describe('P/E if assigned (short puts)', () => {
  const approx = (v: number) => w().peApproxPercentile(co(), v)
  it('interpolates a percentile from the stored 5th, 50th and 95th points', () => {
    expect(approx(10)).toEqual({ pct: 5, beyond: null }); expect(approx(100)).toEqual({ pct: 50, beyond: null }); expect(approx(1000)).toEqual({ pct: 95, beyond: null })
    expect(Math.abs(approx(Math.sqrt(10 * 100)).pct - 27.5)).toBeLessThanOrEqual(0.5)   // halfway (log) between the 5th and the median
    expect(approx(5)).toEqual({ pct: 5, beyond: 'below' }); expect(approx(4000)).toEqual({ pct: 95, beyond: 'above' })
  })
  const html = (c: any, strike: any, premium: any) => { const d = document.createElement('div'); d.innerHTML = w().peAssignedHtml(c, strike, premium); return d }
  it('shows nothing until a company, a strike and a premium are entered, or when the premium swallows the strike', () => {
    expect(w().peAssignedHtml(null, 50, 2)).toBe(''); expect(w().peAssignedHtml(co(), '', 2)).toBe(''); expect(w().peAssignedHtml(co(), 50, '')).toBe('')
    expect(w().peAssignedHtml(co(), 2, 5)).toBe('')
  })
  it('P/E at strike less premium, the dot on the bar, and today as a hollow ring', () => {
    const d = html(co({ pe_eps_ttm: 4, pe_p5: 10, pe_median: 20, pe_p95: 40, pe_current: 12.5 }), 50, 2)
    expect(d.textContent).toContain('P/E if assigned'); expect(d.textContent).toContain('12'); expect(d.textContent).toContain('$48.00')
    expect(d.textContent).toContain('17th percentile'); expect(d.textContent).toContain("today's P/E (13)")
    expect((d.querySelector('[data-pe-assigned-dot]') as HTMLElement).style.left).toBe('13.2%')   // ln(12/10) / ln(40/10)
    expect((d.querySelector('[data-pe-today-dot]') as HTMLElement).style.left).toBe('16.1%')      // ln(12.5/10) / ln(4)
    expect((d.querySelector('[data-pe-assigned-dot]') as HTMLElement).style.backgroundColor).toContain('22, 163, 74')   // low in its own history: green
  })
  it('an assigned P/E above the usual range is red and says so', () => {
    const d = html(co({ pe_eps_ttm: 1, pe_p5: 10, pe_median: 20, pe_p95: 40 }), 100, 2)
    expect(d.textContent).toContain('above its usual 10-year range')
    expect((d.querySelector('[data-pe-assigned-dot]') as HTMLElement).style.backgroundColor).toContain('220, 38, 38')
  })
  it('no earnings (loss-making or non-US) says n/a with the reason, and no bar', () => {
    const d = html(co({ pe_eps_ttm: null, pe_current: null, pe_error: 'not found at the SEC' }), 50, 2)
    expect(d.textContent).toContain('n/a - this happens on loss-making companies (which have no P/E), and non-US companies.')
    expect(d.querySelector('[data-pe-assigned-dot]')).toBeNull()
    expect((d.querySelector('p') as HTMLElement).getAttribute('title')).toBe('not found at the SEC')
  })
  it('earnings but no range yet shows the P/E without a bar', () => {
    const d = html(co({ pe_p5: null, pe_p95: null, pe_percentile: null, pe_eps_ttm: 4 }), 50, 2)
    expect(d.textContent).toContain('12'); expect(d.textContent).toContain('No 10-year range yet'); expect(d.querySelector('[data-pe-assigned-dot]')).toBeNull()
  })
})
`
const MODAL_TESTS = String.raw`
describe('P/E if assigned in the option form', () => {
  const peCo = { id: 1, ticker: 'AAA', company_name: 'Alpha', buy_price: 42.5, pe_eps_ttm: 4, pe_current: 12.5, pe_p5: 10, pe_median: 20, pe_p95: 40, pe_percentile: 30, pe_min: 8, pe_max: 60, pe_months: 118, pe_error: null }
  const noPe = { id: 2, ticker: 'BBB', company_name: 'Beta', buy_price: null, pe_eps_ttm: null, pe_current: null, pe_p5: null, pe_median: null, pe_p95: null, pe_percentile: null, pe_error: 'no positive trailing earnings' }
  const pick = (id: string) => { const s = $('#option_company_select'); s.value = id; s.dispatchEvent(new Event('change', { bubbles: true })) }
  const analysis = () => $('#option-analysis').textContent.replace(/\s+/g, ' ')
  beforeEach(() => {
    mock()
    w().fetchCompaniesWithResearch = vi.fn(async () => [peCo, noPe])
  })

  it('a short put shows the P/E at strike less premium, with the bar', async () => {
    await w().showOptionForm(); await flush()
    pick('1'); set('quantity', '1'); set('strike_price', '50'); set('premium', '2')
    expect(analysis()).toContain('P/E if assigned'); expect(analysis()).toContain('$48.00'); expect(analysis()).toContain('17th percentile')
    expect($('[data-pe-assigned-dot]').style.left).toBe('13.2%')
  })
  it('follows the strike and premium as they change', async () => {
    await w().showOptionForm(); await flush()
    pick('1'); set('strike_price', '50'); set('premium', '2')
    set('strike_price', '200')
    expect(analysis()).toContain('$198.00'); expect(analysis()).toContain('above its usual 10-year range')
  })
  it('all three short put types show it, and no other strategy does', async () => {
    await w().showOptionForm(); await flush()
    pick('1'); set('strike_price', '50'); set('premium', '2')
    for (const s of ['SELLING_PUT', 'SELLING_PUT_WHEEL', 'SELLING_PUT_LONG_TERM']) { choose(s); expect(analysis(), s).toContain('P/E if assigned') }
    for (const s of ['BUYING_PUT', 'LONG_CALL']) { choose(s); expect(analysis(), s).not.toContain('P/E if assigned') }
  })
  it('nothing until a company is chosen; n/a with the reason for a company with no earnings', async () => {
    await w().showOptionForm(); await flush()
    set('strike_price', '50'); set('premium', '2')
    expect(analysis()).not.toContain('P/E if assigned')
    pick('2'); set('premium', '2.5')
    expect(analysis()).toContain('n/a - this happens on loss-making companies (which have no P/E), and non-US companies.')
    expect($('[data-pe-assigned-dot]')).toBeNull()
  })
  it('an open put being edited shows it; a closed one does not', async () => {
    const open = { id: 7, company_id: 1, account_id: 9, strategy_type: 'SELLING_PUT_WHEEL', strike_price: 50, premium: 2, quantity: 1, trade_date: '2026-10-01', expiration_date: '2026-10-31', commission: 0, is_open: 1 }
    mock([open]); w().fetchCompaniesWithResearch = vi.fn(async () => [peCo, noPe])
    await w().showOptionForm(7); await flush()
    expect(analysis()).toContain('P/E if assigned')
    mock([{ ...open, is_open: 0, close_date: '2026-10-20', close_price: 0.5 }]); w().fetchCompaniesWithResearch = vi.fn(async () => [peCo, noPe])
    await w().showOptionForm(7); await flush()
    expect(analysis()).not.toContain('P/E if assigned')
  })
  it('does not change what is saved', async () => {
    await w().showOptionForm(); await flush()
    set('company_id', '1'); set('account_id', '9'); set('quantity', '2'); set('strike_price', '50'); set('premium', '2'); set('commission', '1.3')
    set('trade_date', '2026-10-01'); set('expiration_date', '2026-10-31')
    await submit()
    expect(w().api.post).toHaveBeenCalledWith('/api/options', expect.objectContaining({ company_id: 1, strike_price: 50, premium: 2, quantity: 2 }))
    expect(Object.keys(w().api.post.mock.calls[0][1]).filter(k => k.startsWith('pe_'))).toEqual([])
  })
})
`

const merge = read('public/static/research-merge.js')
if (merge && !merge.text.includes('function peHasRange')) misses.push('research-merge.js: the roster P/E block is missing (install the roster column first)')
append(merge, 'helpers', BLOCK, 'function peAssignedHtml')

const modal = read('public/static/modal-option.js')
edit(modal, 'analysis render',
  "    K.renderAnalysis(panel, rows, [], null)\n  }\n\n  // ---- wiring ----",
  "    K.renderAnalysis(panel, rows, [], null)\n" +
  "    // P/E if assigned: short puts only, while the trade is open. Display only, nothing here is saved.\n" +
  "    if (!isClosed && ['SELLING_PUT', 'SELLING_PUT_WHEEL', 'SELLING_PUT_LONG_TERM'].indexOf(s) !== -1 && typeof peAssignedHtml === 'function') {\n" +
  "      const peCompany = companies.find(c => String(c.id) === String(val('company_id')))\n" +
  "      panel.insertAdjacentHTML('beforeend', peAssignedHtml(peCompany, val('strike_price'), val('premium')))\n" +
  "    }\n  }\n\n  // ---- wiring ----",
  'peAssignedHtml(peCompany')

const t = read('src/ui/option-modal.test.ts')
edit(t, 'load research-merge', "w().eval(read('modal-kit.js')); w().eval(read('modal-option.js'))",
  "w().eval(read('research-merge.js')); w().eval(read('modal-kit.js')); w().eval(read('modal-option.js'))", "read('research-merge.js')")
append(t, 'modal tests', MODAL_TESTS, 'P/E if assigned in the option form')

const pt = read('src/ui/pe-range.test.ts')
append(pt, 'helper tests', PE_TESTS, "describe('P/E if assigned (short puts)'")

if (misses.length) { console.log('NOTHING WRITTEN. Problems:'); misses.forEach(m => console.log('  - ' + m)); process.exit(1) }
const files = [merge, modal, t, pt].filter(f => f && f.changed)
for (const f of files.filter(f => f.rel.endsWith('.js'))) {
  const ok = s => { try { new vm.Script(s); return true } catch { return false } }
  if (ok(f.orig) && !ok(f.text)) { console.log('ABORT: ' + f.rel + ' would no longer parse. Nothing written.'); process.exit(1) }
}
for (const f of files) {
  fs.copyFileSync(f.p, f.p + '.bak-peput-' + stamp)
  fs.writeFileSync(f.p, f.crlf ? f.text.replace(/\n/g, '\r\n') : f.text)
  console.log('updated ' + f.rel)
}
if (!files.length) console.log('Already applied, nothing to do.')
console.log('\nDone. Backups are *.bak-peput-' + stamp + ' (delete them after you commit).')
