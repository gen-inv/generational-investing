import { Hono } from 'hono'

type Bindings = {
  RESEARCH_DB: D1Database
  RESEARCH_INGEST_TOKEN: string
}

const researchApp = new Hono<{ Bindings: Bindings }>()

// --- Auth: separate, static bearer token for the SER8 research machine ---
// NOT the same as the main site's user-login JWT auth (authMiddleware in index.tsx).
async function researchAuthMiddleware(c: any, next: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authHeader.substring(7)
  if (!c.env.RESEARCH_INGEST_TOKEN || token !== c.env.RESEARCH_INGEST_TOKEN) {
    return c.json({ error: 'Invalid token' }, 401)
  }
  await next()
}

// --- Helper: find or create a company by ticker symbol, return its id ---
async function getOrCreateCompanyId(db: D1Database, ticker: string, companyName?: string, sector?: string, industry?: string): Promise<number> {
  const symbol = ticker.toUpperCase()
  const existing = await db.prepare('SELECT id FROM companies WHERE symbol = ?').bind(symbol).first()
  if (existing) {
    await db.prepare(`
      UPDATE companies SET name = COALESCE(?, name), sector = COALESCE(?, sector),
        industry = COALESCE(?, industry), last_updated = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(companyName || null, sector || null, industry || null, existing.id).run()
    return existing.id as number
  }
  const result = await db.prepare(`
    INSERT INTO companies (symbol, name, sector, industry) VALUES (?, ?, ?, ?)
  `).bind(symbol, companyName || null, sector || null, industry || null).run()
  return result.meta.last_row_id as number
}

// --- POST /api/research/ingest ---
// Phase 1: core singleton data per ticker (Quick-5, Valuation, Scoresheet, Anti-Fragile, FGR).
// Phase 2 (later): inversions, events, guru_holdings, peer_comparisons, research_notes.
researchApp.post('/ingest', researchAuthMiddleware, async (c) => {
  const body = await c.req.json()
  if (!body.ticker) {
    return c.json({ error: 'ticker is required' }, 400)
  }
  const db = c.env.RESEARCH_DB

  try {
    const companyId = await getOrCreateCompanyId(db, body.ticker, body.company_name, body.sector, body.industry)

    // --- Quick-5 ---
    if (body.quick_five) {
      const q = body.quick_five
      const existing = await db.prepare('SELECT id FROM quick_five_results WHERE company_id = ?').bind(companyId).first()
      const params = [
        q.status, q.disqualification_reason || null, q.debt_fcf_years ?? null, q.debt_fcf_status || null,
        q.roic_avg ?? null, q.roic_slope ?? null, q.fcf_pct_earnings ?? null,
        q.china_hq ? 1 : 0, q.possible_bank ? 1 : 0,
        q.understand_easily_notes || null, q.understand_destroyers_notes || null,
        q.overall_pass ? 1 : 0,
      ]
      if (existing) {
        await db.prepare(`
          UPDATE quick_five_results SET status=?, disqualification_reason=?, debt_fcf_years=?, debt_fcf_status=?,
            roic_avg=?, roic_slope=?, fcf_pct_earnings=?, china_hq=?, possible_bank=?,
            understand_easily_notes=?, understand_destroyers_notes=?, overall_pass=?, assessed_date=CURRENT_TIMESTAMP
          WHERE company_id=?
        `).bind(...params, companyId).run()
      } else {
        await db.prepare(`
          INSERT INTO quick_five_results (company_id, status, disqualification_reason, debt_fcf_years, debt_fcf_status,
            roic_avg, roic_slope, fcf_pct_earnings, china_hq, possible_bank,
            understand_easily_notes, understand_destroyers_notes, overall_pass)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(companyId, ...params).run()
      }
    }

    // --- Quick-5 override (append-only log, not upserted) ---
    if (body.quick_five_override) {
      const o = body.quick_five_override
      await db.prepare(`
        INSERT INTO quick_five_overrides (company_id, reason, original_disqualification_reason)
        VALUES (?, ?, ?)
      `).bind(companyId, o.reason, o.original_disqualification_reason || null).run()
    }

    // --- Valuation ---
    if (body.valuation) {
      const v = body.valuation
      const existing = await db.prepare('SELECT id FROM valuations WHERE company_id = ?').bind(companyId).first()
      const params = [
        v.growth_classification || null, v.fgr_used ?? null, v.owner_earnings_price ?? null,
        v.dfe_sticker ?? null, v.dfe_buy_price ?? null, v.payback_time_price ?? null, v.avg_fcf_ratio ?? null,
        v.weight_dfe ?? null, v.weight_owner_earnings ?? null, v.weight_payback ?? null,
        v.blended_sticker ?? null, v.blended_buy_price ?? null, v.rop_wheel_ceiling ?? null,
        v.current_price ?? null, v.on_sale ? 1 : 0, v.exit_pe_used ?? null,
        v.exit_pe_override_applied ? 1 : 0, v.exit_pe_override_justification || null, v.notes || null,
      ]
      if (existing) {
        await db.prepare(`
          UPDATE valuations SET growth_classification=?, fgr_used=?, owner_earnings_price=?, dfe_sticker=?,
            dfe_buy_price=?, payback_time_price=?, avg_fcf_ratio=?, weight_dfe=?, weight_owner_earnings=?,
            weight_payback=?, blended_sticker=?, blended_buy_price=?, rop_wheel_ceiling=?, current_price=?,
            on_sale=?, exit_pe_used=?, exit_pe_override_applied=?, exit_pe_override_justification=?, notes=?,
            valuation_date=CURRENT_TIMESTAMP
          WHERE company_id=?
        `).bind(...params, companyId).run()
      } else {
        await db.prepare(`
          INSERT INTO valuations (company_id, growth_classification, fgr_used, owner_earnings_price, dfe_sticker,
            dfe_buy_price, payback_time_price, avg_fcf_ratio, weight_dfe, weight_owner_earnings, weight_payback,
            blended_sticker, blended_buy_price, rop_wheel_ceiling, current_price, on_sale, exit_pe_used,
            exit_pe_override_applied, exit_pe_override_justification, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(companyId, ...params).run()
      }
    }

    // --- Scoresheet ---
    if (body.scoresheet) {
      const s = body.scoresheet
      const existing = await db.prepare('SELECT id FROM scoresheet WHERE company_id = ?').bind(companyId).first()
      const params = [
        s.understanding_score ?? null, s.moat_score ?? null, s.management_score ?? null, s.options_liquidity_score ?? null,
        s.total_pct ?? null, s.grade || null, s.fit_rating ?? null, s.confidence_company ?? null, s.confidence_industry ?? null,
        s.values_alignment ?? null, s.moat_strength ?? null, s.moat_type ?? null, s.pricing_power ?? null,
        s.ceo_candor ?? null, s.insider_activity ?? null, s.fcf_deployment ?? null, s.buyback_timing ?? null,
        s.big_four_score ?? null, s.conservative_financing_score ?? null, s.roic_score ?? null,
        s.guru_activity_score ?? null, s.capital_intensity_score ?? null,
      ]
      if (existing) {
        await db.prepare(`
          UPDATE scoresheet SET understanding_score=?, moat_score=?, management_score=?, options_liquidity_score=?,
            total_pct=?, grade=?, fit_rating=?, confidence_company=?, confidence_industry=?, values_alignment=?,
            moat_strength=?, moat_type=?, pricing_power=?, ceo_candor=?, insider_activity=?, fcf_deployment=?,
            buyback_timing=?, big_four_score=?, conservative_financing_score=?, roic_score=?, guru_activity_score=?,
            capital_intensity_score=?, assessment_date=CURRENT_TIMESTAMP
          WHERE company_id=?
        `).bind(...params, companyId).run()
      } else {
        await db.prepare(`
          INSERT INTO scoresheet (company_id, understanding_score, moat_score, management_score, options_liquidity_score,
            total_pct, grade, fit_rating, confidence_company, confidence_industry, values_alignment, moat_strength,
            moat_type, pricing_power, ceo_candor, insider_activity, fcf_deployment, buyback_timing, big_four_score,
            conservative_financing_score, roic_score, guru_activity_score, capital_intensity_score)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(companyId, ...params).run()
      }
    }

    // --- Anti-Fragile ---
    if (body.anti_fragile) {
      const a = body.anti_fragile
      const existing = await db.prepare('SELECT id FROM anti_fragile_scores WHERE company_id = ?').bind(companyId).first()
      const params = [
        a.roic_score ?? null, a.fgr_score ?? null, a.net_debt_fcf_score ?? null, a.inflation_resilience_score ?? null,
        a.recession_resilience_score ?? null, a.purchase_frequency_score ?? null, a.discretionary_essential_score ?? null,
        a.geopolitical_risk_score ?? null, a.total_score ?? null,
      ]
      if (existing) {
        await db.prepare(`
          UPDATE anti_fragile_scores SET roic_score=?, fgr_score=?, net_debt_fcf_score=?, inflation_resilience_score=?,
            recession_resilience_score=?, purchase_frequency_score=?, discretionary_essential_score=?,
            geopolitical_risk_score=?, total_score=?, assessment_date=CURRENT_TIMESTAMP
          WHERE company_id=?
        `).bind(...params, companyId).run()
      } else {
        await db.prepare(`
          INSERT INTO anti_fragile_scores (company_id, roic_score, fgr_score, net_debt_fcf_score,
            inflation_resilience_score, recession_resilience_score, purchase_frequency_score,
            discretionary_essential_score, geopolitical_risk_score, total_score)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(companyId, ...params).run()
      }
    }

    // --- FGR Triangulation ---
    if (body.fgr_triangulation) {
      const f = body.fgr_triangulation
      const existing = await db.prepare('SELECT id FROM fgr_triangulation WHERE company_id = ?').bind(companyId).first()
      const params = [
        f.historical_cagr ?? null, f.management_guidance ?? null, f.segment_reasoning ?? null, f.blended_fgr,
        f.weighting_rationale || null, f.analyst_commentary ?? null, f.analyst_sources || null,
        f.gap_pct_points ?? null, f.reconciliation_notes || null,
      ]
      if (existing) {
        await db.prepare(`
          UPDATE fgr_triangulation SET historical_cagr=?, management_guidance=?, segment_reasoning=?, blended_fgr=?,
            weighting_rationale=?, analyst_commentary=?, analyst_sources=?, gap_pct_points=?, reconciliation_notes=?,
            assessed_date=CURRENT_TIMESTAMP
          WHERE company_id=?
        `).bind(...params, companyId).run()
      } else {
        await db.prepare(`
          INSERT INTO fgr_triangulation (company_id, historical_cagr, management_guidance, segment_reasoning,
            blended_fgr, weighting_rationale, analyst_commentary, analyst_sources, gap_pct_points, reconciliation_notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(companyId, ...params).run()
      }
    }

    // --- Inversions: fully replaced each pass (delete existing, insert fresh set) ---
    if (body.inversions && Array.isArray(body.inversions)) {
      await db.prepare('DELETE FROM inversions WHERE company_id = ?').bind(companyId).run()
      for (const inv of body.inversions) {
        await db.prepare(`
          INSERT INTO inversions (company_id, category, reason_to_own, bear_case, rebuttal, rebuttal_strength)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(companyId, inv.category, inv.reason_to_own, inv.bear_case, inv.rebuttal, inv.rebuttal_strength || null).run()
      }
    }

    // --- Events: matched by company_id + description, preserves joint_determination if already set ---
    if (body.events && Array.isArray(body.events)) {
      for (const ev of body.events) {
        if (!ev.event_key) {
          warnings.push(`Event "${ev.description?.slice(0, 60)}..." has no event_key -- skipped. Every event needs a stable key for tracking.`)
          continue
        }
        const existing = await db.prepare(
          'SELECT id, joint_determination FROM events WHERE company_id = ? AND event_key = ?'
        ).bind(companyId, ev.event_key).first()

        let eventId: number
        if (existing) {
          await db.prepare(`
            UPDATE events SET description=?, price_impact_pct=?, management_acknowledged=?, management_response=?,
              agent_recoverable_assessment=?, status=?, source_urls=?
            WHERE id=?
          `).bind(
            ev.description, ev.price_impact_pct ?? null, ev.management_acknowledged ? 1 : 0, ev.management_response || null,
            ev.agent_recoverable_assessment || null, ev.status || 'open', ev.source_urls || null, existing.id
          ).run()
          // joint_determination intentionally untouched here -- Rob-only, never auto-overwritten
          eventId = existing.id as number
        } else {
          const result = await db.prepare(`
            INSERT INTO events (company_id, event_key, description, price_impact_pct, management_acknowledged,
              management_response, agent_recoverable_assessment, status, source_urls)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            companyId, ev.event_key, ev.description, ev.price_impact_pct ?? null, ev.management_acknowledged ? 1 : 0,
            ev.management_response || null, ev.agent_recoverable_assessment || null, ev.status || 'open',
            ev.source_urls || null
          ).run()
          eventId = result.meta.last_row_id as number
        }

        // Always append a snapshot to event_history, including the CURRENT joint_determination
        // (carried forward from the existing row, not from the incoming payload -- this is
        // Rob's own call and must survive every automated update untouched)
        const currentJointDetermination = existing?.joint_determination || null
        await db.prepare(`
          INSERT INTO event_history (company_id, event_key, description, price_impact_pct,
            management_acknowledged, management_response, agent_recoverable_assessment,
            joint_determination, status, source_urls)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          companyId, ev.event_key, ev.description, ev.price_impact_pct ?? null,
          ev.management_acknowledged ? 1 : 0, ev.management_response || null,
          ev.agent_recoverable_assessment || null, currentJointDetermination,
          ev.status || 'open', ev.source_urls || null
        ).run()
      }
    }

    // --- Guru holdings: simple append, computed_date distinguishes snapshots over time ---
    if (body.guru_holdings && Array.isArray(body.guru_holdings)) {
      for (const g of body.guru_holdings) {
        await db.prepare(`
          INSERT INTO guru_holdings (company_id, guru_name, filing_date, shares, value, implied_price,
            pct_of_portfolio, activity)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          companyId, g.guru_name, g.filing_date || null, g.shares ?? null, g.value ?? null,
          g.implied_price ?? null, g.pct_of_portfolio ?? null, g.activity || null
        ).run()
      }
    }

    // --- Peer comparisons: simple append, same pattern ---
    if (body.peer_comparisons && Array.isArray(body.peer_comparisons)) {
      for (const p of body.peer_comparisons) {
        await db.prepare(`
          INSERT INTO peer_comparisons (company_id, peer_ticker, fiscal_year, revenue, operating_income,
            operating_margin, avg_fcf_3yr, net_debt_to_fcf_3yr, avg_roic_5yr, employees, revenue_per_employee, data_gaps)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          companyId, p.peer_ticker, p.fiscal_year || null, p.revenue ?? null, p.operating_income ?? null,
          p.operating_margin ?? null, p.avg_fcf_3yr ?? null, p.net_debt_to_fcf_3yr ?? null,
          p.avg_roic_5yr ?? null, p.employees ?? null, p.revenue_per_employee ?? null,
          p.data_gaps ? JSON.stringify(p.data_gaps) : null
        ).run()
      }
    }

    // --- Research notes: upsert on (company_id, doc_type, filing_date), explicit FTS sync ---
    // (D1's remote API can't run trigger-based sync -- see migrations_research/0002 comment)
    if (body.research_notes && Array.isArray(body.research_notes)) {
      for (const n of body.research_notes) {
        const existing = await db.prepare(
          'SELECT id FROM research_notes WHERE company_id = ? AND doc_type = ? AND filing_date = ?'
        ).bind(companyId, n.doc_type, n.filing_date || '').first()

        let noteId: number
        if (existing) {
          await db.prepare(`
            UPDATE research_notes SET source_url=?, content=?, abstract=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
          `).bind(n.source_url || null, n.content, n.abstract || null, existing.id).run()
          noteId = existing.id as number
        } else {
          const result = await db.prepare(`
            INSERT INTO research_notes (company_id, doc_type, filing_date, source_url, content, abstract)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(companyId, n.doc_type, n.filing_date || '', n.source_url || null, n.content, n.abstract || null).run()
          noteId = result.meta.last_row_id as number
        }

      }
    }
    
    return c.json({ success: true, ticker: body.ticker.toUpperCase(), company_id: companyId })
  } catch (err: any) {
    console.error('Research ingest error:', err)
    return c.json({ error: 'Internal error during ingest', detail: String(err) }, 500)
  }
})

// --- GET /api/research/findings — list everything, for a dashboard/table view ---
researchApp.get('/findings', async (c) => {
  const db = c.env.RESEARCH_DB
  const results = await db.prepare(`
    SELECT c.symbol, c.name, c.sector, c.industry, c.last_updated as last_researched_date,
           qf.status as quick_five_status, qf.overall_pass,
           v.blended_buy_price, v.blended_sticker, v.current_price, v.on_sale,
           s.total_pct as scoresheet_pct, s.grade as scoresheet_grade,
           af.total_score as anti_fragile_total
    FROM companies c
    LEFT JOIN quick_five_results qf ON qf.company_id = c.id
    LEFT JOIN valuations v ON v.company_id = c.id
    LEFT JOIN scoresheet s ON s.company_id = c.id
    LEFT JOIN anti_fragile_scores af ON af.company_id = c.id
    ORDER BY c.symbol ASC
  `).all()
  return c.json({ findings: results.results })
})

// --- GET /queue — public, list what's currently pending/in_progress ---
researchApp.get('/queue', async (c) => {
  const db = c.env.RESEARCH_DB
  const results = await db.prepare(`
    SELECT id, ticker, update_type, user_notes, status, attempts, requested_at, claimed_at,
           meaning_question_num, question_sent_at
    FROM pending_research
    WHERE status IN ('pending', 'in_progress', 'failed', 'awaiting_meaning_clarity')
    ORDER BY requested_at ASC
  `).all()
  return c.json({ queue: results.results })
})

// --- GET /queue/next — SER8-only, atomically claims the oldest pending ticker ---
researchApp.get('/queue/next', researchAuthMiddleware, async (c) => {
  const db = c.env.RESEARCH_DB
  const next = await db.prepare(`
    SELECT id, ticker, update_type, user_notes, attempts, meaning_question_num,
           meaning_answer_1, meaning_answer_2, meaning_answer_3, meaning_answer_4
    FROM pending_research
    WHERE status = 'pending'
    ORDER BY requested_at ASC
    LIMIT 1
  `).first()

  if (!next) {
    return c.json({ ticker: null, message: 'No pending research requests.' })
  }

  // Claim it -- only succeeds if still 'pending' (guards against a race if this were
  // ever called concurrently, even though today there's exactly one consumer).
  const claim = await db.prepare(`
    UPDATE pending_research SET status = 'in_progress', claimed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
  `).bind(next.id).run()

  if (claim.meta.changes === 0) {
    // Someone else claimed it between our SELECT and UPDATE -- rare, but handle it
    // honestly rather than pretend we claimed something we didn't.
    return c.json({ ticker: null, message: 'Next item was claimed by another process just now -- try again.' })
  }

  return c.json({
    pending_id: next.id, ticker: next.ticker, update_type: next.update_type,
    user_notes: next.user_notes, attempts: next.attempts,
    meaning_question_num: next.meaning_question_num,
    meaning_answer_1: next.meaning_answer_1, meaning_answer_2: next.meaning_answer_2,
    meaning_answer_3: next.meaning_answer_3, meaning_answer_4: next.meaning_answer_4
  })
})
// --- POST /update/:ticker -- enqueues a re-research request for an existing ticker.
// Public (matches the site's existing auth model -- the main site's own login already
// gates who can reach this UI at all; this endpoint doesn't need the SER8-only bearer
// token, since it's a user-facing action, not a machine-to-machine one) ---
researchApp.post('/update/:ticker', async (c) => {
  const db = c.env.RESEARCH_DB
  const symbol = c.req.param('ticker').toUpperCase()
  const body = await c.req.json()

  const validTypes = ['quarterly', 'annual', 'info']
  if (!validTypes.includes(body.update_type)) {
    return c.json({ error: `update_type must be one of: ${validTypes.join(', ')}` }, 400)
  }
  if (body.update_type === 'info' && !body.user_notes) {
    return c.json({ error: 'user_notes is required for an info update' }, 400)
  }

  // 'annual' means "full research run regardless of what exists" -- so a ticker with
  // zero prior research is a perfectly valid target (e.g. something added to the roster
  // before this feature existed). Only quarterly/info genuinely require prior research
  // to refine, so only they need this check.
  if (body.update_type !== 'annual') {
    const company = await db.prepare('SELECT id FROM companies WHERE symbol = ?').bind(symbol).first()
    if (!company) {
      return c.json({ error: 'No existing research found for this ticker -- use Annual Update for a first-time research run' }, 404)
    }
  }

  const alreadyQueued = await db.prepare(
    "SELECT id FROM pending_research WHERE ticker = ? AND status IN ('pending', 'in_progress')"
  ).bind(symbol).first()
  if (alreadyQueued) {
    return c.json({ error: `${symbol} already has an active research request (status: pending/in_progress)` }, 409)
  }

  const result = await db.prepare(`
    INSERT INTO pending_research (ticker, update_type, user_notes)
    VALUES (?, ?, ?)
  `).bind(symbol, body.update_type, body.user_notes || null).run()

  return c.json({ success: true, ticker: symbol, update_type: body.update_type, pending_id: result.meta.last_row_id }, 201)
})


// --- POST /queue/:id/report-failure — SER8-only, records a failed run and decides
// whether to auto-retry (reset to pending) or give up (mark failed) ---
const MAX_ATTEMPTS = 3

researchApp.post('/queue/:id/report-failure', researchAuthMiddleware, async (c) => {
  const db = c.env.RESEARCH_DB
  const id = c.req.param('id')

  const row = await db.prepare('SELECT id, ticker, status, attempts FROM pending_research WHERE id = ?').bind(id).first()
  if (!row) {
    return c.json({ error: 'Queue entry not found' }, 404)
  }
  if (row.status === 'failed') {
    // Already terminal -- don't keep incrementing attempts past the cap if this
    // gets called again (e.g. accidentally, or by a future bug). Report the existing
    // state rather than mutating it further.
    return c.json({
      ticker: row.ticker, attempts: row.attempts, max_attempts: MAX_ATTEMPTS,
      status: 'failed', will_retry: false, note: 'Already marked failed -- no change made.',
    })
  }
  if (row.status === 'completed' || row.status === 'disqualified') {
    // The run actually succeeded and already pushed real results (e.g. a subagent
    // delivery hang AFTER the real work finished and was pushed -- found via SFM/ACN,
    // 2026-08-21) before the orchestrator's own subprocess got killed for exceeding
    // its timeout. Don't overwrite a genuinely successful outcome with a failure.
    return c.json({
      ticker: row.ticker, attempts: row.attempts, max_attempts: MAX_ATTEMPTS,
      status: row.status, will_retry: false,
      note: `Already ${row.status} -- the research actually completed successfully before this report arrived. No change made.`,
    })
  }

  const newAttempts = (row.attempts as number) + 1
  const willRetry = newAttempts < MAX_ATTEMPTS;

  await db.prepare(`
    UPDATE pending_research
    SET attempts = ?, status = ?, claimed_at = ${willRetry ? 'NULL' : 'claimed_at'}
    WHERE id = ?
  `).bind(newAttempts, willRetry ? 'pending' : 'failed', id).run()

  return c.json({
    ticker: row.ticker,
    attempts: newAttempts,
    max_attempts: MAX_ATTEMPTS,
    status: willRetry ? 'pending' : 'failed',
    will_retry: willRetry,
  })
})

// --- POST /queue/:id/mark-complete — SER8-only. Kendry calls this explicitly at
// genuine completion (full funnel finished + pushed, or a disqualification accepted
// with no override pending) -- NOT inferred from a process exit code, since a clean
// exit can also mean "paused, waiting on Rob" (see AGENTS.md unattended-run rules),
// which must stay in_progress, not get closed out as done. ---
researchApp.post('/queue/:id/mark-complete', researchAuthMiddleware, async (c) => {
  const db = c.env.RESEARCH_DB
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const finalStatus = body.status === 'disqualified' ? 'disqualified' : 'completed'

  const row = await db.prepare('SELECT id, ticker, status FROM pending_research WHERE id = ?').bind(id).first()
  if (!row) {
    return c.json({ error: 'Queue entry not found' }, 404)
  }
  if (row.status !== 'pending' && row.status !== 'in_progress') {
    return c.json({
      ticker: row.ticker, status: row.status,
      note: `Already ${row.status} -- no change made.`,
    })
  }

  await db.prepare(`
    UPDATE pending_research SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(finalStatus, id).run()

  return c.json({ success: true, ticker: row.ticker, status: finalStatus })
})

// --- POST /queue/:id/ask-meaning-question — Kendry calls this after actually sending
// a question via Telegram, marking "the clock starts now" for that specific question.
// SER8-only. ---
researchApp.post('/queue/:id/ask-meaning-question', researchAuthMiddleware, async (c) => {
  const db = c.env.RESEARCH_DB
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const questionNum = body.question_num

  if (![1, 2, 3, 4].includes(questionNum)) {
    return c.json({ error: 'question_num must be 1, 2, 3, or 4' }, 400)
  }

  const row = await db.prepare('SELECT id, ticker FROM pending_research WHERE id = ?').bind(id).first()
  if (!row) {
    return c.json({ error: 'Queue entry not found' }, 404)
  }

  await db.prepare(`
    UPDATE pending_research
    SET status = 'awaiting_meaning_clarity', meaning_question_num = ?, question_sent_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(questionNum, id).run()

  return c.json({ success: true, ticker: row.ticker, question_num: questionNum, status: 'awaiting_meaning_clarity' })
})

// --- POST /queue/:id/record-meaning-answer — called by orchestrator.py's own polling,
// not by Kendry directly. Saves the raw reply, flips status back to pending so the
// ticker becomes claimable again. Deliberately does NOT decide what happens next --
// that's Kendry's judgment on the next claim, read fresh from the database. ---
researchApp.post('/queue/:id/record-meaning-answer', researchAuthMiddleware, async (c) => {
  const db = c.env.RESEARCH_DB
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const questionNum = body.question_num
  const answerText = body.answer_text

  if (![1, 2, 3, 4].includes(questionNum)) {
    return c.json({ error: 'question_num must be 1, 2, 3, or 4' }, 400)
  }
  if (!answerText) {
    return c.json({ error: 'answer_text is required' }, 400)
  }

  const row = await db.prepare('SELECT id, ticker, status FROM pending_research WHERE id = ?').bind(id).first()
  if (!row) {
    return c.json({ error: 'Queue entry not found' }, 404)
  }
  if (row.status !== 'awaiting_meaning_clarity') {
    return c.json({ error: `Queue entry is not awaiting a meaning-clarity answer (status: ${row.status})` }, 409)
  }

  const column = `meaning_answer_${questionNum}`
  await db.prepare(`
    UPDATE pending_research SET ${column} = ?, status = 'pending' WHERE id = ?
  `).bind(answerText, id).run()

  return c.json({ success: true, ticker: row.ticker, question_num: questionNum, status: 'pending' })
})

// --- GET /api/research/:ticker — full picture for one company ---
researchApp.get('/:ticker', async (c) => {
  const db = c.env.RESEARCH_DB
  const symbol = c.req.param('ticker').toUpperCase()

  const company = await db.prepare('SELECT * FROM companies WHERE symbol = ?').bind(symbol).first()
  if (!company) {
    return c.json({ error: 'Company not found' }, 404)
  }
  const companyId = company.id

const [quickFive, valuation, scoresheet, antiFragile, fgr, inversions, events, eventHistory, guruHoldings, peerComparisons, researchNotes] = await Promise.all([
    db.prepare('SELECT * FROM quick_five_results WHERE company_id = ?').bind(companyId).first(),
    db.prepare('SELECT * FROM valuations WHERE company_id = ?').bind(companyId).first(),
    db.prepare('SELECT * FROM scoresheet WHERE company_id = ?').bind(companyId).first(),
    db.prepare('SELECT * FROM anti_fragile_scores WHERE company_id = ?').bind(companyId).first(),
    db.prepare('SELECT * FROM fgr_triangulation WHERE company_id = ?').bind(companyId).first(),
    db.prepare('SELECT * FROM inversions WHERE company_id = ?').bind(companyId).all(),
    db.prepare('SELECT * FROM events WHERE company_id = ?').bind(companyId).all(),
    db.prepare('SELECT * FROM event_history WHERE company_id = ? ORDER BY snapshot_date DESC').bind(companyId).all(),
    db.prepare('SELECT * FROM guru_holdings WHERE company_id = ? ORDER BY computed_date DESC').bind(companyId).all(),
    db.prepare('SELECT * FROM peer_comparisons WHERE company_id = ? ORDER BY computed_date DESC').bind(companyId).all(),
    db.prepare('SELECT id, doc_type, filing_date, source_url, abstract, created_at, updated_at FROM research_notes WHERE company_id = ?').bind(companyId).all(),
  ])

  return c.json({
    company, quick_five: quickFive, valuation, scoresheet, anti_fragile: antiFragile, fgr_triangulation: fgr,
    inversions: inversions.results, events: events.results, event_history: eventHistory.results,
    guru_holdings: guruHoldings.results, peer_comparisons: peerComparisons.results, research_notes: researchNotes.results,
  })
})

// --- GET /:ticker/notes/:id — full content of a single research note ---
researchApp.get('/:ticker/notes/:id', async (c) => {
  const db = c.env.RESEARCH_DB
  const symbol = c.req.param('ticker').toUpperCase()
  const noteId = c.req.param('id')

  const company = await db.prepare('SELECT id FROM companies WHERE symbol = ?').bind(symbol).first()
  if (!company) {
    return c.json({ error: 'Company not found' }, 404)
  }

  // Scoped to company_id, not just note id -- prevents fetching another company's note
  // by guessing an id, even though ids aren't secret, this keeps the API honest about
  // what belongs to what.
  const note = await db.prepare(
    'SELECT * FROM research_notes WHERE id = ? AND company_id = ?'
  ).bind(noteId, company.id).first()

  if (!note) {
    return c.json({ error: 'Note not found for this company' }, 404)
  }

  return c.json({ note })
})



export default researchApp