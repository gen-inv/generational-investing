import { Hono } from 'hono'
import type { Bindings } from '../types'
import { researchAccessMiddleware, researchMachineMiddleware, isValidTicker } from '../lib/research-auth'

// Discovery page data. Mounted at /api/research/discovery (before the research routes, so it is not mistaken for a ticker).
// Reading needs a site login or the ingest token; writing is for the research machine only (ingest token).
export const routes = new Hono<{ Bindings: Bindings }>()

export const SCAN_TYPES = ['guru', 'maturing', 'event']
const STATUS_RE = /^[a-z][a-z_ ]{0,29}$/
const MAX = { headline: 300, details: 8000, company: 200, tier: 40, note: 500, source_key: 120, data: 8000 }

// SQLite-style "YYYY-MM-DD HH:MM:SS" is UTC; anything else must parse as a date. Always stored as ISO.
export function normalizeTime(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const s = v.trim()
  const t = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

const optText = (v: unknown, max: number): string | null | undefined =>
  v === undefined || v === null || v === '' ? null : typeof v === 'string' && v.length <= max ? v : undefined
const optInt = (v: unknown): number | null => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null)

routes.post('/scans', researchMachineMiddleware, async (c) => {
  const body: any = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Request body must be JSON' }, 400)
  if (!SCAN_TYPES.includes(body.scan_type)) return c.json({ error: `scan_type must be one of: ${SCAN_TYPES.join(', ')}` }, 400)
  const lastRun = body.last_run_at === undefined ? new Date().toISOString() : normalizeTime(body.last_run_at)
  if (!lastRun) return c.json({ error: 'last_run_at is not a valid date' }, 400)
  const status = optText(body.status, 40)
  const note = optText(body.note, MAX.note)
  if (status === undefined || note === undefined) return c.json({ error: 'status or note is too long' }, 400)

  await c.env.RESEARCH_DB.prepare(`
    INSERT INTO discovery_scans (scan_type, last_run_at, gurus_scanned, candidates_found, status, note, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(scan_type) DO UPDATE SET last_run_at = excluded.last_run_at, gurus_scanned = excluded.gurus_scanned,
      candidates_found = excluded.candidates_found, status = excluded.status, note = excluded.note, updated_at = CURRENT_TIMESTAMP
  `).bind(body.scan_type, lastRun, optInt(body.gurus_scanned), optInt(body.candidates_found), status ?? 'ok', note).run()
  return c.json({ success: true, scan_type: body.scan_type, last_run_at: lastRun })
})

routes.post('/findings', researchMachineMiddleware, async (c) => {
  const body: any = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Request body must be JSON' }, 400)
  if (!SCAN_TYPES.includes(body.scan_type)) return c.json({ error: `scan_type must be one of: ${SCAN_TYPES.join(', ')}` }, 400)
  const ticker = typeof body.ticker === 'string' ? body.ticker.toUpperCase() : ''
  if (!isValidTicker(ticker)) return c.json({ error: 'Invalid ticker symbol' }, 400)
  if (typeof body.headline !== 'string' || !body.headline.trim() || body.headline.length > MAX.headline) {
    return c.json({ error: `headline is required (up to ${MAX.headline} characters)` }, 400)
  }
  const foundAt = body.found_at === undefined ? new Date().toISOString() : normalizeTime(body.found_at)
  if (!foundAt) return c.json({ error: 'found_at is not a valid date' }, 400)
  const company = optText(body.company_name, MAX.company)
  const tier = optText(body.tier, MAX.tier)
  const details = optText(body.details, MAX.details)
  const sourceKey = body.source_key === undefined ? `${ticker}|${foundAt.slice(0, 10)}` : optText(body.source_key, MAX.source_key)
  const status = body.status === undefined ? 'alerted' : body.status
  if (company === undefined || tier === undefined || details === undefined || !sourceKey) return c.json({ error: 'A text field is too long' }, 400)
  if (typeof status !== 'string' || !STATUS_RE.test(status)) return c.json({ error: 'status must be lowercase letters (up to 30)' }, 400)
  let dataJson: string | null = null
  if (body.data !== undefined && body.data !== null) {
    if (typeof body.data !== 'object' || Array.isArray(body.data)) return c.json({ error: 'data must be an object' }, 400)
    dataJson = JSON.stringify(body.data)
    if (dataJson.length > MAX.data) return c.json({ error: 'data is too large' }, 400)
  }

  const db = c.env.RESEARCH_DB
  const existing = await db.prepare('SELECT id FROM discovery_findings WHERE scan_type = ? AND source_key = ?').bind(body.scan_type, sourceKey).first()
  if (existing) {
    await db.prepare(`UPDATE discovery_findings SET ticker = ?, company_name = ?, found_at = ?, tier = ?, status = ?, headline = ?, details = ?, data_json = ? WHERE id = ?`)
      .bind(ticker, company, foundAt, tier, status, body.headline.trim(), details, dataJson, existing.id).run()
    return c.json({ success: true, id: existing.id, created: false })
  }
  const result = await db.prepare(`
    INSERT INTO discovery_findings (scan_type, ticker, company_name, found_at, tier, status, headline, details, data_json, source_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(body.scan_type, ticker, company, foundAt, tier, status, body.headline.trim(), details, dataJson, sourceKey).run()
  return c.json({ success: true, id: result.meta.last_row_id, created: true }, 201)
})

routes.get('/', researchAccessMiddleware, async (c) => {
  const scanType = c.req.query('scan_type')
  if (scanType && !SCAN_TYPES.includes(scanType)) return c.json({ error: `scan_type must be one of: ${SCAN_TYPES.join(', ')}` }, 400)
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '200', 10) || 200, 1), 500)
  const db = c.env.RESEARCH_DB
  const scans = await db.prepare('SELECT scan_type, last_run_at, gurus_scanned, candidates_found, status, note FROM discovery_scans ORDER BY scan_type').all()
  const cols = 'id, scan_type, ticker, company_name, found_at, tier, status, headline, details, data_json'
  const rows = scanType
    ? await db.prepare(`SELECT ${cols} FROM discovery_findings WHERE scan_type = ? ORDER BY found_at DESC, id DESC LIMIT ?`).bind(scanType, limit).all()
    : await db.prepare(`SELECT ${cols} FROM discovery_findings ORDER BY found_at DESC, id DESC LIMIT ?`).bind(limit).all()
  const findings = (rows.results as any[]).map(({ data_json, ...rest }) => {
    let data = null
    try { data = data_json ? JSON.parse(data_json) : null } catch { data = null }
    return { ...rest, data }
  })
  return c.json({ scans: scans.results, findings })
})

// Called when a company is added to the roster (by the website or by Kendry): marks any open discovery finding for that ticker "added".
// Never throws -- a Discovery hiccup must not break adding a company.
export async function markDiscoveryAdded(env: any, ticker: string): Promise<void> {
  try {
    await env.RESEARCH_DB.prepare(
      "UPDATE discovery_findings SET status = 'added' WHERE ticker = ? AND status IN ('alerted', 'potential_override')"
    ).bind(String(ticker).toUpperCase()).run()
  } catch {
    // ignore
  }
}
