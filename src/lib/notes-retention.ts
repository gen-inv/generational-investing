// Research-notes tab mapping + retention rules. Pure functions, no imports.
// Single source of truth: the API annotates every note with `tab` and `sort_date`,
// and the frontend only renders what it is given.

export const NOTE_TABS = [
  { key: 'quick5',     label: 'Quick 5' },
  { key: 'deep',       label: 'Deep Checklist' },
  { key: 'inversions', label: 'Inversions' },
  { key: 'events',     label: 'Events' },
  { key: 'valuation',  label: 'Valuation' },
  { key: 'scoresheet', label: 'Scoresheet' },
  { key: 'antifragile',label: 'Anti-Fragile' },
  { key: 'calls',      label: 'Earnings Calls' },
  { key: 'filings',    label: 'Filings' },
] as const

// ---- Retention (edit here). Applied per company, per tab. ----
export const KEEP_ANALYSIS_RUNS = 3      // newest N notes per analysis tab
export const KEEP_EARNINGS_CALLS = 12    // about three years of quarters
export const KEEP_FILINGS_PER_FAMILY = 3 // newest N per filing family (10-K, 10-Q, 8-K, proxy ...)
export const FILINGS_MAX_AGE_DAYS = 365 * 3

function norm(dt: string | null | undefined): string {
  return String(dt || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function tabForDocType(dt: string | null | undefined): string {
  const k = norm(dt)
  if (k === 'quickfive' || k === 'quick5') return 'quick5'
  if (k === 'deepchecklist') return 'deep'
  if (k === 'inversions' || k === 'inversion') return 'inversions'
  if (k === 'events' || k === 'event') return 'events'
  if (k === 'valuation' || k === 'valuations') return 'valuation'
  if (k === 'scoresheet') return 'scoresheet'
  if (k === 'antifragile') return 'antifragile'
  if (k === 'earningscall' || k === 'earningscalls') return 'calls'
  return 'filings'
}

export function filingFamily(dt: string | null | undefined): string {
  const k = norm(dt)
  if (k.startsWith('8k')) return '8k'
  if (k.startsWith('def14a') || k.startsWith('proxy')) return 'proxy'
  if (k.startsWith('shareholderletter')) return 'letter'
  if (k.startsWith('6k')) return '6k'
  return k || 'other'
}

const ISO = /^\d{4}-\d{2}-\d{2}/

// Real date if filing_date is one; otherwise fall back to created_at (e.g. 'Q4-FY2025').
export function sortDate(n: { filing_date?: string | null; created_at?: string | null }): string {
  if (n.filing_date && ISO.test(n.filing_date)) return n.filing_date.slice(0, 10)
  if (n.created_at && ISO.test(n.created_at)) return n.created_at.slice(0, 10)
  return '0000-00-00'
}

export function annotateNotes<T extends { doc_type: string; filing_date?: string | null; created_at?: string | null }>(rows: T[]) {
  return rows.map(r => ({ ...r, tab: tabForDocType(r.doc_type), sort_date: sortDate(r) }))
}

type Row = { id: number; doc_type: string; filing_date?: string | null; created_at?: string | null }

// Returns ids to delete for ONE company. The newest note in any tab/family is always kept.
export function pruneCandidates(rows: Row[], now: Date = new Date()): number[] {
  const cutoff = new Date(now.getTime() - FILINGS_MAX_AGE_DAYS * 86400000).toISOString().slice(0, 10)
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const tab = tabForDocType(r.doc_type)
    const g = tab === 'filings' ? 'filings:' + filingFamily(r.doc_type) : tab
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(r)
  }
  const out: number[] = []
  for (const [g, list] of groups) {
    list.sort((a, b) => {
      const d = sortDate(b).localeCompare(sortDate(a))
      return d !== 0 ? d : b.id - a.id
    })
    let keep: number
    if (g === 'calls') keep = KEEP_EARNINGS_CALLS
    else if (g.startsWith('filings:')) keep = KEEP_FILINGS_PER_FAMILY
    else keep = KEEP_ANALYSIS_RUNS
    list.forEach((r, i) => {
      if (i >= keep) { out.push(r.id); return }
      if (g.startsWith('filings:') && i >= 1 && sortDate(r) < cutoff) out.push(r.id)
    })
  }
  return out
}