import { Hono } from 'hono'
import { addCompanyToRoster } from '../lib/add-company'
import { markDiscoveryAdded } from './discovery'
import { authMiddleware } from '../lib/auth'
import { scheduled } from '../scheduled'
import type { Bindings } from '../types'

export const routes = new Hono<{ Bindings: Bindings }>()

// ============================================================================
// COMPANY ROUTES
// ============================================================================

routes.get('/api/companies', authMiddleware, async (c) => {
  const userId = c.get('userId')
  
  const companies = await c.env.DB.prepare(`
    SELECT * FROM companies WHERE user_id = ? ORDER BY ticker ASC
  `).bind(userId).all()
  
  return c.json({ companies: companies.results })
})

routes.get('/api/companies/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const companyId = c.req.param('id')
  
  const company = await c.env.DB.prepare(`
    SELECT * FROM companies WHERE id = ? AND user_id = ?
  `).bind(companyId, userId).first()
  
  if (!company) {
    return c.json({ error: 'Company not found' }, 404)
  }
  
  return c.json({ company })
})

routes.post('/api/companies', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const data = await c.req.json()
  
  // Validate required fields
  if (!data.ticker) {
    return c.json({ error: 'Ticker is required' }, 400)
  }
  
  const ticker = data.ticker.toUpperCase()
  
    const result = await addCompanyToRoster(c.env, userId, ticker)
  if (result && result.success) await markDiscoveryAdded(c.env, ticker)
  return c.json(result.success ? result : { error: result.error }, result.status)
})

routes.put('/api/companies/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const companyId = c.req.param('id')
  const data = await c.req.json()
  
  // Build dynamic UPDATE query only for provided fields
  const updates: string[] = []
  const values: any[] = []
  
  if (data.ticker !== undefined) {
    updates.push('ticker = ?')
    values.push(data.ticker)
  }
  if (data.company_name !== undefined) {
    updates.push('company_name = ?')
    values.push(data.company_name)
  }
  if (data.market_cap !== undefined) {
    updates.push('market_cap = ?')
    values.push(data.market_cap)
  }
  if (data.exchange !== undefined) {
    updates.push('exchange = ?')
    values.push(data.exchange)
  }
  if (data.sector !== undefined) {
    updates.push('sector = ?')
    values.push(data.sector)
  }
  if (data.industry !== undefined) {
    updates.push('industry = ?')
    values.push(data.industry)
  }
  if (data.buy_price !== undefined) {
    updates.push('buy_price = ?')
    values.push(data.buy_price)
  }
  if (data.is_wonderful !== undefined) {
    updates.push('is_wonderful = ?')
    values.push(data.is_wonderful ? 1 : 0)
  }
  if (data.research_score !== undefined) {
    updates.push('research_score = ?')
    values.push(data.research_score)
  }
  if (data.anti_fragile_score !== undefined) {
    updates.push('anti_fragile_score = ?')
    values.push(data.anti_fragile_score)
  }
  if (data.next_earnings_date !== undefined) {
    updates.push('next_earnings_date = ?')
    values.push(data.next_earnings_date)
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP')
  values.push(companyId, userId)
  
  const query = `UPDATE companies SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
  await c.env.DB.prepare(query).bind(...values).run()
  
  return c.json({ success: true })
})

// Fetch earnings date for a company
routes.post('/api/companies/:id/fetch-earnings', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const companyId = c.req.param('id')
  const { DB } = c.env
  
  try {
    // Get company ticker and current earnings date
    const company = await DB.prepare(`
      SELECT ticker, next_earnings_date FROM companies WHERE id = ? AND user_id = ?
    `).bind(companyId, userId).first()
    
    if (!company) {
      return c.json({ error: 'Company not found' }, 404)
    }
    
    const ticker = company.ticker
    const currentEarningsDate = company.next_earnings_date
    
    // Check if test environment
    const isTestEnv = c.env.ENVIRONMENT === 'test' || process.env.NODE_ENV === 'test'
    
    if (isTestEnv) {
      console.log(`🧪 Test environment detected - using mock earnings data for ${ticker}`)
      const mockEarningsDate = '2025-04-30'
      
      // Update the company record
      await DB.prepare(`
        UPDATE companies 
        SET next_earnings_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).bind(mockEarningsDate, companyId, userId).run()
      
      return c.json({ 
        success: true, 
        next_earnings_date: mockEarningsDate,
        source: 'Mock (Test)',
        is_estimated: false,
        message: `✅ Earnings date updated (test mode): ${mockEarningsDate}`
      })
    }
    
    // Smart refresh: Check if refresh is needed
    if (currentEarningsDate) {
      const earningsDate = new Date(currentEarningsDate)
      const today = new Date()
      today.setHours(0, 0, 0, 0) // Reset time to compare dates only
      
      if (earningsDate > today) {
        // Earnings date is in the future and still valid
        console.log(`✅ Earnings date (${currentEarningsDate}) is still current. Skipping API call.`)
        return c.json({ 
          success: true, 
          next_earnings_date: currentEarningsDate,
          source: 'Cached',
          is_estimated: false,
          message: `✅ Earnings date is current: ${currentEarningsDate} (no API call needed)`
        })
      } else {
        console.log(`⚠️ Earnings date (${currentEarningsDate}) has passed. Fetching new date...`)
      }
    }
    
    let nextEarningsDate = null
    let source = 'FinanceBird'
    let isEstimated = false
    
    // Use FinanceBird Summary endpoint (same as company creation)
    const rapidApiKey = c.env.RAPIDAPI_KEY
    
    if (rapidApiKey) {
      try {
        console.log(`🔍 Fetching earnings for ${ticker} from FinanceBird...`)
        
        const summaryUrl = `https://financebird.p.rapidapi.com/quote/${ticker}/summary`
        const response = await fetch(summaryUrl, {
          headers: {
            'X-RapidAPI-Key': rapidApiKey,
            'X-RapidAPI-Host': 'financebird.p.rapidapi.com'
          }
        })
        
        console.log(`API Response status: ${response.status}`)
        
        if (response.ok) {
          const data = await response.json()
          console.log(`API Response data keys: ${Object.keys(data).join(', ')}`)
          
          const result = data.quoteResponse?.result?.[0]
          
          if (result) {
            console.log(`Result keys: ${Object.keys(result).join(', ')}`)
            
            // Get next earnings date (prefer End, fallback to Start)
            const earningsTs = result.earningsTimestampEnd?.raw || 
                              result.earningsTimestampStart?.raw
            
            console.log(`earningsTimestampEnd: ${result.earningsTimestampEnd?.raw}, earningsTimestampStart: ${result.earningsTimestampStart?.raw}, earningsTimestamp: ${result.earningsTimestamp?.raw}`)
            
            if (earningsTs) {
              const date = new Date(earningsTs * 1000)
              nextEarningsDate = date.toISOString().split('T')[0]
              console.log(`✅ FinanceBird Earnings: ${nextEarningsDate}`)
            } else if (result.earningsTimestamp?.raw) {
              // If no future earnings date, estimate from last earnings + 3 months
              const lastEarnings = new Date(result.earningsTimestamp.raw * 1000)
              const estimated = new Date(lastEarnings)
              estimated.setMonth(estimated.getMonth() + 3)
              nextEarningsDate = estimated.toISOString().split('T')[0]
              isEstimated = true
              console.log(`⚠️ FinanceBird Earnings (ESTIMATED): ${nextEarningsDate} (last: ${lastEarnings.toISOString().split('T')[0]} + 3 months)`)
            } else {
              console.log(`No earnings timestamps found in result`)
            }
          } else {
            console.log(`Invalid response structure - quoteResponse.result not found`)
          }
        } else {
          console.log(`API request failed with status: ${response.status}`)
        }
      } catch (e) {
        console.log(`⚠️ FinanceBird API failed for ${ticker}`)
      }
    }
    
    // Update the company record
    await DB.prepare(`
      UPDATE companies 
      SET next_earnings_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(nextEarningsDate, companyId, userId).run()
    
    // Return result
    if (nextEarningsDate) {
      const estimatedNote = isEstimated ? ' (ESTIMATED)' : ''
      return c.json({ 
        success: true, 
        next_earnings_date: nextEarningsDate,
        source: source,
        is_estimated: isEstimated,
        message: `✅ Earnings date updated: ${nextEarningsDate}${estimatedNote} (from ${source})`
      })
    } else {
      return c.json({ 
        success: true, 
        next_earnings_date: null,
        message: 'ℹ️ No earnings date available from FinanceBird. The company may not have scheduled earnings yet, or it may not be publicly traded on major exchanges.'
      })
    }
  } catch (error) {
    console.error('Error in fetch-earnings endpoint:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

routes.delete('/api/companies/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const companyId = c.req.param('id')
  
  await c.env.DB.prepare(`
    DELETE FROM companies WHERE id = ? AND user_id = ?
  `).bind(companyId, userId).run()
  
  return c.json({ success: true })
})
