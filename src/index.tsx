import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
}

// Alias for use in scheduled handler
type CloudflareBindings = Bindings

// Cloudflare scheduled event interface
interface ScheduledEvent {
  cron: string;
  type: 'scheduled';
  scheduledTime: number;
}

// Cloudflare execution context interface
interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './' }))

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Simple password hashing (in production, use proper bcrypt)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password)
  return passwordHash === hash
}

// Simple JWT generation (using Web Crypto API)
async function generateToken(payload: any): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const signature = btoa(`${header}.${body}.secret`)
  return `${header}.${body}.${signature}`
}

// Verify JWT token
function verifyToken(token: string): any | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    return payload
  } catch {
    return null
  }
}

// Helper function to fetch and cache exchange rates
async function fetchAndCacheExchangeRate(DB: any, month: number, year: number) {
  try {
    // Use the /v4/latest/ endpoint which returns current rates
    // Note: This API doesn't support historical rates on the free tier
    // For monthly tracking, we cache the rate when first accessed for that month
    // Use Bank of Canada's official exchange rate API (free, no API key needed)
    const response = await fetch(`https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1`, {
      headers: {
        'User-Agent': 'GenerationalInvesting/1.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('Bank of Canada API status:', response.status, response.statusText);
    
    if (!response.ok) {
      const text = await response.text();
      console.error('Bank of Canada API error response:', text.substring(0, 200));
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    console.log('Bank of Canada API response:', { 
      success: !!data, 
      hasObservations: !!data?.observations,
      observationCount: data?.observations?.length,
      latestRate: data?.observations?.[0]?.FXUSDCAD?.v
    });
    
    // Bank of Canada returns data in format: { observations: [{ d: "2026-02-26", FXUSDCAD: { v: "1.3688" } }] }
    if (data && data.observations && data.observations.length > 0 && data.observations[0].FXUSDCAD?.v) {
      const usdToCad = parseFloat(data.observations[0].FXUSDCAD.v);
      const cadToUsd = 1 / usdToCad;
      const rateDate = data.observations[0].d;
      
      // Cache the rate (use INSERT OR IGNORE to avoid duplicate errors)
      await DB.prepare(`
        INSERT OR IGNORE INTO exchange_rates (month, year, usd_to_cad, cad_to_usd)
        VALUES (?, ?, ?, ?)
      `).bind(month, year, usdToCad, cadToUsd).run();
      
      console.log(`✅ Exchange rate cached for ${month}/${year}: ${usdToCad} USD to CAD (from Bank of Canada, date: ${rateDate})`);
    } else {
      // Use fallback rate
      const defaultRate = 1.35;
      await DB.prepare(`
        INSERT OR IGNORE INTO exchange_rates (month, year, usd_to_cad, cad_to_usd)
        VALUES (?, ?, ?, ?)
      `).bind(month, year, defaultRate, 1 / defaultRate).run();
      
      console.log(`⚠️ Fallback exchange rate cached for ${month}/${year}: ${defaultRate} USD to CAD (API data missing)`);
    }
  } catch (error) {
    console.error('❌ Error fetching and caching exchange rate:', error);
    
    // On error, cache fallback rate
    try {
      const defaultRate = 1.35;
      await DB.prepare(`
        INSERT OR IGNORE INTO exchange_rates (month, year, usd_to_cad, cad_to_usd)
        VALUES (?, ?, ?, ?)
      `).bind(month, year, defaultRate, 1 / defaultRate).run();
      
      console.log(`⚠️ Fallback exchange rate cached for ${month}/${year}: ${defaultRate} USD to CAD (after error)`);
    } catch (insertError) {
      console.error('❌ Error caching fallback rate:', insertError);
    }
  }
}

// Auth middleware
async function authMiddleware(c: any, next: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  
  const token = authHeader.substring(7)
  const payload = verifyToken(token)
  
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401)
  }
  
  c.set('userId', payload.userId)
  await next()
}

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

app.post('/api/auth/register', async (c) => {
  try {
    const { email, password, name } = await c.req.json()
    const { DB } = c.env;
    
    if (!email || !password || !name) {
      return c.json({ error: 'All fields are required' }, 400)
    }
    
    const passwordHash = await hashPassword(password)
    
    const result = await DB.prepare(`
      INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)
    `).bind(email, passwordHash, name).run()
    
    const token = await generateToken({ userId: result.meta.last_row_id, email })
    
    // Fetch and cache current month's exchange rate on registration
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    console.log(`Checking exchange rate cache for ${currentMonth}/${currentYear}`);
    
    // Check if we already have this month's rate cached
    const cached = await DB.prepare(`
      SELECT id FROM exchange_rates 
      WHERE month = ? AND year = ?
    `).bind(currentMonth, currentYear).first();
    
    if (!cached) {
      console.log('Exchange rate not cached, fetching now...');
      // Fetch and cache synchronously (this happens once per month, so it's acceptable)
      await fetchAndCacheExchangeRate(DB, currentMonth, currentYear);
    } else {
      console.log('Exchange rate already cached');
    }
    
    return c.json({ 
      token, 
      user: { id: result.meta.last_row_id, email, name }
    })
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'Email already exists' }, 400)
    }
    return c.json({ error: 'Registration failed' }, 500)
  }
})

app.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json()
    const { DB } = c.env;
    
    const user = await DB.prepare(`
      SELECT id, email, password_hash, name FROM users WHERE email = ?
    `).bind(email).first()
    
    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }
    
    const isValid = await verifyPassword(password, user.password_hash as string)
    
    if (!isValid) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }
    
    const token = await generateToken({ userId: user.id, email: user.email })
    
    // Fetch and cache current month's exchange rate on login
    // This happens once per month, so it's acceptable to await
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    console.log(`Checking exchange rate cache for ${currentMonth}/${currentYear}`);
    
    // Check if we already have this month's rate cached
    const cached = await DB.prepare(`
      SELECT id FROM exchange_rates 
      WHERE month = ? AND year = ?
    `).bind(currentMonth, currentYear).first();
    
    if (!cached) {
      console.log('Exchange rate not cached, fetching now...');
      // Fetch and cache synchronously (this happens once per month, so it's acceptable)
      await fetchAndCacheExchangeRate(DB, currentMonth, currentYear);
    } else {
      console.log('Exchange rate already cached');
    }
    
    return c.json({ 
      token, 
      user: { id: user.id, email: user.email, name: user.name }
    })
  } catch (error) {
    return c.json({ error: 'Login failed' }, 500)
  }
})

// ============================================================================
// USER PROFILE ROUTES
// ============================================================================

// Get current user profile
app.get('/api/user/profile', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env;
    
    const user = await DB.prepare(`
      SELECT id, email, name, created_at, updated_at 
      FROM users 
      WHERE id = ?
    `).bind(userId).first()
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }
    
    return c.json(user)
  } catch (error) {
    console.error('Get profile error:', error)
    return c.json({ error: 'Failed to get profile' }, 500)
  }
})

// Update user profile
app.put('/api/user/profile', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { name, email } = await c.req.json()
    const { DB } = c.env;
    
    if (!name && !email) {
      return c.json({ error: 'Name or email is required' }, 400)
    }
    
    // If email is being updated, check if it's already taken by another user
    if (email) {
      const existingUser = await DB.prepare(`
        SELECT id FROM users WHERE email = ? AND id != ?
      `).bind(email, userId).first()
      
      if (existingUser) {
        return c.json({ error: 'Email already in use' }, 400)
      }
    }
    
    // Build update query dynamically based on provided fields
    let query = 'UPDATE users SET updated_at = CURRENT_TIMESTAMP'
    const params: any[] = []
    
    if (name) {
      query += ', name = ?'
      params.push(name)
    }
    
    if (email) {
      query += ', email = ?'
      params.push(email)
    }
    
    query += ' WHERE id = ?'
    params.push(userId)
    
    await DB.prepare(query).bind(...params).run()
    
    // Fetch updated user
    const updatedUser = await DB.prepare(`
      SELECT id, email, name, created_at, updated_at 
      FROM users 
      WHERE id = ?
    `).bind(userId).first()
    
    return c.json(updatedUser)
  } catch (error) {
    console.error('Update profile error:', error)
    return c.json({ error: 'Failed to update profile' }, 500)
  }
})

// Change password
app.put('/api/user/password', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { current_password, new_password } = await c.req.json()
    const { DB } = c.env;
    
    if (!current_password || !new_password) {
      return c.json({ error: 'Current and new password are required' }, 400)
    }
    
    if (new_password.length < 6) {
      return c.json({ error: 'New password must be at least 6 characters' }, 400)
    }
    
    // Verify current password
    const user = await DB.prepare(`
      SELECT id, password_hash FROM users WHERE id = ?
    `).bind(userId).first()
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }
    
    const isValid = await verifyPassword(current_password, user.password_hash as string)
    
    if (!isValid) {
      return c.json({ error: 'Current password is incorrect' }, 401)
    }
    
    // Hash new password and update
    const newPasswordHash = await hashPassword(new_password)
    
    await DB.prepare(`
      UPDATE users 
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(newPasswordHash, userId).run()
    
    return c.json({ message: 'Password updated successfully' })
  } catch (error) {
    console.error('Change password error:', error)
    return c.json({ error: 'Failed to change password' }, 500)
  }
})

// ============================================================================
// COMPANY ROUTES
// ============================================================================

app.get('/api/companies', authMiddleware, async (c) => {
  const userId = c.get('userId')
  
  const companies = await c.env.DB.prepare(`
    SELECT * FROM companies WHERE user_id = ? ORDER BY ticker ASC
  `).bind(userId).all()
  
  return c.json({ companies: companies.results })
})

app.get('/api/companies/:id', authMiddleware, async (c) => {
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

// Fetch company data from multiple sources with fallback
async function fetchCompanyData(ticker: string, env?: any) {
  let companyName = ticker
  let marketCap = null
  let exchange = null
  let sector = null
  let industry = null
  let nextEarningsDate = null
  
  // Get API keys from environment
  const rapidApiKey = env?.RAPIDAPI_KEY || null
  const isTestEnv = env?.ENVIRONMENT === 'test' || process.env.NODE_ENV === 'test'
  
  if (isTestEnv) {
    console.log(`🧪 Test environment detected - using mock data for ${ticker}`)
    // Return mock data for tests to avoid API calls
    return {
      company_name: ticker === 'AAPL' ? 'Apple Inc.' : 
                    ticker === 'MSFT' ? 'Microsoft Corporation' :
                    ticker === 'TSLA' ? 'Tesla, Inc.' :
                    ticker === 'TEMP' ? 'Temporary Company' :
                    `${ticker} Inc.`,
      market_cap: 2000000000000,
      sector: 'Technology',
      industry: 'Consumer Electronics',
      exchange: 'NASDAQ',
      next_earnings_date: '2025-04-30'
    }
  }
  
  if (rapidApiKey) {
    console.log(`🔑 Using RapidAPI key for FinanceBird: ${rapidApiKey.substring(0, 10)}...`)
  }
  
  console.log(`🔍 Fetching data for ${ticker}...`)
  
  // Step 1: Try Yahoo Finance Chart API for basic info
  try {
    const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`
    const response = await fetch(quoteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      if (data.chart && data.chart.result && data.chart.result.length > 0) {
        const meta = data.chart.result[0].meta
        companyName = meta.longName || meta.shortName || ticker
        marketCap = meta.marketCap || null
        exchange = meta.exchangeName || meta.exchange || null
        console.log(`✅ Yahoo Chart API: ${companyName}`)
      }
    }
  } catch (e) {
    console.log(`⚠️ Yahoo Chart API failed for ${ticker}`)
  }
  
  // Step 2: FinanceBird (RapidAPI) - ONLY call if Yahoo data is incomplete
  if (rapidApiKey && (!sector || !industry || !nextEarningsDate)) {
    try {
      console.log(`⚠️ Yahoo data incomplete. Fetching missing fields from FinanceBird...`)
      console.log(`  Missing: ${!sector ? 'sector ' : ''}${!industry ? 'industry ' : ''}${!nextEarningsDate ? 'earnings' : ''}`)
      
      // Get profile for sector/industry (only if missing)
      if (!sector || !industry) {
        const profileUrl = `https://financebird.p.rapidapi.com/quote/${ticker}/profile`
        const profileResp = await fetch(profileUrl, {
          headers: {
            'X-RapidAPI-Key': rapidApiKey,
            'X-RapidAPI-Host': 'financebird.p.rapidapi.com'
          }
        })
        
        if (profileResp.ok) {
          const data = await profileResp.json()
          if (data.quoteSummary && data.quoteSummary.result && data.quoteSummary.result.length > 0) {
            const profile = data.quoteSummary.result[0].assetProfile
            if (profile) {
              sector = profile.sector || sector
              industry = profile.industry || industry
              console.log(`✅ FinanceBird Profile: Sector=${sector}, Industry=${industry}`)
            }
          }
        }
      }
      
      // Get summary for earnings date (only if missing)
      if (!nextEarningsDate) {
        const summaryUrl = `https://financebird.p.rapidapi.com/quote/${ticker}/summary`
        const summaryResp = await fetch(summaryUrl, {
          headers: {
            'X-RapidAPI-Key': rapidApiKey,
            'X-RapidAPI-Host': 'financebird.p.rapidapi.com'
          }
        })
        
        if (summaryResp.ok) {
          const summary = await summaryResp.json()
          const result = summary.quoteResponse?.result?.[0]
          
          if (result) {
            // Get next earnings date (prefer End, fallback to Start, then Timestamp)
            const earningsTs = result.earningsTimestampEnd?.raw || 
                              result.earningsTimestampStart?.raw ||
                              result.earningsTimestamp?.raw
            
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
              console.log(`⚠️ FinanceBird Earnings (ESTIMATED): ${nextEarningsDate} (last: ${lastEarnings.toISOString().split('T')[0]} + 3 months)`)
            }
          }
        }
      }
    } catch (e) {
      console.log(`⚠️ FinanceBird API failed for ${ticker}`)
    }
  } else if (rapidApiKey) {
    console.log(`✅ Yahoo data complete. Skipping FinanceBird API calls (saved 2 API calls!)`)
  }
  
  console.log(`📊 Final data for ${ticker}: name=${companyName}, marketCap=${marketCap}, sector=${sector}, industry=${industry}, earnings=${nextEarningsDate}`)
  
  return {
    company_name: companyName,
    market_cap: marketCap,
    sector: sector,
    industry: industry,
    exchange: exchange,
    next_earnings_date: nextEarningsDate
  }
}

// Legacy function name for compatibility
async function fetchYahooFinanceData(ticker: string, env?: any) {
  return fetchCompanyData(ticker, env)
}

app.post('/api/companies', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const data = await c.req.json()
  
  // Validate required fields
  if (!data.ticker) {
    return c.json({ error: 'Ticker is required' }, 400)
  }
  
  const ticker = data.ticker.toUpperCase()
  
  // Check if company already exists for this user
  const existing = await c.env.DB.prepare(`
    SELECT id, ticker, company_name FROM companies 
    WHERE ticker = ? AND user_id = ?
  `).bind(ticker, userId).first()
  
  if (existing) {
    return c.json({ 
      error: `${existing.company_name || ticker} is already in your portfolio` 
    }, 409)
  }
  
  // Fetch company data from multiple sources
  const yahooData = await fetchYahooFinanceData(ticker, c.env)
  
  const result = await c.env.DB.prepare(`
    INSERT INTO companies (
      user_id, ticker, company_name, market_cap, exchange, 
      sector, industry, buy_price, is_wonderful, research_score, anti_fragile_score, next_earnings_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId, 
    ticker, 
    yahooData.company_name,
    yahooData.market_cap,
    yahooData.exchange,
    yahooData.sector,
    yahooData.industry,
    data.buy_price || null,
    data.is_wonderful ? 1 : 0,
    data.research_score || null,
    data.anti_fragile_score || null,
    yahooData.next_earnings_date
  ).run()
  
  return c.json({ 
    id: result.meta.last_row_id, 
    ticker: ticker,
    ...yahooData,
    research_score: data.research_score || null,
    anti_fragile_score: data.anti_fragile_score || null
  }, 201)
})

app.put('/api/companies/:id', authMiddleware, async (c) => {
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
app.post('/api/companies/:id/fetch-earnings', authMiddleware, async (c) => {
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

app.delete('/api/companies/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const companyId = c.req.param('id')
  
  await c.env.DB.prepare(`
    DELETE FROM companies WHERE id = ? AND user_id = ?
  `).bind(companyId, userId).run()
  
  return c.json({ success: true })
})

// ============================================================================
// ACCOUNTS ENDPOINTS
// ============================================================================

// Get all accounts for current user
app.get('/api/accounts', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;

    const { results } = await DB.prepare(`
      SELECT id, account_name, account_type, balance_cad, balance_usd, 
             cash_balance_cad, cash_balance_usd, default_currency, created_at, updated_at
      FROM accounts
      WHERE user_id = ?
      ORDER BY account_type, account_name
    `).bind(userId).all();

    return c.json({ accounts: results });
  } catch (error: any) {
    console.error('Get accounts error:', error);
    return c.json({ error: 'Failed to fetch accounts' }, 500);
  }
});

// Get single account
app.get('/api/accounts/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const accountId = parseInt(c.req.param('id'));
    const { DB } = c.env;

    const result = await DB.prepare(`
      SELECT id, account_name, account_type, balance_cad, balance_usd, 
             cash_balance_cad, cash_balance_usd, default_currency, created_at, updated_at
      FROM accounts
      WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).first();

    if (!result) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json({ account: result });
  } catch (error: any) {
    console.error('Get account error:', error);
    return c.json({ error: 'Failed to fetch account' }, 500);
  }
});

// Create new account
app.post('/api/accounts', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;
    const { 
      account_name, 
      account_type, 
      balance_cad = 0, 
      balance_usd = 0, 
      cash_balance_cad = 0,
      cash_balance_usd = 0,
      default_currency = 'CAD'
    } = await c.req.json();

    // Validation
    if (!account_name || !account_type) {
      return c.json({ error: 'Account name and type are required' }, 400);
    }

    // Validate account_type
    const validTypes = ['Cash', 'TFSA', 'RRSP', 'LIRA'];
    if (!validTypes.includes(account_type)) {
      return c.json({ error: 'Invalid account type' }, 400);
    }

    // Validate default_currency
    if (!['CAD', 'USD'].includes(default_currency)) {
      return c.json({ error: 'Invalid currency. Must be CAD or USD' }, 400);
    }

    const result = await DB.prepare(`
      INSERT INTO accounts (
        user_id, account_name, account_type, balance_cad, 
        balance_usd, cash_balance_cad, cash_balance_usd, default_currency
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId, 
      account_name, 
      account_type, 
      balance_cad, 
      balance_usd, 
      cash_balance_cad,
      cash_balance_usd,
      default_currency
    ).run();

    const accountId = result.meta.last_row_id;

    // Save initial balance to history
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Get exchange rates from cache (don't make HTTP call to avoid timeout)
    let rates = { usd_to_cad: 1.35, cad_to_usd: 1 / 1.35 };
    try {
      const cachedRate = await DB.prepare(`
        SELECT usd_to_cad, cad_to_usd 
        FROM exchange_rates 
        WHERE month = ? AND year = ?
      `).bind(currentMonth, currentYear).first();
      
      if (cachedRate) {
        rates = {
          usd_to_cad: cachedRate.usd_to_cad as number,
          cad_to_usd: cachedRate.cad_to_usd as number
        };
        console.log('Using cached exchange rate for account creation');
      } else {
        console.log('No cached rate found, using fallback 1.35');
      }
    } catch (e) {
      console.error('Error reading exchange rate from cache:', e);
      // Use fallback rates
    }

    // Determine balance and currency based on default_currency
    const historyBalance = default_currency === 'CAD' ? balance_cad : balance_usd;
    const historyCash = default_currency === 'CAD' ? cash_balance_cad : cash_balance_usd;

    // Save initial snapshot to history
    try {
      await DB.prepare(`
        INSERT INTO account_balance_history (
          user_id, account_id, balance, cash_balance, currency,
          month, year, exchange_rate_to_usd, exchange_rate_to_cad
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId,
        accountId,
        historyBalance,
        historyCash,
        default_currency,
        currentMonth,
        currentYear,
        rates.cad_to_usd || (1 / rates.usd_to_cad),
        rates.usd_to_cad || 1.35
      ).run();
      console.log(`Initial balance history saved for account ${accountId}`);
    } catch (historyError) {
      console.error('Failed to save initial balance history:', historyError);
      // Don't fail account creation if history save fails
    }

    return c.json({ 
      id: accountId,
      account_name,
      account_type,
      balance_cad,
      balance_usd,
      cash_balance_cad,
      cash_balance_usd,
      default_currency
    }, 201);
  } catch (error: any) {
    console.error('Create account error:', error);
    return c.json({ error: 'Failed to create account' }, 500);
  }
});

// Update account
app.put('/api/accounts/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const accountId = parseInt(c.req.param('id'));
    const { DB } = c.env;
    const { 
      account_name, 
      account_type, 
      balance_cad, 
      balance_usd, 
      cash_balance_cad,
      cash_balance_usd,
      default_currency
    } = await c.req.json();

    // Validate account_type if provided
    if (account_type !== undefined) {
      const validTypes = ['Cash', 'TFSA', 'RRSP', 'LIRA'];
      if (!validTypes.includes(account_type)) {
        return c.json({ error: 'Invalid account type' }, 400);
      }
    }

    // Validate default_currency if provided
    if (default_currency !== undefined && !['CAD', 'USD'].includes(default_currency)) {
      return c.json({ error: 'Invalid currency. Must be CAD or USD' }, 400);
    }

    // Check ownership
    const existing = await DB.prepare(`
      SELECT * FROM accounts WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).first() as any;

    if (!existing) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Build update with only provided fields
    const updates: string[] = [];
    const values: any[] = [];
    
    if (account_name !== undefined) {
      updates.push('account_name = ?');
      values.push(account_name);
    }
    if (account_type !== undefined) {
      updates.push('account_type = ?');
      values.push(account_type);
    }
    if (balance_cad !== undefined) {
      updates.push('balance_cad = ?');
      values.push(balance_cad);
    }
    if (balance_usd !== undefined) {
      updates.push('balance_usd = ?');
      values.push(balance_usd);
    }
    if (cash_balance_cad !== undefined) {
      updates.push('cash_balance_cad = ?');
      values.push(cash_balance_cad);
    }
    if (cash_balance_usd !== undefined) {
      updates.push('cash_balance_usd = ?');
      values.push(cash_balance_usd);
    }
    if (default_currency !== undefined) {
      updates.push('default_currency = ?');
      values.push(default_currency);
    }
    
    if (updates.length === 0) {
      return c.json({ success: true }); // Nothing to update
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(accountId, userId);

    await DB.prepare(`
      UPDATE accounts
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `).bind(...values).run();

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Update account error:', error);
    return c.json({ error: 'Failed to update account' }, 500);
  }
});

// Delete account
app.delete('/api/accounts/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const accountId = parseInt(c.req.param('id'));
    const { DB } = c.env;

    // Check if account has any trades
    const tradesCheck = await DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM stock_trades WHERE account_id = ?) as stock_count,
        (SELECT COUNT(*) FROM option_trades WHERE account_id = ?) as option_count
    `).bind(accountId, accountId).first() as any;

    if (tradesCheck.stock_count > 0 || tradesCheck.option_count > 0) {
      return c.json({ 
        error: 'Cannot delete account with existing trades' 
      }, 400);
    }

    // Check ownership and delete
    const result = await DB.prepare(`
      DELETE FROM accounts WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Delete account error:', error);
    return c.json({ error: 'Failed to delete account' }, 500);
  }
})

// Check if account balance can be updated this month
app.get('/api/accounts/:id/can-update', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const accountId = parseInt(c.req.param('id'));
    const { DB } = c.env;

    // Get current date info
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const currentDay = now.getDate();
    
    // Calculate next month/year
    let targetMonth = currentMonth;
    let targetYear = currentYear;
    
    // Check if we're in the last 5 days of the month (allowing for last trading day flexibility)
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const isLastWeekOfMonth = currentDay >= (daysInMonth - 5);
    
    // If in last week of month, allow updating for next month
    if (isLastWeekOfMonth) {
      targetMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      targetYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    }

    // Check if account exists and belongs to user
    const account = await DB.prepare(`
      SELECT id FROM accounts WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).first();

    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Check if balance was already updated for current month
    const currentMonthHistory = await DB.prepare(`
      SELECT id, created_at FROM account_balance_history
      WHERE account_id = ? AND month = ? AND year = ?
    `).bind(accountId, currentMonth, currentYear).first() as any;

    // Check if balance was already updated for target month (if different)
    let targetMonthHistory = null;
    if (targetMonth !== currentMonth || targetYear !== currentYear) {
      targetMonthHistory = await DB.prepare(`
        SELECT id, created_at FROM account_balance_history
        WHERE account_id = ? AND month = ? AND year = ?
      `).bind(accountId, targetMonth, targetYear).first() as any;
    }

    // If current month already updated
    if (currentMonthHistory && !isLastWeekOfMonth) {
      return c.json({
        canUpdate: false,
        month: currentMonth,
        year: currentYear,
        lastUpdate: currentMonthHistory.created_at,
        message: 'Balance already updated this month'
      });
    }

    // If in last week of month
    if (isLastWeekOfMonth) {
      // Allow update for next month if not already done
      if (targetMonthHistory) {
        return c.json({
          canUpdate: false,
          month: targetMonth,
          year: targetYear,
          lastUpdate: targetMonthHistory.created_at,
          message: `Balance already updated for ${targetMonth}/${targetYear}`
        });
      }
      
      // Can update for next month
      return c.json({
        canUpdate: true,
        month: targetMonth,
        year: targetYear,
        isNextMonth: true,
        message: `Can update balance for next month (${targetMonth}/${targetYear}) - Last week of current month`
      });
    }

    // Regular case - can update current month
    return c.json({
      canUpdate: true,
      month: currentMonth,
      year: currentYear,
      isNextMonth: false,
      message: 'Balance can be updated'
    });
  } catch (error: any) {
    console.error('Check update permission error:', error);
    return c.json({ error: 'Failed to check update permission' }, 500);
  }
})

// Update account balance with monthly restriction and history tracking
app.put('/api/accounts/:id/balance', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const accountId = parseInt(c.req.param('id'));
    const { DB } = c.env;
    const { balance, cash_balance } = await c.req.json();

    // Get current date info
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();
    const currentDay = now.getDate();
    
    // Calculate target month/year for the update
    let targetMonth = currentMonth;
    let targetYear = currentYear;
    
    // Check if we're in the last 5 days of the month (allowing for last trading day flexibility)
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const isLastWeekOfMonth = currentDay >= (daysInMonth - 5);
    
    // If in last week of month, allow updating for next month
    if (isLastWeekOfMonth) {
      targetMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      targetYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    }

    // Get account details
    const account = await DB.prepare(`
      SELECT id, user_id, default_currency, balance_cad, balance_usd, 
             cash_balance_cad, cash_balance_usd
      FROM accounts
      WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).first() as any;

    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Check if balance was already updated for the target month
    const existingHistory = await DB.prepare(`
      SELECT id FROM account_balance_history
      WHERE account_id = ? AND month = ? AND year = ?
    `).bind(accountId, targetMonth, targetYear).first();

    if (existingHistory) {
      return c.json({ 
        error: `Balance already updated for ${targetMonth}/${targetYear}`,
        canUpdate: false,
        month: targetMonth,
        year: targetYear
      }, 400);
    }

    // Prepare update based on currency
    let updateData: any = {};
    let historyBalance = balance;
    let historyCash = cash_balance;
    let historyCurrency = account.default_currency;

    if (account.default_currency === 'CAD') {
      updateData.balance_cad = balance;
      updateData.cash_balance_cad = cash_balance;
    } else {
      updateData.balance_usd = balance;
      updateData.cash_balance_usd = cash_balance;
    }

    // Update account balances
    await DB.prepare(`
      UPDATE accounts
      SET ${account.default_currency === 'CAD' ? 'balance_cad = ?, cash_balance_cad = ?' : 'balance_usd = ?, cash_balance_usd = ?'},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      balance,
      cash_balance,
      accountId,
      userId
    ).run();

    // Get exchange rates for history using target month/year
    const rateResponse = await fetch(`${c.req.url.split('/api')[0]}/api/exchange-rate?month=${targetMonth}&year=${targetYear}`, {
      headers: { 'Authorization': c.req.header('Authorization') || '' }
    });
    const rates = await rateResponse.json() as any;

    // Save to history with target month/year
    await DB.prepare(`
      INSERT INTO account_balance_history (
        user_id, account_id, balance, cash_balance, currency,
        month, year, exchange_rate_to_usd, exchange_rate_to_cad
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      accountId,
      historyBalance,
      historyCash,
      historyCurrency,
      targetMonth,
      targetYear,
      rates.cad_to_usd || (1 / rates.usd_to_cad),
      rates.usd_to_cad || 1.35
    ).run();

    return c.json({ 
      success: true,
      updated: true,
      month: targetMonth,
      year: targetYear,
      isNextMonth: isLastWeekOfMonth,
      historySaved: true,
      message: isLastWeekOfMonth 
        ? `Balance updated for next month (${targetMonth}/${targetYear})` 
        : `Balance updated for current month (${targetMonth}/${targetYear})`
    });
  } catch (error: any) {
    console.error('Update balance error:', error);
    return c.json({ error: 'Failed to update balance' }, 500);
  }
})

// Get exchange rate for a specific month/year
app.get('/api/exchange-rate', authMiddleware, async (c) => {
  try {
    const { DB } = c.env;
    const month = parseInt(c.req.query('month') || new Date().getMonth() + 1);
    const year = parseInt(c.req.query('year') || new Date().getFullYear());

    // Check if we have cached rate
    const cached = await DB.prepare(`
      SELECT usd_to_cad, cad_to_usd FROM exchange_rates 
      WHERE month = ? AND year = ?
    `).bind(month, year).first() as any;

    if (cached) {
      return c.json({ 
        usd_to_cad: cached.usd_to_cad, 
        cad_to_usd: cached.cad_to_usd,
        month,
        year,
        cached: true
      });
    }

    // Fetch from API (using exchangerate-api.com free tier)
    // Format date as YYYY-MM-DD (first day of month)
    const dateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    
    try {
      const response = await fetch(`https://api.exchangerate-api.com/v4/history/USD/${dateStr}`);
      const data = await response.json() as any;
      
      if (data && data.rates && data.rates.CAD) {
        const usdToCad = data.rates.CAD;
        const cadToUsd = 1 / usdToCad;
        
        // Cache the rate
        await DB.prepare(`
          INSERT INTO exchange_rates (month, year, usd_to_cad, cad_to_usd)
          VALUES (?, ?, ?, ?)
        `).bind(month, year, usdToCad, cadToUsd).run();
        
        return c.json({ 
          usd_to_cad: usdToCad, 
          cad_to_usd: cadToUsd,
          month,
          year,
          cached: false
        });
      }
    } catch (apiError) {
      console.error('Exchange rate API error:', apiError);
    }
    
    // Fallback to default rate if API fails
    const defaultRate = 1.35; // USD to CAD
    return c.json({ 
      usd_to_cad: defaultRate, 
      cad_to_usd: 1 / defaultRate,
      month,
      year,
      cached: false,
      fallback: true
    });
  } catch (error: any) {
    console.error('Get exchange rate error:', error);
    return c.json({ error: 'Failed to get exchange rate' }, 500);
  }
})

// Save monthly account balance snapshot
app.post('/api/accounts/:id/snapshot', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const accountId = parseInt(c.req.param('id'));
    const { DB } = c.env;
    
    // Parse request body, default to empty object if body is empty
    let body = {};
    try {
      body = await c.req.json();
    } catch (e) {
      // Empty body is okay, we'll use defaults
    }
    
    // Use provided month/year or default to current month/year
    const now = new Date();
    const month = (body as any).month || (now.getMonth() + 1);
    const year = (body as any).year || now.getFullYear();

    // Get current account details
    const account = await DB.prepare(`
      SELECT id, balance_cad, balance_usd, cash_balance_usd, default_currency
      FROM accounts
      WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).first() as any;

    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Get exchange rates
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    let rates = await DB.prepare(`
      SELECT usd_to_cad, cad_to_usd FROM exchange_rates 
      WHERE month = ? AND year = ?
    `).bind(currentMonth, currentYear).first() as any;
    
    if (!rates) {
      rates = { usd_to_cad: 1.35, cad_to_usd: 1 / 1.35 };
    }

    // Determine balance and currency based on default_currency
    const balance = account.default_currency === 'USD' ? account.balance_usd : account.balance_cad;
    const cashBalance = account.default_currency === 'USD' ? account.cash_balance_usd : 
                        (account.cash_balance_usd * rates.usd_to_cad);

    // Save snapshot
    const result = await DB.prepare(`
      INSERT OR REPLACE INTO account_balance_history (
        user_id, account_id, balance, cash_balance, currency,
        month, year, exchange_rate_to_usd, exchange_rate_to_cad
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      accountId,
      balance,
      cashBalance,
      account.default_currency,
      month,
      year,
      rates.cad_to_usd,
      rates.usd_to_cad
    ).run();

    return c.json({ success: true, id: result.meta.last_row_id }, 201);
  } catch (error: any) {
    console.error('Save snapshot error:', error);
    return c.json({ error: 'Failed to save balance snapshot' }, 500);
  }
})

// Get dashboard totals with currency conversion
app.get('/api/dashboard/totals', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;
    const month = parseInt(c.req.query('month') || String(new Date().getMonth() + 1));
    const year = parseInt(c.req.query('year') || String(new Date().getFullYear()));

    // Get all accounts
    const { results: accounts } = await DB.prepare(`
      SELECT id, account_name, account_type, balance_cad, balance_usd, 
             cash_balance_cad, cash_balance_usd, default_currency
      FROM accounts
      WHERE user_id = ?
    `).bind(userId).all();

    // Get exchange rate from cache (should already be cached from login)
    let rates = await DB.prepare(`
      SELECT usd_to_cad, cad_to_usd FROM exchange_rates 
      WHERE month = ? AND year = ?
    `).bind(month, year).first() as any;
    
    // If not cached, use fallback rate
    let isDefaultRate = false;
    if (!rates) {
      rates = { usd_to_cad: 1.35, cad_to_usd: 1 / 1.35 };
      isDefaultRate = true;
    }

    // Calculate totals in both currencies
    let totalCAD = 0;
    let totalUSD = 0;
    let totalCashCAD = 0;
    let totalCashUSD = 0;

    (accounts as any[]).forEach(account => {
      if (account.default_currency === 'CAD') {
        const balance = account.balance_cad || 0;
        const cash = account.cash_balance_cad || 0;
        
        totalCAD += balance;
        totalUSD += balance * rates.cad_to_usd;
        totalCashCAD += cash;
        totalCashUSD += cash * rates.cad_to_usd;
      } else {
        const balance = account.balance_usd || 0;
        const cash = account.cash_balance_usd || 0;
        
        totalUSD += balance;
        totalCAD += balance * rates.usd_to_cad;
        totalCashUSD += cash;
        totalCashCAD += cash * rates.usd_to_cad;
      }
    });

    return c.json({
      total_cad: totalCAD,
      total_usd: totalUSD,
      total_cash_cad: totalCashCAD,
      total_cash_usd: totalCashUSD,
      exchange_rate: {
        usd_to_cad: rates.usd_to_cad,
        cad_to_usd: rates.cad_to_usd,
        month,
        year,
        is_default: isDefaultRate,
        source: isDefaultRate ? 'Default Rate' : 'Bank of Canada'
      }
    });
  } catch (error: any) {
    console.error('Get dashboard totals error:', error);
    return c.json({ error: 'Failed to get dashboard totals' }, 500);
  }
})

// Get YTD performance for all accounts
app.get('/api/dashboard/ytd-performance', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // Get all accounts
    const { results: accounts } = await DB.prepare(`
      SELECT id, account_name, account_type, balance_cad, balance_usd, 
             cash_balance_cad, cash_balance_usd, default_currency
      FROM accounts
      WHERE user_id = ?
    `).bind(userId).all();
    
    console.log('YTD Performance - User ID:', userId, 'Accounts found:', accounts?.length || 0);

    // Get exchange rate
    let rates = await DB.prepare(`
      SELECT usd_to_cad, cad_to_usd FROM exchange_rates 
      WHERE month = ? AND year = ?
    `).bind(currentMonth, currentYear).first() as any;
    
    if (!rates) {
      rates = { usd_to_cad: 1.35, cad_to_usd: 1 / 1.35 };
    }

    const accountPerformance = [];
    let totalYTDPL = 0;
    let totalCurrentValue = 0;

    for (const account of accounts as any[]) {
      // Get YTD P/L from closed stock positions (using stock_holdings + stock_transactions)
      const stockPositions = await DB.prepare(`
        SELECT sh.id as holding_id, sh.closed_date
        FROM stock_holdings sh
        WHERE sh.user_id = ? 
        AND sh.account_id = ?
        AND sh.is_open = 0
        AND sh.closed_date IS NOT NULL
        AND sh.closed_date LIKE ?
      `).bind(userId, account.id, `${currentYear}%`).all()
      
      // Calculate P/L for each closed stock position
      let stockPLTotal = 0
      for (const holding of stockPositions.results as any[]) {
        const transactions = await DB.prepare(`
          SELECT transaction_type, shares, price_per_share, commission
          FROM stock_transactions
          WHERE holding_id = ?
        `).bind(holding.holding_id).all()
        
        let totalBuyValue = 0
        let totalBuyCommissions = 0
        let totalSellValue = 0
        let totalSellCommissions = 0
        
        transactions.results.forEach((tx: any) => {
          if (tx.transaction_type === 'BUY') {
            totalBuyValue += tx.shares * tx.price_per_share
            totalBuyCommissions += tx.commission || 0
          } else if (tx.transaction_type === 'SELL') {
            totalSellValue += tx.shares * tx.price_per_share
            totalSellCommissions += tx.commission || 0
          }
        })
        
        // P/L = Sale Proceeds - Cost Basis - All Commissions
        stockPLTotal += totalSellValue - totalBuyValue - totalBuyCommissions - totalSellCommissions
      }

      // Get YTD P/L from closed option trades
      const optionPL = await DB.prepare(`
        SELECT COALESCE(SUM(profit_loss), 0) as total_pl
        FROM option_trades
        WHERE user_id = ?
        AND account_type = ?
        AND is_open = 0
        AND close_date LIKE ?
      `).bind(userId, account.account_type, `${currentYear}%`).first() as any;

      // Get YTD P/L from closed daily trades (0DTE)
      const dailyPL = await DB.prepare(`
        SELECT COALESCE(SUM(profit_loss), 0) as total_pl
        FROM daily_trades
        WHERE user_id = ?
        AND account_id = ?
        AND is_open = 0
        AND strftime('%Y', trade_date) = ?
      `).bind(userId, account.id, currentYear.toString()).first() as any;

      // Get YTD dividends for this account
      // Join with stock_holdings to get the account_id for each dividend
      const dividends = await DB.prepare(`
        SELECT COALESCE(SUM(cba.amount), 0) as total_dividends
        FROM cost_basis_adjustments cba
        INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
        INNER JOIN accounts a ON sh.account_id = a.id
        WHERE cba.user_id = ?
        AND a.account_type = ?
        AND cba.adjustment_type = 'DIVIDEND'
        AND cba.adjustment_date LIKE ?
      `).bind(userId, account.account_type, `${currentYear}%`).first() as any;

      console.log(`YTD Performance for ${account.account_name}:`, {
        stockPL: stockPLTotal,
        optionPL: optionPL?.total_pl || 0,
        dailyPL: dailyPL?.total_pl || 0,
        dividends: dividends?.total_dividends || 0,
        account_id: account.id,
        currentYear
      });

      const ytdPL = stockPLTotal + (optionPL?.total_pl || 0) + (dailyPL?.total_pl || 0) + (dividends?.total_dividends || 0);
      const currentValue = account.default_currency === 'CAD' 
        ? (account.balance_cad || 0) 
        : (account.balance_usd || 0);

      // Calculate YTD RORC (Return on Risk Capital)
      const ytdRORC = currentValue > 0 ? (ytdPL / currentValue) * 100 : 0;

      // Calculate ARORC (Annualized RORC)
      const arorc = currentMonth > 0 ? (ytdRORC * 12) / currentMonth : 0;

      accountPerformance.push({
        account_name: account.account_name,
        account_type: account.account_type,
        currency: account.default_currency,
        current_value: currentValue,
        ytd_pl: ytdPL,
        ytd_rorc: ytdRORC,
        arorc: arorc
      });

      // Convert to common currency for totals (USD)
      const valueInUSD = account.default_currency === 'CAD' 
        ? currentValue * rates.cad_to_usd 
        : currentValue;
      const plInUSD = account.default_currency === 'CAD' 
        ? ytdPL * rates.cad_to_usd 
        : ytdPL;

      totalCurrentValue += valueInUSD;
      totalYTDPL += plInUSD;
    }

    // Calculate portfolio-wide metrics
    const totalYTDRORC = totalCurrentValue > 0 ? (totalYTDPL / totalCurrentValue) * 100 : 0;
    const totalARORC = currentMonth > 0 ? (totalYTDRORC * 12) / currentMonth : 0;

    return c.json({
      accounts: accountPerformance,
      totals: {
        current_value: totalCurrentValue,
        ytd_pl: totalYTDPL,
        ytd_rorc: totalYTDRORC,
        arorc: totalARORC
      }
    });
  } catch (error: any) {
    console.error('Get YTD performance error:', error);
    return c.json({ error: 'Failed to get YTD performance' }, 500);
  }
})

// Get dashboard with currency conversion
app.get('/api/dashboard', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;
    const month = parseInt(c.req.query('month') || new Date().getMonth() + 1);
    const year = parseInt(c.req.query('year') || new Date().getFullYear());

    // Get all accounts
    const { results: accounts } = await DB.prepare(`
      SELECT id, account_name, account_type, balance_cad, balance_usd, 
             cash_balance_usd, default_currency
      FROM accounts
      WHERE user_id = ?
    `).bind(userId).all();

    // Get exchange rate from cache (should already be cached from login)
    let rates = await DB.prepare(`
      SELECT usd_to_cad, cad_to_usd FROM exchange_rates 
      WHERE month = ? AND year = ?
    `).bind(month, year).first() as any;
    
    // If not cached, use fallback rate
    if (!rates) {
      rates = { usd_to_cad: 1.35, cad_to_usd: 1 / 1.35 };
    }

    // Calculate totals in both currencies
    let totalCAD = 0;
    let totalUSD = 0;

    (accounts as any[]).forEach(account => {
      if (account.default_currency === 'CAD') {
        totalCAD += account.balance_cad || 0;
        totalUSD += (account.balance_cad || 0) * rates.cad_to_usd;
      } else {
        totalUSD += account.balance_usd || 0;
        totalCAD += (account.balance_usd || 0) * rates.usd_to_cad;
      }
    });

    // Get recent trades count
    const tradesCount = await DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM stock_trades WHERE user_id = ?) as stock_count,
        (SELECT COUNT(*) FROM option_trades WHERE user_id = ?) as option_count
    `).bind(userId, userId).first() as any;

    return c.json({
      total_balance_cad: totalCAD,
      total_balance_usd: totalUSD,
      exchange_rate: rates,
      accounts_count: accounts.length,
      stock_trades_count: tradesCount?.stock_count || 0,
      option_trades_count: tradesCount?.option_count || 0,
      accounts: accounts
    });
  } catch (error: any) {
    console.error('Get dashboard error:', error);
    return c.json({ error: 'Failed to fetch dashboard' }, 500);
  }
})

// ============================================================================
// STOCK TRADES ROUTES
// ============================================================================

app.get('/api/stocks', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const isOpen = c.req.query('open')
  const isClosed = c.req.query('closed')
  const { DB } = c.env
  
  let query = `
    SELECT 
      sh.*,
      a.account_name,
      a.account_type,
      c.ticker as company_ticker,
      c.company_name,
      (SELECT COALESCE(SUM(amount), 0) 
       FROM cost_basis_adjustments cba
       WHERE cba.holding_id = sh.id AND adjustment_type IN ('DIVIDEND', 'COVERED_CALL', 'SELLING_PUT')) as total_adjustments,
      (SELECT MIN(expiration_date)
       FROM option_trades
       WHERE user_id = sh.user_id 
         AND ticker = sh.ticker 
         AND account_id = sh.account_id
         AND strategy_type = 'COVERED_CALL' 
         AND is_open = 1) as nearest_cc_expiration
    FROM stock_holdings sh
    LEFT JOIN accounts a ON sh.account_id = a.id
    LEFT JOIN companies c ON sh.company_id = c.id
    WHERE sh.user_id = ?
  `
  let params = [userId]
  
  if (isOpen !== undefined) {
    query += ' AND sh.is_open = ?'
    params.push(isOpen === 'true' ? 1 : 0)
  } else if (isClosed !== undefined) {
    query += ' AND sh.is_open = ?'
    params.push(isClosed === 'true' ? 0 : 1)
  }
  
  query += ' ORDER BY sh.opened_date DESC'
  
  const stmt = DB.prepare(query)
  const stocks = await stmt.bind(...params).all()
  
  // Calculate avg price, cost basis, P/L, and covered call status for each holding
  const enhancedStocks = await Promise.all(stocks.results.map(async (stock: any) => {
    const avgPrice = stock.average_price
    const costBasis = avgPrice - (stock.total_adjustments / stock.total_shares || 0)
    
    // Calculate P/L for closed positions
    let profitLoss = null
    if (stock.is_open === 0) {
      // Get all transactions for this holding
      const transactions = await DB.prepare(`
        SELECT transaction_type, shares, price_per_share, commission
        FROM stock_transactions
        WHERE holding_id = ?
        ORDER BY transaction_date ASC
      `).bind(stock.id).all()
      
      let totalBuyValue = 0
      let totalBuyCommissions = 0
      let totalSellValue = 0
      let totalSellCommissions = 0
      
      transactions.results.forEach((tx: any) => {
        if (tx.transaction_type === 'BUY') {
          totalBuyValue += tx.shares * tx.price_per_share
          totalBuyCommissions += tx.commission || 0
        } else if (tx.transaction_type === 'SELL') {
          totalSellValue += tx.shares * tx.price_per_share
          totalSellCommissions += tx.commission || 0
        }
      })
      
      // P/L = Sale Proceeds - Cost Basis - All Commissions
      profitLoss = totalSellValue - totalBuyValue - totalBuyCommissions - totalSellCommissions
    }
    
    // Calculate days until covered call expiration
    let ccStatus = null
    let daysUntilExpiration = null
    
    if (stock.nearest_cc_expiration) {
      const expDate = new Date(stock.nearest_cc_expiration)
      const today = new Date()
      daysUntilExpiration = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysUntilExpiration <= 14) {
        ccStatus = 'urgent' // Red - expires within 14 days
      } else {
        ccStatus = 'active' // Orange - expires beyond 14 days
      }
    }
    
    // Check for missing dividends using the same logic as the missing-dividends endpoint
    let hasMissingDividends = false
    let missingDividendCount = 0
    
    if (stock.is_open === 1) {
      // Get date range
      const startDate = stock.opened_date
      const endDate = new Date().toISOString().split('T')[0]
      
      // Get repository dividends for this ticker in date range
      const repoDivs = await DB.prepare(`
        SELECT id, ex_date, pay_date, amount FROM dividend_repository
        WHERE ticker = ? AND ex_date >= ? AND ex_date <= ? AND status = 'active'
      `).bind(stock.ticker, startDate, endDate).all()
      
      if (repoDivs.results && repoDivs.results.length > 0) {
        // Get recorded dividends
        const recordedDivs = await DB.prepare(`
          SELECT amount, adjustment_date, notes FROM cost_basis_adjustments
          WHERE holding_id = ? AND adjustment_type = 'DIVIDEND'
        `).bind(stock.id).all()
        
        // Get transactions to calculate shares
        const txns = await DB.prepare(`
          SELECT transaction_date, transaction_type, shares
          FROM stock_transactions
          WHERE holding_id = ?
          ORDER BY transaction_date ASC
        `).bind(stock.id).all()
        
        const getSharesOnDate = (targetDate: string) => {
          // If no transactions exist, use total_shares from stock_holdings as fallback
          if (!txns.results || txns.results.length === 0) {
            // Use total_shares for all dates >= opened_date
            if (targetDate >= stock.opened_date) {
              return stock.total_shares || 0
            }
            return 0
          }
          
          // Calculate shares from transactions
          let shares = 0
          for (const tx of (txns.results || [])) {
            const t = tx as any
            if (t.transaction_date <= targetDate) {
              shares += t.transaction_type === 'BUY' ? t.shares : -t.shares
            }
          }
          return shares
        }
        
        const datesWithinDays = (d1: string, d2: string, days: number) => {
          const diff = Math.abs(new Date(d1).getTime() - new Date(d2).getTime())
          return Math.ceil(diff / (1000 * 60 * 60 * 24)) <= days
        }
        
        const isDivRecorded = (repoDiv: any, sharesHeld: number) => {
          for (const rec of (recordedDivs.results || [])) {
            const r = rec as any
            
            // Match 1: Exact ex_date from notes
            const exMatch = r.notes?.match(/Ex-date: (\d{4}-\d{2}-\d{2})/)
            if (exMatch && exMatch[1] === repoDiv.ex_date) return true
            
            // Match 2: Exact pay_date match (user entered accurate dividend)
            // Don't require amount match since user may have entered actual amount
            if (repoDiv.pay_date && r.adjustment_date === repoDiv.pay_date) {
              return true
            }
            
            // Match 3: Amount + date proximity
            let perShareRec = r.amount / sharesHeld
            const accountType = stock.account_type || 'RRSP'
            if (accountType === 'Cash' || accountType === 'TFSA') {
              perShareRec = perShareRec / 0.8
            }
            const perShareRepo = repoDiv.amount
            const amtMatch = Math.abs(perShareRec - perShareRepo) < 0.0001
            
            // Check if adjustment_date is within 3 days of pay_date OR ex_date
            let dateMatch = false
            if (repoDiv.pay_date) {
              dateMatch = datesWithinDays(r.adjustment_date, repoDiv.pay_date, 3)
            }
            if (!dateMatch) {
              dateMatch = datesWithinDays(r.adjustment_date, repoDiv.ex_date, 3)
            }
            
            if (amtMatch && dateMatch) return true
          }
          return false
        }
        
        // Count missing dividends
        for (const div of repoDivs.results) {
          const d = div as any
          const sharesHeld = getSharesOnDate(d.ex_date)
          if (sharesHeld > 0 && !isDivRecorded(d, sharesHeld)) {
            missingDividendCount++
          }
        }
        
        hasMissingDividends = missingDividendCount > 0
      }
    }
    
    return {
      ...stock,
      // Map new field names to old field names for backwards compatibility
      price: avgPrice,
      quantity: stock.total_shares,
      trade_date: stock.opened_date,
      avg_price: avgPrice,
      cost_basis: costBasis,
      profit_loss: profitLoss,
      cc_status: ccStatus,
      cc_expiration: stock.nearest_cc_expiration,
      days_until_cc_expiration: daysUntilExpiration,
      has_missing_dividends: hasMissingDividends,
      missing_dividend_count: missingDividendCount
    }
  }))
  
  return c.json(enhancedStocks)
})

// Get single stock holding with transaction details
app.get('/api/stocks/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Get holding details
    const holding = await DB.prepare(`
      SELECT 
        sh.*,
        a.account_name,
        a.account_type,
        c.ticker as company_ticker,
        c.company_name
      FROM stock_holdings sh
      LEFT JOIN accounts a ON sh.account_id = a.id
      LEFT JOIN companies c ON sh.company_id = c.id
      WHERE sh.id = ? AND sh.user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Stock holding not found' }, 404)
    }
    
    // Get all transactions for this holding
    const transactions = await DB.prepare(`
      SELECT * FROM stock_transactions
      WHERE holding_id = ?
      ORDER BY transaction_date ASC
    `).bind(holdingId).all()
    
    // Calculate P/L for closed positions
    let profitLoss = null
    let closePrice = null
    let closeCommission = null
    let closeDate = null
    
    if (holding.is_open === 0) {
      let totalBuyValue = 0
      let totalBuyCommissions = 0
      let totalSellValue = 0
      let totalSellCommissions = 0
      let totalSellShares = 0
      
      transactions.results.forEach((tx: any) => {
        if (tx.transaction_type === 'BUY') {
          totalBuyValue += tx.shares * tx.price_per_share
          totalBuyCommissions += tx.commission || 0
        } else if (tx.transaction_type === 'SELL') {
          totalSellValue += tx.shares * tx.price_per_share
          totalSellCommissions += tx.commission || 0
          totalSellShares += tx.shares
          // Use the last SELL transaction for close details
          closePrice = tx.price_per_share
          closeCommission = tx.commission || 0
          closeDate = tx.transaction_date
        }
      })
      
      profitLoss = totalSellValue - totalBuyValue - totalBuyCommissions - totalSellCommissions
    }
    
    // Get the first transaction to determine trade_type
    const firstTransaction = transactions.results[0] as any
    const tradeType = firstTransaction?.transaction_type || 'BUY'
    
    // Return holding with transaction details mapped to old field names
    return c.json({
      ...holding,
      // Map new field names to old field names for backwards compatibility
      id: holding.id,
      price: holding.average_price,
      quantity: holding.total_shares,
      trade_date: holding.opened_date,
      trade_type: tradeType,
      commission: firstTransaction?.commission || 0,
      avg_price: holding.average_price,
      profit_loss: profitLoss,
      close_date: closeDate,
      close_price: closePrice,
      close_commission: closeCommission,
      closed_date: holding.closed_date,
      transactions: transactions.results
    })
  } catch (error) {
    console.error('Get stock error:', error)
    return c.json({ error: 'Failed to fetch stock' }, 500)
  }
})

app.post('/api/stocks', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Validation
    if (!data.company_id) {
      return c.json({ error: 'Company is required' }, 400)
    }
    
    if (!data.account_id) {
      return c.json({ error: 'Account is required' }, 400)
    }
    
    if (!data.ticker || !data.trade_type || !data.quantity || !data.price || !data.trade_date) {
      return c.json({ error: 'Missing required fields' }, 400)
    }
    
    // Verify company belongs to user
    const company = await DB.prepare(`
      SELECT id FROM companies WHERE id = ? AND user_id = ?
    `).bind(data.company_id, userId).first()
    
    if (!company) {
      return c.json({ error: 'Company not found' }, 404)
    }
    
    // Verify account belongs to user and get account_type
    const account = await DB.prepare(`
      SELECT id, account_type FROM accounts WHERE id = ? AND user_id = ?
    `).bind(data.account_id, userId).first()
    
    if (!account) {
      return c.json({ error: 'Account not found' }, 404)
    }
    
    // Check if holding exists for this ticker + account
    const holding = await DB.prepare(`
      SELECT * FROM stock_holdings 
      WHERE user_id = ? AND ticker = ? AND account_id = ? AND is_open = 1
    `).bind(userId, data.ticker, data.account_id).first()
    
    let holdingId
    const quantity = parseInt(data.quantity)
    const price = parseFloat(data.price)
    const commission = parseFloat(data.commission || 0)
    
    if (holding) {
      // Update existing holding
      holdingId = holding.id
      const currentShares = holding.total_shares
      const currentAvg = holding.average_price
      
      if (data.trade_type === 'BUY') {
        // Add to position - recalculate weighted average
        const newTotalShares = currentShares + quantity
        const newAvgPrice = ((currentShares * currentAvg) + (quantity * price)) / newTotalShares
        
        await DB.prepare(`
          UPDATE stock_holdings 
          SET total_shares = ?, average_price = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(newTotalShares, newAvgPrice, holdingId).run()
      } else if (data.trade_type === 'SELL') {
        // Remove from position - keep same average price
        const newTotalShares = currentShares - quantity
        
        if (newTotalShares < 0) {
          return c.json({ error: 'Cannot sell more shares than you own' }, 400)
        }
        
        if (newTotalShares === 0) {
          // Close the holding
          await DB.prepare(`
            UPDATE stock_holdings 
            SET total_shares = 0, is_open = 0, closed_date = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(data.trade_date, holdingId).run()
        } else {
          // Reduce shares
          await DB.prepare(`
            UPDATE stock_holdings 
            SET total_shares = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(newTotalShares, holdingId).run()
        }
      }
    } else {
      // Create new holding (first purchase)
      if (data.trade_type !== 'BUY') {
        return c.json({ error: 'Cannot sell without an open position' }, 400)
      }
      
      const result = await DB.prepare(`
        INSERT INTO stock_holdings (
          user_id, company_id, ticker, account_id, total_shares, average_price, is_open, opened_date, strategy_type
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).bind(
        userId,
        data.company_id,
        data.ticker,
        data.account_id,
        quantity,
        price,
        data.trade_date,
        data.strategy_type || 'STOCKPILING'
      ).run()
      
      holdingId = result.meta.last_row_id
    }
    
    // Create transaction record
    const txResult = await DB.prepare(`
      INSERT INTO stock_transactions (
        user_id, holding_id, transaction_type, shares, price_per_share, 
        transaction_date, commission, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      holdingId,
      data.trade_type,
      quantity,
      price,
      data.trade_date,
      commission,
      data.notes || null
    ).run()
    
    return c.json({ 
      id: holdingId,
      transaction_id: txResult.meta.last_row_id,
      ...data,
      is_open: true
    }, 201)
  } catch (error) {
    console.error('Create stock trade error:', error)
    return c.json({ error: 'Failed to create stock trade' }, 500)
  }
})

// DEPRECATED: This endpoint is deprecated. Use POST /api/stocks for new transactions
// and PUT /api/stocks/:id/close for closing positions.
// This endpoint is kept for backward compatibility with legacy stock_trades table data.
app.put('/api/stocks/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // First check if this is a stock_holdings record (new system)
    const holding = await DB.prepare(`
      SELECT * FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()
    
    if (holding) {
      // Update stock_holdings record - allow updating strategy_type
      if (data.strategy_type) {
        await DB.prepare(`
          UPDATE stock_holdings 
          SET strategy_type = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?
        `).bind(data.strategy_type, tradeId, userId).run()
      }
      
      return c.json({ success: true })
    }
    
    // If not found in stock_holdings, try legacy stock_trades table
    const trade = await DB.prepare(`
      SELECT id FROM stock_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()
    
    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    // Verify company belongs to user
    if (data.company_id) {
      const company = await DB.prepare(`
        SELECT id FROM companies WHERE id = ? AND user_id = ?
      `).bind(data.company_id, userId).first()
      
      if (!company) {
        return c.json({ error: 'Company not found' }, 404)
      }
    }
    
    // Verify account belongs to user
    if (data.account_id) {
      const account = await DB.prepare(`
        SELECT id FROM accounts WHERE id = ? AND user_id = ?
      `).bind(data.account_id, userId).first()
      
      if (!account) {
        return c.json({ error: 'Account not found' }, 404)
      }
    }
    
    await DB.prepare(`
      UPDATE stock_trades SET
        company_id = ?,
        ticker = ?,
        trade_type = ?,
        quantity = ?,
        price = ?,
        account_id = ?,
        trade_date = ?,
        commission = ?,
        close_date = ?,
        close_price = ?,
        close_commission = ?,
        notes = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      data.company_id,
      data.ticker,
      data.trade_type,
      data.quantity,
      data.price,
      data.account_id,
      data.trade_date,
      data.commission || 0,
      data.close_date || null,
      data.close_price || null,
      data.close_commission || null,
      data.notes || null,
      tradeId,
      userId
    ).run()
    
    // Recalculate profit_loss and is_open if close fields are provided
    if (data.close_date && data.close_price !== null && data.close_price !== undefined) {
      const openCommission = data.commission || 0
      const closeCommission = data.close_commission || 0
      const totalShares = data.quantity
      const openPrice = data.price
      const closePrice = data.close_price
      
      // Calculate P/L: (Close Price - Open Price) * Shares - Commissions
      const profitLoss = (closePrice - openPrice) * totalShares - openCommission - closeCommission
      
      await DB.prepare(`
        UPDATE stock_trades SET
          profit_loss = ?,
          is_open = 0
        WHERE id = ? AND user_id = ?
      `).bind(profitLoss, tradeId, userId).run()
    } else if (!data.close_date) {
      // If close_date is removed, mark as open
      await DB.prepare(`
        UPDATE stock_trades SET
          profit_loss = NULL,
          is_open = 1
        WHERE id = ? AND user_id = ?
      `).bind(tradeId, userId).run()
      await DB.prepare(`
        UPDATE stock_trades SET
          profit_loss = NULL,
          is_open = 1
        WHERE id = ? AND user_id = ?
      `).bind(tradeId, userId).run()
    }
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Update stock trade error:', error)
    return c.json({ error: 'Failed to update stock trade' }, 500)
  }
})

app.put('/api/stocks/:id/close', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Verify holding belongs to user and is open
    const holding = await DB.prepare(`
      SELECT * FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Stock holding not found' }, 404)
    }
    
    if (holding.is_open === 0) {
      return c.json({ error: 'Position is already closed' }, 400)
    }
    
    // Create a SELL transaction for the full position
    const sellTransaction = await DB.prepare(`
      INSERT INTO stock_transactions 
        (user_id, holding_id, transaction_type, shares, price_per_share, transaction_date, commission, notes)
      VALUES (?, ?, 'SELL', ?, ?, ?, ?, ?)
    `).bind(
      userId,
      holdingId,
      holding.total_shares,
      data.close_price,
      data.close_date,
      data.commission || 0,
      'Position closed'
    ).run()
    
    // Calculate P/L
    const saleProceeds = data.close_price * holding.total_shares
    const costBasis = holding.average_price * holding.total_shares
    
    // Get total opening commissions from all BUY transactions
    const buyCommissionsResult = await DB.prepare(`
      SELECT COALESCE(SUM(commission), 0) as total_buy_commissions
      FROM stock_transactions
      WHERE holding_id = ? AND transaction_type = 'BUY'
    `).bind(holdingId).first()
    
    const openingCommissions = buyCommissionsResult?.total_buy_commissions || 0
    const closingCommission = data.commission || 0
    const profitLoss = saleProceeds - costBasis - openingCommissions - closingCommission
    
    // Close the holding
    await DB.prepare(`
      UPDATE stock_holdings SET
        is_open = 0,
        closed_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      data.close_date,
      holdingId,
      userId
    ).run()
    
    return c.json({ 
      success: true, 
      message: 'Position closed successfully', 
      profit_loss: profitLoss,
      sale_proceeds: saleProceeds,
      cost_basis: costBasis,
      total_commissions: openingCommissions + closingCommission
    })
  } catch (error) {
    console.error('Close stock position error:', error)
    return c.json({ error: 'Failed to close stock position' }, 500)
  }
})

app.put('/api/stocks/:id/reopen', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT * FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    if (holding.is_open === 1) {
      return c.json({ error: 'Position is already open' }, 400)
    }
    
    // Delete the SELL transaction that closed this position
    await DB.prepare(`
      DELETE FROM stock_transactions
      WHERE holding_id = ? AND transaction_type = 'SELL' AND notes = 'Position closed'
    `).bind(holdingId).run()
    
    // Re-open the holding
    await DB.prepare(`
      UPDATE stock_holdings SET
        is_open = 1,
        closed_date = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).run()
    
    return c.json({ success: true, message: 'Position re-opened successfully' })
  } catch (error) {
    console.error('Re-open stock holding error:', error)
    return c.json({ error: 'Failed to re-open stock position' }, 500)
  }
})

app.delete('/api/stocks/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Delete all transactions for this holding (CASCADE will handle this in DB)
    // But we'll do it explicitly for clarity
    await DB.prepare(`
      DELETE FROM stock_transactions WHERE holding_id = ?
    `).bind(holdingId).run()
    
    // Delete any cost basis adjustments
    await DB.prepare(`
      DELETE FROM cost_basis_adjustments WHERE holding_id = ?
    `).bind(holdingId).run()
    
    // Delete the holding itself
    await DB.prepare(`
      DELETE FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Delete stock holding error:', error)
    return c.json({ error: 'Failed to delete stock holding' }, 500)
  }
})

// Get cost basis adjustments for a stock holding
app.get('/api/stocks/:id/cost-basis-adjustments', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Get all cost basis adjustments
    const adjustments = await DB.prepare(`
      SELECT * FROM cost_basis_adjustments
      WHERE holding_id = ?
      ORDER BY adjustment_date DESC
    `).bind(holdingId).all()
    
    return c.json(adjustments.results || [])
  } catch (error) {
    console.error('Get cost basis adjustments error:', error)
    return c.json({ error: 'Failed to fetch cost basis adjustments' }, 500)
  }
})

// Get assignment history (short puts that created this stock position)
app.get('/api/stocks/:id/assignment-history', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT id, ticker, company_id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first() as any
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Find option trades that were assigned to create stock for this holding
    // These are Short Put options that:
    // 1. Match the company_id
    // 2. Are closed (is_open = 0)
    // 3. Have close_price = 0 (indicating assignment)
    // 4. Have notes containing "ASSIGNED"
    const assignments = await DB.prepare(`
      SELECT 
        ot.*,
        cba.amount as premium_adjustment,
        cba.adjustment_date
      FROM option_trades ot
      LEFT JOIN cost_basis_adjustments cba 
        ON cba.holding_id = ? 
        AND cba.adjustment_type = 'SELLING_PUT'
        AND cba.notes LIKE '%' || ot.quantity || ' contract%'
      WHERE ot.user_id = ?
        AND ot.company_id = ?
        AND ot.is_open = 0
        AND ot.close_price = 0
        AND (ot.strategy_type = 'SELLING_PUT' OR ot.strategy_type = 'SELLING_PUT_WHEEL')
        AND (ot.notes LIKE '%ASSIGNED%' OR ot.notes LIKE '%assigned%')
      ORDER BY ot.close_date DESC
    `).bind(holdingId, userId, holding.company_id).all()
    
    return c.json(assignments.results || [])
  } catch (error) {
    console.error('Get assignment history error:', error)
    return c.json({ error: 'Failed to fetch assignment history' }, 500)
  }
})

// ============================================================================
// STOCK TRADE - DIVIDENDS & COVERED CALLS
// ============================================================================

// Get dividend history for a stock trade
app.get('/api/stocks/:id/dividends', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Get dividend adjustments
    const dividends = await DB.prepare(`
      SELECT * FROM cost_basis_adjustments
      WHERE holding_id = ? AND adjustment_type = 'DIVIDEND'
      ORDER BY adjustment_date DESC
    `).bind(holdingId).all()
    
    return c.json(dividends.results || [])
  } catch (error) {
    console.error('Get dividends error:', error)
    return c.json({ error: 'Failed to fetch dividends' }, 500)
  }
})

// Get missing dividends from dividend repository
app.get('/api/stocks/:id/missing-dividends', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Get holding details including ticker, account, opened/closed dates, and total_shares
    const holding = await DB.prepare(`
      SELECT 
        sh.id, sh.user_id, sh.opened_date, sh.closed_date,
        sh.ticker, sh.total_shares, a.account_type
      FROM stock_holdings sh
      JOIN accounts a ON sh.account_id = a.id
      WHERE sh.id = ? AND sh.user_id = ?
    `).bind(holdingId, userId).first() as any
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    console.log('[DEBUG] Missing dividends request:', {
      holdingId,
      ticker: holding.ticker,
      accountType: holding.account_type,
      openedDate: holding.opened_date,
      closedDate: holding.closed_date
    })
    
    // Determine date range for dividend matching
    const startDate = holding.opened_date
    const endDate = holding.closed_date || new Date().toISOString().split('T')[0]
    
    console.log('[DEBUG] Date range for dividends:', { startDate, endDate })
    
    // Get all dividends from repository for this ticker in date range
    const repositoryDividends = await DB.prepare(`
      SELECT * FROM dividend_repository
      WHERE ticker = ? 
        AND ex_date >= ? 
        AND ex_date <= ?
        AND status = 'active'
      ORDER BY ex_date DESC
    `).bind(holding.ticker, startDate, endDate).all()
    
    console.log('[DEBUG] Repository dividends found:', repositoryDividends.results?.length || 0)
    
    // Get already recorded dividends with amount and date for smarter matching
    const recordedDividends = await DB.prepare(`
      SELECT amount, adjustment_date, notes FROM cost_basis_adjustments
      WHERE holding_id = ? AND adjustment_type = 'DIVIDEND'
    `).bind(holdingId).all()
    
    console.log('[DEBUG] Already recorded dividends:', recordedDividends.results?.length || 0)
    
    // Helper function to check if dates are within N days of each other
    const datesWithinDays = (date1: string, date2: string, days: number): boolean => {
      const d1 = new Date(date1)
      const d2 = new Date(date2)
      const diffTime = Math.abs(d2.getTime() - d1.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      return diffDays <= days
    }
    
    // Helper function to check if a dividend is already recorded
    const isDividendRecorded = (repoDiv: any, sharesHeld: number): boolean => {
      // Calculate what the total amount would be (with withholding if applicable)
      let expectedAmount = repoDiv.amount * sharesHeld
      if (holding.account_type === 'Cash' || holding.account_type === 'TFSA') {
        expectedAmount = expectedAmount * 0.8 // Apply 20% withholding
      }
      
      for (const recorded of (recordedDividends.results || [])) {
        const rec = recorded as any
        
        // Extract ex_date from notes
        const exDateMatch = rec.notes?.match(/Ex-date: (\d{4}-\d{2}-\d{2})/)
        const recordedExDate = exDateMatch ? exDateMatch[1] : null
        
        // Match 1: Exact ex_date match from notes
        if (recordedExDate && recordedExDate === repoDiv.ex_date) {
          console.log('[DEBUG] Match via exact ex_date:', repoDiv.ex_date)
          return true
        }
        
        // Match 2: Exact pay_date match (user entered accurate dividend)
        // Don't require amount match since user may have entered actual amount
        // vs our estimated withholding calculation
        if (repoDiv.pay_date && rec.adjustment_date === repoDiv.pay_date) {
          console.log('[DEBUG] Match via exact pay_date:', {
            adjustmentDate: rec.adjustment_date,
            payDate: repoDiv.pay_date,
            note: 'Ignoring amount mismatch - user may have accurate amount'
          })
          return true
        }
        
        // Match 3: Per-share amount match + date proximity
        // Need to reverse withholding tax to get original per-share amount
        let perShareRecorded = rec.amount / sharesHeld
        if (holding.account_type === 'Cash' || holding.account_type === 'TFSA') {
          perShareRecorded = perShareRecorded / 0.8 // Reverse the 20% withholding
        }
        const perShareRepo = repoDiv.amount
        
        // Check if per-share amounts are very close (within 0.0001)
        const amountMatch = Math.abs(perShareRecorded - perShareRepo) < 0.0001
        
        // Check if adjustment_date is close to pay_date OR ex_date (within 3 days)
        let dateMatch = false
        
        // Check against pay_date if it exists (within 3 days, not exact)
        if (repoDiv.pay_date) {
          dateMatch = datesWithinDays(rec.adjustment_date, repoDiv.pay_date, 3)
          if (dateMatch) {
            console.log('[DEBUG] Date match via pay_date (within 3 days):', {
              adjustmentDate: rec.adjustment_date,
              payDate: repoDiv.pay_date
            })
          }
        }
        
        // Also check against ex_date if pay_date didn't match
        if (!dateMatch) {
          dateMatch = datesWithinDays(rec.adjustment_date, repoDiv.ex_date, 3)
          if (dateMatch) {
            console.log('[DEBUG] Date match via ex_date (within 3 days):', {
              adjustmentDate: rec.adjustment_date,
              exDate: repoDiv.ex_date
            })
          }
        }
        
        if (amountMatch && dateMatch) {
          console.log('[DEBUG] Found match via amount+date proximity:', {
            repoExDate: repoDiv.ex_date,
            recordedAdjDate: rec.adjustment_date,
            perShareMatch: perShareRecorded.toFixed(4) + ' ≈ ' + perShareRepo.toFixed(4)
          })
          return true
        } else if (amountMatch || dateMatch) {
          // Log near-misses for debugging
          console.log('[DEBUG] Near miss:', {
            amountMatch,
            dateMatch,
            perShareRecorded: perShareRecorded.toFixed(4),
            perShareRepo: perShareRepo.toFixed(4),
            adjustmentDate: rec.adjustment_date,
            exDate: repoDiv.ex_date,
            payDate: repoDiv.pay_date
          })
        }
      }
      
      return false
    }
    
    // Get all stock transactions to calculate shares held on each ex_date
    const transactions = await DB.prepare(`
      SELECT transaction_date, transaction_type, shares
      FROM stock_transactions
      WHERE holding_id = ?
      ORDER BY transaction_date ASC
    `).bind(holdingId).all()
    
    // Calculate shares held on a given date
    const getSharesHeldOnDate = (targetDate: string) => {
      // If no transactions exist, fallback to stock_holdings.total_shares
      // This handles cases where holdings exist but transactions weren't recorded
      if (!transactions.results || transactions.results.length === 0) {
        // Use total_shares from holding for all dates >= opened_date
        if (targetDate >= holding.opened_date) {
          return holding.total_shares || 0
        }
        return 0
      }
      
      // Calculate shares from transactions
      let sharesHeld = 0
      for (const tx of (transactions.results || [])) {
        const txData = tx as any
        if (txData.transaction_date <= targetDate) {
          if (txData.transaction_type === 'BUY') {
            sharesHeld += txData.shares
          } else if (txData.transaction_type === 'SELL') {
            sharesHeld -= txData.shares
          }
        }
      }
      return sharesHeld
    }
    
    // Filter out already recorded dividends and calculate missing ones
    const missingDividends = []
    for (const div of (repositoryDividends.results || [])) {
      const dividend = div as any
      
      // Calculate shares held on ex_date first (needed for matching)
      const sharesHeld = getSharesHeldOnDate(dividend.ex_date)
      
      // Skip if no shares held on that date
      if (sharesHeld <= 0) {
        continue
      }
      
      // Skip if already recorded (using smart matching)
      if (isDividendRecorded(dividend, sharesHeld)) {
        continue
      }
      
      // Calculate total amount
      let totalAmount = dividend.amount * sharesHeld
      
      // Apply withholding tax for CASH and TFSA accounts
      let withholdingNote = ''
      if (holding.account_type === 'Cash' || holding.account_type === 'TFSA') {
        totalAmount = totalAmount * 0.8 // Reduce by 20%
        withholdingNote = ' (20% withholding tax applied)'
      }
      
      missingDividends.push({
        id: dividend.id,
        ticker: dividend.ticker,
        ex_date: dividend.ex_date,
        pay_date: dividend.pay_date,
        amount_per_share: dividend.amount,
        shares_held: sharesHeld,
        total_amount: totalAmount,
        frequency: dividend.frequency,
        withholding_note: withholdingNote,
        account_type: holding.account_type
      })
    }
    
    console.log('[DEBUG] Missing dividends to return:', missingDividends.length)
    console.log('[DEBUG] Missing dividends detail:', missingDividends)
    
    return c.json(missingDividends)
  } catch (error) {
    console.error('Get missing dividends error:', error)
    return c.json({ error: 'Failed to fetch missing dividends' }, 500)
  }
})

// Record a dividend payment
app.post('/api/stocks/:id/dividends', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Validation
    if (!data.amount || !data.payment_date) {
      return c.json({ error: 'Amount and payment date are required' }, 400)
    }
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Insert dividend adjustment
    const result = await DB.prepare(`
      INSERT INTO cost_basis_adjustments (
        user_id, holding_id, adjustment_type, amount, adjustment_date, notes
      ) VALUES (?, ?, 'DIVIDEND', ?, ?, ?)
    `).bind(
      userId,
      holdingId,
      data.amount,
      data.payment_date,
      data.notes || null
    ).run()
    
    return c.json({
      id: result.meta.last_row_id,
      message: 'Dividend recorded successfully'
    })
  } catch (error) {
    console.error('Record dividend error:', error)
    return c.json({ error: 'Failed to record dividend' }, 500)
  }
})

// Add a missing dividend from repository
app.post('/api/stocks/:id/add-missing-dividend', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Validation
    if (!data.dividend_repo_id || !data.total_amount || !data.ex_date) {
      return c.json({ error: 'Missing required fields' }, 400)
    }
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT sh.id, c.ticker 
      FROM stock_holdings sh
      JOIN companies c ON sh.company_id = c.id
      WHERE sh.id = ? AND sh.user_id = ?
    `).bind(holdingId, userId).first() as any
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Get dividend details from repository
    const dividend = await DB.prepare(`
      SELECT * FROM dividend_repository WHERE id = ?
    `).bind(data.dividend_repo_id).first() as any
    
    if (!dividend) {
      return c.json({ error: 'Dividend not found in repository' }, 404)
    }
    
    // Verify ticker matches
    if (dividend.ticker !== holding.ticker) {
      return c.json({ error: 'Dividend ticker does not match holding' }, 400)
    }
    
    // Build notes with ex_date for tracking (stored for matching logic)
    // Format today's date as MM/DD/YYYY
    const today = new Date()
    const addedDate = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`
    
    // Simple note for display, but include ex_date for duplicate detection
    const notes = `Added ${addedDate}. Ex-date: ${data.ex_date}`
    
    // Use pay_date if provided, otherwise use ex_date
    const adjustmentDate = data.pay_date || data.ex_date
    
    // Insert dividend adjustment
    const result = await DB.prepare(`
      INSERT INTO cost_basis_adjustments (
        user_id, holding_id, adjustment_type, amount, adjustment_date, notes
      ) VALUES (?, ?, 'DIVIDEND', ?, ?, ?)
    `).bind(
      userId,
      holdingId,
      data.total_amount,
      adjustmentDate,
      notes
    ).run()
    
    return c.json({
      id: result.meta.last_row_id,
      message: 'Dividend added successfully'
    })
  } catch (error) {
    console.error('Add missing dividend error:', error)
    return c.json({ error: 'Failed to add dividend' }, 500)
  }
})

// Get covered call history for a stock trade
app.get('/api/stocks/:id/covered-calls', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Verify holding belongs to user and get account info
    const holding = await DB.prepare(`
      SELECT sh.id, sh.ticker, sh.account_id, a.account_name, a.account_type
      FROM stock_holdings sh
      LEFT JOIN accounts a ON sh.account_id = a.id
      WHERE sh.id = ? AND sh.user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Get covered calls for this ticker AND specific account_id only
    // Also get account info for display
    // Filter by account_id to prevent cross-account showing (important for multiple Cash/RRSP accounts)
    const coveredCalls = await DB.prepare(`
      SELECT 
        ot.*,
        a.account_name,
        a.account_type as account_type_name
      FROM option_trades ot
      LEFT JOIN accounts a ON ot.account_id = a.id
      WHERE ot.user_id = ? AND ot.ticker = ? AND ot.account_id = ? AND ot.strategy_type = 'COVERED_CALL'
      ORDER BY ot.trade_date DESC
    `).bind(userId, holding.ticker, holding.account_id).all()
    
    return c.json(coveredCalls.results || [])
  } catch (error) {
    console.error('Get covered calls error:', error)
    return c.json({ error: 'Failed to fetch covered calls' }, 500)
  }
})

// Diagnostic endpoint: Get all covered calls for a ticker (regardless of account_id)
app.get('/api/stocks/:id/all-covered-calls', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Get holding info
    const holding = await DB.prepare(`
      SELECT sh.id, sh.ticker, sh.account_id, a.account_name as holding_account_name
      FROM stock_holdings sh
      LEFT JOIN accounts a ON sh.account_id = a.id
      WHERE sh.id = ? AND sh.user_id = ?
    `).bind(holdingId, userId).first() as any
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Get ALL covered calls for this ticker (any account)
    const allCoveredCalls = await DB.prepare(`
      SELECT 
        ot.*,
        a.account_name as cc_account_name,
        a.account_type as cc_account_type,
        CASE 
          WHEN ot.account_id = ? THEN 1 
          ELSE 0 
        END as matches_holding
      FROM option_trades ot
      LEFT JOIN accounts a ON ot.account_id = a.id
      WHERE ot.user_id = ? AND ot.ticker = ? AND ot.strategy_type = 'COVERED_CALL'
      ORDER BY matches_holding DESC, ot.trade_date DESC
    `).bind(holding.account_id, userId, holding.ticker).all()
    
    return c.json({
      holding_info: {
        id: holding.id,
        ticker: holding.ticker,
        account_id: holding.account_id,
        account_name: holding.holding_account_name
      },
      covered_calls: allCoveredCalls.results || []
    })
  } catch (error) {
    console.error('Get all covered calls error:', error)
    return c.json({ error: 'Failed to fetch covered calls' }, 500)
  }
})

// Link a covered call to a stock holding (update account_id)
app.put('/api/covered-calls/:ccId/link-to-holding/:holdingId', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const ccId = c.req.param('ccId')
    const holdingId = c.req.param('holdingId')
    const { DB } = c.env
    
    // Verify covered call belongs to user
    const coveredCall = await DB.prepare(`
      SELECT * FROM option_trades 
      WHERE id = ? AND user_id = ? AND strategy_type = 'COVERED_CALL'
    `).bind(ccId, userId).first() as any
    
    if (!coveredCall) {
      return c.json({ error: 'Covered call not found' }, 404)
    }
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT sh.id, sh.ticker, sh.account_id, a.account_type
      FROM stock_holdings sh
      LEFT JOIN accounts a ON sh.account_id = a.id
      WHERE sh.id = ? AND sh.user_id = ?
    `).bind(holdingId, userId).first() as any
    
    if (!holding) {
      return c.json({ error: 'Stock holding not found' }, 404)
    }
    
    // Verify ticker matches
    if (coveredCall.ticker !== holding.ticker) {
      return c.json({ 
        error: `Ticker mismatch: Covered call is for ${coveredCall.ticker}, holding is for ${holding.ticker}` 
      }, 400)
    }
    
    // Update covered call's account_id and account_type to match holding
    await DB.prepare(`
      UPDATE option_trades 
      SET account_id = ?, account_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(holding.account_id, holding.account_type, ccId).run()
    
    return c.json({ 
      success: true,
      message: `Covered call ${ccId} linked to holding ${holdingId} (account: ${holding.account_id})`
    })
  } catch (error) {
    console.error('Link covered call error:', error)
    return c.json({ error: 'Failed to link covered call' }, 500)
  }
})

// Record a covered call
app.post('/api/stocks/:id/covered-calls', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Validation
    if (!data.strike_price || !data.premium || !data.quantity || !data.expiration_date || !data.trade_date) {
      return c.json({ error: 'All fields are required' }, 400)
    }
    
    // Verify holding belongs to user and get details
    const holding = await DB.prepare(`
      SELECT id, ticker, total_shares, company_id, account_id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Verify user has enough shares (need 100 shares per contract)
    const sharesNeeded = data.quantity * 100
    if (holding.total_shares < sharesNeeded) {
      return c.json({ 
        error: `Insufficient shares. Need ${sharesNeeded} shares, have ${holding.total_shares}` 
      }, 400)
    }
    
    // Get account_type from accounts table
    const account = await DB.prepare(`
      SELECT account_type FROM accounts WHERE id = ?
    `).bind(holding.account_id).first()
    
    // Insert covered call as an option trade with account_id for proper association
    const optionResult = await DB.prepare(`
      INSERT INTO option_trades (
        user_id, company_id, ticker, strategy_type, strike_price, premium, quantity,
        expiration_date, account_type, account_id, trade_date, is_open, commission, notes
      ) VALUES (?, ?, ?, 'COVERED_CALL', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      userId,
      holding.company_id,
      holding.ticker,
      data.strike_price,
      data.premium,
      data.quantity,
      data.expiration_date,
      account?.account_type,
      holding.account_id,  // Store account_id for proper association
      data.trade_date,
      data.commission || 0,
      data.notes || null
    ).run()
    
    // NOTE: Cost basis adjustment is NOT created when opening a covered call
    // It will be created when the covered call is closed, using the actual net P/L
    
    return c.json({
      id: optionResult.meta.last_row_id,
      message: 'Covered call recorded successfully'
    })
  } catch (error) {
    console.error('Record covered call error:', error)
    return c.json({ error: 'Failed to record covered call' }, 500)
  }
})

// Close a covered call
app.put('/api/covered-calls/:id/close', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const ccId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Verify covered call belongs to user and get details
    const cc = await DB.prepare(`
      SELECT ot.*, sh.id as holding_id
      FROM option_trades ot
      LEFT JOIN stock_holdings sh ON sh.ticker = ot.ticker AND sh.user_id = ot.user_id AND sh.is_open = 1
      WHERE ot.id = ? AND ot.user_id = ? AND ot.strategy_type = 'COVERED_CALL'
    `).bind(ccId, userId).first()
    
    if (!cc) {
      return c.json({ error: 'Covered call not found' }, 404)
    }
    
    if (cc.is_open === 0) {
      return c.json({ error: 'Covered call is already closed' }, 400)
    }
    
    // Calculate profit/loss
    const openCommission = parseFloat(cc.commission) || 0
    // Support both 'close_commission' and 'commission' in request body for backward compatibility
    const closeCommission = parseFloat(data.close_commission || data.commission) || 0
    const openPremium = parseFloat(cc.premium)
    const closePremium = parseFloat(data.close_price) || 0
    const contracts = parseInt(cc.quantity)
    
    // P/L = (Open Premium - Close Premium) * Contracts * 100 - Open Commission - Close Commission
    const profitLoss = (openPremium - closePremium) * contracts * 100 - openCommission - closeCommission
    
    // Close the covered call
    await DB.prepare(`
      UPDATE option_trades SET
        is_open = 0,
        close_date = ?,
        close_price = ?,
        close_commission = ?,
        profit_loss = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      data.close_date || new Date().toISOString().split('T')[0],
      data.close_price || 0,
      closeCommission,
      profitLoss,
      ccId,
      userId
    ).run()
    
    // Create cost basis adjustment when closing the covered call
    // The profit/loss from the covered call reduces the cost basis
    if (cc.holding_id && profitLoss !== undefined) {
      await DB.prepare(`
        INSERT INTO cost_basis_adjustments (user_id, holding_id, adjustment_type, amount, adjustment_date, notes)
        VALUES (?, ?, 'COVERED_CALL', ?, ?, ?)
      `).bind(
        userId,
        cc.holding_id,
        profitLoss,
        data.close_date || new Date().toISOString().split('T')[0],
        `Covered call closed - Net P/L: $${profitLoss.toFixed(2)} (${cc.quantity} contracts @ $${cc.strike_price}, closed @ $${data.close_price})`
      ).run()
    }
    
    return c.json({ 
      success: true, 
      message: 'Covered call closed successfully',
      profit_loss: profitLoss 
    })
  } catch (error) {
    console.error('Close covered call error:', error)
    return c.json({ error: 'Failed to close covered call' }, 500)
  }
})

// Edit a covered call
app.put('/api/covered-calls/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const ccId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Verify covered call belongs to user
    const cc = await DB.prepare(`
      SELECT id FROM option_trades 
      WHERE id = ? AND user_id = ? AND strategy_type = 'COVERED_CALL'
    `).bind(ccId, userId).first()
    
    if (!cc) {
      return c.json({ error: 'Covered call not found' }, 404)
    }
    
    // If holding_id is provided, update account_id to match the holding's account
    // This fixes any existing covered calls with incorrect or NULL account_id
    let accountIdToSet = null
    if (data.holding_id) {
      const holding = await DB.prepare(`
        SELECT account_id FROM stock_holdings WHERE id = ? AND user_id = ?
      `).bind(data.holding_id, userId).first()
      
      if (holding) {
        accountIdToSet = holding.account_id
      }
    }
    
    // Update the covered call (including account_id if we have it)
    if (accountIdToSet !== null) {
      await DB.prepare(`
        UPDATE option_trades SET
          strike_price = ?,
          premium = ?,
          quantity = ?,
          expiration_date = ?,
          trade_date = ?,
          commission = ?,
          close_date = ?,
          close_price = ?,
          close_commission = ?,
          notes = ?,
          account_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).bind(
        data.strike_price,
        data.premium,
        data.quantity,
        data.expiration_date,
        data.trade_date,
        data.commission || 0,
        data.close_date || null,
        data.close_price || null,
        data.close_commission || null,
        data.notes || null,
        accountIdToSet,
        ccId,
        userId
      ).run()
    } else {
      // No holding_id provided, update without changing account_id
      await DB.prepare(`
        UPDATE option_trades SET
          strike_price = ?,
          premium = ?,
          quantity = ?,
          expiration_date = ?,
          trade_date = ?,
          commission = ?,
          close_date = ?,
          close_price = ?,
          close_commission = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).bind(
        data.strike_price,
        data.premium,
        data.quantity,
        data.expiration_date,
        data.trade_date,
        data.commission || 0,
        data.close_date || null,
        data.close_price || null,
        data.close_commission || null,
        data.notes || null,
        ccId,
        userId
      ).run()
    }
    
    // Recalculate profit_loss and is_open if close fields are provided
    if (data.close_date && data.close_price !== null && data.close_price !== undefined) {
      const openCommission = parseFloat(data.commission) || 0
      const closeCommission = parseFloat(data.close_commission) || 0
      const openPremium = parseFloat(data.premium)
      const closePremium = parseFloat(data.close_price)
      const contracts = parseInt(data.quantity)
      
      // P/L = (Open Premium - Close Premium) * Contracts * 100 - Open Commission - Close Commission
      const profitLoss = (openPremium - closePremium) * contracts * 100 - openCommission - closeCommission
      
      await DB.prepare(`
        UPDATE option_trades SET
          profit_loss = ?,
          is_open = 0
        WHERE id = ? AND user_id = ?
      `).bind(profitLoss, ccId, userId).run()
    } else if (!data.close_date) {
      // If close_date is removed, mark as open and clear P/L
      await DB.prepare(`
        UPDATE option_trades SET
          profit_loss = NULL,
          is_open = 1
        WHERE id = ? AND user_id = ?
      `).bind(ccId, userId).run()
    }
    
    return c.json({ success: true, message: 'Covered call updated successfully' })
  } catch (error) {
    console.error('Edit covered call error:', error)
    return c.json({ error: 'Failed to edit covered call' }, 500)
  }
})

// Get details of a specific covered call
app.get('/api/covered-calls/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const ccId = c.req.param('id')
    const { DB } = c.env
    
    const cc = await DB.prepare(`
      SELECT ot.*, c.company_name 
      FROM option_trades ot
      LEFT JOIN companies c ON ot.company_id = c.id
      WHERE ot.id = ? AND ot.user_id = ? AND ot.strategy_type = 'COVERED_CALL'
    `).bind(ccId, userId).first()
    
    if (!cc) {
      return c.json({ error: 'Covered call not found' }, 404)
    }
    
    return c.json(cc)
  } catch (error) {
    console.error('Get covered call error:', error)
    return c.json({ error: 'Failed to fetch covered call' }, 500)
  }
})

// Get stock purchase history for a specific stock (all buys/sells for that ticker+account)
app.get('/api/stocks/:id/purchase-history', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Get the holding to extract ticker and account_id
    const holding = await DB.prepare(`
      SELECT id, ticker, account_id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first() as any
    
    if (!holding) {
      return c.json({ error: 'Stock holding not found' }, 404)
    }
    
    // Get all transactions for this holding
    const transactions = await DB.prepare(`
      SELECT 
        st.id,
        st.transaction_type as trade_type,
        st.shares as quantity,
        st.price_per_share as price,
        st.transaction_date as trade_date,
        st.commission,
        st.notes,
        a.account_name,
        1 as is_open
      FROM stock_transactions st
      LEFT JOIN accounts a ON a.id = ?
      WHERE st.holding_id = ?
      ORDER BY st.transaction_date DESC, st.id DESC
    `).bind(holding.account_id, holdingId).all()
    
    return c.json(transactions.results || [])
  } catch (error) {
    console.error('Get purchase history error:', error)
    return c.json({ error: 'Failed to fetch purchase history' }, 500)
  }
})

// ============================================================================
// OPTION TRADES ROUTES
// ============================================================================

app.get('/api/options', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const isOpen = c.req.query('open')
  const isClosed = c.req.query('closed')
  
  let query = `
    SELECT 
      ot.*,
      a.account_name,
      a.account_type as account_type_name
    FROM option_trades ot
    LEFT JOIN accounts a ON ot.account_id = a.id
    WHERE ot.user_id = ?
  `
  let params = [userId]
  
  if (isOpen !== undefined) {
    query += ' AND ot.is_open = ?'
    params.push(isOpen === 'true' ? 1 : 0)
  } else if (isClosed !== undefined) {
    query += ' AND ot.is_open = ?'
    params.push(isClosed === 'true' ? 0 : 1)
  }
  
  query += ' ORDER BY ot.trade_date DESC'
  
  const stmt = c.env.DB.prepare(query)
  const options = await stmt.bind(...params).all()
  
  return c.json(options.results)
})

app.post('/api/options', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Validation
    if (!data.company_id) {
      return c.json({ error: 'Company is required' }, 400)
    }
    
    if (!data.account_id) {
      return c.json({ error: 'Account is required' }, 400)
    }
    
    if (!data.ticker || !data.strategy_type || !data.strike_price || !data.premium || 
        !data.quantity || !data.expiration_date || !data.trade_date) {
      return c.json({ error: 'Missing required fields' }, 400)
    }
    
    // Verify company belongs to user
    const company = await DB.prepare(`
      SELECT id FROM companies WHERE id = ? AND user_id = ?
    `).bind(data.company_id, userId).first()
    
    if (!company) {
      return c.json({ error: 'Company not found' }, 404)
    }
    
    // Verify account belongs to user and get account_type
    const account = await DB.prepare(`
      SELECT id, account_type FROM accounts WHERE id = ? AND user_id = ?
    `).bind(data.account_id, userId).first() as any
    
    if (!account) {
      return c.json({ error: 'Account not found' }, 404)
    }
  
    const result = await DB.prepare(`
      INSERT INTO option_trades (
        user_id, company_id, account_id, ticker, strategy_type, strike_price,
        strike_price_2, strike_price_3, strike_price_4, premium, quantity,
        expiration_date, account_type, trade_date, commission, is_open, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      data.company_id,
      data.account_id,
      data.ticker,
      data.strategy_type,
      data.strike_price,
      data.strike_price_2 || null,
      data.strike_price_3 || null,
      data.strike_price_4 || null,
      data.premium,
      data.quantity,
      data.expiration_date,
      account.account_type,  // Get from accounts table
      data.trade_date,
      data.commission || 0,
      data.is_open !== undefined ? (data.is_open ? 1 : 0) : 1,
      data.notes || null
    ).run()
    
    return c.json({ 
      id: result.meta.last_row_id,
      ...data,
      account_type: account.account_type,
      is_open: data.is_open !== undefined ? data.is_open : true
    }, 201)
  } catch (error) {
    console.error('Create option trade error:', error)
    return c.json({ error: 'Failed to create option trade' }, 500)
  }
})

app.put('/api/options/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // First, get the existing trade data
    const existingTrade = await DB.prepare(`
      SELECT * FROM option_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first() as any
    
    if (!existingTrade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    // If account_id is provided, fetch account_type
    let accountType = data.account_type !== undefined ? data.account_type : existingTrade.account_type
    if (data.account_id) {
      const account = await DB.prepare(`
        SELECT account_type FROM accounts WHERE id = ? AND user_id = ?
      `).bind(data.account_id, userId).first() as any
      
      if (account) {
        accountType = account.account_type
      }
    }
    
    // Build UPDATE query with only provided fields (PATCH-style)
    // D1 doesn't accept undefined, so use null as fallback
    await DB.prepare(`
      UPDATE option_trades SET
        ticker = ?, strategy_type = ?, strike_price = ?,
        strike_price_2 = ?, strike_price_3 = ?, strike_price_4 = ?,
        premium = ?, quantity = ?, expiration_date = ?,
        account_type = ?, account_id = ?, trade_date = ?, commission = ?,
        close_date = ?, close_price = ?, close_price_2 = ?, close_price_3 = ?, close_price_4 = ?,
        close_commission = ?,
        notes = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      data.ticker !== undefined ? data.ticker : existingTrade.ticker,
      data.strategy_type !== undefined ? data.strategy_type : existingTrade.strategy_type,
      data.strike_price !== undefined ? data.strike_price : existingTrade.strike_price,
      data.strike_price_2 !== undefined ? data.strike_price_2 : (existingTrade.strike_price_2 ?? null),
      data.strike_price_3 !== undefined ? data.strike_price_3 : (existingTrade.strike_price_3 ?? null),
      data.strike_price_4 !== undefined ? data.strike_price_4 : (existingTrade.strike_price_4 ?? null),
      data.premium !== undefined ? data.premium : existingTrade.premium,
      data.quantity !== undefined ? data.quantity : existingTrade.quantity,
      data.expiration_date !== undefined ? data.expiration_date : existingTrade.expiration_date,
      accountType,
      data.account_id !== undefined ? data.account_id : (existingTrade.account_id ?? null),
      data.trade_date !== undefined ? data.trade_date : existingTrade.trade_date,
      data.commission !== undefined ? data.commission : (existingTrade.commission ?? 0),
      data.close_date !== undefined ? data.close_date : (existingTrade.close_date ?? null),
      data.close_price !== undefined ? data.close_price : (existingTrade.close_price ?? null),
      data.close_price_2 !== undefined ? data.close_price_2 : (existingTrade.close_price_2 ?? null),
      data.close_price_3 !== undefined ? data.close_price_3 : (existingTrade.close_price_3 ?? null),
      data.close_price_4 !== undefined ? data.close_price_4 : (existingTrade.close_price_4 ?? null),
      data.close_commission !== undefined ? data.close_commission : (existingTrade.close_commission ?? null),
      data.notes !== undefined ? data.notes : (existingTrade.notes ?? null),
      tradeId,
      userId
    ).run()
    
    // Merge data with existing trade for calculations
    const mergedData = {
      ticker: data.ticker !== undefined ? data.ticker : existingTrade.ticker,
      strategy_type: data.strategy_type !== undefined ? data.strategy_type : existingTrade.strategy_type,
      strike_price: data.strike_price !== undefined ? data.strike_price : existingTrade.strike_price,
      strike_price_2: data.strike_price_2 !== undefined ? data.strike_price_2 : existingTrade.strike_price_2,
      strike_price_3: data.strike_price_3 !== undefined ? data.strike_price_3 : existingTrade.strike_price_3,
      strike_price_4: data.strike_price_4 !== undefined ? data.strike_price_4 : existingTrade.strike_price_4,
      premium: data.premium !== undefined ? data.premium : existingTrade.premium,
      quantity: data.quantity !== undefined ? data.quantity : existingTrade.quantity,
      commission: data.commission !== undefined ? data.commission : (existingTrade.commission || 0),
      close_date: data.close_date !== undefined ? data.close_date : existingTrade.close_date,
      close_price: data.close_price !== undefined ? data.close_price : existingTrade.close_price,
      close_price_2: data.close_price_2 !== undefined ? data.close_price_2 : existingTrade.close_price_2,
      close_price_3: data.close_price_3 !== undefined ? data.close_price_3 : existingTrade.close_price_3,
      close_price_4: data.close_price_4 !== undefined ? data.close_price_4 : existingTrade.close_price_4,
      close_commission: data.close_commission !== undefined ? data.close_commission : existingTrade.close_commission
    }
    
    // Recalculate profit_loss and is_open if close fields are provided
    if (mergedData.close_date && mergedData.close_price !== null && mergedData.close_price !== undefined) {
      const openCommission = mergedData.commission || 0
      const closeCommission = mergedData.close_commission || 0
      const contracts = mergedData.quantity
      const strategyType = mergedData.strategy_type
      
      let profitLoss = 0
      
      // Calculate P/L based on strategy type
      if (strategyType === 'CREDIT_SPREAD' || strategyType === 'DEBIT_SPREAD') {
        // Two-leg spread
        const shortOpenPremium = mergedData.premium  // strike_price (short leg)
        const longOpenPremium = mergedData.strike_price_2 || 0  // strike_price_2 (long leg)
        const shortClosePremium = mergedData.close_price || 0
        const longClosePremium = mergedData.close_price_2 || 0
        
        const openCredit = (shortOpenPremium - longOpenPremium) * contracts * 100
        const closeDebit = (shortClosePremium - longClosePremium) * contracts * 100
        profitLoss = openCredit - closeDebit - openCommission - closeCommission
        
      } else if (strategyType === 'IRON_CONDOR') {
        // Four-leg iron condor
        const scOpen = mergedData.premium || 0  // Short Call
        const lcOpen = mergedData.strike_price_2 || 0  // Long Call
        const spOpen = mergedData.strike_price_3 || 0  // Short Put
        const lpOpen = mergedData.strike_price_4 || 0  // Long Put
        
        const scClose = mergedData.close_price || 0
        const lcClose = mergedData.close_price_2 || 0
        const spClose = mergedData.close_price_3 || 0
        const lpClose = mergedData.close_price_4 || 0
        
        const openCredit = ((scOpen - lcOpen) + (spOpen - lpOpen)) * contracts * 100
        const closeDebit = ((scClose - lcClose) + (spClose - lpClose)) * contracts * 100
        profitLoss = openCredit - closeDebit - openCommission - closeCommission
        
      } else {
        // Single-leg (SELLING_PUT, SELLING_PUT_LONG_TERM, BUYING_PUT, LONG_CALL, COVERED_CALL)
        const openPremium = mergedData.premium
        const closePremium = mergedData.close_price
        
        if (strategyType === 'BUYING_PUT' || strategyType === 'LONG_CALL') {
          // Debit strategies: profit when close > open
          profitLoss = (closePremium - openPremium) * contracts * 100 - openCommission - closeCommission
        } else {
          // Credit strategies: profit when open > close
          profitLoss = (openPremium - closePremium) * contracts * 100 - openCommission - closeCommission
        }
      }
      
      await DB.prepare(`
        UPDATE option_trades SET
          profit_loss = ?,
          is_open = 0
        WHERE id = ? AND user_id = ?
      `).bind(profitLoss, tradeId, userId).run()
    } else if (!data.close_date) {
      // If close_date is removed, mark as open
      await DB.prepare(`
        UPDATE option_trades SET
          profit_loss = NULL,
          is_open = 1
        WHERE id = ? AND user_id = ?
      `).bind(tradeId, userId).run()
    }
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Update option trade error:', error)
    return c.json({ error: 'Failed to update option trade' }, 500)
  }
})

app.put('/api/options/:id/reopen', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const { DB } = c.env
    
    // Verify trade belongs to user
    const trade = await DB.prepare(`
      SELECT id, is_open FROM option_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()
    
    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    if (trade.is_open === 1) {
      return c.json({ error: 'Trade is already open' }, 400)
    }
    
    // Re-open the trade and clear closing data
    await DB.prepare(`
      UPDATE option_trades SET
        is_open = 1,
        close_date = NULL,
        close_price = NULL,
        close_price_2 = NULL,
        close_price_3 = NULL,
        close_price_4 = NULL,
        close_commission = NULL,
        profit_loss = NULL
      WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).run()
    
    return c.json({ success: true, message: 'Trade re-opened successfully' })
  } catch (error) {
    console.error('Re-open option trade error:', error)
    return c.json({ error: 'Failed to re-open option trade' }, 500)
  }
})

app.delete('/api/options/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const tradeId = c.req.param('id')
  
  await c.env.DB.prepare(`
    DELETE FROM option_trades WHERE id = ? AND user_id = ?
  `).bind(tradeId, userId).run()
  
  return c.json({ success: true })
})

// Assign stock position from short put option
app.post('/api/options/:id/assign', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const optionId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Fetch the option trade
    const option = await DB.prepare(`
      SELECT ot.*, c.ticker as company_ticker
      FROM option_trades ot
      JOIN companies c ON ot.company_id = c.id
      WHERE ot.id = ? AND ot.user_id = ?
    `).bind(optionId, userId).first() as any
    
    if (!option) {
      return c.json({ error: 'Option trade not found' }, 404)
    }
    
    // Use the company's ticker, not the option's ticker (which may be outdated)
    const ticker = option.company_ticker || option.ticker
    
    // Validate this is a short put strategy
    if (option.strategy_type !== 'SELLING_PUT' && option.strategy_type !== 'SELLING_PUT_WHEEL') {
      return c.json({ error: 'Assignment is only available for Short Put strategies' }, 400)
    }
    
    // Validate option is still open
    if (!option.is_open) {
      return c.json({ error: 'Option is already closed' }, 400)
    }
    
    // Validate assignment date
    if (!data.assignment_date) {
      return c.json({ error: 'Assignment date is required' }, 400)
    }
    
    // Calculate stock details
    const shares = option.quantity * 100
    const strikePrice = parseFloat(option.strike_price)
    
    // Determine strategy type based on option strategy
    const strategyType = option.strategy_type === 'SELLING_PUT_WHEEL' ? 'WHEEL' : 'STOCKPILING'
    
    // Start transaction: Close option and create stock position
    // 1. Close the option with $0 close price (assignment = max profit for short put)
    // When assigned: you keep all the premium collected (minus commission)
    const grossPremium = option.premium * option.quantity * 100
    const openCommission = parseFloat(option.commission || 0)
    const profitLoss = grossPremium - openCommission // Max profit: premium collected minus commission paid
    
    await DB.prepare(`
      UPDATE option_trades
      SET is_open = 0,
          close_date = ?,
          close_price = 0,
          close_commission = 0,
          profit_loss = ?,
          notes = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      data.assignment_date,
      profitLoss,
      option.notes ? `${option.notes}\n\nASSIGNED: ${data.notes || 'Stock position created from assignment'}` : `ASSIGNED: ${data.notes || 'Stock position created from assignment'}`,
      optionId,
      userId
    ).run()
    
    // 2. Check if stock holding already exists for this ticker + account
    const existingHolding = await DB.prepare(`
      SELECT id, total_shares, average_price 
      FROM stock_holdings 
      WHERE user_id = ? AND company_id = ? AND account_id = ? AND is_open = 1
    `).bind(userId, option.company_id, option.account_id).first() as any
    
    let holdingId: number
    
    if (existingHolding) {
      // Update existing holding with new shares
      const totalShares = existingHolding.total_shares + shares
      const totalCost = (existingHolding.total_shares * existingHolding.average_price) + (shares * strikePrice)
      const newAvgPrice = totalCost / totalShares
      
      await DB.prepare(`
        UPDATE stock_holdings
        SET total_shares = ?,
            average_price = ?,
            strategy_type = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).bind(totalShares, newAvgPrice, strategyType, existingHolding.id, userId).run()
      
      holdingId = existingHolding.id
    } else {
      // Create new stock holding
      const holdingResult = await DB.prepare(`
        INSERT INTO stock_holdings (
          user_id, company_id, ticker, account_id, total_shares, average_price, 
          is_open, opened_date, strategy_type, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).bind(
        userId,
        option.company_id,
        ticker,
        option.account_id,
        shares,
        strikePrice,
        data.assignment_date,
        strategyType,
        data.notes || 'Created from option assignment'
      ).run()
      
      holdingId = holdingResult.meta.last_row_id as number
    }
    
    // 3. Create stock transaction record
    await DB.prepare(`
      INSERT INTO stock_transactions (
        user_id, holding_id, transaction_type, shares, price_per_share,
        transaction_date, commission, notes
      ) VALUES (?, ?, 'BUY', ?, ?, ?, 0, ?)
    `).bind(
      userId,
      holdingId,
      shares,
      strikePrice,
      data.assignment_date,
      `Assigned from option: ${shares} shares @ $${strikePrice}`
    ).run()
    
    // 4. Create cost basis adjustment for premium collected
    // Premium reduces the cost basis - this is the key advantage of the Wheel strategy
    // Cost basis adjustment = (Premium per share * contracts * 100) - commission paid
    // Note: grossPremium and openCommission already calculated above
    const netProceeds = grossPremium - openCommission // Net proceeds after commission
    
    await DB.prepare(`
      INSERT INTO cost_basis_adjustments (
        user_id, holding_id, adjustment_type, amount, adjustment_date, notes
      ) VALUES (?, ?, 'SELLING_PUT', ?, ?, ?)
    `).bind(
      userId,
      holdingId,
      netProceeds,
      data.assignment_date,
      `Premium from assigned ${option.strategy_type === 'SELLING_PUT_WHEEL' ? 'Wheel' : 'Stockpiling'} put: ${option.quantity} contract(s) @ $${option.premium}/share = $${grossPremium.toFixed(2)}${openCommission > 0 ? ` - $${openCommission.toFixed(2)} commission = $${netProceeds.toFixed(2)}` : ''}`
    ).run()
    
    return c.json({ 
      success: true,
      message: 'Stock position assigned successfully',
      option_closed: true,
      stock_created: true,
      shares: shares,
      price: strikePrice,
      strategy_type: strategyType,
      premium_adjustment: netProceeds,
      gross_premium: grossPremium,
      commission: openCommission
    })
    
  } catch (error) {
    console.error('Assignment error:', error)
    return c.json({ error: 'Failed to assign stock position' }, 500)
  }
})

// ============================================================================
// DAILY TRADE CONFIG ROUTES
// ============================================================================

// Get user's daily trade configuration
app.get('/api/daily-trade/config', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c

    const result = await env.DB.prepare(`
      SELECT * FROM daily_trade_config WHERE user_id = ?
    `).bind(userId).first()

    if (!result) {
      // Return default configuration if none exists
      return c.json({
        max_contract_limit: 25,
        rolling_profit_window: 50,
        enable_profit_sizing_default: false,
        enable_position_sizing: false,
        position_sizing_type: 'profit',
        account_max_loss_percent: 4.00,
        target_premium_min: 10.00,
        target_premium_max: 15.00,
        guideline_delta: -0.10,
        strike_width: 5,
        default_contracts: 1,
        profit_target_percent: 50,
        atm_proximity_limit: 30,
        time_exit: '14:00:00',
        default_account_id: null
      })
    }

    return c.json(result)
  } catch (error) {
    console.error('Error fetching daily trade config:', error)
    return c.json({ error: 'Failed to fetch configuration' }, 500)
  }
})

// Save or update user's daily trade configuration
app.post('/api/daily-trade/config', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const data = await c.req.json()

    // Check if config exists
    const existing = await env.DB.prepare(`
      SELECT id FROM daily_trade_config WHERE user_id = ?
    `).bind(userId).first()

    if (existing) {
      // Update existing config
      await env.DB.prepare(`
        UPDATE daily_trade_config SET
          max_contract_limit = ?,
          rolling_profit_window = ?,
          enable_profit_sizing_default = ?,
          enable_position_sizing = ?,
          position_sizing_type = ?,
          account_max_loss_percent = ?,
          target_premium_min = ?,
          target_premium_max = ?,
          guideline_delta = ?,
          strike_width = ?,
          default_contracts = ?,
          profit_target_percent = ?,
          atm_proximity_limit = ?,
          time_exit = ?,
          default_account_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).bind(
        data.max_contract_limit,
        data.rolling_profit_window,
        data.enable_profit_sizing_default ? 1 : 0,
        data.enable_position_sizing ? 1 : 0,
        data.position_sizing_type || 'profit',
        data.account_max_loss_percent || 4.00,
        data.target_premium_min,
        data.target_premium_max,
        data.guideline_delta || -0.10,
        data.strike_width,
        data.default_contracts,
        data.profit_target_percent,
        data.atm_proximity_limit,
        data.time_exit,
        data.default_account_id || null,
        userId
      ).run()
    } else {
      // Insert new config
      await env.DB.prepare(`
        INSERT INTO daily_trade_config (
          user_id,
          max_contract_limit,
          rolling_profit_window,
          enable_profit_sizing_default,
          enable_position_sizing,
          position_sizing_type,
          account_max_loss_percent,
          target_premium_min,
          target_premium_max,
          guideline_delta,
          strike_width,
          default_contracts,
          profit_target_percent,
          atm_proximity_limit,
          time_exit,
          default_account_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId,
        data.max_contract_limit,
        data.rolling_profit_window,
        data.enable_profit_sizing_default ? 1 : 0,
        data.enable_position_sizing ? 1 : 0,
        data.position_sizing_type || 'profit',
        data.account_max_loss_percent || 4.00,
        data.target_premium_min,
        data.target_premium_max,
        data.guideline_delta || -0.10,
        data.strike_width,
        data.default_contracts,
        data.profit_target_percent,
        data.atm_proximity_limit,
        data.time_exit,
        data.default_account_id || null
      ).run()
    }

    return c.json({ success: true, message: 'Configuration saved successfully' })
  } catch (error) {
    console.error('Error saving daily trade config:', error)
    return c.json({ error: 'Failed to save configuration' }, 500)
  }
})

// Reset configuration to defaults
app.post('/api/daily-trade/config/reset', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c

    await env.DB.prepare(`
      DELETE FROM daily_trade_config WHERE user_id = ?
    `).bind(userId).run()

    return c.json({ 
      success: true, 
      message: 'Configuration reset to defaults',
      config: {
        max_contract_limit: 25,
        rolling_profit_window: 50,
        enable_position_sizing: false,
        position_sizing_type: 'profit',
        account_max_loss_percent: 4.00,
        target_premium_min: 10.00,
        target_premium_max: 15.00,
        strike_width: 5,
        default_contracts: 1,
        profit_target_percent: 50,
        atm_proximity_limit: 30,
        time_exit: '14:00:00',
        default_account_id: null
      }
    })
  } catch (error) {
    console.error('Error resetting daily trade config:', error)
    return c.json({ error: 'Failed to reset configuration' }, 500)
  }
})

// ============================================================================
// DAILY TRADES ROUTES
// ============================================================================

// Get all daily trades for user (with optional filters)
app.get('/api/daily-trades', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const date = c.req.query('date') // Optional: filter by specific date
    const isOpen = c.req.query('is_open') // Optional: filter by open/closed

    let query = `
      SELECT dt.*, a.account_name 
      FROM daily_trades dt
      LEFT JOIN accounts a ON dt.account_id = a.id
      WHERE dt.user_id = ?
    `
    const params = [userId]

    if (date) {
      query += ` AND dt.trade_date = ?`
      params.push(date)
    }

    if (isOpen !== undefined) {
      query += ` AND dt.is_open = ?`
      params.push(isOpen === 'true' ? 1 : 0)
    }

    query += ` ORDER BY dt.trade_date DESC, dt.entry_time DESC`

    const result = await env.DB.prepare(query).bind(...params).all()

    return c.json({ trades: result.results || [] })
  } catch (error) {
    console.error('Error fetching daily trades:', error)
    return c.json({ error: 'Failed to fetch trades' }, 500)
  }
})

// Get today's daily trades
app.get('/api/daily-trades/today', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const today = new Date().toISOString().split('T')[0]

    const result = await env.DB.prepare(`
      SELECT dt.*, a.account_name 
      FROM daily_trades dt
      LEFT JOIN accounts a ON dt.account_id = a.id
      WHERE dt.user_id = ? AND dt.trade_date = ?
      ORDER BY dt.entry_time DESC
    `).bind(userId, today).all()

    return c.json({ trades: result.results || [] })
  } catch (error) {
    console.error('Error fetching today trades:', error)
    return c.json({ error: 'Failed to fetch today trades' }, 500)
  }
})

// Create new daily trade
app.post('/api/daily-trades', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const data = await c.req.json()

    // Get default account if not provided
    let accountId = data.account_id
    if (!accountId) {
      const config = await env.DB.prepare(`
        SELECT default_account_id FROM daily_trade_config WHERE user_id = ?
      `).bind(userId).first() as any
      accountId = config?.default_account_id || null
    }

    const result = await env.DB.prepare(`
      INSERT INTO daily_trades (
        user_id, account_id, trade_date, entry_time, strategy_type, contracts, strike_width,
        call_enabled, call_short_strike, call_total_credit,
        put_enabled, put_short_strike, put_total_credit,
        spx_entry_price, vix_entry_price, total_credit, commission, notes, is_open
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      userId,
      accountId,
      data.trade_date,
      data.entry_time,
      data.strategy_type,
      data.contracts,
      data.strike_width || 5,
      data.call_enabled ? 1 : 0,
      data.call_short_strike || null,
      data.call_total_credit || null,
      data.put_enabled ? 1 : 0,
      data.put_short_strike || null,
      data.put_total_credit || null,
      data.spx_entry_price || null,
      data.vix_entry_price || null,
      data.total_credit,
      data.commission || 0,
      data.notes || null
    ).run()

    return c.json({ 
      success: true, 
      id: result.meta.last_row_id,
      message: 'Trade entered successfully' 
    }, 201)
  } catch (error) {
    console.error('Error creating daily trade:', error)
    return c.json({ error: 'Failed to create trade' }, 500)
  }
})

// Update a daily trade
app.put('/api/daily-trades/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const tradeId = c.req.param('id')
    const data = await c.req.json()

    // Check if exit data is provided (for closed trades)
    let updateQuery = `
      UPDATE daily_trades SET
        trade_date = ?,
        entry_time = ?,
        strategy_type = ?,
        contracts = ?,
        strike_width = ?,
        call_enabled = ?,
        call_short_strike = ?,
        call_total_credit = ?,
        put_enabled = ?,
        put_short_strike = ?,
        put_total_credit = ?,
        spx_entry_price = ?,
        vix_entry_price = ?,
        total_credit = ?,
        commission = ?,
        notes = ?`
    
    const bindings: any[] = [
      data.trade_date,
      data.entry_time,
      data.strategy_type || 'IRON_CONDOR',
      data.contracts,
      data.strike_width || 5,
      data.call_enabled ? 1 : 0,
      data.call_short_strike || null,
      data.call_total_credit || 0,
      data.put_enabled ? 1 : 0,
      data.put_short_strike || null,
      data.put_total_credit || 0,
      data.spx_entry_price || null,
      data.vix_entry_price || null,
      data.total_credit || 0,
      data.commission || 1.30,
      data.notes || null
    ]
    
    // Add exit fields if provided
    if (data.exit_time !== undefined) {
      updateQuery += `,
        exit_time = ?,
        total_debit = ?,
        close_commission = ?,
        profit_loss = ?,
        exit_reason = ?`
      
      bindings.push(
        data.exit_time || null,
        data.total_debit || 0,
        data.close_commission || 0,
        data.profit_loss || 0,
        data.exit_reason || 'MANUAL'
      )
    }
    
    updateQuery += `,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`
    
    bindings.push(tradeId, userId)
    
    await env.DB.prepare(updateQuery).bind(...bindings).run()

    return c.json({ 
      success: true,
      message: 'Trade updated successfully' 
    })
  } catch (error) {
    console.error('Error updating daily trade:', error)
    return c.json({ error: 'Failed to update trade' }, 500)
  }
})

// Close a daily trade
app.post('/api/daily-trades/:id/close', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const tradeId = c.req.param('id')
    const data = await c.req.json()

    // First get the trade to calculate P/L
    const trade = await env.DB.prepare(`
      SELECT * FROM daily_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()

    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }

    // Calculate profit/loss
    const exitCost = data.exit_cost || 0
    
    const entryCredit = trade.total_credit * trade.contracts * 100
    const exitDebit = exitCost * trade.contracts * 100
    const entryCommission = trade.commission || 0
    const closeCommission = data.close_commission || 0
    
    const profitLoss = entryCredit - exitDebit - entryCommission - closeCommission

    // Handle notes - append close notes if provided
    let updatedNotes = trade.notes || ''
    if (data.notes && data.notes.trim() !== '') {
      updatedNotes = updatedNotes + '\n' + 'Close: ' + data.notes
    }

    // Map exit reason to database-compatible value
    // EXPIRED_WORTHLESS is shown in UI but stored as MANUAL for DB constraint compatibility
    let exitReason = data.exit_reason || 'MANUAL'
    if (exitReason === 'EXPIRED_WORTHLESS') {
      exitReason = 'MANUAL'
    }

    const result = await env.DB.prepare(`
      UPDATE daily_trades SET
        exit_time = ?,
        total_debit = ?,
        close_commission = ?,
        profit_loss = ?,
        exit_reason = ?,
        is_open = 0,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      data.exit_time,
      exitCost,
      closeCommission,
      profitLoss,
      exitReason,
      updatedNotes,
      tradeId,
      userId
    ).run()
    
    if (!result.success) {
      throw new Error('Database update failed')
    }

    return c.json({ 
      success: true, 
      profit_loss: profitLoss,
      message: 'Trade closed successfully' 
    })
  } catch (error) {
    console.error('Error closing daily trade:', error)
    console.error('Error message:', error.message)
    return c.json({ error: 'Failed to close trade', details: error.message }, 500)
  }
})

// Delete a daily trade
app.delete('/api/daily-trades/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const tradeId = c.req.param('id')

    await env.DB.prepare(`
      DELETE FROM daily_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).run()

    return c.json({ success: true, message: 'Trade deleted successfully' })
  } catch (error) {
    console.error('Error deleting daily trade:', error)
    return c.json({ error: 'Failed to delete trade' }, 500)
  }
})

// Reopen a closed daily trade (clears exit information)
app.put('/api/daily-trades/:id/reopen', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const tradeId = c.req.param('id')

    // Verify trade belongs to user and is currently closed
    const trade = await env.DB.prepare(`
      SELECT id, is_open FROM daily_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()

    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }

    if ((trade as any).is_open === 1) {
      return c.json({ error: 'Trade is already open' }, 400)
    }

    // Reopen the trade by clearing exit information
    await env.DB.prepare(`
      UPDATE daily_trades SET
        is_open = 1,
        exit_time = NULL,
        exit_reason = NULL,
        total_debit = NULL,
        profit_loss = NULL,
        close_commission = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).run()

    return c.json({ success: true, message: 'Trade reopened successfully' })
  } catch (error) {
    console.error('Error reopening daily trade:', error)
    return c.json({ error: 'Failed to reopen trade' }, 500)
  }
})

// Get performance statistics
app.get('/api/daily-trades/stats', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const period = c.req.query('period') || 'all' // all, rolling, month, year
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')) : 50

    let query = `
      SELECT 
        COUNT(*) as total_trades,
        SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
        AVG(CASE WHEN profit_loss > 0 THEN profit_loss ELSE NULL END) as avg_win,
        AVG(CASE WHEN profit_loss < 0 THEN profit_loss ELSE NULL END) as avg_loss,
        SUM(profit_loss) as net_pl,
        AVG(profit_loss) as avg_pl,
        MAX(profit_loss) as best_trade,
        MIN(profit_loss) as worst_trade
      FROM daily_trades
      WHERE user_id = ? AND is_open = 0
    `
    const params = [userId]

    if (period === 'rolling') {
      // For rolling window, use a subquery to get the last N trades
      query = `
        SELECT 
          COUNT(*) as total_trades,
          SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
          AVG(CASE WHEN profit_loss > 0 THEN profit_loss ELSE NULL END) as avg_win,
          AVG(CASE WHEN profit_loss < 0 THEN profit_loss ELSE NULL END) as avg_loss,
          SUM(profit_loss) as net_pl,
          AVG(profit_loss) as avg_pl,
          MAX(profit_loss) as best_trade,
          MIN(profit_loss) as worst_trade
        FROM (
          SELECT profit_loss 
          FROM daily_trades 
          WHERE user_id = ? AND is_open = 0 
          ORDER BY trade_date DESC, entry_time DESC 
          LIMIT ?
        )
      `
      params.length = 0 // Clear params array
      params.push(userId, limit) // Push both userId and limit
    } else if (period === 'month') {
      query += ` AND strftime('%Y-%m', trade_date) = strftime('%Y-%m', 'now')`
    } else if (period === 'year') {
      query += ` AND strftime('%Y', trade_date) = strftime('%Y', 'now')`
    }

    const result = await env.DB.prepare(query).bind(...params).first()

    // Get best trade date
    let bestTradeQuery = `
      SELECT trade_date, entry_time 
      FROM daily_trades 
      WHERE user_id = ? AND is_open = 0 AND profit_loss = ?
    `
    if (period === 'rolling') {
      bestTradeQuery = `
        SELECT trade_date, entry_time 
        FROM (
          SELECT trade_date, entry_time, profit_loss 
          FROM daily_trades 
          WHERE user_id = ? AND is_open = 0 
          ORDER BY trade_date DESC, entry_time DESC 
          LIMIT ?
        )
        WHERE profit_loss = ?
      `
    } else if (period === 'month') {
      bestTradeQuery += ` AND strftime('%Y-%m', trade_date) = strftime('%Y-%m', 'now')`
    } else if (period === 'year') {
      bestTradeQuery += ` AND strftime('%Y', trade_date) = strftime('%Y', 'now')`
    }
    bestTradeQuery += ` LIMIT 1`

    // Get worst trade date
    let worstTradeQuery = `
      SELECT trade_date, entry_time 
      FROM daily_trades 
      WHERE user_id = ? AND is_open = 0 AND profit_loss = ?
    `
    if (period === 'rolling') {
      worstTradeQuery = `
        SELECT trade_date, entry_time 
        FROM (
          SELECT trade_date, entry_time, profit_loss 
          FROM daily_trades 
          WHERE user_id = ? AND is_open = 0 
          ORDER BY trade_date DESC, entry_time DESC 
          LIMIT ?
        )
        WHERE profit_loss = ?
      `
    } else if (period === 'month') {
      worstTradeQuery += ` AND strftime('%Y-%m', trade_date) = strftime('%Y-%m', 'now')`
    } else if (period === 'year') {
      worstTradeQuery += ` AND strftime('%Y', trade_date) = strftime('%Y', 'now')`
    }
    worstTradeQuery += ` LIMIT 1`

    let bestTradeDate = null
    let worstTradeDate = null

    if (result.best_trade !== null) {
      const bestTradeParams = period === 'rolling' 
        ? [userId, limit, result.best_trade]
        : [userId, result.best_trade]
      const bestTradeResult = await env.DB.prepare(bestTradeQuery).bind(...bestTradeParams).first()
      if (bestTradeResult) {
        bestTradeDate = bestTradeResult.trade_date
      }
    }

    if (result.worst_trade !== null) {
      const worstTradeParams = period === 'rolling'
        ? [userId, limit, result.worst_trade]
        : [userId, result.worst_trade]
      const worstTradeResult = await env.DB.prepare(worstTradeQuery).bind(...worstTradeParams).first()
      if (worstTradeResult) {
        worstTradeDate = worstTradeResult.trade_date
      }
    }

    const winRate = result.total_trades > 0 
      ? ((result.winning_trades / result.total_trades) * 100).toFixed(1)
      : 0

    return c.json({ 
      ...result,
      win_rate: winRate,
      best_trade_date: bestTradeDate,
      worst_trade_date: worstTradeDate
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return c.json({ error: 'Failed to fetch statistics' }, 500)
  }
})

// Get chart data for P/L trend visualization
app.get('/api/daily-trades/chart-data', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const period = c.req.query('period') || 'all'
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')) : 50

    let query = `
      SELECT 
        id,
        trade_date,
        entry_time,
        exit_time,
        strategy_type,
        contracts,
        total_credit,
        profit_loss
      FROM daily_trades
      WHERE user_id = ? AND is_open = 0
    `
    const params = [userId]

    if (period === 'rolling') {
      // For rolling window, get the last N trades
      query += ` ORDER BY trade_date DESC, entry_time DESC LIMIT ?`
      params.push(limit)
    } else if (period === 'month') {
      query += ` AND strftime('%Y-%m', trade_date) = strftime('%Y-%m', 'now')
                 ORDER BY trade_date ASC, entry_time ASC`
    } else if (period === 'year') {
      query += ` AND strftime('%Y', trade_date) = strftime('%Y', 'now')
                 ORDER BY trade_date ASC, entry_time ASC`
    } else {
      // All time
      query += ` ORDER BY trade_date ASC, entry_time ASC`
    }

    const result = await env.DB.prepare(query).bind(...params).all()
    
    // For rolling period, reverse the array to show oldest to newest
    const trades = period === 'rolling' ? result.results.reverse() : result.results

    return c.json({ trades })
  } catch (error) {
    console.error('Error fetching chart data:', error)
    return c.json({ error: 'Failed to fetch chart data' }, 500)
  }
})

// Get day of week statistics
app.get('/api/daily-trades/day-stats', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c

    const query = `
      SELECT 
        CASE CAST(strftime('%w', trade_date) AS INTEGER)
          WHEN 0 THEN 'Sunday'
          WHEN 1 THEN 'Monday'
          WHEN 2 THEN 'Tuesday'
          WHEN 3 THEN 'Wednesday'
          WHEN 4 THEN 'Thursday'
          WHEN 5 THEN 'Friday'
          WHEN 6 THEN 'Saturday'
        END as day_name,
        CAST(strftime('%w', trade_date) AS INTEGER) as day_num,
        COUNT(*) as total_trades,
        SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
        SUM(profit_loss) as net_pl,
        AVG(profit_loss) as avg_pl,
        MAX(profit_loss) as best_trade,
        MIN(profit_loss) as worst_trade
      FROM daily_trades
      WHERE user_id = ? AND is_open = 0
      GROUP BY day_num, day_name
      ORDER BY day_num
    `

    const result = await env.DB.prepare(query).bind(userId).all()

    // Calculate win rates and format data
    const dayStats = result.results.map(day => {
      const winRate = day.total_trades > 0 
        ? ((day.winning_trades / day.total_trades) * 100).toFixed(1)
        : 0
      
      return {
        ...day,
        win_rate: winRate
      }
    })

    return c.json({ days: dayStats })
  } catch (error) {
    console.error('Error fetching day stats:', error)
    return c.json({ error: 'Failed to fetch day statistics' }, 500)
  }
})

// ============================================================================
// REPORTS DASHBOARD - NEW TAB-BASED REPORTS
// ============================================================================

// Portfolio Overview Report
app.get('/api/reports/portfolio-overview', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const currentYear = new Date().getFullYear()
    
    // Get current account balances
    const { results: accounts } = await DB.prepare(`
      SELECT id, account_name, account_type, balance_cad, balance_usd, default_currency
      FROM accounts
      WHERE user_id = ?
    `).bind(userId).all()
    
    // Calculate total value
    let totalValueCAD = 0
    let totalValueUSD = 0
    const accountData = []
    
    for (const account of accounts as any[]) {
      // Sum both CAD and USD balances
      const cadBalance = account.balance_cad || 0
      const usdBalance = account.balance_usd || 0
      
      totalValueCAD += cadBalance
      totalValueUSD += usdBalance
      
      // For account breakdown chart, use the default currency balance
      const balance = account.default_currency === 'CAD' ? cadBalance : usdBalance
      accountData.push({
        name: account.account_name,
        value: balance
      })
    }
    
    // Get exchange rate for conversion
    const currentMonth = new Date().getMonth() + 1
    const rates = await DB.prepare(`
      SELECT usd_to_cad, cad_to_usd FROM exchange_rates
      WHERE month = ? AND year = ?
    `).bind(currentMonth, currentYear).first() as any
    
    const usdToCad = rates?.usd_to_cad || 1.35
    const cadToUsd = rates?.cad_to_usd || 0.74
    
    // Store original values
    const originalCAD = totalValueCAD
    const originalUSD = totalValueUSD
    
    // Calculate total in CAD (CAD + USD converted to CAD)
    totalValueCAD = originalCAD + (originalUSD * usdToCad)
    // Calculate total in USD (USD + CAD converted to USD)
    totalValueUSD = originalUSD + (originalCAD * cadToUsd)
    
    const totalValue = totalValueUSD // Keep for backward compatibility

    
    // Get YTD P/L from all closed trades
    const stockPL = await DB.prepare(`
      SELECT COALESCE(SUM(profit_loss), 0) as total_pl
      FROM stock_trades
      WHERE user_id = ? AND is_open = 0 AND close_date LIKE ?
    `).bind(userId, `${currentYear}%`).first() as any
    
    const optionPL = await DB.prepare(`
      SELECT COALESCE(SUM(profit_loss), 0) as total_pl
      FROM option_trades
      WHERE user_id = ? AND is_open = 0 AND close_date LIKE ?
    `).bind(userId, `${currentYear}%`).first() as any
    
    const dailyPL = await DB.prepare(`
      SELECT COALESCE(SUM(profit_loss), 0) as total_pl
      FROM daily_trades
      WHERE user_id = ? AND is_open = 0 AND strftime('%Y', trade_date) = ?
    `).bind(userId, currentYear.toString()).first() as any
    
    // Get YTD dividends
    const dividends = await DB.prepare(`
      SELECT COALESCE(SUM(cba.amount), 0) as total_dividends
      FROM cost_basis_adjustments cba
      WHERE cba.user_id = ?
      AND cba.adjustment_type = 'DIVIDEND'
      AND cba.adjustment_date LIKE ?
    `).bind(userId, `${currentYear}%`).first() as any
    
    const ytdPL = (stockPL?.total_pl || 0) + (optionPL?.total_pl || 0) + (dailyPL?.total_pl || 0) + (dividends?.total_dividends || 0)
    const ytdPercentage = totalValue > 0 ? (ytdPL / totalValue) * 100 : 0
    
    // Get trade statistics
    const closedTrades = await DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as wins,
        AVG(profit_loss) as avg_pl,
        MAX(profit_loss) as best_trade
      FROM (
        SELECT profit_loss FROM stock_trades WHERE user_id = ? AND is_open = 0
        UNION ALL
        SELECT profit_loss FROM option_trades WHERE user_id = ? AND is_open = 0
        UNION ALL
        SELECT profit_loss FROM daily_trades WHERE user_id = ? AND is_open = 0
      )
    `).bind(userId, userId, userId).first() as any
    
    const totalTrades = closedTrades?.total || 0
    const winningTrades = closedTrades?.wins || 0
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0
    
    // Generate monthly P/L data (last 12 months)
    const monthlyPL = []
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date()
      date.setMonth(date.getMonth() - i)
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      const monthStr = month.toString().padStart(2, '0')
      
      const monthlyStockPL = await DB.prepare(`
        SELECT COALESCE(SUM(profit_loss), 0) as pl
        FROM stock_trades
        WHERE user_id = ? AND is_open = 0 AND close_date LIKE ?
      `).bind(userId, `${year}-${monthStr}%`).first() as any
      
      const monthlyOptionPL = await DB.prepare(`
        SELECT COALESCE(SUM(profit_loss), 0) as pl
        FROM option_trades
        WHERE user_id = ? AND is_open = 0 AND close_date LIKE ?
      `).bind(userId, `${year}-${monthStr}%`).first() as any
      
      const monthlyDailyPL = await DB.prepare(`
        SELECT COALESCE(SUM(profit_loss), 0) as pl
        FROM daily_trades
        WHERE user_id = ? AND is_open = 0 AND strftime('%Y-%m', trade_date) = ?
      `).bind(userId, `${year}-${monthStr}`).first() as any
      
      const monthlyDividends = await DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as pl
        FROM cost_basis_adjustments
        WHERE user_id = ? AND adjustment_type = 'DIVIDEND' AND adjustment_date LIKE ?
      `).bind(userId, `${year}-${monthStr}%`).first() as any
      
      const totalMonthlyPL = (monthlyStockPL?.pl || 0) + (monthlyOptionPL?.pl || 0) + (monthlyDailyPL?.pl || 0) + (monthlyDividends?.pl || 0)
      
      monthlyPL.push({
        month: monthNames[month - 1],
        pl: totalMonthlyPL
      })
    }
    
    // Generate portfolio value history - get actual available data based on timeframe
    const timeframe = c.req.query('timeframe') || '12months'
    let limit = 12
    let whereClause = 'WHERE user_id = ?'
    
    if (timeframe === 'ytd') {
      whereClause = `WHERE user_id = ? AND year = ${currentYear}`
      limit = 12
    } else if (timeframe === 'all') {
      limit = 999 // Get all available data
    }
    
    // Query to get USD and CAD totals separately for each month
    const { results: availableMonths } = await DB.prepare(`
      SELECT 
        year, 
        month,
        SUM(CASE WHEN currency = 'USD' THEN balance ELSE balance * exchange_rate_to_usd END) as total_usd,
        SUM(CASE WHEN currency = 'CAD' THEN balance ELSE balance * exchange_rate_to_cad END) as total_cad,
        MAX(exchange_rate_to_cad) as usd_to_cad,
        MAX(exchange_rate_to_usd) as cad_to_usd
      FROM account_balance_history
      ${whereClause}
      GROUP BY year, month
      ORDER BY year DESC, month DESC
      LIMIT ${limit}
    `).bind(userId).all() as any
    
    // Build portfolio value array from available data
    const portfolioValue = []
    
    if (availableMonths && availableMonths.length > 0) {
      // We have historical data - use it (reverse to show oldest to newest)
      for (let i = availableMonths.length - 1; i >= 0; i--) {
        const record = availableMonths[i]
        const usdToCad = record.usd_to_cad || 1.35
        
        portfolioValue.push({
          date: `${monthNames[record.month - 1]} ${record.year}`,
          valueUSD: record.total_usd || 0,
          valueCAD: record.total_cad || 0,
          exchangeRate: usdToCad
        })
      }
    } else {
      // No historical data - generate placeholder months with current value
      for (let i = 11; i >= 0; i--) {
        const date = new Date()
        date.setMonth(date.getMonth() - i)
        const year = date.getFullYear()
        const month = date.getMonth() + 1
        
        portfolioValue.push({
          date: `${monthNames[month - 1]} ${year}`,
          valueUSD: totalValueUSD,
          valueCAD: totalValueCAD,
          exchangeRate: usdToCad
        })
      }
    }
    
    return c.json({
      metrics: {
        totalValue,
        totalValueCAD,
        totalValueUSD,
        ytdPL,
        ytdPercentage,
        winRate,
        totalTrades,
        winningTrades,
        avgPL: closedTrades?.avg_pl || 0,
        bestTrade: closedTrades?.best_trade || 0
      },
      accounts: accountData,
      monthlyPL,
      portfolioValue
    })
    
  } catch (error: any) {
    console.error('Portfolio overview error:', error)
    console.error('Error stack:', error.stack)
    console.error('Error message:', error.message)
    return c.json({ error: 'Failed to generate portfolio overview', details: error.message }, 500)
  }
})

// ============================================================================
// P/L REPORTING ROUTES
// ============================================================================

app.get('/api/reports/pl', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const year = c.req.query('year')
  const month = c.req.query('month')
  
  // Get stock trades P/L
  let stockQuery = `
    SELECT 
      strftime('%Y', trade_date) as year,
      strftime('%m', trade_date) as month,
      account_type,
      SUM(CASE WHEN trade_type = 'SELL' THEN (price * quantity) ELSE -(price * quantity) END) as total
    FROM stock_trades
    WHERE user_id = ?
  `
  
  const stockParams = [userId]
  
  if (year) {
    stockQuery += ` AND strftime('%Y', trade_date) = ?`
    stockParams.push(year)
  }
  
  if (month) {
    stockQuery += ` AND strftime('%m', trade_date) = ?`
    stockParams.push(month.padStart(2, '0'))
  }
  
  stockQuery += ` GROUP BY year, month, account_type`
  
  const stockPL = await c.env.DB.prepare(stockQuery).bind(...stockParams).all()
  
  // Get option trades P/L
  let optionQuery = `
    SELECT 
      strftime('%Y', trade_date) as year,
      strftime('%m', trade_date) as month,
      account_type,
      strategy_type,
      SUM(premium * quantity * 100) as total_premium,
      SUM(CASE WHEN profit_loss IS NOT NULL THEN profit_loss ELSE 0 END) as realized_pl
    FROM option_trades
    WHERE user_id = ?
  `
  
  const optionParams = [userId]
  
  if (year) {
    optionQuery += ` AND strftime('%Y', trade_date) = ?`
    optionParams.push(year)
  }
  
  if (month) {
    optionQuery += ` AND strftime('%m', trade_date) = ?`
    optionParams.push(month.padStart(2, '0'))
  }
  
  optionQuery += ` GROUP BY year, month, account_type, strategy_type`
  
  const optionPL = await c.env.DB.prepare(optionQuery).bind(...optionParams).all()
  
  return c.json({
    stocks: stockPL.results,
    options: optionPL.results
  })
})

// P/L Summary Report - detailed breakdown by asset type, account type, and time period
app.get('/api/reports/pl-summary', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const period = c.req.query('period') || 'ytd' // mtd, qtd, ytd, 12months, all
    
    console.log(`P/L Summary request: userId=${userId}, period=${period}`)
    
    // Calculate date range based on period
    const now = new Date()
    let startDate = ''
    
    switch (period) {
      case 'mtd':
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        break
      case 'qtd':
        const quarter = Math.floor(now.getMonth() / 3)
        const quarterStartMonth = quarter * 3 + 1
        startDate = `${now.getFullYear()}-${String(quarterStartMonth).padStart(2, '0')}-01`
        break
      case 'ytd':
        startDate = `${now.getFullYear()}-01-01`
        break
      case '12months':
        const last12Months = new Date(now)
        last12Months.setMonth(last12Months.getMonth() - 12)
        startDate = last12Months.toISOString().split('T')[0]
        break
      case 'all':
        startDate = '1900-01-01'
        break
    }
    
    console.log(`Date range: startDate=${startDate}`)
    
    // Get closed stock positions with calculated P/L
    console.log('Fetching closed stock positions...')
    const stockPositions = await DB.prepare(`
      SELECT 
        sh.id as holding_id,
        sh.closed_date as close_date,
        a.account_type,
        'Stocks' as asset_type,
        sh.total_shares,
        sh.average_price
      FROM stock_holdings sh
      JOIN accounts a ON sh.account_id = a.id
      WHERE sh.user_id = ?
        AND sh.is_open = 0
        AND sh.closed_date IS NOT NULL
        AND sh.closed_date >= ?
      ORDER BY sh.closed_date DESC
    `).bind(userId, startDate).all()
    
    // Calculate P/L for each closed stock position
    const stockTrades = await Promise.all(stockPositions.results.map(async (holding: any) => {
      // Get all transactions for this holding
      const transactions = await DB.prepare(`
        SELECT transaction_type, shares, price_per_share, commission
        FROM stock_transactions
        WHERE holding_id = ?
        ORDER BY transaction_date ASC
      `).bind(holding.holding_id).all()
      
      let totalBuyValue = 0
      let totalBuyCommissions = 0
      let totalSellValue = 0
      let totalSellCommissions = 0
      
      transactions.results.forEach((tx: any) => {
        if (tx.transaction_type === 'BUY') {
          totalBuyValue += tx.shares * tx.price_per_share
          totalBuyCommissions += tx.commission || 0
        } else if (tx.transaction_type === 'SELL') {
          totalSellValue += tx.shares * tx.price_per_share
          totalSellCommissions += tx.commission || 0
        }
      })
      
      // P/L = Sale Proceeds - Cost Basis - All Commissions
      const profitLoss = totalSellValue - totalBuyValue - totalBuyCommissions - totalSellCommissions
      
      return {
        profit_loss: profitLoss,
        close_date: holding.close_date,
        account_type: holding.account_type,
        asset_type: holding.asset_type
      }
    }))
    console.log(`Stock positions fetched and calculated: ${stockTrades.length}`)
    
    // Get option trades
    console.log('Fetching option trades...')
    const optionTrades = await DB.prepare(`
      SELECT 
        ot.profit_loss,
        ot.close_date,
        ot.account_type,
        'Options' as asset_type
      FROM option_trades ot
      WHERE ot.user_id = ?
        AND ot.is_open = 0
        AND ot.close_date IS NOT NULL
        AND ot.close_date >= ?
        AND ot.profit_loss IS NOT NULL
      ORDER BY ot.close_date DESC
    `).bind(userId, startDate).all()
    console.log(`Option trades fetched: ${optionTrades.results.length}`)
    
    // Get daily trades
    console.log('Fetching daily trades...')
    const dailyTrades = await DB.prepare(`
      SELECT 
        dt.profit_loss,
        dt.trade_date as close_date,
        COALESCE(a.account_type, 'Unknown') as account_type,
        'Daily Trades' as asset_type
      FROM daily_trades dt
      LEFT JOIN accounts a ON dt.account_id = a.id
      WHERE dt.user_id = ?
        AND dt.trade_date >= ?
        AND dt.profit_loss IS NOT NULL
      ORDER BY dt.trade_date DESC
    `).bind(userId, startDate).all()
    console.log(`Daily trades fetched: ${dailyTrades.results.length}`)
    
    // Get dividends
    console.log('Fetching dividends...')
    const dividends = await DB.prepare(`
      SELECT 
        cba.amount as profit_loss,
        cba.adjustment_date as close_date,
        COALESCE(a.account_type, 'Unknown') as account_type,
        'Dividends' as asset_type
      FROM cost_basis_adjustments cba
      INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
      INNER JOIN accounts a ON sh.account_id = a.id
      WHERE cba.user_id = ?
        AND cba.adjustment_type = 'DIVIDEND'
        AND cba.adjustment_date >= ?
      ORDER BY cba.adjustment_date DESC
    `).bind(userId, startDate).all()
    console.log(`Dividends fetched: ${dividends.results.length}`)
    
    // Combine all trades
    const allTrades = [
      ...stockTrades,
      ...optionTrades.results,
      ...dailyTrades.results,
      ...dividends.results
    ]
    
    // Calculate overall metrics
    const totalPL = allTrades.reduce((sum, t: any) => sum + (t.profit_loss || 0), 0)
    const totalTrades = allTrades.length
    const winningTrades = allTrades.filter((t: any) => t.profit_loss > 0).length
    const losingTrades = allTrades.filter((t: any) => t.profit_loss < 0).length
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0
    const avgTrade = totalTrades > 0 ? totalPL / totalTrades : 0
    const bestTrade = allTrades.length > 0 ? Math.max(...allTrades.map((t: any) => t.profit_loss || 0)) : 0
    const worstTrade = allTrades.length > 0 ? Math.min(...allTrades.map((t: any) => t.profit_loss || 0)) : 0
    
    // Group by asset type
    const byAssetType: any = {}
    allTrades.forEach((trade: any) => {
      const assetType = trade.asset_type
      if (!byAssetType[assetType]) {
        byAssetType[assetType] = {
          trades: [],
          totalPL: 0,
          totalTrades: 0,
          wins: 0,
          losses: 0
        }
      }
      byAssetType[assetType].trades.push(trade)
      byAssetType[assetType].totalPL += trade.profit_loss || 0
      byAssetType[assetType].totalTrades += 1
      if (trade.profit_loss > 0) byAssetType[assetType].wins += 1
      if (trade.profit_loss < 0) byAssetType[assetType].losses += 1
    })
    
    // Format asset type data
    const assetTypeData = Object.keys(byAssetType).map(type => ({
      name: type,
      pl: byAssetType[type].totalPL,
      trades: byAssetType[type].totalTrades,
      wins: byAssetType[type].wins,
      losses: byAssetType[type].losses,
      winRate: byAssetType[type].totalTrades > 0 
        ? (byAssetType[type].wins / byAssetType[type].totalTrades) * 100 
        : 0
    }))
    
    // Group by account type
    const byAccountType: any = {}
    allTrades.forEach((trade: any) => {
      const accountType = trade.account_type || 'Unknown'
      if (!byAccountType[accountType]) {
        byAccountType[accountType] = {
          trades: [],
          totalPL: 0,
          totalTrades: 0,
          wins: 0,
          losses: 0
        }
      }
      byAccountType[accountType].trades.push(trade)
      byAccountType[accountType].totalPL += trade.profit_loss || 0
      byAccountType[accountType].totalTrades += 1
      if (trade.profit_loss > 0) byAccountType[accountType].wins += 1
      if (trade.profit_loss < 0) byAccountType[accountType].losses += 1
    })
    
    // Format account type data
    const accountTypeData = Object.keys(byAccountType).map(type => ({
      name: type,
      pl: byAccountType[type].totalPL,
      trades: byAccountType[type].totalTrades,
      wins: byAccountType[type].wins,
      losses: byAccountType[type].losses,
      winRate: byAccountType[type].totalTrades > 0 
        ? (byAccountType[type].wins / byAccountType[type].totalTrades) * 100 
        : 0
    }))
    
    // Group by month for trend chart
    const byMonth: any = {}
    allTrades.forEach((trade: any) => {
      if (!trade.close_date) return
      const monthKey = trade.close_date.substring(0, 7) // YYYY-MM
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = 0
      }
      byMonth[monthKey] += trade.profit_loss || 0
    })
    
    // Format monthly data
    const monthlyData = Object.keys(byMonth)
      .sort()
      .map(month => ({
        month,
        pl: byMonth[month]
      }))
    
    console.log(`P/L Summary result: ${totalTrades} trades, $${totalPL.toFixed(2)} total P/L`)
    console.log(`Asset types: ${assetTypeData.length}, Account types: ${accountTypeData.length}, Months: ${monthlyData.length}`)
    
    return c.json({
      summary: {
        totalPL,
        totalTrades,
        winningTrades,
        losingTrades,
        winRate,
        avgTrade,
        bestTrade,
        worstTrade
      },
      byAssetType: assetTypeData,
      byAccountType: accountTypeData,
      monthlyTrend: monthlyData
    })
  } catch (error) {
    console.error('P/L Summary error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error: error
    })
    return c.json({ 
      error: 'Failed to generate P/L summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})
// Strategy Analysis Report - comprehensive strategy performance comparison
app.get('/api/reports/strategy-analysis', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const period = c.req.query('period') || 'ytd'
    
    console.log(`Strategy Analysis request: userId=${userId}, period=${period}`)
    
    // Calculate date range
    const now = new Date()
    let startDate = ''
    
    switch (period) {
      case 'ytd':
        startDate = `${now.getFullYear()}-01-01`
        break
      case '12months':
        const last12Months = new Date(now)
        last12Months.setMonth(last12Months.getMonth() - 12)
        startDate = last12Months.toISOString().split('T')[0]
        break
      case 'all':
        startDate = '1900-01-01'
        break
    }
    
    // Get all closed trades with strategy information
    const optionTrades = await DB.prepare(`
      SELECT 
        ot.profit_loss,
        ot.close_date,
        ot.strategy_type,
        ot.commission,
        ot.close_commission
      FROM option_trades ot
      WHERE ot.user_id = ?
        AND ot.is_open = 0
        AND ot.close_date IS NOT NULL
        AND ot.close_date >= ?
        AND ot.profit_loss IS NOT NULL
      ORDER BY ot.close_date ASC
    `).bind(userId, startDate).all()
    
    const dailyTrades = await DB.prepare(`
      SELECT 
        dt.profit_loss,
        dt.trade_date as close_date,
        dt.strategy_type,
        dt.commission
      FROM daily_trades dt
      WHERE dt.user_id = ?
        AND dt.trade_date >= ?
        AND dt.profit_loss IS NOT NULL
      ORDER BY dt.trade_date ASC
    `).bind(userId, startDate).all()
    
    // Combine all trades
    const allTrades = [
      ...optionTrades.results.map((t: any) => ({
        ...t,
        asset_type: 'Options'
      })),
      ...dailyTrades.results.map((t: any) => ({
        ...t,
        asset_type: 'Daily Trades'
      }))
    ]
    
    console.log(`Total trades for analysis: ${allTrades.length}`)
    
    // Group by strategy
    const byStrategy: any = {}
    allTrades.forEach((trade: any) => {
      const strategy = trade.strategy_type || 'Other'
      if (!byStrategy[strategy]) {
        byStrategy[strategy] = {
          trades: [],
          pnl: []
        }
      }
      byStrategy[strategy].trades.push(trade)
      byStrategy[strategy].pnl.push(trade.profit_loss || 0)
    })
    
    // Calculate statistics for each strategy
    const strategyData = Object.keys(byStrategy).map(strategy => {
      const trades = byStrategy[strategy].trades
      const pnl = byStrategy[strategy].pnl
      
      const totalPL = pnl.reduce((sum: number, val: number) => sum + val, 0)
      const wins = pnl.filter((val: number) => val > 0).length
      const losses = pnl.filter((val: number) => val < 0).length
      const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0
      const avgPL = trades.length > 0 ? totalPL / trades.length : 0
      const bestTrade = trades.length > 0 ? Math.max(...pnl) : 0
      const worstTrade = trades.length > 0 ? Math.min(...pnl) : 0
      
      // Calculate Sharpe Ratio (simplified)
      const mean = avgPL
      const variance = pnl.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / (pnl.length || 1)
      const stdDev = Math.sqrt(variance)
      const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0 // Annualized
      
      return {
        strategy,
        trades: trades.length,
        totalPL,
        avgPL,
        wins,
        losses,
        winRate,
        bestTrade,
        worstTrade,
        sharpe
      }
    })
    
    // Calculate overall portfolio metrics
    const allPnl = allTrades.map((t: any) => t.profit_loss || 0)
    const totalPL = allPnl.reduce((sum: number, val: number) => sum + val, 0)
    const totalTrades = allTrades.length
    const wins = allPnl.filter((val: number) => val > 0).length
    const losses = allPnl.filter((val: number) => val < 0).length
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0
    
    // Calculate cumulative returns for drawdown
    let cumPL = 0
    let peak = 0
    let maxDrawdown = 0
    const cumulativeReturns = allTrades.map((trade: any) => {
      cumPL += trade.profit_loss || 0
      if (cumPL > peak) peak = cumPL
      const drawdown = peak > 0 ? ((peak - cumPL) / peak) * 100 : 0
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
      return { date: trade.close_date, cumPL, peak, drawdown }
    })
    
    // Calculate Sharpe Ratio for overall portfolio
    const mean = totalTrades > 0 ? totalPL / totalTrades : 0
    const variance = allPnl.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / (totalTrades || 1)
    const stdDev = Math.sqrt(variance)
    const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0
    
    // Group by month for heatmap
    const byMonth: any = {}
    allTrades.forEach((trade: any) => {
      if (!trade.close_date) return
      const monthKey = trade.close_date.substring(0, 7) // YYYY-MM
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = 0
      }
      byMonth[monthKey] += trade.profit_loss || 0
    })
    
    const monthlyData = Object.keys(byMonth)
      .sort()
      .map(month => ({
        month,
        pl: byMonth[month]
      }))
    
    // Calculate total return percentage (simplified - would need starting capital)
    // Using arbitrary $100k starting capital for demonstration
    const startingCapital = 100000
    const totalReturn = (totalPL / startingCapital) * 100
    
    console.log(`Strategy Analysis complete: ${strategyData.length} strategies, ${totalTrades} trades`)
    
    return c.json({
      overall: {
        totalPL,
        totalReturn,
        totalTrades,
        wins,
        losses,
        winRate,
        sharpe,
        maxDrawdown
      },
      strategies: strategyData,
      monthlyData,
      cumulativeReturns: cumulativeReturns.slice(-100) // Last 100 data points
    })
  } catch (error) {
    console.error('Strategy Analysis error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return c.json({ 
      error: 'Failed to generate strategy analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Performance Analysis endpoint - Portfolio growth, rolling returns, drawdown
app.get('/api/reports/performance', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const period = c.req.query('period') || 'ytd'
    
    console.log(`Performance Analysis request: userId=${userId}, period=${period}`)
    
    // Calculate date range
    const now = new Date()
    let startDate = ''
    
    switch (period) {
      case 'ytd':
        startDate = `${now.getFullYear()}-01-01`
        break
      case '1year':
        const oneYearAgo = new Date(now)
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
        startDate = oneYearAgo.toISOString().split('T')[0]
        break
      case '3years':
        const threeYearsAgo = new Date(now)
        threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)
        startDate = threeYearsAgo.toISOString().split('T')[0]
        break
      case 'all':
        startDate = '1900-01-01'
        break
    }
    
    // Get account balance history for portfolio value over time
    const balanceHistory = await DB.prepare(`
      SELECT 
        month,
        year,
        SUM(balance_cad + (balance_usd * 1.4)) as total_value
      FROM account_balances
      WHERE user_id = ?
      GROUP BY year, month
      ORDER BY year ASC, month ASC
    `).bind(userId).all()
    
    // Get all closed trades for P/L calculations
    const stockTrades = await DB.prepare(`
      SELECT 
        st.profit_loss,
        st.close_date,
        st.trade_date
      FROM stock_trades st
      WHERE st.user_id = ?
        AND st.is_open = 0
        AND st.close_date IS NOT NULL
        AND st.close_date >= ?
        AND st.profit_loss IS NOT NULL
      ORDER BY st.close_date ASC
    `).bind(userId, startDate).all()
    
    const optionTrades = await DB.prepare(`
      SELECT 
        ot.profit_loss,
        ot.close_date,
        ot.trade_date
      FROM option_trades ot
      WHERE ot.user_id = ?
        AND ot.is_open = 0
        AND ot.close_date IS NOT NULL
        AND ot.close_date >= ?
        AND ot.profit_loss IS NOT NULL
      ORDER BY ot.close_date ASC
    `).bind(userId, startDate).all()
    
    const dailyTrades = await DB.prepare(`
      SELECT 
        dt.profit_loss,
        dt.trade_date as close_date,
        dt.trade_date
      FROM daily_trades dt
      WHERE dt.user_id = ?
        AND dt.trade_date >= ?
        AND dt.profit_loss IS NOT NULL
      ORDER BY dt.trade_date ASC
    `).bind(userId, startDate).all()
    
    const dividends = await DB.prepare(`
      SELECT 
        cba.amount as profit_loss,
        cba.adjustment_date as close_date,
        cba.adjustment_date as trade_date
      FROM cost_basis_adjustments cba
      WHERE cba.user_id = ?
        AND cba.adjustment_type = 'DIVIDEND'
        AND cba.adjustment_date >= ?
      ORDER BY cba.adjustment_date ASC
    `).bind(userId, startDate).all()
    
    // Combine all trades
    const allTrades = [
      ...stockTrades.results,
      ...optionTrades.results,
      ...dailyTrades.results,
      ...dividends.results
    ].sort((a: any, b: any) => {
      const dateA = a.close_date || a.trade_date
      const dateB = b.close_date || b.trade_date
      return dateA.localeCompare(dateB)
    })
    
    console.log(`Total trades for performance: ${allTrades.length}`)
    
    // Calculate cumulative P/L over time for portfolio growth
    let cumulativePL = 0
    let peak = 0
    const portfolioGrowth: any[] = []
    const drawdownData: any[] = []
    
    allTrades.forEach((trade: any) => {
      cumulativePL += trade.profit_loss || 0
      if (cumulativePL > peak) peak = cumulativePL
      
      const drawdownPercent = peak > 0 ? ((peak - cumulativePL) / peak) * 100 : 0
      
      portfolioGrowth.push({
        date: trade.close_date || trade.trade_date,
        value: cumulativePL,
        peak: peak
      })
      
      drawdownData.push({
        date: trade.close_date || trade.trade_date,
        drawdown: -drawdownPercent // Negative for chart display
      })
    })
    
    // Calculate rolling returns (30-day, 90-day, 1-year)
    const rollingReturns: any = {
      daily: [],
      monthly: [],
      quarterly: []
    }
    
    // Group trades by date for daily returns
    const tradesByDate: any = {}
    allTrades.forEach((trade: any) => {
      const date = trade.close_date || trade.trade_date
      if (!tradesByDate[date]) {
        tradesByDate[date] = []
      }
      tradesByDate[date].push(trade.profit_loss || 0)
    })
    
    // Calculate daily returns
    const dates = Object.keys(tradesByDate).sort()
    let runningBalance = 100000 // Starting capital assumption
    
    dates.forEach(date => {
      const dayPL = tradesByDate[date].reduce((sum: number, pl: number) => sum + pl, 0)
      const prevBalance = runningBalance
      runningBalance += dayPL
      const dailyReturn = prevBalance > 0 ? (dayPL / prevBalance) * 100 : 0
      
      rollingReturns.daily.push({
        date,
        return: dailyReturn,
        pl: dayPL
      })
    })
    
    // Calculate 30-day rolling returns
    const rolling30 = []
    for (let i = 29; i < dates.length; i++) {
      const window = dates.slice(i - 29, i + 1)
      const windowPL = window.reduce((sum, d) => {
        return sum + tradesByDate[d].reduce((s: number, pl: number) => s + pl, 0)
      }, 0)
      rolling30.push({
        date: dates[i],
        return: (windowPL / 100000) * 100 // Percentage
      })
    }
    
    // Calculate monthly aggregates
    const byMonth: any = {}
    allTrades.forEach((trade: any) => {
      const date = trade.close_date || trade.trade_date
      const month = date.substring(0, 7) // YYYY-MM
      if (!byMonth[month]) {
        byMonth[month] = { pl: 0, trades: 0 }
      }
      byMonth[month].pl += trade.profit_loss || 0
      byMonth[month].trades++
    })
    
    Object.keys(byMonth).sort().forEach((month, idx) => {
      const startingBalance = 100000 + (idx > 0 ? Object.keys(byMonth).slice(0, idx).reduce((sum, m) => sum + byMonth[m].pl, 0) : 0)
      const monthReturn = startingBalance > 0 ? (byMonth[month].pl / startingBalance) * 100 : 0
      
      rollingReturns.monthly.push({
        month,
        return: monthReturn,
        pl: byMonth[month].pl,
        trades: byMonth[month].trades
      })
    })
    
    // Calculate max drawdown stats
    const maxDrawdown = drawdownData.length > 0 
      ? Math.min(...drawdownData.map((d: any) => d.drawdown))
      : 0
    
    const maxDrawdownDate = drawdownData.length > 0
      ? drawdownData.find((d: any) => d.drawdown === maxDrawdown)?.date
      : null
    
    // Calculate recovery stats
    let inDrawdown = false
    let drawdownStart = null
    let drawdownEnd = null
    let longestDrawdown = 0
    let currentDrawdownDays = 0
    
    drawdownData.forEach((point: any, idx: number) => {
      if (point.drawdown < -0.1 && !inDrawdown) {
        inDrawdown = true
        drawdownStart = point.date
        currentDrawdownDays = 0
      } else if (point.drawdown >= -0.1 && inDrawdown) {
        inDrawdown = false
        drawdownEnd = point.date
        if (currentDrawdownDays > longestDrawdown) {
          longestDrawdown = currentDrawdownDays
        }
        currentDrawdownDays = 0
      }
      
      if (inDrawdown) {
        currentDrawdownDays++
      }
    })
    
    // Summary statistics
    const totalPL = cumulativePL
    const totalReturn = (totalPL / 100000) * 100
    const totalTrades = allTrades.length
    const avgTradeReturn = totalTrades > 0 ? (totalPL / totalTrades / 100000) * 100 : 0
    
    // Volatility (standard deviation of returns)
    const returns = rollingReturns.daily.map((d: any) => d.return)
    const avgReturn = returns.length > 0 ? returns.reduce((sum: number, r: number) => sum + r, 0) / returns.length : 0
    const variance = returns.length > 0 
      ? returns.reduce((sum: number, r: number) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      : 0
    const volatility = Math.sqrt(variance) * Math.sqrt(252) // Annualized
    
    // Sharpe ratio
    const sharpeRatio = volatility > 0 ? (avgReturn * 252) / volatility : 0
    
    console.log(`Performance analysis complete: ${portfolioGrowth.length} data points, max DD: ${maxDrawdown.toFixed(2)}%`)
    
    return c.json({
      summary: {
        totalPL,
        totalReturn,
        totalTrades,
        avgTradeReturn,
        maxDrawdown: -maxDrawdown, // Convert back to positive
        maxDrawdownDate,
        longestDrawdown,
        volatility,
        sharpeRatio
      },
      portfolioGrowth: portfolioGrowth.slice(-365), // Last 365 days max
      drawdownData: drawdownData.slice(-365),
      rollingReturns: {
        rolling30: rolling30.slice(-180), // Last 180 days
        monthly: rollingReturns.monthly
      },
      balanceHistory: balanceHistory.results
    })
  } catch (error) {
    console.error('Performance Analysis error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return c.json({ 
      error: 'Failed to generate performance analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Position Analysis endpoint - Top holdings, sector allocation, concentration
app.get('/api/reports/positions', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    
    console.log(`Position Analysis request: userId=${userId}`)
    
    // Get all open stock positions with company details from stock_holdings
    const stockPositions = await DB.prepare(`
      SELECT 
        sh.ticker,
        a.account_type,
        sh.total_shares as quantity,
        sh.average_price as avg_price,
        sh.opened_date as trade_date,
        c.company_name,
        c.sector,
        c.industry,
        c.market_cap,
        (sh.total_shares * sh.average_price) as position_value
      FROM stock_holdings sh
      JOIN accounts a ON sh.account_id = a.id
      LEFT JOIN companies c ON sh.company_id = c.id
      WHERE sh.user_id = ?
        AND sh.is_open = 1
      ORDER BY (sh.total_shares * sh.average_price) DESC
    `).bind(userId).all()
    
    console.log(`Found ${stockPositions.results.length} open stock positions`)
    
    // Get current account balances for total portfolio value
    const accounts = await DB.prepare(`
      SELECT 
        account_type,
        balance_cad,
        balance_usd,
        cash_balance_usd
      FROM account_balances
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(userId).all()
    
    // Get latest balance per account type
    const accountMap = new Map()
    accounts.results.forEach((acc: any) => {
      if (!accountMap.has(acc.account_type)) {
        accountMap.set(acc.account_type, acc)
      }
    })
    
    // Calculate total portfolio value (using 1.4 as CAD/USD rate)
    const exchangeRate = 1.4
    let totalPortfolioValue = 0
    accountMap.forEach((acc: any) => {
      totalPortfolioValue += (acc.balance_cad || 0) + ((acc.balance_usd || 0) * exchangeRate)
    })
    
    // If no account balances, use sum of position values
    if (totalPortfolioValue === 0) {
      totalPortfolioValue = stockPositions.results.reduce((sum: number, pos: any) => sum + (pos.position_value || 0), 0)
    }
    
    console.log(`Total portfolio value: $${totalPortfolioValue.toFixed(2)}`)
    
    // Calculate position metrics with cost basis adjustments
    const positions = await Promise.all(stockPositions.results.map(async (pos: any) => {
      const value = pos.position_value || 0
      const weight = totalPortfolioValue > 0 ? (value / totalPortfolioValue) * 100 : 0
      
      // Get cost basis adjustments for this position (by ticker and account)
      // Note: We need to get the holding_id first
      const holding = await DB.prepare(`
        SELECT id FROM stock_holdings
        WHERE user_id = ? AND ticker = ? AND account_id = (
          SELECT id FROM accounts WHERE user_id = ? AND account_type = ?
        ) AND is_open = 1
      `).bind(userId, pos.ticker, userId, pos.account_type).first()
      
      let totalAdjustments = 0
      if (holding) {
        const adjustments = await DB.prepare(`
          SELECT COALESCE(SUM(amount), 0) as total
          FROM cost_basis_adjustments
          WHERE holding_id = ? AND adjustment_type IN ('DIVIDEND', 'COVERED_CALL')
        `).bind(holding.id).first()
        totalAdjustments = adjustments?.total || 0
      }
      
      const totalCostBasis = (pos.avg_price * pos.quantity) - totalAdjustments
      const costBasisPerShare = pos.quantity > 0 ? totalCostBasis / pos.quantity : 0
      
      return {
        ticker: pos.ticker,
        companyName: pos.company_name || pos.ticker,
        quantity: pos.quantity,
        avgPrice: pos.avg_price,
        costBasis: costBasisPerShare,
        value: value,
        weight: weight,
        sector: pos.sector || 'Unknown',
        industry: pos.industry || 'Unknown',
        accountType: pos.account_type,
        tradeDate: pos.trade_date,
        adjustments: totalAdjustments
      }
    }))
    
    // Top holdings (top 10 by value)
    const topHoldings = positions.slice(0, 10)
    
    // Calculate sector allocation
    const sectorMap = new Map()
    positions.forEach(pos => {
      const sector = pos.sector || 'Unknown'
      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, { value: 0, count: 0 })
      }
      const current = sectorMap.get(sector)
      sectorMap.set(sector, {
        value: current.value + pos.value,
        count: current.count + 1
      })
    })
    
    const sectorAllocation = Array.from(sectorMap.entries()).map(([sector, data]: [string, any]) => ({
      sector,
      value: data.value,
      weight: totalPortfolioValue > 0 ? (data.value / totalPortfolioValue) * 100 : 0,
      positions: data.count
    })).sort((a, b) => b.value - a.value)
    
    // Calculate industry allocation (top 10)
    const industryMap = new Map()
    positions.forEach(pos => {
      const industry = pos.industry || 'Unknown'
      if (!industryMap.has(industry)) {
        industryMap.set(industry, { value: 0, count: 0 })
      }
      const current = industryMap.get(industry)
      industryMap.set(industry, {
        value: current.value + pos.value,
        count: current.count + 1
      })
    })
    
    const industryAllocation = Array.from(industryMap.entries()).map(([industry, data]: [string, any]) => ({
      industry,
      value: data.value,
      weight: totalPortfolioValue > 0 ? (data.value / totalPortfolioValue) * 100 : 0,
      positions: data.count
    })).sort((a, b) => b.value - a.value).slice(0, 10)
    
    // Get all accounts to ensure comprehensive allocation
    const allAccounts = await DB.prepare(`
      SELECT DISTINCT account_type
      FROM accounts
      WHERE user_id = ?
      ORDER BY account_type
    `).bind(userId).all()
    
    // Calculate account allocation - include ALL accounts
    const accountAllocationMap = new Map()
    
    // Initialize all accounts with 0 values
    allAccounts.results.forEach((acc: any) => {
      accountAllocationMap.set(acc.account_type, { value: 0, count: 0 })
    })
    
    // Add actual position values
    positions.forEach(pos => {
      const accountType = pos.accountType || 'Unknown'
      if (!accountAllocationMap.has(accountType)) {
        accountAllocationMap.set(accountType, { value: 0, count: 0 })
      }
      const current = accountAllocationMap.get(accountType)
      accountAllocationMap.set(accountType, {
        value: current.value + pos.value,
        count: current.count + 1
      })
    })
    
    const accountAllocation = Array.from(accountAllocationMap.entries()).map(([account, data]: [string, any]) => ({
      accountType: account,
      value: data.value,
      weight: totalPortfolioValue > 0 ? (data.value / totalPortfolioValue) * 100 : 0,
      positions: data.count
    })).sort((a, b) => b.value - a.value)
    
    // Calculate concentration metrics
    const top5Value = positions.slice(0, 5).reduce((sum, pos) => sum + pos.value, 0)
    const top10Value = positions.slice(0, 10).reduce((sum, pos) => sum + pos.value, 0)
    const top5Concentration = totalPortfolioValue > 0 ? (top5Value / totalPortfolioValue) * 100 : 0
    const top10Concentration = totalPortfolioValue > 0 ? (top10Value / totalPortfolioValue) * 100 : 0
    
    // Herfindahl-Hirschman Index (HHI) - measure of concentration
    // 0-1500: low concentration, 1500-2500: moderate, >2500: high concentration
    const hhi = positions.reduce((sum, pos) => sum + Math.pow(pos.weight, 2), 0)
    
    // Calculate diversification score (inverse of concentration)
    const diversificationScore = positions.length > 0 ? Math.min(100, (positions.length / 20) * 100) : 0
    
    // Risk metrics
    const largestPosition = positions.length > 0 ? positions[0].weight : 0
    const avgPositionSize = positions.length > 0 
      ? positions.reduce((sum, pos) => sum + pos.weight, 0) / positions.length 
      : 0
    
    console.log(`Position analysis complete: ${positions.length} positions, top 5 concentration: ${top5Concentration.toFixed(2)}%`)
    
    return c.json({
      summary: {
        totalPositions: positions.length,
        totalValue: totalPortfolioValue,
        top5Concentration,
        top10Concentration,
        hhi,
        diversificationScore,
        largestPosition,
        avgPositionSize
      },
      topHoldings,
      sectorAllocation,
      industryAllocation,
      accountAllocation,
      allPositions: positions
    })
  } catch (error) {
    console.error('Position Analysis error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return c.json({ 
      error: 'Failed to generate position analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Export to CSV endpoint
app.get('/api/reports/export', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const type = c.req.query('type') || 'stocks'
  const year = c.req.query('year')
  
  let query = ''
  let params = [userId]
  
  if (type === 'stocks') {
    // Export stock holdings with all transactions
    query = `
      SELECT 
        sh.id,
        sh.ticker,
        a.account_type,
        a.account_name,
        sh.total_shares,
        sh.average_price,
        sh.is_open,
        sh.opened_date,
        sh.closed_date,
        sh.notes,
        c.company_name
      FROM stock_holdings sh
      JOIN accounts a ON sh.account_id = a.id
      LEFT JOIN companies c ON sh.company_id = c.id
      WHERE sh.user_id = ?`
    if (year) {
      query += ` AND (strftime('%Y', sh.opened_date) = ? OR strftime('%Y', sh.closed_date) = ?)`
      params.push(year)
      params.push(year)
    }
    query += ` ORDER BY sh.opened_date DESC`
  } else if (type === 'options') {
    query = `SELECT * FROM option_trades WHERE user_id = ?`
    if (year) {
      query += ` AND strftime('%Y', trade_date) = ?`
      params.push(year)
    }
    query += ` ORDER BY trade_date DESC`
  }
  
  const data = await c.env.DB.prepare(query).bind(...params).all()
  
  if (data.results.length === 0) {
    return c.text('No data to export', 404)
  }
  
  // Generate CSV
  const headers = Object.keys(data.results[0])
  let csv = headers.join(',') + '\n'
  
  data.results.forEach((row: any) => {
    const values = headers.map(header => {
      const value = row[header]
      return value !== null && value !== undefined ? `"${value}"` : ''
    })
    csv += values.join(',') + '\n'
  })
  
  return c.text(csv, 200, {
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="${type}_${year || 'all'}.csv"`
  })
})

// Dividends Report - detailed breakdown by account and stock
app.get('/api/reports/dividends', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const groupBy = c.req.query('groupBy') || 'account' // 'account' or 'stock'
    const period = c.req.query('period') || 'ytd' // 'mtd', 'ytd', 'all'
    
    console.log(`Dividends report request: userId=${userId}, groupBy=${groupBy}, period=${period}`)
    
    // Calculate date range
    const now = new Date()
    let startDate = ''
    
    switch (period) {
      case 'mtd':
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        break
      case 'ytd':
        startDate = `${now.getFullYear()}-01-01`
        break
      case 'all':
        startDate = '1900-01-01'
        break
    }
    
    console.log(`Date range: startDate=${startDate}`)
    
    if (groupBy === 'account') {
      // Group dividends by account
      const dividends = await DB.prepare(`
        SELECT 
          a.account_name,
          a.account_type,
          a.id as account_id,
          COUNT(*) as dividend_count,
          SUM(cba.amount) as total_dividends
        FROM cost_basis_adjustments cba
        INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
        INNER JOIN accounts a ON sh.account_id = a.id
        WHERE cba.user_id = ?
          AND cba.adjustment_type = 'DIVIDEND'
          AND cba.adjustment_date >= ?
        GROUP BY a.id, a.account_name, a.account_type
        ORDER BY total_dividends DESC
      `).bind(userId, startDate).all()
      
      console.log(`Dividends by account fetched: ${dividends.results.length} accounts`)
      
      return c.json({
        groupBy: 'account',
        period,
        data: dividends.results,
        total: dividends.results.reduce((sum: number, d: any) => sum + (d.total_dividends || 0), 0)
      })
    } else {
      // Group dividends by stock
      const dividends = await DB.prepare(`
        SELECT 
          sh.ticker,
          c.company_name,
          sh.id as holding_id,
          COUNT(*) as dividend_count,
          SUM(cba.amount) as total_dividends,
          MIN(cba.adjustment_date) as first_dividend_date,
          MAX(cba.adjustment_date) as last_dividend_date
        FROM cost_basis_adjustments cba
        INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
        LEFT JOIN companies c ON sh.company_id = c.id
        WHERE cba.user_id = ?
          AND cba.adjustment_type = 'DIVIDEND'
          AND cba.adjustment_date >= ?
        GROUP BY sh.id, sh.ticker, c.company_name
        ORDER BY total_dividends DESC
      `).bind(userId, startDate).all()
      
      console.log(`Dividends by stock fetched: ${dividends.results.length} stocks`)
      
      return c.json({
        groupBy: 'stock',
        period,
        data: dividends.results,
        total: dividends.results.reduce((sum: number, d: any) => sum + (d.total_dividends || 0), 0)
      })
    }
  } catch (error) {
    console.error('Error generating dividends report:', error)
    return c.json({
      error: 'Failed to generate dividends report',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Monthly Income Report
app.get('/api/reports/monthly-income', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const year = c.req.query('year') || new Date().getFullYear().toString()
    const month = c.req.query('month') || (new Date().getMonth() + 1).toString()
    const accountId = c.req.query('account_id') // Optional account filter
    
    // Calculate date range for the month
    const startDate = `${year}-${month.padStart(2, '0')}-01`
    const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1
    const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year)
    const endDate = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`
    
    // Stock Investments Income
    // Dividend ETFs
    const dividendETFsClosedPL = await DB.prepare(`
      SELECT sh.ticker, SUM(st.shares * (st.price_per_share - sh.average_price)) as profit_loss
      FROM stock_transactions st
      INNER JOIN stock_holdings sh ON st.holding_id = sh.id
      WHERE st.user_id = ? AND sh.strategy_type = 'DIVIDEND_ETFS'
        ${accountId ? 'AND sh.account_id = ?' : ''}
        AND st.transaction_type = 'SELL'
        AND st.transaction_date >= ? AND st.transaction_date < ?
      GROUP BY sh.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    const dividendETFsCoveredCalls = await DB.prepare(`
      SELECT ot.ticker, SUM(ot.profit_loss) as amount
      FROM option_trades ot
      INNER JOIN stock_holdings sh ON ot.ticker = sh.ticker AND ot.account_id = sh.account_id
      WHERE ot.user_id = ? AND ot.strategy_type = 'COVERED_CALL'
        AND sh.strategy_type = 'DIVIDEND_ETFS'
        ${accountId ? 'AND ot.account_id = ?' : ''}
        AND ot.is_open = 0 AND ot.close_date >= ? AND ot.close_date < ?
      GROUP BY ot.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    const dividendETFsDividends = await DB.prepare(`
      SELECT sh.ticker, SUM(cba.amount) as amount
      FROM cost_basis_adjustments cba
      INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
      WHERE cba.user_id = ? AND cba.adjustment_type = 'DIVIDEND'
        AND sh.strategy_type = 'DIVIDEND_ETFS'
        ${accountId ? 'AND sh.account_id = ?' : ''}
        AND cba.adjustment_date >= ? AND cba.adjustment_date < ?
      GROUP BY sh.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    // Stockpiling
    const stockpilingClosedPL = await DB.prepare(`
      SELECT sh.ticker, SUM(st.shares * (st.price_per_share - sh.average_price)) as profit_loss
      FROM stock_transactions st
      INNER JOIN stock_holdings sh ON st.holding_id = sh.id
      WHERE st.user_id = ? AND sh.strategy_type = 'STOCKPILING'
        ${accountId ? 'AND sh.account_id = ?' : ''}
        AND st.transaction_type = 'SELL'
        AND st.transaction_date >= ? AND st.transaction_date < ?
      GROUP BY sh.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    const stockpilingCoveredCalls = await DB.prepare(`
      SELECT ot.ticker, SUM(ot.profit_loss) as amount
      FROM option_trades ot
      INNER JOIN stock_holdings sh ON ot.ticker = sh.ticker AND ot.account_id = sh.account_id
      WHERE ot.user_id = ? AND ot.strategy_type = 'COVERED_CALL'
        AND sh.strategy_type = 'STOCKPILING'
        ${accountId ? 'AND ot.account_id = ?' : ''}
        AND ot.is_open = 0 AND ot.close_date >= ? AND ot.close_date < ?
      GROUP BY ot.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    const stockpilingDividends = await DB.prepare(`
      SELECT sh.ticker, SUM(cba.amount) as amount
      FROM cost_basis_adjustments cba
      INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
      WHERE cba.user_id = ? AND cba.adjustment_type = 'DIVIDEND'
        AND sh.strategy_type = 'STOCKPILING'
        ${accountId ? 'AND sh.account_id = ?' : ''}
        AND cba.adjustment_date >= ? AND cba.adjustment_date < ?
      GROUP BY sh.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    // Wheel Stock
    const wheelClosedPL = await DB.prepare(`
      SELECT sh.ticker, SUM(st.shares * (st.price_per_share - sh.average_price)) as profit_loss
      FROM stock_transactions st
      INNER JOIN stock_holdings sh ON st.holding_id = sh.id
      WHERE st.user_id = ? AND sh.strategy_type = 'WHEEL'
        ${accountId ? 'AND sh.account_id = ?' : ''}
        AND st.transaction_type = 'SELL'
        AND st.transaction_date >= ? AND st.transaction_date < ?
      GROUP BY sh.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    const wheelCoveredCalls = await DB.prepare(`
      SELECT ot.ticker, SUM(ot.profit_loss) as amount
      FROM option_trades ot
      INNER JOIN stock_holdings sh ON ot.ticker = sh.ticker AND ot.account_id = sh.account_id
      WHERE ot.user_id = ? AND ot.strategy_type = 'COVERED_CALL'
        AND sh.strategy_type = 'WHEEL'
        ${accountId ? 'AND ot.account_id = ?' : ''}
        AND ot.is_open = 0 AND ot.close_date >= ? AND ot.close_date < ?
      GROUP BY ot.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    const wheelDividends = await DB.prepare(`
      SELECT sh.ticker, SUM(cba.amount) as amount
      FROM cost_basis_adjustments cba
      INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
      WHERE cba.user_id = ? AND cba.adjustment_type = 'DIVIDEND'
        AND sh.strategy_type = 'WHEEL'
        ${accountId ? 'AND sh.account_id = ?' : ''}
        AND cba.adjustment_date >= ? AND cba.adjustment_date < ?
      GROUP BY sh.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    // Option Trades Income
    // Short Puts (Wheel)
    const shortPutsWheel = await DB.prepare(`
      SELECT ticker, SUM(profit_loss) as profit_loss
      FROM option_trades
      WHERE user_id = ? AND strategy_type = 'SELLING_PUT_WHEEL'
        ${accountId ? 'AND account_id = ?' : ''}
        AND is_open = 0 AND close_date >= ? AND close_date < ?
      GROUP BY ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    // Short Puts (Stockpiling)
    const shortPutsStockpiling = await DB.prepare(`
      SELECT ticker, SUM(profit_loss) as profit_loss
      FROM option_trades
      WHERE user_id = ? AND strategy_type = 'SELLING_PUT'
        ${accountId ? 'AND account_id = ?' : ''}
        AND is_open = 0 AND close_date >= ? AND close_date < ?
      GROUP BY ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    // Short Puts (Long Term)
    const shortPutsLongTerm = await DB.prepare(`
      SELECT ticker, SUM(profit_loss) as profit_loss
      FROM option_trades
      WHERE user_id = ? AND strategy_type = 'SELLING_PUT_LONG_TERM'
        ${accountId ? 'AND account_id = ?' : ''}
        AND is_open = 0 AND close_date >= ? AND close_date < ?
      GROUP BY ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    // 0 DTE SPX Trades
    const dteTrades = await DB.prepare(`
      SELECT SUM(profit_loss) as profit_loss, COUNT(*) as trade_count
      FROM daily_trades
      WHERE user_id = ? AND is_open = 0
        ${accountId ? 'AND account_id = ?' : ''}
        AND trade_date >= ? AND trade_date < ?
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).first() as any
    
    return c.json({
      year: parseInt(year),
      month: parseInt(month),
      startDate,
      endDate,
      stockInvestments: {
        dividendETFs: {
          closedPL: { results: dividendETFsClosedPL.results || [] },
          coveredCalls: { results: dividendETFsCoveredCalls.results || [] },
          dividends: { results: dividendETFsDividends.results || [] }
        },
        stockpiling: {
          closedPL: { results: stockpilingClosedPL.results || [] },
          coveredCalls: { results: stockpilingCoveredCalls.results || [] },
          dividends: { results: stockpilingDividends.results || [] }
        },
        wheel: {
          closedPL: { results: wheelClosedPL.results || [] },
          coveredCalls: { results: wheelCoveredCalls.results || [] },
          dividends: { results: wheelDividends.results || [] }
        }
      },
      optionTrades: {
        shortPutsWheel: { results: shortPutsWheel.results || [] },
        shortPutsStockpiling: { results: shortPutsStockpiling.results || [] },
        shortPutsLongTerm: { results: shortPutsLongTerm.results || [] },
        dteTrades: {
          profitLoss: dteTrades?.profit_loss || 0,
          tradeCount: dteTrades?.trade_count || 0
        }
      }
    })
  } catch (error) {
    console.error('Error generating monthly income report:', error)
    return c.json({
      error: 'Failed to generate monthly income report',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// ============================================================================
// DIVIDEND REPOSITORY - Automated Dividend Tracking
// ============================================================================

// Get API configuration for RapidAPI
app.get('/api/dividend-repository/config', authMiddleware, async (c) => {
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
app.post('/api/dividend-repository/config', authMiddleware, async (c) => {
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
app.post('/api/dividend-repository/fetch', authMiddleware, async (c) => {
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
    
    // Create fetch log immediately
    const logResult = await DB.prepare(`
      INSERT INTO dividend_fetch_logs (user_id, fetch_type, status, tickers_processed, started_at)
      VALUES (?, 'manual', 'in_progress', '', CURRENT_TIMESTAMP)
    `).bind(userId).run()
    
    const logId = logResult.meta.last_row_id as number
    
    console.log(`[DIVIDEND-FETCH] Created log entry ${logId}, starting synchronous processing`)
    
    // Run synchronously (no waitUntil - just await the result)
    // This will take 2-3 minutes but ensures reliable completion
    await performDividendFetchInternal(DB, userId, logId, startTime)
    
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
  startTime: number
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
    const MASSIVE_API_KEY = 'x4VbKUBkKwYB10ObRLoRt9eDqfcClxEW'
    
    // Use EODHD API key for Canadian stocks fallback
    const EODHD_API_KEY = '69bc75c1788da8.83960172'
    
    // Minimum date filter: only fetch dividends from 2026-01-01 onwards
    const MIN_DATE = '2026-01-01'
    
    // Get all stock holdings for this user (including closed ones)
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
        // Endpoint: GET /v3/reference/dividends?ticker={ticker}&apiKey={key}
        const response = await fetch(`https://api.polygon.io/v3/reference/dividends?ticker=${holding.ticker}&apiKey=${MASSIVE_API_KEY}`, {
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
        
        // Fallback to EODHD for Canadian stocks if Massive returns 0 results
        let eodhd_dividends = []
        if (dividends.length === 0 && (holding.ticker.endsWith('.TO') || holding.ticker.endsWith('.V'))) {
          debugInfo.push(`${holding.ticker}: Canadian stock with 0 results, trying EODHD fallback...`)
          
          try {
            const eodhd_response = await fetch(`https://eodhd.com/api/div/${holding.ticker}?from=2000-01-01&api_token=${EODHD_API_KEY}&fmt=json`, {
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
        
        // Minimum date filter: only fetch dividends from 2026-01-01 onwards
        const MIN_DATE = '2026-01-01'
        
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
          
          // Filter: only include dividends from 2026-01-01 onwards
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
          const payDate = div.pay_date
          const recordDate = div.record_date
          const declaredDate = div.declaration_date
          const amount = parseFloat(div.cash_amount)
          
          if (!exDate || !amount) {
            console.log(`Skipping dividend with missing data: ${JSON.stringify(div)}`)
            continue
          }
          
          // Filter: only include dividends from 2026-01-01 onwards
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

// Cron-specific dividend fetch endpoint (secret key authentication)
// Test endpoint to verify secret key
app.post('/api/cron/test', async (c) => {
  try {
    const contentType = c.req.header('Content-Type') || 'not-set'
    let body = {}
    let rawBody = ''
    
    try {
      rawBody = await c.req.text()
      body = JSON.parse(rawBody)
    } catch (e) {
      // Couldn't parse as JSON
    }
    
    const secretKey = c.req.header('X-Cron-Secret') || body.secret
    const CRON_SECRET = c.env.CRON_SECRET || 'dividend-fetch-cron-2026-secret-key'
    
    return c.json({
      content_type: contentType,
      raw_body: rawBody,
      parsed_body: body,
      received_secret: secretKey,
      expected_secret: CRON_SECRET,
      matches: secretKey === CRON_SECRET,
      all_headers: Object.fromEntries(c.req.raw.headers.entries())
    })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// Simple GET endpoint for cron - just triggers the existing fetch logic
app.get('/api/cron/dividend-repository/fetch/:secret', authMiddleware, async (c) => {
  const urlSecret = c.req.param('secret')
  const CRON_SECRET = c.env.CRON_SECRET || 'dividend-fetch-cron-2026-secret-key'
  
  if (urlSecret !== CRON_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  
  // This will execute synchronously and complete before returning
  // It's the same as clicking the button in the UI
  const userId = c.get('userId')
  
  // Forward to the regular fetch endpoint logic
  // This is exactly what happens when you click the button in the UI
  return c.redirect('/api/dividend-repository/fetch', 307) // Temporary redirect with POST method preserved
})

app.post('/api/cron/dividend-repository/fetch', async (c) => {
  try {
    const { DB } = c.env
    const body = await c.req.json().catch(() => ({}))
    
    // Check for secret key in header or body
    const secretKey = c.req.header('X-Cron-Secret') || body.secret
    const CRON_SECRET = c.env.CRON_SECRET || 'dividend-fetch-cron-2026-secret-key'
    
    if (secretKey !== CRON_SECRET) {
      console.error('Unauthorized cron attempt - invalid secret')
      return c.json({ error: 'Unauthorized' }, 401)
    }
    
    // Get user ID from body or default to first user (admin)
    const targetUserId = body.user_id || 1
    
    console.log(`[CRON] Starting automated dividend fetch for user ${targetUserId}`)
    
    const startTime = Date.now()
    
    // Use waitUntil to extend worker lifetime for background processing
    const executionContext = c.executionCtx
    
    // Start the fetch process in the background
    const fetchPromise = (async () => {
      try {
        await performDividendFetch(DB, targetUserId, startTime)
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
async function performDividendFetch(DB: any, targetUserId: number, startTime: number) {
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
    const MASSIVE_API_KEY = 'x4VbKUBkKwYB10ObRLoRt9eDqfcClxEW'
    
    // Use EODHD API key for Canadian stocks fallback
    const EODHD_API_KEY = '69bc75c1788da8.83960172'
    
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
          const massiveUrl = `https://api.polygon.io/v3/reference/dividends?ticker=${ticker}&limit=100&apiKey=${MASSIVE_API_KEY}`
          
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
          const payDate = div.pay_date
          const recordDate = div.record_date
          const declaredDate = div.declaration_date
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
app.get('/api/dividend-repository', authMiddleware, async (c) => {
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
app.get('/api/dividend-repository/logs', authMiddleware, async (c) => {
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
app.get('/api/dividend-repository/:id', authMiddleware, async (c) => {
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
app.put('/api/dividend-repository/:id', authMiddleware, async (c) => {
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
app.post('/api/dividend-repository/:id/apply', authMiddleware, async (c) => {
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

// ============================================================================
// FRONTEND ROUTES
// ============================================================================

app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Generational Investing - Portfolio Management</title>
        <link rel="icon" type="image/png" href="/static/logo.png">
        <link rel="shortcut icon" type="image/png" href="/static/logo.png">
        <link rel="apple-touch-icon" href="/static/logo.png">
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/apexcharts@3.45.1/dist/apexcharts.min.js"></script>
        <style>
            :root {
                --teal: #004F59;
                --gold: #C9B25F;
                --gray: #7A7A7A;
                --black: #000000;
            }
            body {
                font-family: 'Avenir', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            .bg-brand-teal { background-color: var(--teal); }
            .bg-brand-gold { background-color: var(--gold); }
            .text-brand-teal { color: var(--teal); }
            .text-brand-gold { color: var(--gold); }
            .border-brand-teal { border-color: var(--teal); }
            .border-brand-gold { border-color: var(--gold); }
            .btn-primary {
                background-color: var(--teal);
                color: white;
                padding: 0.75rem 1.5rem;
                border-radius: 0.5rem;
                font-weight: 600;
                transition: all 0.2s;
            }
            .btn-primary:hover {
                background-color: #003940;
            }
            .btn-secondary {
                background-color: var(--gold);
                color: white;
                padding: 0.75rem 1.5rem;
                border-radius: 0.5rem;
                font-weight: 600;
                transition: all 0.2s;
            }
            .btn-secondary:hover {
                background-color: #b39d50;
            }
            .card {
                background: white;
                border-radius: 0.75rem;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                padding: 1.5rem;
            }
            .nav-link {
                color: white;
                padding: 0.5rem 1rem;
                border-radius: 0.5rem;
                transition: all 0.2s;
            }
            .nav-link:hover, .nav-link.active {
                background-color: rgba(255, 255, 255, 0.1);
            }
            .utility-tab.active {
                color: var(--teal);
                border-bottom-color: var(--teal);
            }
            .portfolio-timeframe-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .hidden { display: none; }
        </style>
    </head>
    <body class="bg-gray-50">
        <div id="app">
            <!-- Login/Register Screen -->
            <div id="auth-screen" class="min-h-screen bg-brand-teal flex items-center justify-center p-4">
                <div class="card max-w-md w-full">
                    <div class="text-center mb-8">
                        <h1 class="text-4xl font-bold text-brand-teal mb-2">Generational Investing</h1>
                        <p class="text-brand-gold text-lg">Portfolio Management</p>
                    </div>
                    
                    <div id="login-form">
                        <h2 class="text-2xl font-bold text-brand-teal mb-6">Login</h2>
                        <form id="loginForm">
                            <div class="mb-4">
                                <label class="block text-gray-700 mb-2">Email</label>
                                <input type="email" name="email" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-brand-teal" required>
                            </div>
                            <div class="mb-6">
                                <label class="block text-gray-700 mb-2">Password</label>
                                <input type="password" name="password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-brand-teal" required>
                            </div>
                            <button type="submit" class="btn-primary w-full">Login</button>
                        </form>
                        <p class="text-center mt-4 text-gray-600">
                            Don't have an account? <a href="#" onclick="showRegister()" class="text-brand-teal font-semibold">Register</a>
                        </p>
                        <p class="text-center mt-2 text-sm text-gray-500">
                            Demo: demo@generationalinvesting.ca / test123
                        </p>
                    </div>
                    
                    <div id="register-form" class="hidden">
                        <h2 class="text-2xl font-bold text-brand-teal mb-6">Register</h2>
                        <form id="registerForm">
                            <div class="mb-4">
                                <label class="block text-gray-700 mb-2">Name</label>
                                <input type="text" name="name" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-brand-teal" required>
                            </div>
                            <div class="mb-4">
                                <label class="block text-gray-700 mb-2">Email</label>
                                <input type="email" name="email" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-brand-teal" required>
                            </div>
                            <div class="mb-6">
                                <label class="block text-gray-700 mb-2">Password</label>
                                <input type="password" name="password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-brand-teal" required>
                            </div>
                            <button type="submit" class="btn-primary w-full">Register</button>
                        </form>
                        <p class="text-center mt-4 text-gray-600">
                            Already have an account? <a href="#" onclick="showLogin()" class="text-brand-teal font-semibold">Login</a>
                        </p>
                    </div>
                </div>
            </div>
            
            <!-- Main Application -->
            <div id="main-app" class="hidden">
                <!-- Navigation -->
                <nav class="bg-brand-teal text-white p-4 shadow-lg">
                    <div class="container mx-auto flex justify-between items-center">
                        <div>
                            <h1 class="text-2xl font-bold">Generational Investing</h1>
                            <p class="text-brand-gold text-sm">Portfolio Management</p>
                        </div>
                        <div class="flex gap-4 items-center">
                            <a href="#" onclick="showSection('dashboard')" class="nav-link active" data-section="dashboard">
                                <i class="fas fa-chart-line mr-2"></i>Dashboard
                            </a>
                            <a href="#" onclick="showSection('companies')" class="nav-link" data-section="companies">
                                <i class="fas fa-building mr-2"></i>Companies
                            </a>
                            <a href="#" onclick="showSection('accounts')" class="nav-link" data-section="accounts">
                                <i class="fas fa-wallet mr-2"></i>Accounts
                            </a>
                            <a href="#" onclick="showSection('stocks')" class="nav-link" data-section="stocks">
                                <i class="fas fa-chart-bar mr-2"></i>Stock Trades
                            </a>
                            <a href="#" onclick="showSection('options')" class="nav-link" data-section="options">
                                <i class="fas fa-layer-group mr-2"></i>Options Trades
                            </a>
                            <a href="#" onclick="showSection('daily-trade')" class="nav-link" data-section="daily-trade">
                                <i class="fas fa-chart-line mr-2 text-orange-400"></i>0DTE SPX
                            </a>
                            <a href="#" onclick="showSection('utilities')" class="nav-link" data-section="utilities">
                                <i class="fas fa-tools mr-2"></i>Utilities
                            </a>
                            <a href="#" onclick="showSection('reports')" class="nav-link" data-section="reports">
                                <i class="fas fa-file-alt mr-2"></i>Reports
                            </a>
                            
                            <!-- User Profile Dropdown -->
                            <div class="relative" id="user-menu-container">
                                <button onclick="toggleUserMenu()" class="flex items-center gap-2 text-white hover:text-brand-gold transition-colors">
                                    <i class="fas fa-user-circle text-2xl"></i>
                                    <span id="user-name-display" class="text-sm"></span>
                                    <i class="fas fa-chevron-down text-xs"></i>
                                </button>
                                
                                <!-- Dropdown Menu -->
                                <div id="user-dropdown" class="hidden absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
                                    <div class="px-4 py-2 border-b border-gray-200">
                                        <p class="text-sm font-semibold text-gray-900" id="user-email-display"></p>
                                        <p class="text-xs text-gray-500">Account Settings</p>
                                    </div>
                                    <a href="#" onclick="showProfileModal(); return false;" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        <i class="fas fa-user-edit mr-2"></i>Edit Profile
                                    </a>
                                    <a href="#" onclick="showPasswordModal(); return false;" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        <i class="fas fa-key mr-2"></i>Change Password
                                    </a>
                                    <div class="border-t border-gray-200 my-1"></div>
                                    <a href="#" onclick="logout(); return false;" class="block px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                                        <i class="fas fa-sign-out-alt mr-2"></i>Logout
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </nav>
                
                <!-- Content Area -->
                <div class="container mx-auto p-6">
                    <!-- Dashboard Section -->
                    <div id="dashboard-section" class="section">
                        <h2 class="text-3xl font-bold text-brand-teal mb-6">Dashboard</h2>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                            <div class="card">
                                <h3 class="text-lg font-semibold text-gray-700 mb-2">Total Portfolio (CAD)</h3>
                                <p class="text-3xl font-bold text-brand-teal" id="total-cad">$0.00</p>
                                <p class="text-xs text-gray-500 italic mt-1" id="exchange-rate-display"></p>
                            </div>
                            <div class="card">
                                <h3 class="text-lg font-semibold text-gray-700 mb-2">Total Portfolio (USD)</h3>
                                <p class="text-3xl font-bold text-brand-gold" id="total-usd">$0.00</p>
                            </div>
                            <div class="card">
                                <h3 class="text-lg font-semibold text-gray-700 mb-2">Total Cash (CAD)</h3>
                                <p class="text-3xl font-bold text-gray-700" id="total-cash-cad">$0.00</p>
                            </div>
                            <div class="card">
                                <h3 class="text-lg font-semibold text-gray-700 mb-2">Total Cash (USD)</h3>
                                <p class="text-3xl font-bold text-gray-700" id="total-cash-usd">$0.00</p>
                            </div>
                        </div>
                        
                        <div class="card">
                            <h3 class="text-xl font-bold text-brand-teal mb-4">YTD Account Performance</h3>
                            <div class="overflow-x-auto">
                                <table class="w-full">
                                    <thead>
                                        <tr class="bg-gray-100">
                                            <th class="px-4 py-3 text-left">Account Name</th>
                                            <th class="px-4 py-3 text-left">Type</th>
                                            <th class="px-4 py-3 text-right">Current Value</th>
                                            <th class="px-4 py-3 text-right">YTD P/L</th>
                                            <th class="px-4 py-3 text-right">YTD RORC</th>
                                            <th class="px-4 py-3 text-right">ARORC</th>
                                        </tr>
                                    </thead>
                                    <tbody id="ytd-performance-table">
                                        <!-- Dynamic content -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Companies Section -->
                    <div id="companies-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-3xl font-bold text-brand-teal">Company Roster</h2>
                            <button onclick="showCompanyForm()" class="btn-primary">
                                <i class="fas fa-plus mr-2"></i>Add Company
                            </button>
                        </div>
                        
                        <div class="card">
                            <div class="overflow-x-auto">
                                <table class="w-full">
                                    <thead>
                                        <tr class="bg-gray-100">
                                            <th class="px-4 py-3 text-left cursor-pointer hover:bg-gray-200 select-none" onclick="sortCompanies('ticker')">
                                                <div class="flex items-center gap-2">
                                                    Ticker
                                                    <span id="sort-ticker" class="text-xs">
                                                        <i class="fas fa-sort-up text-brand-teal"></i>
                                                    </span>
                                                </div>
                                            </th>
                                            <th class="px-4 py-3 text-left cursor-pointer hover:bg-gray-200 select-none" onclick="sortCompanies('company_name')">
                                                <div class="flex items-center gap-2">
                                                    Company
                                                    <span id="sort-company_name" class="text-xs text-gray-400">
                                                        <i class="fas fa-sort"></i>
                                                    </span>
                                                </div>
                                            </th>
                                            <th class="px-4 py-3 text-left">Exchange</th>
                                            <th class="px-4 py-3 text-left">Industry</th>
                                            <th class="px-4 py-3 text-center">Wonderful</th>
                                            <th class="px-4 py-3 text-center cursor-pointer hover:bg-gray-200 select-none" onclick="sortCompanies('research_score')">
                                                <div class="flex items-center justify-center gap-2">
                                                    Research Score
                                                    <span id="sort-research_score" class="text-xs text-gray-400">
                                                        <i class="fas fa-sort"></i>
                                                    </span>
                                                </div>
                                            </th>
                                            <th class="px-4 py-3 text-center cursor-pointer hover:bg-gray-200 select-none" onclick="sortCompanies('anti_fragile_score')">
                                                <div class="flex items-center justify-center gap-2">
                                                    Anti-Fragile
                                                    <span id="sort-anti_fragile_score" class="text-xs text-gray-400">
                                                        <i class="fas fa-sort"></i>
                                                    </span>
                                                </div>
                                            </th>
                                            <th class="px-4 py-3 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="companies-table">
                                        <!-- Dynamic content -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Accounts Section -->
                    <div id="accounts-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-3xl font-bold text-brand-teal">Account Balances</h2>
                            <button onclick="showAccountForm()" class="btn-primary">
                                <i class="fas fa-plus mr-2"></i>Add Account
                            </button>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6" id="accounts-grid">
                            <!-- Dynamic content -->
                        </div>
                    </div>
                    
                    <!-- Stock Trades Section -->
                    <div id="stocks-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-3xl font-bold text-brand-teal">Stock Trades</h2>
                            <button onclick="showStockForm()" class="btn-primary">
                                <i class="fas fa-plus mr-2"></i>Add Stock Trade
                            </button>
                        </div>
                        
                        <!-- Account Tabs -->
                        <div class="mb-6">
                            <div class="flex flex-wrap gap-2" id="stock-account-tabs">
                                <!-- Tabs will be dynamically generated -->
                            </div>
                        </div>
                        
                        <div class="card">
                            <div class="overflow-x-auto">
                                <table class="w-full">
                                    <thead>
                                        <tr class="bg-gray-100">
                                            <th class="px-4 py-3 text-left">Account</th>
                                            <th class="px-4 py-3 text-left">Ticker</th>
                                            <th class="px-4 py-3 text-left">Open Date</th>
                                            <th class="px-4 py-3 text-right">Shares</th>
                                            <th class="px-4 py-3 text-right">Avg Price</th>
                                            <th class="px-4 py-3 text-right">Cost Basis</th>
                                            <th class="px-4 py-3 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="stocks-table">
                                        <!-- Dynamic content -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Options Section -->
                    <div id="options-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-3xl font-bold text-brand-teal">Option Trades</h2>
                            <div class="flex items-center gap-4">
                                <!-- Include Closed Trades Toggle -->
                                <label class="flex items-center cursor-pointer group">
                                    <span class="mr-3 text-gray-700 font-medium">Include Closed</span>
                                    <div class="relative">
                                        <input type="checkbox" id="include-closed-options" class="sr-only peer" onchange="toggleClosedOptions()">
                                        <div class="w-11 h-6 bg-gray-300 rounded-full peer peer-focus:ring-2 peer-focus:ring-teal-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-teal"></div>
                                    </div>
                                </label>
                                <button onclick="showOptionForm()" class="btn-primary">
                                    <i class="fas fa-plus mr-2"></i>Add Option Trade
                                </button>
                            </div>
                        </div>
                        
                        <!-- Strategy Tabs -->
                        <div class="mb-6">
                            <div class="flex flex-wrap gap-2" id="strategy-tabs">
                                <!-- Tabs will be dynamically generated -->
                            </div>
                        </div>
                        
                        <div class="card">
                            <div class="overflow-x-auto">
                                <table class="w-full">
                                    <thead>
                                        <tr class="bg-gray-100">
                                            <th class="px-4 py-3 text-left">Date</th>
                                            <th class="px-4 py-3 text-left">Ticker</th>
                                            <th class="px-4 py-3 text-left">Strategy</th>
                                            <th class="px-4 py-3 text-right">Strike</th>
                                            <th class="px-4 py-3 text-right">Premium</th>
                                            <th class="px-4 py-3 text-center">Contracts</th>
                                            <th class="px-4 py-3 text-left">Expiration</th>
                                            <th class="px-4 py-3 text-center">Status</th>
                                            <th class="px-4 py-3 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="options-table">
                                        <!-- Dynamic content -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Daily Trade Section (0DTE Trading) -->
                    <div id="daily-trade-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <div class="flex items-center gap-3">
                                <h2 class="text-3xl font-bold text-orange-600">0DTE SPX Trading</h2>
                                <button onclick="openDailyTradeConfig()" class="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Configuration">
                                    <i class="fas fa-cog text-2xl"></i>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Sub-tabs -->
                        <div class="mb-6 border-b border-gray-200">
                            <nav class="flex gap-4">
                                <button onclick="showDailyTradeTab('performance')" class="daily-trade-tab active px-6 py-3 font-semibold text-orange-600 border-b-2 border-orange-600" data-tab="performance">
                                    <i class="fas fa-chart-bar mr-2"></i>Performance
                                </button>
                                <button onclick="showDailyTradeTab('today')" class="daily-trade-tab px-6 py-3 font-semibold text-gray-600 hover:text-orange-600" data-tab="today">
                                    <i class="fas fa-bullseye mr-2"></i>Today's Trading
                                </button>
                            </nav>
                        </div>
                        
                        <!-- Configuration Modal (hidden by default) -->
                        <div id="dt-config-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
                            <div class="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
                                <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                                    <h3 class="text-2xl font-bold text-orange-600">
                                        <i class="fas fa-cog mr-2"></i>0DTE Trading Configuration
                                    </h3>
                                    <button onclick="closeDailyTradeConfig()" class="text-gray-500 hover:text-gray-700">
                                        <i class="fas fa-times text-2xl"></i>
                                    </button>
                                </div>
                                
                                <div class="p-6">
                                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <!-- Trading Rules & Risk Management -->
                                <div class="card">
                                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                                        <i class="fas fa-shield-alt text-orange-600 mr-2"></i>Risk Management & Position Sizing
                                    </h3>
                                    <div class="space-y-4">
                                        <!-- Rolling Profit Window (always visible - used for stats and sizing) -->
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Rolling Profit Window (Last X Trades)</label>
                                            <input type="number" id="dt-rolling-profit-window" value="50" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="50">
                                            <small class="text-gray-500">Number of recent trades for performance stats and position sizing</small>
                                        </div>
                                        
                                        <!-- Master Toggle for Position Sizing -->
                                        <div>
                                            <label class="flex items-center justify-between p-3 bg-blue-50 border border-blue-300 rounded-lg cursor-pointer hover:bg-blue-100">
                                                <div>
                                                    <div class="font-semibold text-gray-700">Enable Calculated Position Sizing</div>
                                                    <div class="text-sm text-gray-500">Use automated contract sizing based on strategy</div>
                                                </div>
                                                <div class="relative inline-block w-12 h-6">
                                                    <input type="checkbox" id="dt-enable-position-sizing" class="sr-only peer" onchange="togglePositionSizing()">
                                                    <div class="w-full h-full bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                                </div>
                                            </label>
                                        </div>
                                        
                                        <!-- Position Sizing Config (hidden by default) -->
                                        <div id="dt-sizing-config" class="hidden space-y-4 pl-4 border-l-4 border-orange-300">
                                            <!-- Type Toggle -->
                                            <div>
                                                <label class="block text-gray-700 font-semibold mb-3">Sizing Method</label>
                                                <div class="grid grid-cols-2 gap-3">
                                                    <label class="relative flex items-center justify-center p-3 border-2 border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 has-[:checked]:border-orange-600 has-[:checked]:bg-orange-50">
                                                        <input type="radio" name="dt-position-sizing-type" value="profit" class="sr-only" onchange="toggleSizingType()" checked>
                                                        <div class="text-center">
                                                            <i class="fas fa-chart-line text-lg mb-1"></i>
                                                            <div class="font-semibold">Profit-Based</div>
                                                            <div class="text-xs text-gray-500">Recent trades</div>
                                                        </div>
                                                    </label>
                                                    <label class="relative flex items-center justify-center p-3 border-2 border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 has-[:checked]:border-orange-600 has-[:checked]:bg-orange-50">
                                                        <input type="radio" name="dt-position-sizing-type" value="account" class="sr-only" onchange="toggleSizingType()">
                                                        <div class="text-center">
                                                            <i class="fas fa-wallet text-lg mb-1"></i>
                                                            <div class="font-semibold">Account-Based</div>
                                                            <div class="text-xs text-gray-500">% of balance</div>
                                                        </div>
                                                    </label>
                                                </div>
                                            </div>
                                            
                                            <!-- Profit-Based Config -->
                                            <div id="dt-profit-sizing-config" class="space-y-3">
                                                <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                                    <div class="flex items-start">
                                                        <i class="fas fa-info-circle text-blue-600 mr-2 mt-1"></i>
                                                        <div class="text-sm text-gray-700">
                                                            <strong>Formula:</strong> <code>Contracts = floor(Total Profit / (Strike Width × 100))</code><br>
                                                            Uses Rolling Profit Window above. Capped at Max Contract Limit below.
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <!-- Account-Based Config -->
                                            <div id="dt-account-sizing-config" class="hidden space-y-3">
                                                <div>
                                                    <label class="block text-gray-700 font-semibold mb-2">Max Loss % of Account Balance</label>
                                                    <div class="flex items-center gap-2">
                                                        <input type="number" step="0.01" id="dt-account-max-loss-percent" value="4.00" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="4.00">
                                                        <span class="text-gray-600 font-semibold">%</span>
                                                    </div>
                                                    <small class="text-gray-500">Position sized to limit max loss to this % of account</small>
                                                </div>
                                                <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                                    <div class="flex items-start">
                                                        <i class="fas fa-info-circle text-blue-600 mr-2 mt-1"></i>
                                                        <div class="text-sm text-gray-700">
                                                            <strong>Formula:</strong> <code>Contracts = floor((Balance × Max Loss %) / (Strike Width × 100))</code><br>
                                                            Capped at Max Contract Limit below.
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <!-- Max Contract Limit (always visible) -->
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Max Contract Limit (Upper Bound)</label>
                                            <input type="number" id="dt-max-contract-limit" value="25" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="25">
                                            <small class="text-gray-500">Absolute maximum contracts regardless of calculation</small>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Default Entry Parameters -->
                                <div class="card">
                                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                                        <i class="fas fa-sliders-h text-orange-600 mr-2"></i>Default Entry Parameters
                                    </h3>
                                    <div class="space-y-4">
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Target Premium Credit Range ($)</label>
                                            <div class="grid grid-cols-2 gap-2">
                                                <input type="number" step="0.01" id="dt-target-premium-min" value="10.00" class="px-4 py-2 border border-gray-300 rounded-lg" placeholder="Min">
                                                <input type="number" step="0.01" id="dt-target-premium-max" value="15.00" class="px-4 py-2 border border-gray-300 rounded-lg" placeholder="Max">
                                            </div>
                                        </div>
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Guideline Delta</label>
                                            <input type="number" step="0.01" id="dt-guideline-delta" value="-0.10" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="-0.10">
                                            <small class="text-gray-500">Target delta for short option selection (negative value, e.g., -0.10)</small>
                                        </div>
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Strike Width (Points)</label>
                                            <input type="number" id="dt-strike-width" value="5" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="5">
                                        </div>
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Default Contracts</label>
                                            <input type="number" id="dt-default-contracts" value="1" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="1">
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Exit Rules -->
                                <div class="card">
                                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                                        <i class="fas fa-sign-out-alt text-orange-600 mr-2"></i>Exit Rules
                                    </h3>
                                    <div class="space-y-4">
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Profit Target (% of max profit)</label>
                                            <input type="number" id="dt-profit-target-percent" value="50" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="50">
                                        </div>
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">ATM Proximity Limit (Points from SPX)</label>
                                            <input type="number" step="1" id="dt-atm-proximity-limit" value="30" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="30">
                                            <small class="text-gray-500">Exit if SPX moves within this distance from your short strikes</small>
                                        </div>
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Time-based Exit (HH:MM MT)</label>
                                            <input type="time" id="dt-time-exit" value="14:00" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                            <small class="text-gray-500">MT - Exit if no Profit Target/Proximity Limit hit</small>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Account Settings -->
                                <div class="card">
                                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                                        <i class="fas fa-wallet text-orange-600 mr-2"></i>Account Settings
                                    </h3>
                                    <div class="space-y-4">
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Default Account</label>
                                            <select id="dt-default-account" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                                <option value="">Select account...</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="mt-6 flex gap-4">
                                <button onclick="saveDailyTradeConfig()" class="btn-primary bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800">
                                    <i class="fas fa-save mr-2"></i>Save Configuration
                                </button>
                                <button onclick="resetDailyTradeConfig()" class="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50">
                                    <i class="fas fa-undo mr-2"></i>Reset to Defaults
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                        
                        <!-- Performance Tab -->
                        <div id="dt-performance-tab" class="daily-trade-tab-content">
                            <!-- Monthly Expiration Warning Alert (shown only on Thursday before 3rd Friday) -->
                            <div id="dt-monthly-expiration-alert-perf" class="hidden mb-6 bg-red-50 border-2 border-red-500 rounded-lg p-6 shadow-lg">
                                <div class="flex items-start gap-4">
                                    <div class="flex-shrink-0">
                                        <i class="fas fa-exclamation-triangle text-red-600 text-4xl"></i>
                                    </div>
                                    <div class="flex-1">
                                        <h3 class="text-2xl font-bold text-red-800 mb-3">
                                            ⚠️ MONTHLY EXPIRATION WARNING - DO NOT TRADE TODAY
                                        </h3>
                                        <div class="space-y-3 text-red-900">
                                            <p class="text-lg font-semibold">
                                                Today is <span class="font-bold bg-red-200 px-2 py-1 rounded">Thursday before the 3rd Friday of the month</span>
                                            </p>
                                            <p class="text-base">
                                                <strong>Critical Risk:</strong> SPX options that appear to be 0DTE today are actually <strong>MONTHLY options</strong> 
                                                that expire <strong>TOMORROW MORNING AT MARKET OPEN</strong> (not 4:15 PM today).
                                            </p>
                                            <div class="bg-red-100 border border-red-400 rounded-lg p-4 mt-3">
                                                <p class="font-semibold mb-2">Why This is Dangerous:</p>
                                                <ul class="list-disc list-inside space-y-1 text-sm">
                                                    <li><strong>Overnight Risk:</strong> Your position would carry <strong><em>significant</em></strong> overnight exposure</li>
                                                    <li><strong>Gap Risk:</strong> Market can gap <strong><em>significantly</em></strong> overnight and you have no ability to manage</li>
                                                    <li><strong>Max Loss Potential:</strong> Could realize <strong><em>full max loss</em></strong> before market opens</li>
                                                    <li><strong>No Ability To Manage:</strong> Positions <strong>CLOSE</strong> at tomorrow's open, and there is no ability to adjust/manage overnight.</li>
                                                </ul>
                                            </div>
                                            <p class="text-base font-bold mt-4 text-red-800">
                                                🛑 <strong>ACTION REQUIRED:</strong> Avoid all SPX 0DTE trades today. Resume normal trading tomorrow (Friday) with true 0DTE options.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Filter Buttons -->
                            <div class="mb-6 flex gap-2">
                                <button onclick="loadPerformanceStats('rolling')" id="dt-filter-rolling" class="px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold">Last 50 Trades</button>
                                <button onclick="loadPerformanceStats('year')" id="dt-filter-year" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">YTD</button>
                                <button onclick="loadPerformanceStats('all')" id="dt-filter-all" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">All Time</button>
                            </div>
                            
                            <!-- Key Metrics -->
                            <div class="card mb-6">
                                <h3 class="text-xl font-bold text-gray-800 mb-4">Key Metrics</h3>
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div class="text-center p-4 bg-gray-50 rounded-lg">
                                        <div id="dt-perf-total-trades" class="text-2xl font-bold text-gray-900">-</div>
                                        <div class="text-sm text-gray-600">Total Trades</div>
                                    </div>
                                    <div class="text-center p-4 bg-green-50 rounded-lg">
                                        <div id="dt-perf-win-rate" class="text-2xl font-bold text-green-600">-</div>
                                        <div class="text-sm text-gray-600">Win Rate</div>
                                    </div>
                                    <div class="text-center p-4 bg-blue-50 rounded-lg">
                                        <div id="dt-perf-avg-win" class="text-2xl font-bold text-blue-600">-</div>
                                        <div class="text-sm text-gray-600">Avg Win</div>
                                    </div>
                                    <div class="text-center p-4 bg-red-50 rounded-lg">
                                        <div id="dt-perf-avg-loss" class="text-2xl font-bold text-red-600">-</div>
                                        <div class="text-sm text-gray-600">Avg Loss</div>
                                    </div>
                                </div>
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                    <div class="text-center p-4 bg-green-50 rounded-lg">
                                        <div id="dt-perf-net-pl" class="text-2xl font-bold text-green-600">-</div>
                                        <div class="text-sm text-gray-600">Net P/L</div>
                                    </div>
                                    <div class="text-center p-4 bg-gray-50 rounded-lg">
                                        <div id="dt-perf-avg-pl" class="text-2xl font-bold text-gray-900">-</div>
                                        <div class="text-sm text-gray-600">Avg P/L</div>
                                    </div>
                                    <div class="text-center p-4 bg-blue-50 rounded-lg">
                                        <div id="dt-perf-best-trade" class="text-2xl font-bold text-blue-600">-</div>
                                        <div class="text-sm text-gray-600">Best Trade</div>
                                        <div id="dt-perf-best-trade-date" class="text-xs text-gray-500 mt-1">-</div>
                                    </div>
                                    <div class="text-center p-4 bg-red-50 rounded-lg">
                                        <div id="dt-perf-worst-trade" class="text-2xl font-bold text-red-600">-</div>
                                        <div class="text-sm text-gray-600">Worst Trade</div>
                                        <div id="dt-perf-worst-trade-date" class="text-xs text-gray-500 mt-1">-</div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- P/L Trend Chart -->
                            <div class="card mb-6">
                                <h3 class="text-xl font-bold text-gray-800 mb-4" id="dt-chart-title">
                                    <i class="fas fa-chart-line mr-2 text-orange-600"></i>P/L Trend (Last 50 Trades)
                                </h3>
                                <div class="bg-white rounded-lg p-4" style="height: 400px;">
                                    <canvas id="dt-pl-trend-chart"></canvas>
                                </div>
                            </div>
                            
                            <!-- Recent Trade History (Last 7 Days) -->
                            <div class="card mb-6">
                                <div class="flex justify-between items-center mb-4">
                                    <h3 class="text-xl font-bold text-gray-800">Recent Trade History (Last 7 Days)</h3>
                                    <button onclick="openFullHistoryModal()" class="px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700">
                                        <i class="fas fa-history mr-2"></i>View Full History
                                    </button>
                                </div>
                                
                                <!-- Weekly Gain/Loss Summary -->
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <div class="bg-gradient-to-br from-blue-50 to-white rounded-lg p-4 border-2 border-blue-200">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">This Week (Mon-Fri)</p>
                                                <p class="text-2xl font-bold text-blue-600" id="dt-weekly-pl">$0.00</p>
                                                <p class="text-xs text-gray-500 mt-1" id="dt-weekly-trades">0 trades</p>
                                            </div>
                                            <div class="text-3xl text-blue-600 opacity-20">
                                                <i class="fas fa-calendar-week"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="bg-gradient-to-br from-green-50 to-white rounded-lg p-4 border-2 border-green-200">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Week Start</p>
                                                <p class="text-lg font-bold text-gray-800" id="dt-week-start-date">-</p>
                                                <p class="text-xs text-gray-500 mt-1">Monday</p>
                                            </div>
                                            <div class="text-3xl text-green-600 opacity-20">
                                                <i class="fas fa-calendar-day"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="bg-gradient-to-br from-purple-50 to-white rounded-lg p-4 border-2 border-purple-200">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Week End</p>
                                                <p class="text-lg font-bold text-gray-800" id="dt-week-end-date">-</p>
                                                <p class="text-xs text-gray-500 mt-1">Friday</p>
                                            </div>
                                            <div class="text-3xl text-purple-600 opacity-20">
                                                <i class="fas fa-calendar-check"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm">
                                        <thead>
                                            <tr class="bg-gray-100">
                                                <th class="px-4 py-3 text-left">Date</th>
                                                <th class="px-4 py-3 text-left">Strategy</th>
                                                <th class="px-4 py-3 text-left">Entry</th>
                                                <th class="px-4 py-3 text-left">Exit</th>
                                                <th class="px-4 py-3 text-right">Credit</th>
                                                <th class="px-4 py-3 text-center">Contracts</th>
                                                <th class="px-4 py-3 text-right">P/L</th>
                                                <th class="px-4 py-3 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody id="dt-recent-trades-tbody">
                                            <tr>
                                                <td colspan="8" class="px-4 py-8 text-center text-gray-500 italic">
                                                    <i class="fas fa-spinner fa-spin mr-2"></i>Loading trades...
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            
                            <!-- Day of Week Statistics -->
                            <div class="card">
                                <h3 class="text-xl font-bold text-gray-800 mb-4">Statistics by Day of Week</h3>
                                <div id="dt-day-stats-container" class="space-y-3">
                                    <div class="text-center py-8 text-gray-500 italic">
                                        <i class="fas fa-spinner fa-spin mr-2"></i>Loading day of week statistics...
                                    </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Today's Trading Tab -->
                        <div id="dt-today-tab" class="daily-trade-tab-content hidden">
                            <!-- Monthly Expiration Warning Alert (shown only on Thursday before 3rd Friday) -->
                            <div id="dt-monthly-expiration-alert" class="hidden mb-6 bg-red-50 border-2 border-red-500 rounded-lg p-6 shadow-lg">
                                <div class="flex items-start gap-4">
                                    <div class="flex-shrink-0">
                                        <i class="fas fa-exclamation-triangle text-red-600 text-4xl"></i>
                                    </div>
                                    <div class="flex-1">
                                        <h3 class="text-2xl font-bold text-red-800 mb-3">
                                            ⚠️ MONTHLY EXPIRATION WARNING - DO NOT TRADE TODAY
                                        </h3>
                                        <div class="space-y-3 text-red-900">
                                            <p class="text-lg font-semibold">
                                                Today is <span class="font-bold bg-red-200 px-2 py-1 rounded">Thursday before the 3rd Friday of the month</span>
                                            </p>
                                            <p class="text-base">
                                                <strong>Critical Risk:</strong> SPX options that appear to be 0DTE today are actually <strong>MONTHLY options</strong> 
                                                that expire <strong>TOMORROW MORNING AT MARKET OPEN</strong> (not 4:15 PM today).
                                            </p>
                                            <div class="bg-red-100 border border-red-400 rounded-lg p-4 mt-3">
                                                <p class="font-semibold mb-2">Why This is Dangerous:</p>
                                                <ul class="list-disc list-inside space-y-1 text-sm">
                                                    <li><strong>Overnight Risk:</strong> Your position would carry <strong><em>significant</em></strong> overnight exposure</li>
                                                    <li><strong>Gap Risk:</strong> Market can gap <strong><em>significantly</em></strong> overnight and you have no ability to manage</li>
                                                    <li><strong>Max Loss Potential:</strong> Could realize <strong><em>full max loss</em></strong> before market opens</li>
                                                    <li><strong>No Ability To Manage:</strong> Positions <strong>CLOSE</strong> at tomorrow's open, and there is no ability to adjust/manage overnight.</li>
                                                </ul>
                                            </div>
                                            <p class="text-base font-bold mt-4 text-red-800">
                                                🛑 <strong>ACTION REQUIRED:</strong> Avoid all SPX 0DTE trades today. Resume normal trading tomorrow (Friday) with true 0DTE options.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Position Summary Card -->
                            <div class="card mb-6 bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200">
                                <!-- Open Position Display (shown when there's an active trade) -->
                                <div id="dt-open-position-display" class="hidden">
                                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <!-- SPX Price -->
                                        <div class="text-center">
                                            <h3 class="text-sm font-semibold text-gray-600 mb-2">SPX Price</h3>
                                            <div class="text-3xl font-bold text-gray-900" id="dt-spx-current">--</div>
                                            <div class="text-sm mt-1" id="dt-spx-change">--</div>
                                            <div class="text-xs text-gray-500 mt-1" id="dt-spx-time">--</div>
                                        </div>
                                        
                                        <!-- Open Trade Details -->
                                        <div class="md:col-span-2 border-l-2 border-orange-200 pl-6">
                                            <h3 class="text-sm font-semibold text-gray-600 mb-3">Open Position</h3>
                                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4" id="dt-position-details">
                                                <!-- Dynamic position details will be inserted here -->
                                            </div>
                                            <div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg" id="dt-position-info">
                                                <!-- Dynamic position info will be inserted here -->
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Active Positions Section (shown when there are active trades) -->
                                <div id="dt-active-trades-section" class="hidden">
                                    <div class="flex justify-between items-center mb-4">
                                        <h3 class="text-xl font-bold text-gray-800">
                                            <i class="fas fa-list text-orange-600 mr-2"></i>Active Positions
                                        </h3>
                                        <span id="dt-active-trade-count" class="px-3 py-1 bg-orange-100 text-orange-600 rounded-full font-semibold text-sm">0 open</span>
                                    </div>
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-sm">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Entry</th>
                                                    <th class="px-4 py-3 text-left">Strategy</th>
                                                    <th class="px-4 py-3 text-center">Contracts</th>
                                                    <th class="px-4 py-3 text-left">Call Spread</th>
                                                    <th class="px-4 py-3 text-left">Put Spread</th>
                                                    <th class="px-4 py-3 text-right">Credit</th>
                                                    <th class="px-4 py-3 text-right">Commission</th>
                                                    <th class="px-4 py-3 text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody id="dt-active-trades-tbody">
                                                <tr>
                                                    <td colspan="8" class="px-4 py-8 text-center text-gray-500 italic">
                                                        <i class="fas fa-spinner fa-spin mr-2"></i>Loading active trades...
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                <!-- No Open Position State (shown when no active trades) -->
                                <div id="dt-no-open-position" class="hidden text-center py-8">
                                    <div class="mb-4">
                                        <i class="fas fa-chart-line text-gray-300 text-5xl mb-3"></i>
                                        <h3 class="text-lg font-semibold text-gray-700 mb-2">Ready to Start Trading</h3>
                                        <p class="text-gray-500 text-sm">No active positions yet. Use the Quick Entry Form below to enter your first trade.</p>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Quick Entry Form -->
                            <div class="card mb-6">
                                <div class="flex justify-between items-center mb-4">
                                    <h3 class="text-xl font-bold text-gray-800">
                                        <i class="fas fa-plus-circle text-orange-600 mr-2"></i>Quick Entry Form
                                    </h3>
                                    <div class="flex items-center gap-2">
                                        <span class="text-sm text-gray-600">Auto-Position Sizing</span>
                                        <label class="relative inline-block w-12 h-6">
                                            <input type="checkbox" id="dt-profit-sizing-toggle" class="sr-only peer" onchange="toggleAutoPositionSizing()">
                                            <div class="w-full h-full bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                        </label>
                                    </div>
                                </div>
                                
                                <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                                    <div>
                                        <label class="block text-gray-700 font-semibold mb-1 text-sm">Entry Date</label>
                                        <input type="date" id="dt-entry-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    </div>
                                    <div>
                                        <label class="block text-gray-700 font-semibold mb-1 text-sm">Entry Time</label>
                                        <input type="time" id="dt-entry-time" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    </div>
                                    <div>
                                        <label class="block text-gray-700 font-semibold mb-1 text-sm">SPX Price</label>
                                        <input type="number" step="0.01" id="dt-spx-price" placeholder="4856.20" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    </div>
                                    <div>
                                        <label class="block text-gray-700 font-semibold mb-1 text-sm">VIX Price</label>
                                        <input type="number" step="0.01" id="dt-vix-price" placeholder="18.50" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    </div>
                                    <div>
                                        <label class="block text-gray-700 font-semibold mb-1 text-sm">Contracts</label>
                                        <input type="number" id="dt-contracts" value="1" min="1" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-sm">
                                        <small class="text-xs text-gray-500 mt-1 block" id="dt-contracts-hint">Manual Entry</small>
                                    </div>
                                </div>
                                
                                <!-- Strategy Type Toggle -->
                                <div class="mb-4">
                                    <label class="block text-gray-700 font-semibold mb-2">Strategy Type</label>
                                    <div class="flex gap-2">
                                        <button class="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold">Iron Condor (Both Sides)</button>
                                        <button class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">Credit Spread (One Side)</button>
                                    </div>
                                </div>
                                
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <!-- Call Spread -->
                                    <div class="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                                        <div class="flex items-center justify-between mb-3">
                                            <h4 class="font-bold text-gray-800"><span class="text-red-600">BEARISH:</span> Call Spread <span class="text-sm font-normal text-gray-600" id="call-spread-width-display">($5 wide)</span></h4>
                                            <label class="flex items-center">
                                                <input type="checkbox" checked class="mr-2" id="enable-call-spread">
                                                <span class="text-sm">Enable</span>
                                            </label>
                                        </div>
                                        <div class="space-y-3">
                                            <div class="grid grid-cols-3 gap-2">
                                                <div>
                                                    <label class="block text-xs text-gray-600 mb-1">Short Call Strike</label>
                                                    <input type="number" step="0.01" value="4870" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" id="call-short-strike">
                                                </div>
                                                <div>
                                                    <label class="block text-xs text-gray-600 mb-1">Premium Collected ($)</label>
                                                    <input type="number" step="0.01" value="0.70" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" id="call-total-credit">
                                                </div>
                                                <div>
                                                    <label class="block text-xs text-gray-600 mb-1">Commission ($)</label>
                                                    <input type="number" step="0.01" value="1.30" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" id="call-commission">
                                                </div>
                                            </div>
                                            <div class="bg-white rounded p-2 text-sm">
                                                <div class="flex justify-between mb-1">
                                                    <span class="text-gray-600">Total Dollars At Work:</span>
                                                    <span class="font-semibold text-orange-600" id="call-dollars-at-work">$500.00</span>
                                                </div>
                                                <div class="flex justify-between mb-1">
                                                    <span class="text-gray-600">Total Credit:</span>
                                                    <span class="font-semibold text-green-600" id="call-total-credit-display">$70.00</span>
                                                </div>
                                                <div class="flex justify-between">
                                                    <span class="text-gray-600">Distance from SPX:</span>
                                                    <span class="font-semibold text-blue-600" id="call-distance">+13.80 pts (0.28%)</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Put Spread -->
                                    <div class="border-2 border-green-200 rounded-lg p-4 bg-green-50">
                                        <div class="flex items-center justify-between mb-3">
                                            <h4 class="font-bold text-gray-800"><span class="text-green-600">BULLISH:</span> Put Spread <span class="text-sm font-normal text-gray-600" id="put-spread-width-display">($5 wide)</span></h4>
                                            <label class="flex items-center">
                                                <input type="checkbox" checked class="mr-2" id="enable-put-spread">
                                                <span class="text-sm">Enable</span>
                                            </label>
                                        </div>
                                        <div class="space-y-3">
                                            <div class="grid grid-cols-3 gap-2">
                                                <div>
                                                    <label class="block text-xs text-gray-600 mb-1">Short Put Strike</label>
                                                    <input type="number" step="0.01" value="4840" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" id="put-short-strike">
                                                </div>
                                                <div>
                                                    <label class="block text-xs text-gray-600 mb-1">Premium Collected ($)</label>
                                                    <input type="number" step="0.01" value="0.80" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" id="put-total-credit">
                                                </div>
                                                <div>
                                                    <label class="block text-xs text-gray-600 mb-1">Commission ($)</label>
                                                    <input type="number" step="0.01" value="1.30" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" id="put-commission">
                                                </div>
                                            </div>
                                            <div class="bg-white rounded p-2 text-sm">
                                                <div class="flex justify-between mb-1">
                                                    <span class="text-gray-600">Total Dollars At Work:</span>
                                                    <span class="font-semibold text-orange-600" id="put-dollars-at-work">$500.00</span>
                                                </div>
                                                <div class="flex justify-between mb-1">
                                                    <span class="text-gray-600">Total Credit:</span>
                                                    <span class="font-semibold text-green-600" id="put-total-credit-display">$80.00</span>
                                                </div>
                                                <div class="flex justify-between">
                                                    <span class="text-gray-600">Distance from SPX:</span>
                                                    <span class="font-semibold text-blue-600" id="put-distance">-16.20 pts (0.33%)</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Trade Summary -->
                                <div class="mt-4 p-4 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200">
                                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                                        <div>
                                            <div class="text-sm text-gray-600">Total Premium Credit</div>
                                            <div class="text-xl font-bold text-green-600" id="dt-total-credit">$1.50</div>
                                            <div class="text-xs text-gray-500">per contract</div>
                                        </div>
                                        <div>
                                            <div class="text-sm text-gray-600">Max Risk</div>
                                            <div class="text-xl font-bold text-red-600" id="dt-max-risk">$350.00</div>
                                        </div>
                                        <div>
                                            <div class="text-sm text-gray-600">Commission</div>
                                            <div class="text-xl font-bold text-gray-700" id="dt-total-commission">$2.60</div>
                                        </div>
                                        <div>
                                            <div class="text-sm text-gray-600">Net Credit</div>
                                            <div class="text-xl font-bold text-green-600" id="dt-net-credit">$147.40</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Notes -->
                                <div class="mt-4">
                                    <label class="block text-gray-700 font-semibold mb-2">Trade Notes (Optional)</label>
                                    <textarea id="dt-notes" class="w-full px-4 py-2 border border-gray-300 rounded-lg" rows="2" placeholder="Add notes about market conditions, reasoning, etc."></textarea>
                                </div>
                                
                                <!-- Action Buttons -->
                                <div class="mt-4 flex gap-4">
                                    <button onclick="submitDailyTrade()" class="flex-1 bg-gradient-to-r from-orange-600 to-orange-700 text-white px-6 py-3 rounded-lg font-bold hover:from-orange-700 hover:to-orange-800">
                                        <i class="fas fa-rocket mr-2"></i>Enter Trade
                                    </button>
                                    <button onclick="resetDailyTradeForm()" class="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50">
                                        <i class="fas fa-redo mr-2"></i>Reset Form
                                    </button>
                                    <button onclick="openDailyTradeConfig()" class="px-6 py-3 border-2 border-orange-300 text-orange-700 rounded-lg font-semibold hover:bg-orange-50">
                                        <i class="fas fa-cog mr-2"></i>Load Config
                                    </button>
                                </div>
                            </div>
                            
                            <!-- Closed Positions Today -->
                            <div class="card mb-6">
                                <h3 class="text-xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-check-circle text-green-600 mr-2"></i>Closed Positions Today
                                </h3>
                                <div id="dt-closed-positions-container" class="overflow-x-auto">
                                    <div class="text-center py-8 text-gray-500 italic">
                                        <i class="fas fa-spinner fa-spin mr-2"></i>Loading closed positions...
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Trade Journal -->
                            <div class="card">
                                <h3 class="text-xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-book text-orange-600 mr-2"></i>Trade Journal
                                </h3>
                                <div id="dt-journal-entries" class="space-y-2 mb-4">
                                    <div class="text-center py-8 text-gray-500 italic">
                                        <i class="fas fa-spinner fa-spin mr-2"></i>Loading journal entries...
                                    </div>
                                </div>
                                <div class="flex gap-2">
                                    <input type="text" id="dt-journal-input" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg" placeholder="Add journal entry...">
                                    <button onclick="addJournalEntry()" class="px-6 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700">
                                        <i class="fas fa-plus mr-2"></i>Add
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    
                    <!-- Utilities Section -->
                    <div id="utilities-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-3xl font-bold text-brand-teal">
                                <i class="fas fa-tools mr-2"></i>Utilities
                            </h2>
                        </div>
                        
                        <!-- Utilities Tabs -->
                        <div class="mb-6">
                            <div class="border-b border-gray-200">
                                <nav class="flex gap-4">
                                    <button onclick="showUtilityTab('option-tax')" data-utility-tab="option-tax" class="utility-tab px-4 py-3 font-semibold text-gray-600 border-b-2 border-transparent hover:text-brand-teal hover:border-brand-teal transition-colors active">
                                        <i class="fas fa-file-invoice-dollar mr-2"></i>Option Tax Transform
                                    </button>
                                    <button onclick="showUtilityTab('historical-balances')" data-utility-tab="historical-balances" class="utility-tab px-4 py-3 font-semibold text-gray-600 border-b-2 border-transparent hover:text-brand-teal hover:border-brand-teal transition-colors">
                                        <i class="fas fa-history mr-2"></i>Historical Balances
                                    </button>
                                    <button onclick="showUtilityTab('dividend-repository')" data-utility-tab="dividend-repository" class="utility-tab px-4 py-3 font-semibold text-gray-600 border-b-2 border-transparent hover:text-brand-teal hover:border-brand-teal transition-colors">
                                        <i class="fas fa-coins mr-2"></i>Dividend Repository
                                    </button>
                                </nav>
                            </div>
                        </div>
                        
                        <!-- Option Tax Transform Tool -->
                        <div id="option-tax-utility" class="utility-content">
                        <div class="card mb-6">
                            <div class="flex items-start gap-4 mb-4">
                                <div class="bg-brand-teal text-white p-3 rounded-lg">
                                    <i class="fas fa-file-invoice-dollar text-2xl"></i>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-xl font-bold text-gray-800 mb-2">Option Tax Transform</h3>
                                    <p class="text-gray-600 mb-4">Transform option transaction CSV files for tax reporting. Groups transactions by underlying symbol and merges buy/sell lines.</p>
                                    
                                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                        <h4 class="font-semibold text-blue-900 mb-2">
                                            <i class="fas fa-info-circle mr-2"></i>How to Use:
                                        </h4>
                                        <ol class="list-decimal list-inside text-sm text-blue-800 space-y-1">
                                            <li>Export your option transactions from your broker as CSV</li>
                                            <li>Upload the CSV file using the button below</li>
                                            <li>The tool will transform and download the processed file</li>
                                        </ol>
                                    </div>
                                    
                                    <!-- Expected Format Example -->
                                    <details class="bg-gray-50 border border-gray-300 rounded-lg p-4 mb-4">
                                        <summary class="font-semibold text-gray-800 cursor-pointer hover:text-brand-teal">
                                            <i class="fas fa-file-alt mr-2"></i>Expected Input Format (Click to expand)
                                        </summary>
                                        <div class="mt-3">
                                            <p class="text-sm text-gray-600 mb-2">Your CSV should have this structure:</p>
                                            <div class="bg-white p-3 rounded border border-gray-200 overflow-x-auto">
                                                <pre class="text-xs font-mono text-gray-700">Transaction History[TAB]Header[TAB]Date[TAB]Account[TAB]Description[TAB]Transaction Type[TAB]Symbol[TAB]Quantity[TAB]Price[TAB]Price Currency[TAB]Gross Amount[TAB]Commission[TAB]Net Amount
Transaction History[TAB]Data[TAB]2025-01-31[TAB]U***13773[TAB]MSFT 18JUL25 390 P[TAB]Sell[TAB]MSFT  250718P00390000[TAB]-2[TAB]12.4[TAB]USD[TAB]2480[TAB]-1.49[TAB]2478.51
Transaction History[TAB]Data[TAB]2025-01-24[TAB]U***13773[TAB]NVDA 07FEB25 138 P[TAB]Sell[TAB]NVDA  250207P00138000[TAB]-1[TAB]1.69[TAB]USD[TAB]169[TAB]-1.06[TAB]167.94</pre>
                                            </div>
                                            <p class="text-xs text-gray-500 mt-2">
                                                <i class="fas fa-info-circle mr-1"></i>Note: [TAB] represents a tab character. Most broker exports use tabs to separate columns.
                                            </p>
                                        </div>
                                    </details>
                                    
                                    <!-- File Upload Area -->
                                    <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-brand-teal transition-colors">
                                        <input type="file" id="option-tax-file" accept=".csv" class="hidden" onchange="handleOptionTaxFileUpload(event)">
                                        <label for="option-tax-file" class="cursor-pointer">
                                            <i class="fas fa-cloud-upload-alt text-4xl text-gray-400 mb-3"></i>
                                            <p class="text-gray-600 font-semibold mb-2">Click to upload CSV file</p>
                                            <p class="text-sm text-gray-500">or drag and drop your file here</p>
                                        </label>
                                    </div>
                                    
                                    <!-- Progress/Status Area -->
                                    <div id="option-tax-status" class="hidden mt-4">
                                        <div class="flex items-center justify-center gap-3 text-gray-600">
                                            <i class="fas fa-spinner fa-spin text-brand-teal"></i>
                                            <span id="option-tax-status-text">Processing...</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        </div>
                        
                        <!-- Historical Account Balances Tool -->
                        <div id="historical-balances-utility" class="utility-content hidden">
                        <div class="card mb-6">
                            <div class="flex items-start gap-4 mb-4">
                                <div class="bg-brand-teal text-white p-3 rounded-lg">
                                    <i class="fas fa-history text-2xl"></i>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-xl font-bold text-gray-800 mb-2">Historical Account Balances</h3>
                                    <p class="text-gray-600 mb-4">Track account balances over time for portfolio performance analysis and growth charts.</p>
                                    
                                    <!-- Add Balance Form -->
                                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                        <h4 class="font-semibold text-blue-900 mb-3">
                                            <i class="fas fa-plus-circle mr-2"></i>Add Historical Balance
                                        </h4>
                                        
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label class="block text-sm font-semibold text-gray-700 mb-2">Account</label>
                                                <select id="hist-balance-account" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal">
                                                    <option value="">Select Account...</option>
                                                </select>
                                            </div>
                                            
                                            <div>
                                                <label class="block text-sm font-semibold text-gray-700 mb-2">Month/Year</label>
                                                <input type="month" id="hist-balance-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal">
                                            </div>
                                            
                                            <div>
                                                <label class="block text-sm font-semibold text-gray-700 mb-2">Currency</label>
                                                <select id="hist-balance-currency" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" onchange="calculateHistoricalBalance()">
                                                    <option value="USD">USD</option>
                                                    <option value="CAD">CAD</option>
                                                </select>
                                            </div>
                                            
                                            <div>
                                                <label class="block text-sm font-semibold text-gray-700 mb-2">Balance Amount</label>
                                                <input type="number" id="hist-balance-amount" step="0.01" placeholder="0.00" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" oninput="calculateHistoricalBalance()">
                                            </div>
                                            
                                            <div>
                                                <label class="block text-sm font-semibold text-gray-700 mb-2">Exchange Rate</label>
                                                <input type="number" id="hist-balance-rate" step="0.000001" placeholder="1.35" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" oninput="calculateHistoricalBalance()">
                                                <p class="text-xs text-gray-500 mt-1">CAD per 1 USD</p>
                                            </div>
                                            
                                            <div>
                                                <label class="block text-sm font-semibold text-gray-700 mb-2">Calculated Balance</label>
                                                <input type="text" id="hist-balance-calculated" readonly class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700">
                                                <p class="text-xs text-gray-500 mt-1" id="hist-balance-calculated-label">USD Balance</p>
                                            </div>
                                        </div>
                                        
                                        <div class="mt-4 flex gap-3">
                                            <button onclick="saveHistoricalBalance()" class="px-6 py-2 bg-brand-teal text-white rounded-lg font-semibold hover:bg-teal-700">
                                                <i class="fas fa-save mr-2"></i>Save Balance
                                            </button>
                                            <button onclick="clearHistoricalBalanceForm()" class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400">
                                                <i class="fas fa-times mr-2"></i>Clear
                                            </button>
                                        </div>
                                        
                                        <input type="hidden" id="hist-balance-edit-id">
                                    </div>
                                    
                                    <!-- Historical Balances Table -->
                                    <div class="bg-gray-50 border border-gray-300 rounded-lg p-4">
                                        <div class="flex justify-between items-center mb-3">
                                            <h4 class="font-semibold text-gray-800">
                                                <i class="fas fa-list mr-2"></i>Recent Historical Balances (Last 24 Entries)
                                            </h4>
                                            <div class="flex items-center gap-2">
                                                <label class="text-sm font-semibold text-gray-700">Filter by Account:</label>
                                                <select id="hist-balance-filter" onchange="filterHistoricalBalances()" class="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm">
                                                    <option value="">All Accounts</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="overflow-x-auto">
                                            <table class="min-w-full bg-white border border-gray-200 rounded-lg">
                                                <thead class="bg-gray-100">
                                                    <tr>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Date</th>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Account</th>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Currency</th>
                                                        <th class="px-4 py-2 text-right text-sm font-semibold text-gray-700">Amount</th>
                                                        <th class="px-4 py-2 text-right text-sm font-semibold text-gray-700">Rate</th>
                                                        <th class="px-4 py-2 text-right text-sm font-semibold text-gray-700">USD</th>
                                                        <th class="px-4 py-2 text-right text-sm font-semibold text-gray-700">CAD</th>
                                                        <th class="px-4 py-2 text-center text-sm font-semibold text-gray-700">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody id="historical-balances-table">
                                                    <tr>
                                                        <td colspan="8" class="px-4 py-8 text-center text-gray-500">
                                                            <i class="fas fa-inbox text-3xl mb-2"></i>
                                                            <p>No historical balances yet</p>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>
                    
                    <!-- Edit Historical Balance Modal -->
                    <div id="edit-hist-balance-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
                        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                            <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                                <h3 class="text-2xl font-bold text-brand-teal">
                                    <i class="fas fa-edit mr-2"></i>Edit Historical Balance
                                </h3>
                                <button onclick="closeEditHistBalanceModal()" class="text-gray-500 hover:text-gray-700">
                                    <i class="fas fa-times text-2xl"></i>
                                </button>
                            </div>
                            
                            <div class="p-6">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">Account</label>
                                        <select id="edit-hist-balance-account" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal">
                                            <option value="">Select Account...</option>
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">Month/Year</label>
                                        <input type="month" id="edit-hist-balance-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal">
                                    </div>
                                    
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">Currency</label>
                                        <select id="edit-hist-balance-currency" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" onchange="calculateEditHistoricalBalance()">
                                            <option value="USD">USD</option>
                                            <option value="CAD">CAD</option>
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">Balance Amount</label>
                                        <input type="number" id="edit-hist-balance-amount" step="0.01" placeholder="0.00" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" oninput="calculateEditHistoricalBalance()">
                                    </div>
                                    
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">Exchange Rate</label>
                                        <input type="number" id="edit-hist-balance-rate" step="0.000001" placeholder="1.35" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" oninput="calculateEditHistoricalBalance()">
                                        <p class="text-xs text-gray-500 mt-1">CAD per 1 USD</p>
                                    </div>
                                    
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">Calculated Balance</label>
                                        <input type="text" id="edit-hist-balance-calculated" readonly class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700">
                                        <p class="text-xs text-gray-500 mt-1" id="edit-hist-balance-calculated-label">USD Balance</p>
                                    </div>
                                </div>
                                
                                <div class="mt-6 flex gap-3 justify-end">
                                    <button onclick="closeEditHistBalanceModal()" class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400">
                                        <i class="fas fa-times mr-2"></i>Cancel
                                    </button>
                                    <button onclick="saveEditHistoricalBalance()" class="px-6 py-2 bg-brand-teal text-white rounded-lg font-semibold hover:bg-teal-700">
                                        <i class="fas fa-save mr-2"></i>Save Changes
                                    </button>
                                </div>
                                
                                <input type="hidden" id="edit-hist-balance-id">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Dividend Repository Utility -->
                    <div id="dividend-repository-utility" class="utility-content hidden">
                        <div class="card mb-6">
                            <div class="flex items-start gap-4 mb-4">
                                <div class="bg-brand-gold text-white p-3 rounded-lg">
                                    <i class="fas fa-coins text-2xl"></i>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-xl font-bold text-gray-800 mb-2">Dividend Repository</h3>
                                    <p class="text-gray-600 mb-4">
                                        Automatically fetch and track dividends for all your stock holdings from 2026 onwards. 
                                        Uses a dual-API approach: <strong>Polygon.io (Massive)</strong> for US stocks and <strong>EODHD</strong> as automatic fallback for Canadian stocks (.TO, .V).
                                    </p>
                                    
                                    <!-- API Information Panel (Collapsible) -->
                                    <details class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                        <summary class="font-semibold text-gray-900 cursor-pointer hover:text-blue-700 flex items-center">
                                            <i class="fas fa-info-circle mr-2 text-blue-600"></i>
                                            <span>API Coverage & Limitations</span>
                                            <i class="fas fa-chevron-down ml-2 text-xs text-blue-600"></i>
                                        </summary>
                                        <div class="mt-3">
                                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <p class="font-semibold text-gray-900 mb-1">
                                                        <i class="fas fa-flag-usa mr-1 text-blue-600"></i>Polygon.io (Massive) - Primary
                                                    </p>
                                                    <ul class="text-gray-700 space-y-1 ml-4">
                                                        <li><i class="fas fa-check text-green-600 mr-1"></i>US stocks (NYSE, NASDAQ, AMEX)</li>
                                                        <li><i class="fas fa-check text-green-600 mr-1"></i>250 requests/day free tier</li>
                                                        <li><i class="fas fa-check text-green-600 mr-1"></i>Weekly, monthly, quarterly dividends</li>
                                                        <li><i class="fas fa-times text-red-600 mr-1"></i>No Canadian stock support</li>
                                                    </ul>
                                                </div>
                                                <div>
                                                    <p class="font-semibold text-gray-900 mb-1">
                                                        <i class="fas fa-leaf mr-1 text-green-600"></i>EODHD - Automatic Fallback
                                                    </p>
                                                    <ul class="text-gray-700 space-y-1 ml-4">
                                                        <li><i class="fas fa-check text-green-600 mr-1"></i>Canadian stocks (TSX, TSXV)</li>
                                                        <li><i class="fas fa-check text-green-600 mr-1"></i>Tickers ending in .TO or .V</li>
                                                        <li><i class="fas fa-check text-green-600 mr-1"></i>1 year dividend history</li>
                                                        <li><i class="fas fa-info text-blue-600 mr-1"></i>Activated when Massive returns 0</li>
                                                    </ul>
                                                </div>
                                            </div>
                                            <p class="text-xs text-gray-600 mt-3">
                                                <i class="fas fa-clock mr-1"></i><strong>Processing Time:</strong> ~4-5 minutes for full portfolio (12.5 second delay between tickers to respect rate limits)
                                            </p>
                                            <p class="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                                <i class="fas fa-exclamation-triangle mr-1"></i><strong>Important:</strong> Do not trigger multiple fetches in quick succession. If you receive rate limit errors (HTTP 429), wait at least 1 minute before retrying.
                                            </p>
                                        </div>
                                    </details>
                                    
                                    <!-- Fetch Dividends Section (Collapsible) -->
                                    <details class="bg-gradient-to-br from-gold-50 to-white border border-brand-gold rounded-lg p-4 mb-4">
                                        <summary class="font-semibold text-gray-900 cursor-pointer hover:text-brand-gold flex items-center">
                                            <i class="fas fa-download mr-2 text-brand-gold"></i>
                                            <span>Fetch Dividends</span>
                                            <i class="fas fa-chevron-down ml-2 text-xs text-brand-gold"></i>
                                        </summary>
                                        <div class="mt-3">
                                            <p class="text-sm text-gray-700 mb-3">
                                                This will check all your stock holdings for dividend payments since January 1, 2026. The system will:
                                            </p>
                                            <ul class="text-sm text-gray-700 space-y-1 mb-4 ml-4">
                                                <li><i class="fas fa-check text-green-600 mr-2"></i>Try Polygon.io (Massive) first for all tickers</li>
                                                <li><i class="fas fa-check text-green-600 mr-2"></i>Automatically fallback to EODHD for Canadian stocks</li>
                                                <li><i class="fas fa-check text-green-600 mr-2"></i>Only include dividends from 2026 onwards</li>
                                                <li><i class="fas fa-check text-green-600 mr-2"></i>Store results in global dividend repository</li>
                                                <li><i class="fas fa-check text-green-600 mr-2"></i>Deduplicate tickers to minimize API calls</li>
                                            </ul>
                                            <button onclick="fetchDividends()" id="fetch-dividends-btn" class="btn-primary w-full">
                                                <i class="fas fa-sync mr-2"></i>Fetch Dividends for All Holdings
                                            </button>
                                            <div id="fetch-status" class="mt-3 text-sm"></div>
                                        </div>
                                    </details>
                                    
                                    <!-- Filter Section -->
                                    <div class="flex gap-4 mb-4">
                                        <div class="flex-1">
                                            <label class="block text-sm font-semibold text-gray-700 mb-2">Filter by Ticker</label>
                                            <input type="text" id="dividend-ticker-filter" placeholder="e.g., AAPL" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" onkeyup="loadDividendRepository()">
                                        </div>
                                        <div class="flex items-end">
                                            <button onclick="loadDividendRepository()" class="btn-secondary h-[42px]">
                                                <i class="fas fa-search mr-2"></i>Search
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <!-- Dividend Repository Table -->
                                    <div class="border border-gray-200 rounded-lg overflow-hidden">
                                        <div class="overflow-x-auto">
                                            <table class="w-full">
                                                <thead class="bg-gray-100">
                                                    <tr>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Ticker</th>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Ex-Date</th>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Pay Date</th>
                                                        <th class="px-4 py-2 text-right text-sm font-semibold text-gray-700">Amount/Share</th>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Frequency</th>
                                                        <th class="px-4 py-2 text-center text-sm font-semibold text-gray-700">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody id="dividend-repository-table">
                                                    <tr>
                                                        <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                                                            <i class="fas fa-coins text-3xl mb-2"></i>
                                                            <p>No dividends found yet. Click "Fetch Dividends" to start.</p>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    
                                    <!-- Fetch Logs -->
                                    <details class="mt-4 bg-gray-50 border border-gray-300 rounded-lg p-4">
                                        <summary class="font-semibold text-gray-800 cursor-pointer hover:text-brand-teal">
                                            <i class="fas fa-history mr-2"></i>Fetch History Logs
                                        </summary>
                                        <div class="mt-3 space-y-2" id="dividend-fetch-logs">
                                            <p class="text-sm text-gray-500">No fetch history yet</p>
                                        </div>
                                    </details>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Edit Dividend Modal -->
                    <div id="edit-dividend-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
                        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                            <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                                <h3 class="text-2xl font-bold text-brand-teal">
                                    <i class="fas fa-edit mr-2"></i>Edit Dividend Entry
                                </h3>
                                <button onclick="closeEditDividendModal()" class="text-gray-500 hover:text-gray-700">
                                    <i class="fas fa-times text-2xl"></i>
                                </button>
                            </div>
                            
                            <div class="p-6 space-y-4">
                                <!-- Ticker (read-only) -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">Ticker</label>
                                    <input type="text" id="edit-dividend-ticker" readonly class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50" />
                                </div>
                                
                                <!-- Ex-Dividend Date -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">
                                        Ex-Dividend Date <span class="text-red-500">*</span>
                                    </label>
                                    <input type="date" id="edit-dividend-ex-date" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                                    <p class="text-xs text-gray-500 mt-1">Date when stock trades without dividend</p>
                                </div>
                                
                                <!-- Pay Date -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">Pay Date</label>
                                    <input type="date" id="edit-dividend-pay-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                                    <p class="text-xs text-gray-500 mt-1">Date when dividend is paid (optional)</p>
                                </div>
                                
                                <!-- Record Date -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">Record Date</label>
                                    <input type="date" id="edit-dividend-record-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                                    <p class="text-xs text-gray-500 mt-1">Date of record for dividend eligibility (optional)</p>
                                </div>
                                
                                <!-- Declaration Date -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">Declaration Date</label>
                                    <input type="date" id="edit-dividend-declared-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                                    <p class="text-xs text-gray-500 mt-1">Date when dividend was declared (optional)</p>
                                </div>
                                
                                <!-- Amount per Share -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">
                                        Amount per Share <span class="text-red-500">*</span>
                                    </label>
                                    <input type="number" id="edit-dividend-amount" step="0.0001" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                                    <p class="text-xs text-gray-500 mt-1">Dividend amount in dollars (e.g., 0.1234)</p>
                                </div>
                                
                                <!-- Frequency -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">Frequency</label>
                                    <select id="edit-dividend-frequency" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal">
                                        <option value="52">Weekly (52)</option>
                                        <option value="12">Monthly (12)</option>
                                        <option value="4">Quarterly (4)</option>
                                        <option value="2">Semi-Annual (2)</option>
                                        <option value="1">Annual (1)</option>
                                    </select>
                                    <p class="text-xs text-gray-500 mt-1">Expected number of dividend payments per year</p>
                                </div>
                                
                                <!-- Buttons -->
                                <div class="flex gap-3 justify-end pt-4 border-t">
                                    <button onclick="closeEditDividendModal()" class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400">
                                        <i class="fas fa-times mr-2"></i>Cancel
                                    </button>
                                    <button onclick="saveEditDividend()" class="px-6 py-2 bg-brand-teal text-white rounded-lg font-semibold hover:bg-teal-700">
                                        <i class="fas fa-save mr-2"></i>Save Changes
                                    </button>
                                </div>
                                
                                <input type="hidden" id="edit-dividend-id">
                            </div>
                        </div>
                    </div>
                    </div>
                    <!-- End Utilities Section -->
                    
                    <!-- Reports Section -->
                    <!-- NEW REPORTS SECTION WITH TABS -->
                    <div id="reports-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-3xl font-bold text-brand-teal">
                                <i class="fas fa-chart-bar mr-2"></i>Reports Dashboard
                            </h2>
                            <div class="text-sm text-gray-600">
                                <i class="fas fa-info-circle mr-1"></i>
                                Comprehensive portfolio analysis and insights
                            </div>
                        </div>
                        
                        <!-- Tab Navigation -->
                        <div class="mb-6 border-b border-gray-200">
                            <nav class="flex flex-wrap gap-2">
                                <button onclick="showReportTab('overview')" class="report-tab active px-6 py-3 font-semibold text-brand-teal border-b-2 border-brand-teal" data-tab="overview">
                                    <i class="fas fa-chart-pie mr-2"></i>Portfolio Overview
                                </button>
                                <button onclick="showReportTab('pl-summary')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="pl-summary">
                                    <i class="fas fa-dollar-sign mr-2"></i>P/L Summary
                                </button>
                                <button onclick="showReportTab('performance')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="performance">
                                    <i class="fas fa-chart-line mr-2"></i>Performance
                                </button>
                                <button onclick="showReportTab('strategy')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="strategy">
                                    <i class="fas fa-chess mr-2"></i>Strategy Analysis
                                </button>
                                <button onclick="showReportTab('positions')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="positions">
                                    <i class="fas fa-sitemap mr-2"></i>Position Analysis
                                </button>
                                <button onclick="showReportTab('dividends')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="dividends">
                                    <i class="fas fa-coins mr-2"></i>Dividends
                                </button>
                                <button onclick="showReportTab('monthly-income')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="monthly-income">
                                    <i class="fas fa-money-bill-wave mr-2"></i>Monthly Income
                                </button>
                                <button onclick="showReportTab('closed-trades')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="closed-trades">
                                    <i class="fas fa-history mr-2"></i>Closed Trades
                                </button>
                            </nav>
                        </div>
                        
                        <!-- Portfolio Overview Tab -->
                        <div id="report-tab-overview" class="report-tab-content">
                            <div class="mb-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">Portfolio Overview</h3>
                                
                                <!-- Key Metrics Cards -->
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    <div class="card bg-gradient-to-br from-teal-50 to-white cursor-pointer hover:shadow-lg transition-shadow" onclick="toggleTotalValueCurrency()">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Total Value <span id="overview-currency-label">(CAD)</span></p>
                                                <p class="text-2xl font-bold text-brand-teal" id="overview-total-value">$0.00</p>
                                                <p class="text-xs text-gray-500 italic mt-1" id="overview-total-value-subtitle">USD: $0.00</p>
                                            </div>
                                            <div class="text-3xl text-brand-teal opacity-20">
                                                <i class="fas fa-wallet"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-green-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">YTD P/L</p>
                                                <p class="text-2xl font-bold text-green-600" id="overview-ytd-pl">+$0.00</p>
                                                <p class="text-xs text-gray-500 mt-1" id="overview-ytd-pl-change">↑ 0%</p>
                                            </div>
                                            <div class="text-3xl text-green-600 opacity-20">
                                                <i class="fas fa-chart-line"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-blue-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Win Rate</p>
                                                <p class="text-2xl font-bold text-blue-600" id="overview-win-rate">0%</p>
                                                <p class="text-xs text-gray-500 mt-1" id="overview-trades-count">0 trades</p>
                                            </div>
                                            <div class="text-3xl text-blue-600 opacity-20">
                                                <i class="fas fa-trophy"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-purple-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Avg Trade P/L</p>
                                                <p class="text-2xl font-bold text-purple-600" id="overview-avg-pl">$0.00</p>
                                                <p class="text-xs text-gray-500 mt-1" id="overview-best-trade">Best: $0</p>
                                            </div>
                                            <div class="text-3xl text-purple-600 opacity-20">
                                                <i class="fas fa-hand-holding-usd"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Portfolio Value Chart -->
                                <div class="card mb-6">
                                    <div class="flex justify-between items-center mb-4">
                                        <h4 class="text-lg font-bold text-gray-800">
                                            <i class="fas fa-chart-area text-brand-teal mr-2"></i>
                                            Portfolio Value Trend
                                        </h4>
                                        <div class="flex gap-2">
                                            <button onclick="changePortfolioTimeframe('ytd')" data-timeframe="ytd" class="portfolio-timeframe-btn px-3 py-1 text-sm font-semibold border border-gray-300 rounded hover:bg-brand-teal hover:text-white hover:border-brand-teal transition-colors">
                                                YTD
                                            </button>
                                            <button onclick="changePortfolioTimeframe('12months')" data-timeframe="12months" class="portfolio-timeframe-btn px-3 py-1 text-sm font-semibold border border-gray-300 rounded bg-brand-teal text-white border-brand-teal">
                                                Last 12 Months
                                            </button>
                                            <button onclick="changePortfolioTimeframe('all')" data-timeframe="all" class="portfolio-timeframe-btn px-3 py-1 text-sm font-semibold border border-gray-300 rounded hover:bg-brand-teal hover:text-white hover:border-brand-teal transition-colors">
                                                All Time
                                            </button>
                                        </div>
                                    </div>
                                    <div style="position: relative;">
                                        <div id="overview-portfolio-chart" style="height: 350px;"></div>
                                        <div id="portfolio-chart-loading" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.9); z-index: 10; justify-content: center; align-items: center;">
                                            <div style="text-align: center;">
                                                <i class="fas fa-spinner fa-spin text-brand-teal" style="font-size: 2rem;"></i>
                                                <p class="mt-2 text-gray-600 font-semibold">Loading chart data...</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Account Breakdown and Monthly P/L -->
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    <div class="card">
                                        <h4 class="text-lg font-bold text-gray-800 mb-4">
                                            <i class="fas fa-building text-blue-600 mr-2"></i>
                                            Account Distribution
                                        </h4>
                                        <div id="overview-account-chart" style="height: 300px;"></div>
                                    </div>
                                    
                                    <div class="card">
                                        <h4 class="text-lg font-bold text-gray-800 mb-4">
                                            <i class="fas fa-calendar-alt text-green-600 mr-2"></i>
                                            Monthly P/L Breakdown
                                        </h4>
                                        <div id="overview-monthly-pl-chart" style="height: 300px;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- P/L Summary Tab -->
                        <div id="report-tab-pl-summary" class="report-tab-content hidden">
                            <div class="mb-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-dollar-sign text-green-600 mr-2"></i>
                                    Profit & Loss Summary
                                </h3>
                                
                                <!-- Time Period Selector -->
                                <div class="card mb-6">
                                    <div class="flex items-center gap-2 mb-4">
                                        <i class="fas fa-calendar-alt text-brand-teal"></i>
                                        <span class="font-semibold text-gray-700">Time Period:</span>
                                    </div>
                                    <div class="flex flex-wrap gap-2">
                                        <button onclick="loadPLSummary('mtd')" class="pl-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="mtd">
                                            MTD
                                        </button>
                                        <button onclick="loadPLSummary('qtd')" class="pl-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="qtd">
                                            QTD
                                        </button>
                                        <button onclick="loadPLSummary('ytd')" class="pl-period-btn active px-4 py-2 bg-brand-teal text-white rounded-lg" data-period="ytd">
                                            YTD
                                        </button>
                                        <button onclick="loadPLSummary('12months')" class="pl-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="12months">
                                            Last 12 Months
                                        </button>
                                        <button onclick="loadPLSummary('all')" class="pl-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="all">
                                            All Time
                                        </button>
                                    </div>
                                </div>
                                
                                <!-- Summary Metrics Cards -->
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    <div class="card bg-gradient-to-br from-green-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Total P/L</p>
                                                <p class="text-2xl font-bold text-green-600" id="pl-total">$0.00</p>
                                                <p class="text-xs text-gray-500 mt-1" id="pl-total-subtitle">0 trades</p>
                                            </div>
                                            <div class="text-3xl text-green-600 opacity-20">
                                                <i class="fas fa-dollar-sign"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-blue-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Win Rate</p>
                                                <p class="text-2xl font-bold text-blue-600" id="pl-win-rate">0%</p>
                                                <p class="text-xs text-gray-500 mt-1" id="pl-win-loss">0W / 0L</p>
                                            </div>
                                            <div class="text-3xl text-blue-600 opacity-20">
                                                <i class="fas fa-trophy"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-purple-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Average Trade</p>
                                                <p class="text-2xl font-bold text-purple-600" id="pl-avg-trade">$0.00</p>
                                                <p class="text-xs text-gray-500 mt-1" id="pl-avg-subtitle">Per trade</p>
                                            </div>
                                            <div class="text-3xl text-purple-600 opacity-20">
                                                <i class="fas fa-chart-bar"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-orange-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Best Trade</p>
                                                <p class="text-2xl font-bold text-orange-600" id="pl-best-trade">$0.00</p>
                                                <p class="text-xs text-gray-500 mt-1" id="pl-worst-trade">Worst: $0</p>
                                            </div>
                                            <div class="text-3xl text-orange-600 opacity-20">
                                                <i class="fas fa-star"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Charts Row -->
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    <!-- P/L by Asset Type Chart -->
                                    <div class="card">
                                        <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                            <i class="fas fa-layer-group mr-2 text-brand-teal"></i>
                                            P/L by Asset Type
                                        </h4>
                                        <div id="pl-asset-chart" style="height: 300px;"></div>
                                    </div>
                                    
                                    <!-- P/L by Account Type Chart -->
                                    <div class="card">
                                        <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                            <i class="fas fa-wallet mr-2 text-brand-teal"></i>
                                            P/L by Account Type
                                        </h4>
                                        <div id="pl-account-chart" style="height: 300px;"></div>
                                    </div>
                                </div>
                                
                                <!-- Detailed Breakdown Tables -->
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    <!-- By Asset Type Table -->
                                    <div class="card">
                                        <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                            <i class="fas fa-list mr-2 text-brand-teal"></i>
                                            Breakdown by Asset Type
                                        </h4>
                                        <div class="overflow-x-auto">
                                            <table class="w-full">
                                                <thead>
                                                    <tr class="bg-gray-100">
                                                        <th class="px-4 py-3 text-left">Asset Type</th>
                                                        <th class="px-4 py-3 text-right">Trades</th>
                                                        <th class="px-4 py-3 text-right">P/L</th>
                                                        <th class="px-4 py-3 text-right">Win Rate</th>
                                                    </tr>
                                                </thead>
                                                <tbody id="pl-asset-table">
                                                    <!-- Dynamic content -->
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    
                                    <!-- By Account Type Table -->
                                    <div class="card">
                                        <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                            <i class="fas fa-list mr-2 text-brand-teal"></i>
                                            Breakdown by Account Type
                                        </h4>
                                        <div class="overflow-x-auto">
                                            <table class="w-full">
                                                <thead>
                                                    <tr class="bg-gray-100">
                                                        <th class="px-4 py-3 text-left">Account Type</th>
                                                        <th class="px-4 py-3 text-right">Trades</th>
                                                        <th class="px-4 py-3 text-right">P/L</th>
                                                        <th class="px-4 py-3 text-right">Win Rate</th>
                                                    </tr>
                                                </thead>
                                                <tbody id="pl-account-table">
                                                    <!-- Dynamic content -->
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Monthly P/L Trend -->
                                <div class="card">
                                    <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                        <i class="fas fa-chart-line mr-2 text-brand-teal"></i>
                                        Monthly P/L Trend
                                    </h4>
                                    <div id="pl-monthly-chart" style="height: 350px;"></div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Performance Tab -->
                        <!-- Performance Charts Tab -->
                        <div id="report-tab-performance" class="report-tab-content hidden">
                            <div class="mb-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-chart-line text-blue-600 mr-2"></i>
                                    Performance Analysis
                                </h3>
                                
                                <!-- Time Period Selector -->
                                <div class="card mb-6">
                                    <div class="flex items-center gap-2 mb-4">
                                        <i class="fas fa-calendar-alt text-brand-teal"></i>
                                        <span class="font-semibold text-gray-700">Time Period:</span>
                                    </div>
                                    <div class="flex flex-wrap gap-2">
                                        <button onclick="loadPerformanceAnalysis('ytd')" class="performance-period-btn active px-4 py-2 bg-brand-teal text-white rounded-lg" data-period="ytd">
                                            YTD
                                        </button>
                                        <button onclick="loadPerformanceAnalysis('1year')" class="performance-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="1year">
                                            1 Year
                                        </button>
                                        <button onclick="loadPerformanceAnalysis('3years')" class="performance-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="3years">
                                            3 Years
                                        </button>
                                        <button onclick="loadPerformanceAnalysis('all')" class="performance-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="all">
                                            All Time
                                        </button>
                                    </div>
                                </div>
                                
                                <!-- Summary Metrics Cards -->
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    <div class="card bg-gradient-to-br from-green-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Total Return</p>
                                                <p class="text-2xl font-bold text-green-600" id="perf-total-return">0%</p>
                                                <p class="text-xs text-gray-500 mt-1" id="perf-total-pl">$0.00</p>
                                            </div>
                                            <div class="text-3xl text-green-600 opacity-20">
                                                <i class="fas fa-arrow-trend-up"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-red-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Max Drawdown</p>
                                                <p class="text-2xl font-bold text-red-600" id="perf-max-dd">0%</p>
                                                <p class="text-xs text-gray-500 mt-1" id="perf-dd-date">No data</p>
                                            </div>
                                            <div class="text-3xl text-red-600 opacity-20">
                                                <i class="fas fa-arrow-trend-down"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-blue-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Volatility</p>
                                                <p class="text-2xl font-bold text-blue-600" id="perf-volatility">0%</p>
                                                <p class="text-xs text-gray-500 mt-1">Annualized</p>
                                            </div>
                                            <div class="text-3xl text-blue-600 opacity-20">
                                                <i class="fas fa-wave-square"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-purple-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Sharpe Ratio</p>
                                                <p class="text-2xl font-bold text-purple-600" id="perf-sharpe">0.00</p>
                                                <p class="text-xs text-gray-500 mt-1">Risk-adjusted</p>
                                            </div>
                                            <div class="text-3xl text-purple-600 opacity-20">
                                                <i class="fas fa-balance-scale"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Portfolio Growth Chart -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-chart-area text-green-600 mr-2"></i>
                                        Portfolio Growth (Cumulative P/L)
                                    </h4>
                                    <div id="portfolio-growth-chart" style="height: 400px;"></div>
                                </div>
                                
                                <!-- Drawdown Analysis -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-arrow-down text-red-600 mr-2"></i>
                                        Drawdown Analysis
                                    </h4>
                                    <div id="drawdown-chart" style="height: 300px;"></div>
                                    
                                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                        <div class="p-4 bg-red-50 rounded-lg border border-red-200">
                                            <p class="text-sm text-gray-600 font-semibold mb-1">Maximum Drawdown</p>
                                            <p class="text-xl font-bold text-red-600" id="perf-max-dd-detail">0%</p>
                                            <p class="text-xs text-gray-500 mt-1" id="perf-max-dd-date">No data</p>
                                        </div>
                                        <div class="p-4 bg-orange-50 rounded-lg border border-orange-200">
                                            <p class="text-sm text-gray-600 font-semibold mb-1">Longest Drawdown</p>
                                            <p class="text-xl font-bold text-orange-600" id="perf-longest-dd">0 days</p>
                                            <p class="text-xs text-gray-500 mt-1">Duration in drawdown</p>
                                        </div>
                                        <div class="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                                            <p class="text-sm text-gray-600 font-semibold mb-1">Recovery Time</p>
                                            <p class="text-xl font-bold text-yellow-600" id="perf-recovery-time">-</p>
                                            <p class="text-xs text-gray-500 mt-1">Time to recover peak</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Rolling Returns -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-calendar-check text-blue-600 mr-2"></i>
                                        Rolling Returns (30-Day)
                                    </h4>
                                    <div id="rolling-returns-chart" style="height: 300px;"></div>
                                </div>
                                
                                <!-- Monthly Returns Table -->
                                <div class="card">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-table text-purple-600 mr-2"></i>
                                        Monthly Returns Summary
                                    </h4>
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Month</th>
                                                    <th class="px-4 py-3 text-right">Return %</th>
                                                    <th class="px-4 py-3 text-right">P/L</th>
                                                    <th class="px-4 py-3 text-center">Trades</th>
                                                    <th class="px-4 py-3 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody id="monthly-returns-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Strategy Analysis Tab -->
                        <div id="report-tab-strategy" class="report-tab-content hidden">
                            <div class="mb-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-chess text-purple-600 mr-2"></i>
                                    Strategy Analysis & Performance Comparison
                                </h3>
                                
                                <!-- Time Period Selector -->
                                <div class="card mb-6">
                                    <div class="flex items-center gap-2 mb-4">
                                        <i class="fas fa-calendar-alt text-brand-teal"></i>
                                        <span class="font-semibold text-gray-700">Time Period:</span>
                                    </div>
                                    <div class="flex flex-wrap gap-2">
                                        <button onclick="loadStrategyAnalysis('ytd')" class="strategy-period-btn active px-4 py-2 bg-brand-teal text-white rounded-lg" data-period="ytd">
                                            YTD
                                        </button>
                                        <button onclick="loadStrategyAnalysis('12months')" class="strategy-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="12months">
                                            Last 12 Months
                                        </button>
                                        <button onclick="loadStrategyAnalysis('all')" class="strategy-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="all">
                                            All Time
                                        </button>
                                    </div>
                                </div>
                                
                                <!-- Overall Performance Metrics -->
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    <div class="card bg-gradient-to-br from-green-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Total Return</p>
                                                <p class="text-2xl font-bold text-green-600" id="strategy-total-return">0%</p>
                                                <p class="text-xs text-gray-500 mt-1" id="strategy-total-pl">$0.00</p>
                                            </div>
                                            <div class="text-3xl text-green-600 opacity-20">
                                                <i class="fas fa-chart-line"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-blue-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Sharpe Ratio</p>
                                                <p class="text-2xl font-bold text-blue-600" id="strategy-sharpe">0.00</p>
                                                <p class="text-xs text-gray-500 mt-1">Risk-adjusted return</p>
                                            </div>
                                            <div class="text-3xl text-blue-600 opacity-20">
                                                <i class="fas fa-balance-scale"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-purple-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Max Drawdown</p>
                                                <p class="text-2xl font-bold text-purple-600" id="strategy-max-dd">0%</p>
                                                <p class="text-xs text-gray-500 mt-1">Peak to trough</p>
                                            </div>
                                            <div class="text-3xl text-purple-600 opacity-20">
                                                <i class="fas fa-arrow-down"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-orange-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Win Rate</p>
                                                <p class="text-2xl font-bold text-orange-600" id="strategy-win-rate">0%</p>
                                                <p class="text-xs text-gray-500 mt-1" id="strategy-win-loss">0W / 0L</p>
                                            </div>
                                            <div class="text-3xl text-orange-600 opacity-20">
                                                <i class="fas fa-trophy"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Strategy Comparison Charts -->
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    <!-- Strategy Performance Comparison -->
                                    <div class="card">
                                        <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                            <i class="fas fa-chart-bar mr-2 text-brand-teal"></i>
                                            Performance by Strategy
                                        </h4>
                                        <div id="strategy-performance-chart" style="height: 350px;"></div>
                                    </div>
                                    
                                    <!-- Win Rate by Strategy -->
                                    <div class="card">
                                        <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                            <i class="fas fa-percent mr-2 text-brand-teal"></i>
                                            Win Rate by Strategy
                                        </h4>
                                        <div id="strategy-winrate-chart" style="height: 350px;"></div>
                                    </div>
                                </div>
                                
                                <!-- Detailed Strategy Table -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                        <i class="fas fa-table mr-2 text-brand-teal"></i>
                                        Detailed Strategy Breakdown
                                    </h4>
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Strategy</th>
                                                    <th class="px-4 py-3 text-right">Trades</th>
                                                    <th class="px-4 py-3 text-right">Total P/L</th>
                                                    <th class="px-4 py-3 text-right">Avg P/L</th>
                                                    <th class="px-4 py-3 text-right">Win Rate</th>
                                                    <th class="px-4 py-3 text-right">Best Trade</th>
                                                    <th class="px-4 py-3 text-right">Worst Trade</th>
                                                    <th class="px-4 py-3 text-right">Sharpe</th>
                                                </tr>
                                            </thead>
                                            <tbody id="strategy-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                <!-- Benchmark Comparison -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                        <i class="fas fa-chart-line mr-2 text-brand-teal"></i>
                                        Benchmark Comparison
                                    </h4>
                                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                        <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                            <div class="flex items-center justify-between mb-2">
                                                <span class="text-sm font-semibold text-gray-700">SPY (S&P 500)</span>
                                                <span class="text-xs text-gray-500">YTD</span>
                                            </div>
                                            <p class="text-xl font-bold text-blue-600" id="benchmark-spy">+0.0%</p>
                                            <p class="text-xs text-gray-500 mt-1">Broad market index</p>
                                        </div>
                                        
                                        <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                            <div class="flex items-center justify-between mb-2">
                                                <span class="text-sm font-semibold text-gray-700">QQQ (Nasdaq-100)</span>
                                                <span class="text-xs text-gray-500">YTD</span>
                                            </div>
                                            <p class="text-xl font-bold text-purple-600" id="benchmark-qqq">+0.0%</p>
                                            <p class="text-xs text-gray-500 mt-1">Tech-heavy index</p>
                                        </div>
                                        
                                        <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                            <div class="flex items-center justify-between mb-2">
                                                <span class="text-sm font-semibold text-gray-700">Your Portfolio</span>
                                                <span class="text-xs text-gray-500">YTD</span>
                                            </div>
                                            <p class="text-xl font-bold text-green-600" id="benchmark-portfolio">+0.0%</p>
                                            <p class="text-xs text-gray-500 mt-1">Total return</p>
                                        </div>
                                    </div>
                                    
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Metric</th>
                                                    <th class="px-4 py-3 text-right">Your Portfolio</th>
                                                    <th class="px-4 py-3 text-right">SPY</th>
                                                    <th class="px-4 py-3 text-right">QQQ</th>
                                                    <th class="px-4 py-3 text-right">Hedge Funds*</th>
                                                </tr>
                                            </thead>
                                            <tbody id="benchmark-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                    <p class="text-xs text-gray-500 mt-4">
                                        * Hedge fund benchmarks: YTD ~8-12%, Sharpe ~1.5-2.0, Max DD ~10-15%
                                    </p>
                                </div>
                                
                                <!-- Monthly Performance Heat Map -->
                                <div class="card">
                                    <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                        <i class="fas fa-calendar-check mr-2 text-brand-teal"></i>
                                        Monthly Performance Heat Map
                                    </h4>
                                    <div id="strategy-heatmap-chart" style="height: 400px;"></div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Position Analysis Tab -->
                        <!-- Position Analysis Tab -->
                        <div id="report-tab-positions" class="report-tab-content hidden">
                            <div class="mb-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-sitemap text-orange-600 mr-2"></i>
                                    Position Analysis & Portfolio Allocation
                                </h3>
                                
                                <!-- Summary Metrics Cards -->
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    <div class="card bg-gradient-to-br from-blue-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Total Positions</p>
                                                <p class="text-2xl font-bold text-blue-600" id="pos-total-positions">0</p>
                                                <p class="text-xs text-gray-500 mt-1">Open stock positions</p>
                                            </div>
                                            <div class="text-3xl text-blue-600 opacity-20">
                                                <i class="fas fa-chart-pie"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-orange-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Top 5 Concentration</p>
                                                <p class="text-2xl font-bold text-orange-600" id="pos-top5-concentration">0%</p>
                                                <p class="text-xs text-gray-500 mt-1">Of total portfolio</p>
                                            </div>
                                            <div class="text-3xl text-orange-600 opacity-20">
                                                <i class="fas fa-compress-alt"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-green-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Diversification Score</p>
                                                <p class="text-2xl font-bold text-green-600" id="pos-diversification">0</p>
                                                <p class="text-xs text-gray-500 mt-1">Out of 100</p>
                                            </div>
                                            <div class="text-3xl text-green-600 opacity-20">
                                                <i class="fas fa-network-wired"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-purple-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Largest Position</p>
                                                <p class="text-2xl font-bold text-purple-600" id="pos-largest">0%</p>
                                                <p class="text-xs text-gray-500 mt-1">Single position weight</p>
                                            </div>
                                            <div class="text-3xl text-purple-600 opacity-20">
                                                <i class="fas fa-crown"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Top Holdings Table -->
                                <div class="card mb-6">
                                    <div class="flex items-center justify-between mb-4">
                                        <h4 class="text-lg font-bold text-gray-800">
                                            <i class="fas fa-trophy text-yellow-600 mr-2"></i>
                                            Top Holdings
                                        </h4>
                                        <div class="flex gap-2">
                                            <button 
                                                id="holdings-by-account-btn" 
                                                class="px-4 py-2 bg-brand-teal text-white rounded font-semibold hover:bg-brand-teal-dark transition"
                                                onclick="switchHoldingsView('account')"
                                            >
                                                <i class="fas fa-wallet mr-1"></i>
                                                By Account
                                            </button>
                                            <button 
                                                id="holdings-by-portfolio-btn" 
                                                class="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300 transition"
                                                onclick="switchHoldingsView('portfolio')"
                                            >
                                                <i class="fas fa-chart-pie mr-1"></i>
                                                By Portfolio
                                            </button>
                                        </div>
                                    </div>
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Rank</th>
                                                    <th class="px-4 py-3 text-left">Ticker</th>
                                                    <th class="px-4 py-3 text-left">Company</th>
                                                    <th class="px-4 py-3 text-right">Shares</th>
                                                    <th class="px-4 py-3 text-right">Avg Price</th>
                                                    <th class="px-4 py-3 text-right">Cost/Share</th>
                                                    <th class="px-4 py-3 text-right">Value</th>
                                                    <th class="px-4 py-3 text-right">Weight %</th>
                                                    <th class="px-4 py-3 text-left">Account</th>
                                                </tr>
                                            </thead>
                                            <tbody id="top-holdings-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    <!-- Sector Allocation Chart -->
                                    <div class="card">
                                        <h4 class="text-lg font-bold text-gray-800 mb-4">
                                            <i class="fas fa-building text-blue-600 mr-2"></i>
                                            Sector Allocation
                                        </h4>
                                        <div id="sector-allocation-chart" style="height: 350px;"></div>
                                    </div>
                                    
                                    <!-- Account Allocation Chart -->
                                    <div class="card">
                                        <h4 class="text-lg font-bold text-gray-800 mb-4">
                                            <i class="fas fa-wallet text-purple-600 mr-2"></i>
                                            Account Allocation
                                        </h4>
                                        <div id="account-allocation-chart" style="height: 350px;"></div>
                                    </div>
                                </div>
                                
                                <!-- Sector Breakdown Table -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-layer-group text-blue-600 mr-2"></i>
                                        Sector Breakdown
                                    </h4>
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Sector</th>
                                                    <th class="px-4 py-3 text-right">Value</th>
                                                    <th class="px-4 py-3 text-right">Weight %</th>
                                                    <th class="px-4 py-3 text-center">Positions</th>
                                                    <th class="px-4 py-3 text-center">Allocation</th>
                                                </tr>
                                            </thead>
                                            <tbody id="sector-breakdown-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                <!-- Industry Breakdown -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-industry text-green-600 mr-2"></i>
                                        Top Industries
                                    </h4>
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Industry</th>
                                                    <th class="px-4 py-3 text-right">Value</th>
                                                    <th class="px-4 py-3 text-right">Weight %</th>
                                                    <th class="px-4 py-3 text-center">Positions</th>
                                                </tr>
                                            </thead>
                                            <tbody id="industry-breakdown-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                <!-- Concentration Analysis -->
                                <div class="card">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-chart-bar text-orange-600 mr-2"></i>
                                        Concentration Analysis
                                    </h4>
                                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                            <p class="text-sm text-gray-600 font-semibold mb-1">Top 5 Holdings</p>
                                            <p class="text-xl font-bold text-blue-600" id="concentration-top5">0%</p>
                                            <p class="text-xs text-gray-500 mt-1">Of portfolio value</p>
                                        </div>
                                        <div class="p-4 bg-purple-50 rounded-lg border border-purple-200">
                                            <p class="text-sm text-gray-600 font-semibold mb-1">Top 10 Holdings</p>
                                            <p class="text-xl font-bold text-purple-600" id="concentration-top10">0%</p>
                                            <p class="text-xs text-gray-500 mt-1">Of portfolio value</p>
                                        </div>
                                        <div class="p-4 bg-green-50 rounded-lg border border-green-200">
                                            <p class="text-sm text-gray-600 font-semibold mb-1">HHI Score</p>
                                            <p class="text-xl font-bold text-green-600" id="concentration-hhi">0</p>
                                            <p class="text-xs text-gray-500 mt-1" id="concentration-hhi-label">Low concentration</p>
                                        </div>
                                    </div>
                                    <div class="mt-4 p-4 bg-gray-50 rounded-lg">
                                        <p class="text-sm text-gray-700">
                                            <strong>Concentration Guide:</strong> 
                                            Top 5 &lt;40% (Well diversified) | 
                                            40-60% (Moderate) | 
                                            &gt;60% (Concentrated) | 
                                            HHI &lt;1500 (Low) | 
                                            1500-2500 (Moderate) | 
                                            &gt;2500 (High)
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Dividends Report Tab -->
                        <div id="report-tab-dividends" class="report-tab-content hidden">
                            <div class="mb-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-coins mr-2 text-brand-gold"></i>Dividend Report
                                </h3>
                                
                                <!-- Control Panel -->
                                <div class="card mb-6">
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <!-- Group By Selector -->
                                        <div>
                                            <label class="block text-sm font-semibold text-gray-700 mb-2">
                                                <i class="fas fa-layer-group mr-2 text-brand-teal"></i>Group By
                                            </label>
                                            <div class="flex gap-2">
                                                <button onclick="loadDividendsReport('account', getCurrentDividendPeriod())" id="dividends-group-account" class="dividends-group-btn active px-4 py-2 bg-brand-teal text-white rounded-lg font-semibold">
                                                    <i class="fas fa-building mr-2"></i>Account
                                                </button>
                                                <button onclick="loadDividendsReport('stock', getCurrentDividendPeriod())" id="dividends-group-stock" class="dividends-group-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">
                                                    <i class="fas fa-chart-line mr-2"></i>Stock
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <!-- Period Selector -->
                                        <div>
                                            <label class="block text-sm font-semibold text-gray-700 mb-2">
                                                <i class="fas fa-calendar-alt mr-2 text-brand-teal"></i>Time Period
                                            </label>
                                            <div class="flex gap-2">
                                                <button onclick="loadDividendsReport(getCurrentDividendGroupBy(), 'mtd')" id="dividends-period-mtd" class="dividends-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">
                                                    MTD
                                                </button>
                                                <button onclick="loadDividendsReport(getCurrentDividendGroupBy(), 'ytd')" id="dividends-period-ytd" class="dividends-period-btn active px-4 py-2 bg-brand-teal text-white rounded-lg font-semibold">
                                                    YTD
                                                </button>
                                                <button onclick="loadDividendsReport(getCurrentDividendGroupBy(), 'all')" id="dividends-period-all" class="dividends-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">
                                                    All Time
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Summary Card -->
                                <div class="card bg-gradient-to-br from-gold-50 to-white mb-6">
                                    <div class="flex items-center justify-between">
                                        <div>
                                            <p class="text-sm text-gray-600 font-semibold mb-1">
                                                <i class="fas fa-coins mr-2 text-brand-gold"></i>Total Dividends
                                            </p>
                                            <p class="text-3xl font-bold text-brand-gold" id="dividends-total">$0.00</p>
                                            <p class="text-xs text-gray-500 mt-1" id="dividends-count">0 payments</p>
                                        </div>
                                        <div class="text-5xl text-brand-gold opacity-20">
                                            <i class="fas fa-coins"></i>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Dividends Table -->
                                <div class="card">
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="border-b border-gray-200">
                                                    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase" id="dividends-header-col1">Account</th>
                                                    <th class="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Count</th>
                                                    <th class="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total Dividends</th>
                                                </tr>
                                            </thead>
                                            <tbody id="dividends-table-body">
                                                <tr>
                                                    <td colspan="3" class="px-4 py-8 text-center text-gray-400">
                                                        <i class="fas fa-coins text-4xl mb-2"></i>
                                                        <p>Loading dividends data...</p>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Monthly Income Tab -->
                        <div id="report-tab-monthly-income" class="report-tab-content hidden">
                            <div class="flex justify-between items-center mb-6">
                                <h3 class="text-2xl font-bold text-brand-teal">
                                    <i class="fas fa-money-bill-wave mr-2"></i>Monthly Income Report
                                </h3>
                                <div class="flex gap-4">
                                    <select id="monthly-income-month" class="px-4 py-2 border border-gray-300 rounded-lg" onchange="loadMonthlyIncome()">
                                        <!-- Populated dynamically -->
                                    </select>
                                    <select id="monthly-income-year" class="px-4 py-2 border border-gray-300 rounded-lg" onchange="loadMonthlyIncome()">
                                        <!-- Populated dynamically -->
                                    </select>
                                </div>
                            </div>
                            
                            <!-- Account Filter Tabs -->
                            <div id="monthly-income-account-tabs" class="flex gap-2 mb-6 border-b border-gray-200 overflow-x-auto">
                                <!-- Populated dynamically with ALL + user accounts -->
                            </div>
                            
                            <div id="monthly-income-content">
                                <p class="text-center text-gray-500 py-8">Select a month to view income details</p>
                            </div>
                        </div>
                        
                        <!-- Closed Trades Tab -->
                        <div id="report-tab-closed-trades" class="report-tab-content hidden">
                            <div class="flex justify-between items-center mb-6">
                                <h3 class="text-2xl font-bold text-brand-teal">
                                    <i class="fas fa-history mr-2"></i>Closed Trades
                                </h3>
                                <div class="flex gap-4">
                                    <select id="closed-trade-type" class="px-4 py-2 border border-gray-300 rounded-lg" onchange="loadClosedTrades()">
                                        <option value="all">All Trade Types</option>
                                        <option value="stocks">Stock Trades</option>
                                        <option value="options">Option Trades</option>
                                    </select>
                                    <button onclick="loadClosedTrades()" class="btn-primary">
                                        <i class="fas fa-sync mr-2"></i>Refresh
                                    </button>
                                </div>
                            </div>
                            
                            <!-- Closed Stock Trades -->
                            <div id="closed-stocks-container" class="mb-8">
                                <div class="card">
                                    <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center">
                                        <i class="fas fa-chart-line text-brand-teal mr-2"></i>
                                        Closed Stock Trades
                                    </h3>
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-sm">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Opened Date</th>
                                                    <th class="px-4 py-3 text-left">Ticker</th>
                                                    <th class="px-4 py-3 text-left">Closed Date</th>
                                                    <th class="px-4 py-3 text-right">Shares</th>
                                                    <th class="px-4 py-3 text-right">Avg Price</th>
                                                    <th class="px-4 py-3 text-left">Account</th>
                                                    <th class="px-4 py-3 text-right">P/L</th>
                                                    <th class="px-4 py-3 text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody id="closed-stocks-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Closed Option Trades -->
                            <div id="closed-options-container" class="mb-8">
                                <div class="card">
                                    <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center">
                                        <i class="fas fa-file-contract text-purple-600 mr-2"></i>
                                        Closed Option Trades
                                    </h3>
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-sm">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Trade Date</th>
                                                    <th class="px-4 py-3 text-left">Ticker</th>
                                                    <th class="px-4 py-3 text-left">Strategy</th>
                                                    <th class="px-4 py-3 text-right">Strike</th>
                                                    <th class="px-4 py-3 text-right">Premium</th>
                                                    <th class="px-4 py-3 text-left">Expiration</th>
                                                    <th class="px-4 py-3 text-left">Account</th>
                                                    <th class="px-4 py-3 text-right">P/L</th>
                                                    <th class="px-4 py-3 text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody id="closed-options-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                </div>
            </div>
        </div>
        
        <!-- Full Trade History Modal -->
        <div id="full-history-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
            <div class="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                    <h3 class="text-2xl font-bold text-orange-600">
                        <i class="fas fa-history mr-2"></i>Full Trade History
                    </h3>
                    <button onclick="closeFullHistoryModal()" class="text-gray-500 hover:text-gray-700">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                
                <div class="flex-1 overflow-y-auto p-6">
                    <div class="mb-4 flex gap-4 items-center">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Filter by Status</label>
                            <select id="history-status-filter" onchange="filterFullHistory()" class="px-4 py-2 border border-gray-300 rounded-lg">
                                <option value="all">All Trades</option>
                                <option value="closed">Closed Only</option>
                                <option value="open">Open Only</option>
                            </select>
                        </div>
                        <div class="flex-1">
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Search</label>
                            <input type="text" id="history-search" oninput="filterFullHistory()" placeholder="Search by date, strategy, notes..." class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                        </div>
                    </div>
                    
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="bg-gray-100">
                                    <th class="px-4 py-3 text-left">Date</th>
                                    <th class="px-4 py-3 text-left">Entry</th>
                                    <th class="px-4 py-3 text-left">Exit</th>
                                    <th class="px-4 py-3 text-left">Strategy</th>
                                    <th class="px-4 py-3 text-right">Credit</th>
                                    <th class="px-4 py-3 text-center">Contracts</th>
                                    <th class="px-4 py-3 text-right">P/L</th>
                                    <th class="px-4 py-3 text-center">Status</th>
                                    <th class="px-4 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="full-history-tbody">
                                <tr>
                                    <td colspan="9" class="px-4 py-8 text-center text-gray-500 italic">
                                        <i class="fas fa-spinner fa-spin mr-2"></i>Loading all trades...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Edit Trade Modal -->
        <div id="edit-trade-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
            <div class="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[95vh] overflow-y-auto">
                <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center z-10">
                    <h3 class="text-2xl font-bold text-orange-600">
                        <i class="fas fa-edit mr-2"></i>Edit Trade
                    </h3>
                    <button onclick="closeEditTradeModal()" class="text-gray-500 hover:text-gray-700">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                
                <div class="p-6">
                    <form id="edit-trade-form" onsubmit="updateTrade(event)">
                        <input type="hidden" id="edit-trade-id">
                        
                        <!-- ENTRY DATA SECTION -->
                        <div class="mb-4 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                            <h4 class="font-bold text-lg text-blue-700 mb-3">
                                <i class="fas fa-arrow-right mr-2"></i>ENTRY DATA
                            </h4>
                            
                            <!-- Compressed Entry Row: Date, Time, SPX, VIX, Contracts, Strike Width, Entry Commission -->
                            <div class="grid grid-cols-7 gap-3">
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Entry Date</label>
                                    <input type="date" id="edit-trade-date" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Entry Time</label>
                                    <input type="time" id="edit-entry-time" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">SPX Price</label>
                                    <input type="number" step="0.01" id="edit-spx-entry" placeholder="5856.20" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">VIX Price</label>
                                    <input type="number" step="0.01" id="edit-vix-entry" placeholder="15.50" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Contracts</label>
                                    <input type="number" id="edit-contracts" required min="1" value="1" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Strike Width</label>
                                    <input type="number" id="edit-strike-width" required min="1" value="5" onchange="updateEditStrikeWidthDisplays()" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Entry Commission ($)</label>
                                    <input type="number" step="0.01" id="edit-entry-commission" value="1.30" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Strategy Type Selection -->
                        <div class="mb-4">
                            <label class="block text-gray-700 font-semibold mb-2">Strategy Type</label>
                            <select id="edit-strategy-type" onchange="updateEditStrategyDisplay()" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                <option value="IRON_CONDOR">Iron Condor (Call + Put Spreads)</option>
                                <option value="CREDIT_SPREAD_CALL">Credit Spread - Call Only</option>
                                <option value="CREDIT_SPREAD_PUT">Credit Spread - Put Only</option>
                            </select>
                        </div>
                        
                        <!-- Call Spread Section -->
                        <div id="edit-call-spread-section" class="mb-4 p-4 border-2 border-red-200 rounded-lg bg-red-50">
                            <div class="flex justify-between items-center mb-3">
                                <h4 id="edit-call-spread-title" class="font-bold text-lg">
                                    <span class="text-red-600">BEARISH:</span> Call Spread <span class="text-sm font-normal text-gray-600">($5 wide)</span>
                                </h4>
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="edit-enable-call-spread" onchange="updateEditStrategyDisplay()" class="w-5 h-5">
                                    <span class="font-semibold">Enable</span>
                                </label>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2">Short Call Strike</label>
                                    <input type="number" step="0.01" id="edit-call-short-strike" placeholder="5875" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2">Total Credit ($)</label>
                                    <input type="number" step="0.01" id="edit-call-credit" placeholder="3.50" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Put Spread Section -->
                        <div id="edit-put-spread-section" class="mb-4 p-4 border-2 border-green-200 rounded-lg bg-green-50">
                            <div class="flex justify-between items-center mb-3">
                                <h4 id="edit-put-spread-title" class="font-bold text-lg">
                                    <span class="text-green-600">BULLISH:</span> Put Spread <span class="text-sm font-normal text-gray-600">($5 wide)</span>
                                </h4>
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="edit-enable-put-spread" onchange="updateEditStrategyDisplay()" class="w-5 h-5">
                                    <span class="font-semibold">Enable</span>
                                </label>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2">Short Put Strike</label>
                                    <input type="number" step="0.01" id="edit-put-short-strike" placeholder="5835" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2">Total Credit ($)</label>
                                    <input type="number" step="0.01" id="edit-put-credit" placeholder="3.00" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                </div>
                            </div>
                        </div>
                        
                        <!-- EXIT DATA SECTION (for closed trades) -->
                        <div id="edit-exit-section" class="mb-4 p-4 bg-orange-50 border-2 border-orange-300 rounded-lg hidden">
                            <h4 class="font-bold text-lg text-orange-700 mb-3">
                                <i class="fas fa-arrow-left mr-2"></i>EXIT DATA (Trade Closed)
                            </h4>
                            
                            <!-- Exit Row: Exit Time, Exit Cost, Exit Commission, Exit Reason -->
                            <div class="grid grid-cols-4 gap-3">
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Time</label>
                                    <input type="time" id="edit-exit-time" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Cost ($)</label>
                                    <input type="number" step="0.01" id="edit-exit-cost" placeholder="0.00" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    <small class="text-gray-500 text-xs">Debit paid to close</small>
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Commission ($)</label>
                                    <input type="number" step="0.01" id="edit-exit-commission" placeholder="1.30" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Reason</label>
                                    <select id="edit-exit-reason" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                        <option value="PROFIT_TARGET">Profit Target</option>
                                        <option value="TIME_EXIT">Time Exit</option>
                                        <option value="STOP_LOSS">Stop Loss</option>
                                        <option value="ATM_PROXIMITY">ATM Proximity</option>
                                        <option value="MANUAL">Manual</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Notes -->
                        <div class="mb-4">
                            <label class="block text-gray-700 font-semibold mb-2">Notes (Optional)</label>
                            <textarea id="edit-trade-notes" rows="3" placeholder="Add any notes about this trade..." class="w-full px-4 py-2 border border-gray-300 rounded-lg"></textarea>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="flex gap-3">
                            <button type="submit" class="px-6 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700">
                                <i class="fas fa-save mr-2"></i>Save Changes
                            </button>
                            <button type="button" onclick="closeEditTradeModal()" class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        
        <!-- Close Trade Modal -->
        <div id="close-trade-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
            <div class="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[95vh] overflow-y-auto">
                <div class="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center rounded-t-lg sticky top-0 z-10">
                    <h3 class="text-2xl font-bold text-orange-600">
                        <i class="fas fa-check-circle mr-2"></i>Close Trade
                    </h3>
                    <button onclick="closeCloseTradeModal()" class="text-gray-500 hover:text-gray-700">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                
                <div class="p-6">
                    <form id="close-trade-form" onsubmit="submitCloseTrade(event)">
                        <input type="hidden" id="close-trade-id">
                        
                        <div id="close-trade-summary" class="mb-6 p-4 bg-gray-50 rounded-lg">
                            <!-- Trade summary will be populated here -->
                        </div>
                        
                        <!-- Compressed Exit Data Entry - All on One Line -->
                        <div class="grid grid-cols-4 gap-3 mb-4">
                            <div>
                                <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Time</label>
                                <input type="time" id="close-exit-time" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Cost ($)</label>
                                <input type="number" step="0.01" id="close-exit-cost" placeholder="0.00" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Commission ($)</label>
                                <input type="number" step="0.01" id="close-commission" value="1.30" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Reason</label>
                                <select id="close-exit-reason" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    <option value="PROFIT_TARGET">Profit Target</option>
                                    <option value="TIME_EXIT">Time Exit</option>
                                    <option value="STOP_LOSS">Stop Loss</option>
                                    <option value="ATM_PROXIMITY">ATM Proximity</option>
                                    <option value="EXPIRED_WORTHLESS">Expired Worthless</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="mb-4 text-xs text-gray-500 -mt-2">
                            <i class="fas fa-info-circle mr-1"></i>Enter 0.00 for Exit Cost and Commission if trade expired worthless
                        </div>
                        
                        <div class="mb-6">
                            <label class="block text-gray-700 font-semibold mb-2">Close Notes (Optional)</label>
                            <textarea id="close-trade-notes" rows="3" placeholder="Add any closing notes about this trade..." class="w-full px-4 py-2 border border-gray-300 rounded-lg"></textarea>
                        </div>
                        
                        <!-- Real-time P/L Preview -->
                        <div id="close-pl-preview" class="mb-6 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg hidden">
                            <h4 class="text-sm font-semibold text-gray-700 mb-3 text-center">
                                <i class="fas fa-chart-line mr-2"></i>Real-Time P/L Preview
                            </h4>
                            <div class="grid grid-cols-3 gap-4">
                                <div class="text-center p-4 bg-white rounded-lg shadow-sm">
                                    <div class="text-xs text-gray-600 mb-1">Profit/Loss</div>
                                    <div id="close-pl-amount" class="text-2xl font-bold"></div>
                                </div>
                                <div class="text-center p-4 bg-white rounded-lg shadow-sm">
                                    <div class="text-xs text-gray-600 mb-1">RORC</div>
                                    <div id="close-rorc-amount" class="text-2xl font-bold"></div>
                                </div>
                                <div class="text-center p-4 bg-white rounded-lg shadow-sm">
                                    <div class="text-xs text-gray-600 mb-1">Dollars At Work</div>
                                    <div id="close-dollars-at-work" class="text-lg font-semibold text-gray-700"></div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex gap-3">
                            <button type="submit" class="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">
                                <i class="fas fa-check mr-2"></i>Close Trade
                            </button>
                            <button type="button" onclick="closeCloseTradeModal()" class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        
        <!-- Research Modal -->
        <div id="research-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
            <div class="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[95vh] overflow-y-auto">
                <div class="bg-gradient-to-r from-teal-700 to-teal-900 text-white px-6 py-4 flex justify-between items-center rounded-t-lg sticky top-0 z-10">
                    <h3 id="research-modal-title" class="text-2xl font-bold">
                        <i class="fas fa-chart-bar mr-2"></i>Company Research
                    </h3>
                    <button onclick="closeResearchModal()" class="text-white hover:text-gray-200">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                
                <!-- Tabs -->
                <div class="flex border-b border-gray-200 bg-gray-50 sticky top-[68px] z-10">
                    <button class="research-tab px-6 py-3 font-semibold text-gray-600 hover:text-teal-600 hover:bg-white border-b-2 border-transparent active" onclick="switchResearchTab('income')">
                        <i class="fas fa-chart-line mr-2"></i>Income Statement
                    </button>
                    <button class="research-tab px-6 py-3 font-semibold text-gray-600 hover:text-teal-600 hover:bg-white border-b-2 border-transparent" onclick="switchResearchTab('balance')">
                        <i class="fas fa-balance-scale mr-2"></i>Balance Sheet
                    </button>
                    <button class="research-tab px-6 py-3 font-semibold text-gray-600 hover:text-teal-600 hover:bg-white border-b-2 border-transparent" onclick="switchResearchTab('cashflow')">
                        <i class="fas fa-money-bill-wave mr-2"></i>Cash Flow
                    </button>
                </div>
                
                <!-- Tab Content -->
                <div class="p-6">
                    <div id="research-loading" class="text-center py-12">
                        <i class="fas fa-spinner fa-spin text-4xl text-teal-600 mb-4"></i>
                        <p class="text-gray-600">Loading financial data...</p>
                    </div>
                    
                    <div id="research-error" class="hidden text-center py-12">
                        <i class="fas fa-exclamation-circle text-4xl text-red-600 mb-4"></i>
                        <p class="text-gray-600" id="research-error-message">Error loading data</p>
                    </div>
                    
                    <div id="research-income-tab" class="research-tab-content hidden"></div>
                    <div id="research-balance-tab" class="research-tab-content hidden"></div>
                    <div id="research-cashflow-tab" class="research-tab-content hidden"></div>
                </div>
            </div>
        </div>
        
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

// Utility endpoint: Transform option transactions for tax reporting
app.post('/api/utilities/transform-option-tax', authMiddleware, async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return c.json({ error: 'No file provided' }, 400)
    }
    
    // Read file content
    const content = await file.text()
    const lines = content.split('\n').map(line => line.trim()).filter(line => line)
    
    if (lines.length < 2) {
      return c.json({ 
        error: 'File must have at least 2 lines',
        debug: {
          totalLines: lines.length,
          firstLine: lines[0]?.substring(0, 200)
        }
      }, 400)
    }
    
    // Detect delimiter (tab or comma)
    const firstLine = lines[0]
    const delimiter = firstLine.includes('\t') ? '\t' : ','
    
    // Find the header row (starts with "Transaction History\tHeader" or similar)
    let headerLine = ''
    let headerIndex = -1
    
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(delimiter)
      if (parts[0] === 'Transaction History' && parts[1] === 'Header') {
        headerLine = lines[i]
        headerIndex = i
        break
      }
    }
    
    if (headerIndex === -1) {
      return c.json({ 
        error: 'Could not find header row. Expected format: "Transaction History[tab]Header[tab]Date[tab]..."',
        debug: {
          delimiter: delimiter === '\t' ? 'TAB' : 'COMMA',
          firstLine: lines[0].substring(0, 200),
          secondLine: lines[1]?.substring(0, 200)
        }
      }, 400)
    }
    
    // Parse headers (skip first 2 columns: "Transaction History" and "Header")
    const allHeaders = headerLine.split(delimiter).map(h => h.trim().replace(/"/g, ''))
    const headers = allHeaders.slice(2) // Skip "Transaction History" and "Header"
    
    // Parse data rows (only lines that start with "Transaction History\tData")
    const dataLines = lines.slice(headerIndex + 1).filter(line => {
      const parts = line.split(delimiter)
      return parts[0] === 'Transaction History' && parts[1] === 'Data'
    })
    
    if (dataLines.length === 0) {
      return c.json({ 
        error: 'No data rows found. Expected format: "Transaction History[tab]Data[tab]..."',
        debug: {
          headers,
          totalLinesAfterHeader: lines.length - headerIndex - 1
        }
      }, 400)
    }
    
    // Parse data rows
    const rows = dataLines.map((line, lineIndex) => {
      const allValues = line.split(delimiter).map(v => v.trim().replace(/"/g, ''))
      const values = allValues.slice(2) // Skip "Transaction History" and "Data"
      
      // Create object from headers and values
      const obj: any = {}
      headers.forEach((header, idx) => {
        obj[header] = values[idx] || ''
      })
      
      obj._lineNumber = lineIndex + 1
      return obj
    })
    
    // Check if we have the required columns
    const requiredColumns = ['Date', 'Description', 'Symbol', 'Quantity', 'Price', 'Gross Amount', 'Commission', 'Net Amount']
    const missingColumns = requiredColumns.filter(col => !headers.includes(col))
    
    if (missingColumns.length > 0) {
      return c.json({ 
        error: 'Missing required columns',
        debug: {
          missingColumns,
          foundHeaders: headers,
          sampleRow: rows[0],
          hint: 'Column names must match exactly. Check for extra spaces or different spelling.'
        }
      }, 400)
    }
    
    // Group and transform transactions
    const transactions: any[] = []
    
    rows.forEach(row => {
      const netAmount = parseFloat(row['Net Amount'] || '0')
      const quantity = parseFloat(row['Quantity'] || '0')
      const grossAmount = parseFloat(row['Gross Amount'] || '0')
      const commission = parseFloat(row['Commission'] || '0')
      const price = parseFloat(row['Price'] || '0')
      
      // Extract underlying symbol (first part before space)
      const symbol = row['Symbol'] || ''
      const underlying = symbol.split(' ')[0] || symbol
      
      transactions.push({
        date: row['Date'],
        underlying,
        description: row['Description'],
        transactionType: row['Transaction Type'],
        buy: netAmount < 0 ? Math.abs(quantity) : 0,
        sell: netAmount > 0 ? Math.abs(quantity) : 0,
        cost: netAmount < 0 ? Math.abs(grossAmount) + Math.abs(commission) : 0,
        proceeds: netAmount > 0 ? Math.abs(grossAmount) - Math.abs(commission) : 0,
        price,
        commission: Math.abs(commission),
        quantitySign: netAmount < 0 ? -1 : 1,
        currency: row['Price Currency'] || 'USD'
      })
    })
    
    // Group by underlying, description, date, and quantity sign
    const grouped: any = {}
    
    transactions.forEach(t => {
      const key = `${t.underlying}|${t.description}|${t.date}|${t.quantitySign}`
      if (!grouped[key]) {
        grouped[key] = {
          date: t.date,
          underlying: t.underlying,
          description: t.description,
          buy: 0,
          sell: 0,
          cost: 0,
          proceeds: 0,
          commission: 0,
          priceSum: 0,
          priceCount: 0,
          currency: t.currency
        }
      }
      grouped[key].buy += t.buy
      grouped[key].sell += t.sell
      grouped[key].cost += t.cost
      grouped[key].proceeds += t.proceeds
      grouped[key].commission += t.commission
      grouped[key].priceSum += t.price
      grouped[key].priceCount += 1
    })
    
    // Convert to array and calculate average price
    const groupedArray = Object.values(grouped).map((g: any) => ({
      ...g,
      price: g.priceCount > 0 ? g.priceSum / g.priceCount : 0
    }))
    
    // Sort by underlying, then date
    groupedArray.sort((a: any, b: any) => {
      if (a.underlying !== b.underlying) {
        return a.underlying.localeCompare(b.underlying)
      }
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    })
    
    // Get unique underlying symbols for company lookup
    const uniqueSymbols = [...new Set(groupedArray.map((g: any) => g.underlying))]
    
    // Fetch company names from Yahoo Finance API
    const companyNames: Record<string, string> = {}
    
    for (const symbol of uniqueSymbols) {
      try {
        const companyData = await fetchCompanyData(symbol, c.env)
        if (companyData && companyData.company_name && companyData.company_name !== symbol) {
          companyNames[symbol] = companyData.company_name
        }
      } catch (err) {
        // If company not found, just use the ticker
        console.log(`Company name not found for ticker ${symbol}`)
      }
    }
    
    // Generate output CSV
    const outputLines = ['Date,Description,Buy,Sell,Price,Commission,Cost,Proceeds,XCH RATE,CAD Cost,CAD Proceeds,CAD Gain/Loss,Currency']
    
    let currentUnderlying = ''
    let sectionTotalCost = 0
    let sectionTotalProceeds = 0
    
    groupedArray.forEach((row: any, index: number) => {
      if (currentUnderlying !== row.underlying) {
        // Add totals for previous section
        if (currentUnderlying !== '') {
          const totalCostStr = sectionTotalCost > 0 ? sectionTotalCost.toFixed(2) : ''
          const totalProceedsStr = sectionTotalProceeds > 0 ? sectionTotalProceeds.toFixed(2) : ''
          // Empty Date column, then Totals in Description column
          outputLines.push(`,Totals for ${currentUnderlying},,,,,${totalCostStr},${totalProceedsStr},,,,,`)
          outputLines.push('')  // Blank line between sections
        }
        
        // Start new section
        const companyName = companyNames[row.underlying] || ''
        // Remove commas from company name to avoid CSV issues
        const cleanCompanyName = companyName.replace(/,/g, '')
        let header = cleanCompanyName 
          ? `*** ${row.underlying} - ${cleanCompanyName} ***`
          : `*** ${row.underlying} ***`
        
        // Empty Date column, then header in Description column
        outputLines.push(`,${header}`)
        
        currentUnderlying = row.underlying
        sectionTotalCost = 0
        sectionTotalProceeds = 0
      }
      
      const buyStr = row.buy > 0 ? Math.round(row.buy).toString() : ''
      const sellStr = row.sell > 0 ? Math.round(row.sell).toString() : ''
      const costStr = row.cost > 0 ? row.cost.toFixed(2) : ''
      const proceedsStr = row.proceeds > 0 ? row.proceeds.toFixed(2) : ''
      
      // Remove commas from description to avoid CSV issues
      const cleanDescription = row.description.replace(/,/g, '')
      
      // Add to section totals
      sectionTotalCost += row.cost
      sectionTotalProceeds += row.proceeds
      
      outputLines.push(
        `${row.date},${cleanDescription},${buyStr},${sellStr},${row.price.toFixed(2)},${row.commission.toFixed(6)},${costStr},${proceedsStr},,,,,`
      )
      
      // Add totals for last section
      if (index === groupedArray.length - 1) {
        const totalCostStr = sectionTotalCost > 0 ? sectionTotalCost.toFixed(2) : ''
        const totalProceedsStr = sectionTotalProceeds > 0 ? sectionTotalProceeds.toFixed(2) : ''
        // Empty Date column, then Totals in Description column
        outputLines.push(`,Totals for ${currentUnderlying},,,,,${totalCostStr},${totalProceedsStr},,,,,`)
      }
    })
    
    const outputContent = outputLines.join('\n')
    
    // Return CSV content
    return new Response(outputContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="option_tax_transform_output.csv"'
      }
    })
    
  } catch (error: any) {
    console.error('Error transforming option tax file:', error)
    return c.json({ error: error.message || 'Failed to transform file' }, 500)
  }
})

// Historical Balances API endpoints (using account_balance_history table)

// Get historical balances (last 24 entries)
app.get('/api/historical-balances', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const accountId = c.req.query('account_id')
    
    let query = `
      SELECT hb.*, a.account_name, a.account_type
      FROM account_balance_history hb
      JOIN accounts a ON hb.account_id = a.id
      WHERE hb.user_id = ?
    `
    const params = [userId]
    
    // Add account filter if provided
    if (accountId) {
      query += ` AND hb.account_id = ?`
      params.push(accountId)
    }
    
    query += `
      ORDER BY hb.year DESC, hb.month DESC, hb.created_at DESC
      LIMIT 24
    `
    
    const result = await c.env.DB.prepare(query).bind(...params).all()
    
    return c.json(result.results || [])
  } catch (error: any) {
    console.error('Error fetching historical balances:', error)
    return c.json({ error: 'Failed to fetch historical balances' }, 500)
  }
})

// Create historical balance
app.post('/api/historical-balances', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const body = await c.req.json()
    
    const { account_id, month, year, currency, balance, exchange_rate_to_cad } = body
    
    // Validate required fields
    if (!account_id || !month || !year || !currency || balance === undefined || !exchange_rate_to_cad) {
      return c.json({ error: 'Missing required fields' }, 400)
    }
    
    const exchange_rate_to_usd = 1 / parseFloat(exchange_rate_to_cad)
    
    // Insert or replace (UPSERT)
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO account_balance_history 
      (user_id, account_id, balance, cash_balance, currency, month, year, exchange_rate_to_usd, exchange_rate_to_cad)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      account_id,
      balance,
      0, // cash_balance - set to 0 for manual entries
      currency,
      month,
      year,
      exchange_rate_to_usd,
      exchange_rate_to_cad
    ).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error creating historical balance:', error)
    return c.json({ error: error.message || 'Failed to create historical balance' }, 500)
  }
})

// Update historical balance
app.put('/api/historical-balances/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const body = await c.req.json()
    
    const { account_id, month, year, currency, balance, exchange_rate_to_cad } = body
    
    // Validate required fields
    if (!account_id || !month || !year || !currency || balance === undefined || !exchange_rate_to_cad) {
      return c.json({ error: 'Missing required fields' }, 400)
    }
    
    const exchange_rate_to_usd = 1 / parseFloat(exchange_rate_to_cad)
    
    // Update the balance
    await c.env.DB.prepare(`
      UPDATE account_balance_history 
      SET account_id = ?, month = ?, year = ?, currency = ?, balance = ?, 
          exchange_rate_to_usd = ?, exchange_rate_to_cad = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      account_id,
      month,
      year,
      currency,
      balance,
      exchange_rate_to_usd,
      exchange_rate_to_cad,
      id,
      userId
    ).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error updating historical balance:', error)
    return c.json({ error: error.message || 'Failed to update historical balance' }, 500)
  }
})

// Delete historical balance
app.delete('/api/historical-balances/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const id = c.req.param('id')
    
    await c.env.DB.prepare(`
      DELETE FROM account_balance_history WHERE id = ? AND user_id = ?
    `).bind(id, userId).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting historical balance:', error)
    return c.json({ error: 'Failed to delete historical balance' }, 500)
  }
})

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
            const response = await fetch(`https://api.polygon.io/v3/reference/dividends?ticker=${holding.ticker}&apiKey=${MASSIVE_API_KEY}`, {
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
            
            // Fallback to EODHD for Canadian stocks if Massive returns 0 results
            const EODHD_API_KEY = '69bc75c1788da8.83960172'
            let eodhd_dividends = []
            
            if (dividends.length === 0 && (holding.ticker.endsWith('.TO') || holding.ticker.endsWith('.V'))) {
              console.log(`${holding.ticker}: Canadian stock with 0 results, trying EODHD fallback...`)
              
              try {
                const eodhd_response = await fetch(`https://eodhd.com/api/div/${holding.ticker}?from=2000-01-01&api_token=${EODHD_API_KEY}&fmt=json`, {
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
            
            // Minimum date filter: only fetch dividends from 2026-01-01 onwards
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
              
              // Filter: only include dividends from 2026-01-01 onwards
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
              
              // Filter: only include dividends from 2026-01-01 onwards
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

export default app
