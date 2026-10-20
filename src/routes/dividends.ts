import { Hono } from 'hono'
import { authMiddleware } from '../lib/auth'
import type { Bindings } from '../types'

export const routes = new Hono<{ Bindings: Bindings }>()

// ============================================================================
// DIVIDEND REPOSITORY - Automated Dividend Tracking
// ============================================================================

// Get API configuration for RapidAPI
routes.get('/api/dividend-repository/config', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    
    const config = await DB.prepare(`
      SELECT api_name, api_host, is_active, last_used, rate_limit_remaining, rate_limit_reset
      FROM api_configurations
      WHERE user_id = ? AND api_name = 'alpha_vantage'
    `).bind(userId).first()
    
    return c.json({
      configured: !!config,
      config: config ? {
        api_name: config.api_name,
        api_host: config.api_host,
        is_active: config.is_active === 1,
        last_used: config.last_used,
        rate_limit_remaining: config.rate_limit_remaining,
        rate_limit_reset: config.rate_limit_reset
      } : null
    })
  } catch (error) {
    console.error('Error fetching API config:', error)
    return c.json({ error: 'Failed to fetch API configuration' }, 500)
  }
})

// Save/Update API configuration
routes.post('/api/dividend-repository/config', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const { api_key, api_host } = await c.req.json()
    
    if (!api_key) {
      return c.json({ error: 'API key is required' }, 400)
    }
    
    // Check if config exists
    const existing = await DB.prepare(`
      SELECT id FROM api_configurations
      WHERE user_id = ? AND api_name = 'alpha_vantage'
    `).bind(userId).first()
    
    if (existing) {
      // Update existing
      await DB.prepare(`
        UPDATE api_configurations
        SET api_key = ?, api_host = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND api_name = 'alpha_vantage'
      `).bind(api_key, api_host || 'www.alphavantage.co', userId).run()
    } else {
      // Insert new
      await DB.prepare(`
        INSERT INTO api_configurations (user_id, api_name, api_key, api_host, is_active)
        VALUES (?, 'alpha_vantage', ?, ?, 1)
      `).bind(userId, api_key, api_host || 'www.alphavantage.co').run()
    }
    
    return c.json({ success: true, message: 'API configuration saved' })
  } catch (error) {
    console.error('Error saving API config:', error)
    return c.json({ error: 'Failed to save API configuration' }, 500)
  }
})

// Fetch dividends for all open holdings
routes.post('/api/dividend-repository/fetch', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const { DB } = c.env
  
  try {
    const startTime = Date.now()
    
    console.log(`[DIVIDEND-FETCH] Starting dividend fetch for user ${userId}`)
    
    // Quick validation: check if user has any holdings
    const holdingsCheck = await DB.prepare(`
      SELECT COUNT(*) as count
      FROM stock_holdings sh
      WHERE sh.user_id = ?
    `).bind(userId).first()
    
    if (!holdingsCheck || (holdingsCheck as any).count === 0) {
      return c.json({ message: 'No holdings found', dividends_found: 0, dividends_eligible: 0 })
    }
    
    if (!c.env.MASSIVE_API_KEY) return c.json({ error: 'MASSIVE_API_KEY is not configured on the server' }, 503)

    // Create fetch log immediately
    const logResult = await DB.prepare(`
      INSERT INTO dividend_fetch_logs (user_id, fetch_type, status, tickers_processed, started_at)
      VALUES (?, 'manual', 'in_progress', '', CURRENT_TIMESTAMP)
    `).bind(userId).run()
    
    const logId = logResult.meta.last_row_id as number
    
    console.log(`[DIVIDEND-FETCH] Created log entry ${logId}, starting synchronous processing`)
    
    // Run synchronously (no waitUntil - just await the result)
    // This will take 2-3 minutes but ensures reliable completion
    await performDividendFetchInternal(DB, userId, logId, startTime, { massive: c.env.MASSIVE_API_KEY || '', eodhd: c.env.EODHD_API_KEY || '' })
    
    console.log(`[DIVIDEND-FETCH] Fetch completed, retrieving results from log`)
    
    // Fetch the completed log to get actual results
    const completedLog = await DB.prepare(`
      SELECT * FROM dividend_fetch_logs WHERE id = ?
    `).bind(logId).first() as any
    
    if (!completedLog) {
      return c.json({
        error: 'Failed to retrieve fetch results',
        log_id: logId
      }, 500)
    }
    
    // Return success with actual results
    return c.json({
      status: completedLog.status,
      message: completedLog.status === 'success' 
        ? 'Dividend fetch completed successfully.' 
        : 'Dividend fetch completed with some errors.',
      log_id: logId,
      tickers_processed: completedLog.tickers_processed,
      dividends_found: completedLog.dividends_found,
      dividends_eligible: completedLog.dividends_eligible,
      api_calls_made: completedLog.api_calls_made,
      error_message: completedLog.error_message,
      started_at: new Date(startTime).toISOString(),
      completed_at: completedLog.completed_at,
      duration_ms: completedLog.fetch_duration_ms
    }, 200)
    
  } catch (error) {
    console.error('[DIVIDEND-FETCH] Error starting dividend fetch:', error)
    return c.json({
      error: 'Failed to start dividend fetch',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Internal function that performs the actual dividend fetching
// This runs in the background via waitUntil
async function performDividendFetchInternal(
  DB: any,
  userId: number,
  logId: number,
  startTime: number,
  keys: { massive: string; eodhd: string }
): Promise<void> {
  let totalDividends = 0
  let totalEligible = 0
  let apiCalls = 0
  const tickersProcessed: string[] = []
  const errors: string[] = []
  const debugInfo: string[] = []
  
  try {
    console.log(`[DIVIDEND-FETCH-BG] Background processing started for user ${userId}, log ${logId}`)
    
    // Use system-wide Massive (Polygon.io) API key (admin-managed)
    const MASSIVE_API_KEY = keys.massive
    
    // Use EODHD API key for Canadian stocks fallback
    const EODHD_API_KEY = keys.eodhd
    
    // Minimum date filter: only fetch dividends from 2025-01-01 onwards
    const MIN_DATE = '2025-01-01'
    
    // Get all OPEN stock holdings for this user
    const holdings = await DB.prepare(`
      SELECT 
        sh.id as holding_id,
        sh.ticker,
        sh.opened_date,
        sh.closed_date,
        sh.total_shares,
        sh.is_open
      FROM stock_holdings sh
      WHERE sh.user_id = ? AND sh.is_open = 1
      ORDER BY sh.ticker
    `).bind(userId).all()
    
    if (!holdings.results || holdings.results.length === 0) {
      console.log(`[DIVIDEND-FETCH-BG] No holdings found for user ${userId}`)
      await DB.prepare(`
        UPDATE dividend_fetch_logs
        SET status = 'completed', error_message = 'No holdings found',
            completed_at = CURRENT_TIMESTAMP, fetch_duration_ms = ?
        WHERE id = ?
      `).bind(Date.now() - startTime, logId).run()
      return
    }
    
    console.log(`[DIVIDEND-FETCH-BG] Found ${holdings.results.length} holdings to check`)
    debugInfo.push(`Starting dividend fetch for ${holdings.results.length} holdings`)
    
    // Get unique tickers to avoid duplicate API calls
    const allHoldings = holdings.results as any[]
    const uniqueTickers = new Set<string>()
    const holdingsToProcess: any[] = []
    
    for (const holding of allHoldings) {
      if (!uniqueTickers.has(holding.ticker)) {
        uniqueTickers.add(holding.ticker)
        holdingsToProcess.push(holding)
      }
    }
    
    debugInfo.push(`Processing ${holdingsToProcess.length} unique tickers (deduplicated from ${allHoldings.length} total holdings)`)
    console.log(`[DIVIDEND-FETCH-BG] Processing ${holdingsToProcess.length} unique tickers`)
    
    // Smart rate limiter for Polygon.io (5 calls/minute)
    // Track actual call timestamps and only wait when needed
    const RATE_LIMIT_CALLS = 5
    const RATE_LIMIT_WINDOW_MS = 60000 // 60 seconds
    const callTimestamps: number[] = [] // Track timestamps of last N calls
    
    // Helper function to respect rate limits with minimal waiting
    const respectRateLimit = async () => {
      const now = Date.now()
      
      // Remove timestamps older than the rate limit window
      while (callTimestamps.length > 0 && now - callTimestamps[0] >= RATE_LIMIT_WINDOW_MS) {
        callTimestamps.shift()
      }
      
      // If we've made 5 calls in the last 60 seconds, wait until the oldest call expires
      if (callTimestamps.length >= RATE_LIMIT_CALLS) {
        const oldestCall = callTimestamps[0]
        const waitTime = RATE_LIMIT_WINDOW_MS - (now - oldestCall) + 100 // +100ms buffer
        
        if (waitTime > 0) {
          debugInfo.push(`Rate limit: Waiting ${(waitTime/1000).toFixed(1)}s before next call`)
          console.log(`[DIVIDEND-FETCH-BG] Rate limit: Waiting ${(waitTime/1000).toFixed(1)}s`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
        
        // After waiting, remove the expired timestamp
        callTimestamps.shift()
      }
      
      // Record this call's timestamp
      callTimestamps.push(Date.now())
    }
    
    // Process all tickers with smart rate limiting
    // No fixed batches - just process sequentially with automatic throttling
    for (const holding of holdingsToProcess) {
      try {
        console.log(`[DIVIDEND-FETCH-BG] Fetching dividends for ${holding.ticker}`)
        tickersProcessed.push(holding.ticker)
        
        // Wait if needed to respect rate limits
        await respectRateLimit()
        
        // Call Massive (Polygon.io) API
        // Endpoint: GET /v3/reference/dividends?ticker={ticker}&ex_dividend_date.gte={date}&apiKey={key}
        // Filter dividends from 2025-01-01 onwards
        const response = await fetch(`https://api.polygon.io/v3/reference/dividends?ticker=${holding.ticker}&ex_dividend_date.gte=2025-01-01&apiKey=${MASSIVE_API_KEY}`, {
          method: 'GET'
        })
        
        apiCalls++
        
        debugInfo.push(`${holding.ticker}: HTTP ${response.status}`)
        
        if (!response.ok) {
          if (response.status === 429) {
            console.error(`Rate limit exceeded for ${holding.ticker}`)
            errors.push(`${holding.ticker}: Rate limit exceeded (HTTP 429) - please wait before retrying`)
            debugInfo.push(`${holding.ticker}: Rate limit exceeded - API quota reached`)
          } else {
            console.error(`API error for ${holding.ticker}:`, response.status)
            errors.push(`${holding.ticker}: HTTP ${response.status}`)
            debugInfo.push(`${holding.ticker}: API call failed with ${response.status}`)
          }
          continue
        }
        
        const dividendData = await response.json() as any
        
        // Log raw response structure for debugging
        const responseKeys = Object.keys(dividendData).join(', ')
        const responsePreview = JSON.stringify(dividendData).substring(0, 200)
        debugInfo.push(`${holding.ticker}: Keys=[${responseKeys}] Preview=${responsePreview}`)
        
        // Process dividend data from Massive (Polygon.io)
        // API returns { results: [...], status: "OK", count: N }
        const dividends = dividendData.results || []
        
        debugInfo.push(`${holding.ticker}: Found ${dividends.length} dividends in API response`)
        console.log(`${holding.ticker}: Found ${dividends.length} dividends in API response`)
        
        // Fallback to EODHD if Massive returns 0 results
        // This includes Canadian stocks (.TO, .V) and US stocks with incomplete Polygon.io data
        let eodhd_dividends = []
        if (dividends.length === 0) {
          debugInfo.push(`${holding.ticker}: Polygon.io returned 0 results, trying EODHD fallback...`)
          
          try {
            const eodhd_response = await fetch(`https://eodhd.com/api/div/${holding.ticker}?from=2025-01-01&api_token=${EODHD_API_KEY}&fmt=json`, {
              method: 'GET'
            })
            
            apiCalls++
            
            if (eodhd_response.ok) {
              eodhd_dividends = await eodhd_response.json() as any[]
              debugInfo.push(`${holding.ticker}: EODHD returned ${eodhd_dividends.length} dividends`)
              console.log(`${holding.ticker}: EODHD fallback returned ${eodhd_dividends.length} dividends`)
            } else {
              debugInfo.push(`${holding.ticker}: EODHD API failed with ${eodhd_response.status}`)
            }
          } catch (eodhd_error) {
            debugInfo.push(`${holding.ticker}: EODHD error: ${eodhd_error instanceof Error ? eodhd_error.message : 'Unknown'}`)
            console.error(`EODHD error for ${holding.ticker}:`, eodhd_error)
          }
        }
        
        // Minimum date filter: only fetch dividends from 2025-01-01 onwards
        const MIN_DATE = '2025-01-01'
        
        // Process EODHD dividends if available
        for (const div of eodhd_dividends) {
          const exDate = div.date  // EODHD uses 'date' field for ex-dividend date
          const payDate = div.payment_date || null
          const recordDate = div.record_date || null
          const declaredDate = div.declarationDate || null
          const amount = parseFloat(div.value)
          
          if (!exDate || !amount) {
            console.log(`Skipping EODHD dividend with missing data: ${JSON.stringify(div)}`)
            continue
          }
          
          // Filter: only include dividends from 2025-01-01 onwards
          if (exDate < MIN_DATE) {
            debugInfo.push(`${holding.ticker}: Skipping EODHD ${exDate} (before ${MIN_DATE})`)
            continue
          }
          
          // Check eligibility: holding must be opened before ex_date
          const isEligible = holding.opened_date < exDate
          
          if (isEligible) {
            totalEligible++
          }
          totalDividends++
          
          debugInfo.push(`${holding.ticker}: Processing EODHD ${exDate}, amt ${amount}, eligible: ${isEligible}`)
          console.log(`${holding.ticker}: Processing EODHD dividend ${exDate}, amount ${amount}, eligible: ${isEligible}`)
          
          // Check if dividend already exists
          const existing = await DB.prepare(`
            SELECT id, manually_edited FROM dividend_repository
            WHERE ticker = ? AND ex_date = ?
          `).bind(holding.ticker, exDate).first()
          
          if (existing) {
            // Skip update if dividend was manually edited by user
            const ex = existing as any
            if (ex.manually_edited === 1) {
              debugInfo.push(`${holding.ticker}: Skipping EODHD ${exDate} (manually edited)`)
              console.log(`${holding.ticker}: Skipping EODHD dividend ${exDate} - manually edited`)
              continue
            }
            
            // Update existing record
            await DB.prepare(`
              UPDATE dividend_repository
              SET amount = ?, pay_date = ?, record_date = ?, declared_date = ?,
                  frequency = 12, fetch_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
                  api_source = 'eodhd'
              WHERE id = ?
            `).bind(
              amount,
              payDate,
              recordDate,
              declaredDate,
              ex.id
            ).run()
          } else {
            // Insert new record - EODHD dividends default to monthly frequency (12)
            await DB.prepare(`
              INSERT INTO dividend_repository (
                ticker, ex_date, pay_date, record_date, declared_date,
                amount, frequency, status, api_source
              ) VALUES (?, ?, ?, ?, ?, ?, 12, 'active', 'eodhd')
            `).bind(
              holding.ticker,
              exDate,
              payDate,
              recordDate,
              declaredDate,
              amount
            ).run()
          }
        }
        
        // Process Massive (Polygon.io) dividends
        for (const div of dividends) {
          const exDate = div.ex_dividend_date
          const payDate = div.pay_date || null
          const recordDate = div.record_date || null
          const declaredDate = div.declaration_date || null
          const amount = parseFloat(div.cash_amount)
          
          if (!exDate || !amount) {
            console.log(`Skipping dividend with missing data: ${JSON.stringify(div)}`)
            continue
          }
          
          // Filter: only include dividends from 2025-01-01 onwards
          if (exDate < MIN_DATE) {
            debugInfo.push(`${holding.ticker}: Skipping ${exDate} (before ${MIN_DATE})`)
            continue
          }
          
          // Check eligibility: holding must be opened before ex_date
          // We record ALL dividends regardless of position closure
          // Application to individual holdings will be done later based on pay_date
          const isEligible = holding.opened_date < exDate
          
          if (isEligible) {
            totalEligible++
          }
          totalDividends++
          
          debugInfo.push(`${holding.ticker}: Processing ${exDate}, amt ${amount}, eligible: ${isEligible}`)
          console.log(`${holding.ticker}: Processing dividend ${exDate}, amount ${amount}, eligible: ${isEligible}`)
          
          // Check if dividend already exists for this ticker/ex_date combination
          // Dividends are user-agnostic - stored once per ticker/ex_date globally
          const existing = await DB.prepare(`
            SELECT id, manually_edited FROM dividend_repository
            WHERE ticker = ? AND ex_date = ?
          `).bind(holding.ticker, exDate).first()
          
          if (existing) {
            // Skip update if dividend was manually edited by user
            const ex = existing as any
            if (ex.manually_edited === 1) {
              debugInfo.push(`${holding.ticker}: Skipping ${exDate} (manually edited)`)
              console.log(`${holding.ticker}: Skipping dividend ${exDate} - manually edited`)
              continue
            }
            
            // Update existing record (keep most recent data from API)
            await DB.prepare(`
              UPDATE dividend_repository
              SET amount = ?, pay_date = ?, record_date = ?, declared_date = ?,
                  frequency = ?, fetch_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).bind(
              amount,
              payDate,
              recordDate,
              declaredDate,
              div.frequency || 52,  // Massive provides frequency field
              ex.id
            ).run()
          } else {
            // Insert new record - just store dividend info, no shares calculation
            // Dividends are user-agnostic, stored once globally per ticker/ex_date
            // Application to individual holdings will be done later based on pay_date
            await DB.prepare(`
              INSERT INTO dividend_repository (
                ticker, ex_date, pay_date, record_date, declared_date,
                amount, frequency, status, api_source
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'massive')
            `).bind(
              holding.ticker,
              exDate,
              payDate,
              recordDate,
              declaredDate,
              amount,
              div.frequency || 52  // Massive provides frequency field, default to 52 (weekly)
            ).run()
          }
        }
        
        debugInfo.push(`${holding.ticker}: Completed, moving to next ticker`)
        
      } catch (error) {
        console.error(`Error processing ${holding.ticker}:`, error)
        errors.push(`${holding.ticker}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } // End of ticker processing loop
    
    const duration = Date.now() - startTime
    
    console.log(`[DIVIDEND-FETCH-BG] Completed processing for user ${userId} in ${duration}ms`)
    
    // Update fetch log with success/partial status
    await DB.prepare(`
      UPDATE dividend_fetch_logs
      SET status = ?, tickers_processed = ?, dividends_found = ?,
          dividends_eligible = ?, api_calls_made = ?, completed_at = CURRENT_TIMESTAMP,
          fetch_duration_ms = ?, error_message = ?
      WHERE id = ?
    `).bind(
      errors.length > 0 ? 'partial' : 'success',
      tickersProcessed.join(','),
      totalDividends,
      totalEligible,
      apiCalls,
      duration,
      errors.length > 0 ? errors.join('; ') : null,
      logId
    ).run()
    
    console.log(`[DIVIDEND-FETCH-BG] Updated log ${logId}: ${errors.length > 0 ? 'partial' : 'success'}`)
    
  } catch (error) {
    console.error('[DIVIDEND-FETCH-BG] Error in background fetch:', error)
    
    // Try to update log with error status
    try {
      await DB.prepare(`
        UPDATE dividend_fetch_logs
        SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        error instanceof Error ? error.message : 'Unknown error',
        logId
      ).run()
      console.log(`[DIVIDEND-FETCH-BG] Updated log ${logId} with error status`)
    } catch (logError) {
      console.error('[DIVIDEND-FETCH-BG] Failed to update error log:', logError)
    }
  }
}

// Cron-specific dividend fetch endpoints (secret key authentication)
// Simple GET endpoint for cron - just triggers the existing fetch logic
routes.get('/api/cron/dividend-repository/fetch/:secret', authMiddleware, async (c) => {
  const urlSecret = c.req.param('secret')
  const CRON_SECRET = c.env.CRON_SECRET
  
  if (!CRON_SECRET || urlSecret !== CRON_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  
  // This will execute synchronously and complete before returning
  // It's the same as clicking the button in the UI
  const userId = c.get('userId')
  
  // Forward to the regular fetch endpoint logic
  // This is exactly what happens when you click the button in the UI
  return c.redirect('/api/dividend-repository/fetch', 307) // Temporary redirect with POST method preserved
})

routes.post('/api/cron/dividend-repository/fetch', async (c) => {
  try {
    const { DB } = c.env
    const body = await c.req.json().catch(() => ({}))
    
    // Check for secret key in header or body
    const secretKey = c.req.header('X-Cron-Secret') || body.secret
    const CRON_SECRET = c.env.CRON_SECRET
    
    if (!CRON_SECRET || secretKey !== CRON_SECRET) {
      console.error('Unauthorized cron attempt - invalid secret')
      return c.json({ error: 'Unauthorized' }, 401)
    }
    
    if (!c.env.MASSIVE_API_KEY) return c.json({ error: 'MASSIVE_API_KEY is not configured on the server' }, 503)

    // Get user ID from body or default to first user (admin)
    const targetUserId = body.user_id || 1
    
    console.log(`[CRON] Starting automated dividend fetch for user ${targetUserId}`)
    
    const startTime = Date.now()
    
    // Use waitUntil to extend worker lifetime for background processing
    const executionContext = c.executionCtx
    
    // Start the fetch process in the background
    const fetchPromise = (async () => {
      try {
        await performDividendFetch(DB, targetUserId, startTime, { massive: c.env.MASSIVE_API_KEY || '', eodhd: c.env.EODHD_API_KEY || '' })
      } catch (error) {
        console.error('[CRON] Background fetch error:', error)
      }
    })()
    
    // Tell Cloudflare to keep the worker alive until fetchPromise completes
    if (executionContext && executionContext.waitUntil) {
      executionContext.waitUntil(fetchPromise)
    }
    
    // Return immediately with 202 Accepted
    return c.json({
      status: 'accepted',
      message: 'Dividend fetch started in background',
      user_id: targetUserId,
      started_at: new Date().toISOString()
    }, 202)
    
  } catch (error) {
    console.error('[CRON] Error in automated dividend fetch:', error)
    return c.json({
      error: 'Failed to start dividend fetch',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Extract fetch logic into separate function for background execution
async function performDividendFetch(DB: any, targetUserId: number, startTime: number, keys: { massive: string; eodhd: string }) {
  let logId: any = null
  let totalDividends = 0
  let totalEligible = 0
  let apiCalls = 0
  const tickersProcessed: string[] = []
  const errors: string[] = []
  const debugInfo: string[] = []
  
  try {
    console.log(`[CRON] Background processing started for user ${targetUserId}`)
    
    // Use system-wide Massive (Polygon.io) API key
    const MASSIVE_API_KEY = keys.massive
    
    // Use EODHD API key for Canadian stocks fallback
    const EODHD_API_KEY = keys.eodhd
    
    // Get all stock holdings for this user
    const holdings = await DB.prepare(`
      SELECT 
        sh.id as holding_id,
        sh.ticker,
        sh.opened_date,
        sh.closed_date,
        sh.total_shares,
        sh.is_open
      FROM stock_holdings sh
      WHERE sh.user_id = ?
      ORDER BY sh.ticker
    `).bind(targetUserId).all()
    
    if (!holdings.results || holdings.results.length === 0) {
      console.log('[CRON] No holdings found for user')
      return // Early return, no data to process
    }
    
    console.log(`[CRON] Found ${holdings.results.length} holdings to check`)
    
    // Create fetch log
    const logResult = await DB.prepare(`
      INSERT INTO dividend_fetch_logs (user_id, fetch_type, status, tickers_processed)
      VALUES (?, 'automated', 'in_progress', '')
    `).bind(targetUserId).run()
    
    logId = logResult.meta.last_row_id
    
    // Get unique tickers
    const uniqueTickers = [...new Set(holdings.results.map((h: any) => h.ticker))]
    
    const MIN_DATE = '2026-01-01'
    
    // Process each unique ticker
    for (const ticker of uniqueTickers) {
      try {
        const holding = holdings.results.find((h: any) => h.ticker === ticker) as any
        
        debugInfo.push(`${ticker}: Starting fetch...`)
        console.log(`[CRON] Processing ${ticker}`)
        
        // Determine if this is a Canadian stock
        const isCanadian = ticker.endsWith('.TO') || ticker.endsWith('.V')
        
        let dividends: any[] = []
        
        // Fetch from Massive (Polygon.io) for US stocks
        if (!isCanadian) {
          const massiveUrl = `https://api.polygon.io/v3/reference/dividends?ticker=${ticker}&ex_dividend_date.gte=2025-01-01&limit=100&apiKey=${MASSIVE_API_KEY}`
          
          try {
            const massiveResponse = await fetch(massiveUrl)
            apiCalls++
            
            if (massiveResponse.ok) {
              const massiveData = await massiveResponse.json()
              dividends = massiveData.results || []
              debugInfo.push(`${ticker}: Massive returned ${dividends.length} dividends`)
            } else {
              debugInfo.push(`${ticker}: Massive error ${massiveResponse.status}`)
            }
          } catch (e) {
            debugInfo.push(`${ticker}: Massive fetch failed`)
          }
        }
        
        // Fallback to EODHD for Canadian stocks or if Massive returned nothing
        if (isCanadian || dividends.length === 0) {
          const eodhd_ticker = ticker.replace('.TO', '.TSX').replace('.V', '.TSXV')
          const eodhdUrl = `https://eodhd.com/api/div/${eodhd_ticker}?api_token=${EODHD_API_KEY}&fmt=json`
          
          try {
            const eodhdResponse = await fetch(eodhdUrl)
            apiCalls++
            
            if (eodhdResponse.ok) {
              const eodhdData = await eodhdResponse.json()
              
              if (Array.isArray(eodhdData) && eodhdData.length > 0) {
                debugInfo.push(`${ticker}: EODHD returned ${eodhdData.length} dividends`)
                
                for (const eodhd_div of eodhdData) {
                  const exDate = eodhd_div.date
                  const payDate = eodhd_div.paymentDate || null
                  const recordDate = eodhd_div.recordDate || null
                  const declaredDate = eodhd_div.declarationDate || null
                  const amount = parseFloat(eodhd_div.value)
                  
                  if (!exDate || !amount || exDate < MIN_DATE) continue
                  
                  const isEligible = holding.opened_date < exDate
                  if (isEligible) totalEligible++
                  totalDividends++
                  
                  const existing = await DB.prepare(`
                    SELECT id FROM dividend_repository
                    WHERE ticker = ? AND ex_date = ?
                  `).bind(ticker, exDate).first()
                  
                  if (!existing) {
                    await DB.prepare(`
                      INSERT INTO dividend_repository (
                        ticker, ex_date, pay_date, record_date, declared_date,
                        amount, frequency, status, api_source
                      ) VALUES (?, ?, ?, ?, ?, ?, 12, 'active', 'eodhd')
                    `).bind(ticker, exDate, payDate, recordDate, declaredDate, amount).run()
                  }
                }
              }
            }
          } catch (e) {
            debugInfo.push(`${ticker}: EODHD fetch failed`)
          }
        }
        
        // Process Massive dividends
        for (const div of dividends) {
          const exDate = div.ex_dividend_date
          const payDate = div.pay_date || null
          const recordDate = div.record_date || null
          const declaredDate = div.declaration_date || null
          const amount = parseFloat(div.cash_amount)
          
          if (!exDate || !amount || exDate < MIN_DATE) continue
          
          const isEligible = holding.opened_date < exDate
          if (isEligible) totalEligible++
          totalDividends++
          
          const existing = await DB.prepare(`
            SELECT id FROM dividend_repository
            WHERE ticker = ? AND ex_date = ?
          `).bind(ticker, exDate).first()
          
          if (existing) {
            await DB.prepare(`
              UPDATE dividend_repository
              SET amount = ?, pay_date = ?, record_date = ?, declared_date = ?,
                  frequency = ?, fetch_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).bind(amount, payDate, recordDate, declaredDate, div.frequency || 52, (existing as any).id).run()
          } else {
            await DB.prepare(`
              INSERT INTO dividend_repository (
                ticker, ex_date, pay_date, record_date, declared_date,
                amount, frequency, status, api_source
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'massive')
            `).bind(ticker, exDate, payDate, recordDate, declaredDate, amount, div.frequency || 52).run()
          }
        }
        
        tickersProcessed.push(ticker)
        debugInfo.push(`${ticker}: Completed`)
        
        // Rate limiting delay
        if (uniqueTickers.indexOf(ticker) < uniqueTickers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 12500))
        }
        
      } catch (error) {
        console.error(`[CRON] Error processing ${ticker}:`, error)
        errors.push(`${ticker}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
    
    const duration = Date.now() - startTime
    
    // Update log
    await DB.prepare(`
      UPDATE dividend_fetch_logs
      SET 
        status = ?,
        completed_at = CURRENT_TIMESTAMP,
        tickers_processed = ?,
        dividends_found = ?,
        api_calls_made = ?,
        duration_ms = ?,
        error_message = ?
      WHERE id = ?
    `).bind(
      errors.length > 0 ? 'partial' : 'success',
      tickersProcessed.join(', '),
      totalDividends,
      apiCalls,
      duration,
      errors.length > 0 ? errors.join('; ') : null,
      logId
    ).run()
    
    console.log(`[CRON] Dividend fetch completed: ${totalDividends} dividends, ${apiCalls} API calls, ${duration}ms`)
    
    // Function completes successfully - no return value needed
  } catch (error) {
    console.error('[CRON] Error in background dividend fetch:', error)
    
    // Try to update log with error
    try {
      await DB.prepare(`
        UPDATE dividend_fetch_logs
        SET status = 'error', error_message = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(error instanceof Error ? error.message : 'Unknown error', logId).run()
    } catch (logError) {
      console.error('[CRON] Failed to update error log:', logError)
    }
  }
}

// Get dividend repository entries (user-agnostic data)
routes.get('/api/dividend-repository', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const status = c.req.query('status') || 'all' // all, active, deprecated
    const ticker = c.req.query('ticker')
    const fromDate = c.req.query('from_date')
    const toDate = c.req.query('to_date')
    
    let query = `
      SELECT 
        dr.*,
        c.company_name
      FROM dividend_repository dr
      LEFT JOIN companies c ON dr.ticker = c.ticker AND c.user_id = ?
      WHERE 1=1
    `
    const params: any[] = [userId]
    
    if (status !== 'all') {
      query += ` AND dr.status = ?`
      params.push(status)
    }
    
    if (ticker) {
      query += ` AND dr.ticker = ?`
      params.push(ticker)
    }
    
    if (fromDate) {
      query += ` AND dr.ex_date >= ?`
      params.push(fromDate)
    }
    
    if (toDate) {
      query += ` AND dr.ex_date <= ?`
      params.push(toDate)
    }
    
    query += ` ORDER BY dr.ex_date DESC, dr.ticker ASC`
    
    const results = await DB.prepare(query).bind(...params).all()
    
    return c.json({
      dividends: results.results,
      count: results.results.length
    })
  } catch (error) {
    console.error('Error fetching dividend repository:', error)
    return c.json({ error: 'Failed to fetch dividend repository' }, 500)
  }
})

// Get fetch logs (must be before /:id route to avoid matching 'logs' as an id)
routes.get('/api/dividend-repository/logs', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const limit = parseInt(c.req.query('limit') || '10')
    
    const results = await DB.prepare(`
      SELECT * FROM dividend_fetch_logs
      WHERE user_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `).bind(userId, limit).all()
    
    return c.json({ logs: results.results })
  } catch (error) {
    console.error('Error fetching logs:', error)
    return c.json({ error: 'Failed to fetch logs' }, 500)
  }
})

// Get single dividend by ID
routes.get('/api/dividend-repository/:id', authMiddleware, async (c) => {
  try {
    const { DB } = c.env
    const dividendId = c.req.param('id')
    
    const dividend = await DB.prepare(`
      SELECT * FROM dividend_repository
      WHERE id = ?
    `).bind(dividendId).first() as any
    
    if (!dividend) {
      return c.json({ error: 'Dividend not found' }, 404)
    }
    
    return c.json(dividend)
  } catch (error) {
    console.error('Error fetching dividend:', error)
    return c.json({ error: 'Failed to fetch dividend' }, 500)
  }
})

// Update dividend by ID
routes.put('/api/dividend-repository/:id', authMiddleware, async (c) => {
  try {
    const { DB } = c.env
    const dividendId = c.req.param('id')
    const body = await c.req.json()
    
    // Validate required fields
    if (!body.ex_date || !body.amount) {
      return c.json({ error: 'ex_date and amount are required' }, 400)
    }
    
    // Check if dividend exists
    const existing = await DB.prepare(`
      SELECT * FROM dividend_repository WHERE id = ?
    `).bind(dividendId).first() as any
    
    if (!existing) {
      return c.json({ error: 'Dividend not found' }, 404)
    }
    
    // Update dividend and mark as manually edited
    await DB.prepare(`
      UPDATE dividend_repository
      SET 
        ex_date = ?,
        pay_date = ?,
        record_date = ?,
        declared_date = ?,
        amount = ?,
        frequency = ?,
        manually_edited = 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      body.ex_date,
      body.pay_date || null,
      body.record_date || null,
      body.declared_date || null,
      body.amount,
      body.frequency || null,
      dividendId
    ).run()
    
    // Fetch updated record
    const updated = await DB.prepare(`
      SELECT * FROM dividend_repository WHERE id = ?
    `).bind(dividendId).first() as any
    
    return c.json({ 
      success: true, 
      dividend: updated 
    })
  } catch (error) {
    console.error('Error updating dividend:', error)
    return c.json({ error: 'Failed to update dividend' }, 500)
  }
})

// Apply dividend to cost_basis_adjustments
routes.post('/api/dividend-repository/:id/apply', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const dividendId = c.req.param('id')
    
    // Get dividend record
    const dividend = await DB.prepare(`
      SELECT * FROM dividend_repository
      WHERE id = ? AND user_id = ?
    `).bind(dividendId, userId).first() as any
    
    if (!dividend) {
      return c.json({ error: 'Dividend not found' }, 404)
    }
    
    if (dividend.is_applied === 1) {
      return c.json({ error: 'Dividend already applied' }, 400)
    }
    
    if (dividend.is_eligible !== 1) {
      return c.json({ error: 'Dividend is not eligible for this holding' }, 400)
    }
    
    // Create cost_basis_adjustment entry
    const result = await DB.prepare(`
      INSERT INTO cost_basis_adjustments (
        user_id, holding_id, adjustment_type, amount, adjustment_date, notes
      ) VALUES (?, ?, 'DIVIDEND', ?, ?, ?)
    `).bind(
      userId,
      dividend.holding_id,
      dividend.total_dividend,
      dividend.pay_date || dividend.ex_date,
      `Auto-applied dividend from repository: ${dividend.ticker} ${dividend.amount}/share * ${dividend.shares_held} shares`
    ).run()
    
    const costBasisId = result.meta.last_row_id
    
    // Update dividend repository
    await DB.prepare(`
      UPDATE dividend_repository
      SET is_applied = 1, applied_date = CURRENT_TIMESTAMP,
          cost_basis_adjustment_id = ?, status = 'applied',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(costBasisId, dividendId).run()
    
    return c.json({
      success: true,
      message: 'Dividend applied to cost basis adjustments',
      cost_basis_adjustment_id: costBasisId
    })
  } catch (error) {
    console.error('Error applying dividend:', error)
    return c.json({ error: 'Failed to apply dividend' }, 500)
  }
})
