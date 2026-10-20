import type { CloudflareBindings, ScheduledEvent, ExecutionContext } from './types'

// Cloudflare Scheduled Event Handler (Cron Jobs)
// Runs every Sunday at midnight: "0 0 * * 0"
export async function scheduled(event: ScheduledEvent, env: CloudflareBindings, ctx: ExecutionContext) {
  console.log('Scheduled event triggered:', new Date().toISOString())
  
  try {
    // Fetch dividends for all users (system-wide Massive API key)
    const MASSIVE_API_KEY = 'x4VbKUBkKwYB10ObRLoRt9eDqfcClxEW'
    
    // Get all users with stock holdings
    const users = await env.DB.prepare(`
      SELECT DISTINCT user_id
      FROM stock_holdings
    `).all()
    
    console.log(`Found ${users.results.length} users with stock holdings`)
    
    for (const user of users.results as any[]) {
      const userId = user.user_id
      
      try {
        console.log(`Fetching dividends for user ${userId}`)
        
        // Get all holdings for this user
        const holdings = await env.DB.prepare(`
          SELECT DISTINCT ticker
          FROM stock_holdings
          WHERE user_id = ?
          ORDER BY ticker
        `).bind(userId).all()
        
        if (!holdings.results || holdings.results.length === 0) {
          console.log(`No holdings found for user ${userId}`)
          continue
        }
        
        // Create fetch log
        const logResult = await env.DB.prepare(`
          INSERT INTO dividend_fetch_logs (user_id, fetch_type, status, tickers_processed)
          VALUES (?, 'scheduled', 'in_progress', '')
        `).bind(userId).run()
        
        const logId = logResult.meta.last_row_id
        const startTime = Date.now()
        let totalDividends = 0
        let apiCalls = 0
        const tickersProcessed: string[] = []
        const errors: string[] = []
        
        // Process each unique ticker
        for (const holding of holdings.results as any[]) {
          try {
            console.log(`Fetching dividends for ${holding.ticker}`)
            tickersProcessed.push(holding.ticker)
            
            // Call Massive (Polygon.io) API
            // Filter dividends from 2025-01-01 onwards
            const response = await fetch(`https://api.polygon.io/v3/reference/dividends?ticker=${holding.ticker}&ex_dividend_date.gte=2025-01-01&apiKey=${MASSIVE_API_KEY}`, {
              method: 'GET'
            })
            
            apiCalls++
            
            if (!response.ok) {
              if (response.status === 429) {
                console.error(`Rate limit exceeded for ${holding.ticker}`)
                errors.push(`${holding.ticker}: Rate limit exceeded (HTTP 429) - please wait before retrying`)
              } else {
                console.error(`API error for ${holding.ticker}:`, response.status)
                errors.push(`${holding.ticker}: HTTP ${response.status}`)
              }
              continue
            }
            
            const dividendData = await response.json() as any
            const dividends = dividendData.results || []
            
            // Fallback to EODHD if Massive returns 0 results
            // This includes Canadian stocks (.TO, .V) and US stocks with incomplete Polygon.io data
            const EODHD_API_KEY = '69bc75c1788da8.83960172'
            let eodhd_dividends = []
            
            if (dividends.length === 0) {
              console.log(`${holding.ticker}: Polygon.io returned 0 results, trying EODHD fallback...`)
              
              try {
                const eodhd_response = await fetch(`https://eodhd.com/api/div/${holding.ticker}?from=2025-01-01&api_token=${EODHD_API_KEY}&fmt=json`, {
                  method: 'GET'
                })
                
                apiCalls++
                
                if (eodhd_response.ok) {
                  eodhd_dividends = await eodhd_response.json() as any[]
                  console.log(`${holding.ticker}: EODHD fallback returned ${eodhd_dividends.length} dividends`)
                } else {
                  console.log(`${holding.ticker}: EODHD API failed with ${eodhd_response.status}`)
                }
              } catch (eodhd_error) {
                console.error(`EODHD error for ${holding.ticker}:`, eodhd_error)
              }
            }
            
            // Minimum date filter: only fetch dividends from 2025-01-01 onwards
            const MIN_DATE = '2026-01-01'
            
            // Process EODHD dividends if available
            for (const div of eodhd_dividends) {
              const exDate = div.date  // EODHD uses 'date' field for ex-dividend date
              const payDate = div.payment_date || null
              const recordDate = div.record_date || null
              const declaredDate = div.declarationDate || null
              const amount = parseFloat(div.value)
              
              if (!exDate || !amount) {
                continue
              }
              
              // Filter: only include dividends from 2025-01-01 onwards
              if (exDate < MIN_DATE) {
                continue
              }
              
              totalDividends++
              
              // Check if dividend already exists (user-agnostic)
              const existing = await env.DB.prepare(`
                SELECT id FROM dividend_repository
                WHERE ticker = ? AND ex_date = ?
              `).bind(holding.ticker, exDate).first()
              
              if (existing) {
                // Update existing record
                await env.DB.prepare(`
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
                  (existing as any).id
                ).run()
              } else {
                // Insert new record - EODHD dividends default to monthly frequency (12)
                await env.DB.prepare(`
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
              const payDate = div.pay_date
              const recordDate = div.record_date
              const declaredDate = div.declaration_date
              const amount = parseFloat(div.cash_amount)
              
              if (!exDate || !amount) {
                continue
              }
              
              // Filter: only include dividends from 2025-01-01 onwards
              if (exDate < MIN_DATE) {
                continue
              }
              
              totalDividends++
              
              // Check if dividend already exists (user-agnostic)
              const existing = await env.DB.prepare(`
                SELECT id FROM dividend_repository
                WHERE ticker = ? AND ex_date = ?
              `).bind(holding.ticker, exDate).first()
              
              if (existing) {
                // Update existing record
                await env.DB.prepare(`
                  UPDATE dividend_repository
                  SET amount = ?, pay_date = ?, record_date = ?, declared_date = ?,
                      frequency = ?, fetch_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                `).bind(
                  amount,
                  payDate,
                  recordDate,
                  declaredDate,
                  div.frequency || 52,
                  (existing as any).id
                ).run()
              } else {
                // Insert new record (user-agnostic)
                await env.DB.prepare(`
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
                  div.frequency || 52
                ).run()
              }
            }
            
            // Rate limiting: 12.5s delay for Massive API (5 calls/minute with extra buffer)
            await new Promise(resolve => setTimeout(resolve, 12500))
            
          } catch (error) {
            console.error(`Error processing ${holding.ticker}:`, error)
            errors.push(`${holding.ticker}: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }
        
        const duration = Date.now() - startTime
        
        // Update fetch log
        await env.DB.prepare(`
          UPDATE dividend_fetch_logs
          SET status = ?, tickers_processed = ?, dividends_found = ?,
              api_calls_made = ?, completed_at = CURRENT_TIMESTAMP,
              fetch_duration_ms = ?, error_message = ?
          WHERE id = ?
        `).bind(
          errors.length > 0 ? 'partial' : 'success',
          tickersProcessed.join(','),
          totalDividends,
          apiCalls,
          duration,
          errors.length > 0 ? errors.join('; ') : null,
          logId
        ).run()
        
        console.log(`Completed dividend fetch for user ${userId}: ${totalDividends} dividends, ${apiCalls} API calls`)
        
      } catch (userError) {
        console.error(`Error fetching dividends for user ${userId}:`, userError)
      }
    }
    
    console.log('Scheduled dividend fetch completed')
    
  } catch (error) {
    console.error('Error in scheduled handler:', error)
  }
}
