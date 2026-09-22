import { fetchYahooFinanceData } from './company-data'

export async function addCompanyToRoster(env: any, userId: number, rawTicker: string) {
  const ticker = rawTicker.toUpperCase()

  // Check if company already exists for this user
  const existing = await env.DB.prepare(`
    SELECT id, ticker, company_name FROM companies 
    WHERE ticker = ? AND user_id = ?
  `).bind(ticker, userId).first()

  if (existing) {
    return {
      success: false, status: 409,
      error: `${existing.company_name || ticker} is already in your portfolio`,
    }
  }

  // Fetch company data from multiple sources
  const yahooData = await fetchYahooFinanceData(ticker, env)

  // Check for existing research first -- research-production is ticker-global (no
  // user concept), so if this ticker has already been researched by anyone, auto-populate
  // the summary fields from real research data instead of leaving them blank/manual.
  // If no research exists yet, falls through to the old client-provided/null behavior
  // unchanged -- this does NOT yet trigger new research for missing tickers (that's the
  // separate pending-queue work, not built yet).
  let researchBuyPrice = null
  let researchIsWonderful = 0
  let researchScore = null
  let researchAntiFragileScore = null

  try {
    const researchCompany = await env.RESEARCH_DB.prepare(
      'SELECT id FROM companies WHERE symbol = ?'
    ).bind(ticker).first()

    if (researchCompany) {
      const [valuation, scoresheet, antiFragile] = await Promise.all([
        env.RESEARCH_DB.prepare('SELECT blended_buy_price FROM valuations WHERE company_id = ?').bind(researchCompany.id).first(),
        env.RESEARCH_DB.prepare('SELECT total_pct FROM scoresheet WHERE company_id = ?').bind(researchCompany.id).first(),
        env.RESEARCH_DB.prepare('SELECT total_score FROM anti_fragile_scores WHERE company_id = ?').bind(researchCompany.id).first(),
      ])

      if (valuation && valuation.blended_buy_price !== null) researchBuyPrice = valuation.blended_buy_price
      if (scoresheet && scoresheet.total_pct !== null) {
        researchScore = scoresheet.total_pct
        researchIsWonderful = scoresheet.total_pct >= 80 ? 1 : 0
      }
      if (antiFragile && antiFragile.total_score !== null) researchAntiFragileScore = antiFragile.total_score
    } else {
      // No research exists for this ticker at all -- enqueue it. Only insert if not
      // already active (pending/in_progress) for this ticker, since multiple users could
      // add the same unresearched ticker -- the unique index would reject a duplicate
      // anyway, but checking first avoids relying on that as the only guard and lets us
      // stay silent (not an error) on a duplicate request.
      const alreadyQueued = await env.RESEARCH_DB.prepare(
        "SELECT id FROM pending_research WHERE ticker = ? AND status IN ('pending', 'in_progress')"
      ).bind(ticker).first()

      if (!alreadyQueued) {
        // Only Rob (user_id=1) can trigger new research -- per his decision
        // 2026-09-13, since he's the one who answers every judgment-call question
        // Kendry raises during a run. Other users can still add the ticker to their
        // own roster (with blank score fields until research exists), just won't
        // trigger a new research request.
        if (userId === 1) {
          await env.RESEARCH_DB.prepare(
            'INSERT INTO pending_research (ticker, requested_by_user_id) VALUES (?, ?)'
          ).bind(ticker, userId).run()
        }
      }
    }
  } catch (e) {
    // Research lookup failing shouldn't block adding a company -- log and continue
    // with whatever data was already available (client-provided or null).
    console.error('Research lookup failed during company creation:', e)
  }

  const result = await env.DB.prepare(`
    INSERT INTO companies (
      user_id, ticker, company_name, market_cap, exchange,
      sector, industry, buy_price, is_wonderful, research_score, anti_fragile_score,
      next_earnings_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    ticker,
    yahooData.company_name,
    yahooData.market_cap,
    yahooData.exchange,
    yahooData.sector,
    yahooData.industry,
    researchBuyPrice,
    researchIsWonderful,
    researchScore,
    researchAntiFragileScore,
    yahooData.next_earnings_date
  ).run()

  return {
    success: true, status: 201,
    id: result.meta.last_row_id,
    ticker: ticker,
    ...yahooData,
    research_score: researchScore,
    anti_fragile_score: researchAntiFragileScore,
  }
}