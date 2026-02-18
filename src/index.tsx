import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
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
    // Format date as YYYY-MM-DD (first day of month)
    const dateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    
    // Fetch from API
    const response = await fetch(`https://api.exchangerate-api.com/v4/history/USD/${dateStr}`);
    const data = await response.json() as any;
    
    if (data && data.rates && data.rates.CAD) {
      const usdToCad = data.rates.CAD;
      const cadToUsd = 1 / usdToCad;
      
      // Cache the rate (use INSERT OR IGNORE to avoid duplicate errors)
      await DB.prepare(`
        INSERT OR IGNORE INTO exchange_rates (month, year, usd_to_cad, cad_to_usd)
        VALUES (?, ?, ?, ?)
      `).bind(month, year, usdToCad, cadToUsd).run();
      
      console.log(`Exchange rate cached for ${month}/${year}: ${usdToCad} USD to CAD`);
    } else {
      // Use fallback rate
      const defaultRate = 1.35;
      await DB.prepare(`
        INSERT OR IGNORE INTO exchange_rates (month, year, usd_to_cad, cad_to_usd)
        VALUES (?, ?, ?, ?)
      `).bind(month, year, defaultRate, 1 / defaultRate).run();
      
      console.log(`Fallback exchange rate cached for ${month}/${year}: ${defaultRate} USD to CAD`);
    }
  } catch (error) {
    console.error('Error fetching and caching exchange rate:', error);
    
    // On error, cache fallback rate
    try {
      const defaultRate = 1.35;
      await DB.prepare(`
        INSERT OR IGNORE INTO exchange_rates (month, year, usd_to_cad, cad_to_usd)
        VALUES (?, ?, ?, ?)
      `).bind(month, year, defaultRate, 1 / defaultRate).run();
    } catch (insertError) {
      console.error('Error caching fallback rate:', insertError);
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
  
  // Step 2: FinanceBird (RapidAPI) as PRIMARY source for ALL data (sector, industry, earnings)
  if (rapidApiKey) {
    try {
      // Get profile for sector/industry
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
            console.log(`✅ FinanceBird Profile (PRIMARY): Sector=${sector}, Industry=${industry}`)
          }
        }
      }
      
      // Get summary for market cap and earnings date
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
          // Get market cap (prefer FinanceBird over Yahoo for consistency)
          if (result.marketCap?.raw) {
            marketCap = result.marketCap.raw
            console.log(`✅ FinanceBird Market Cap (PRIMARY): ${result.marketCap.fmt}`)
          }
          
          // Get next earnings date (prefer End, fallback to Start, then Timestamp)
          const earningsTs = result.earningsTimestampEnd?.raw || 
                            result.earningsTimestampStart?.raw ||
                            result.earningsTimestamp?.raw
          
          if (earningsTs) {
            const date = new Date(earningsTs * 1000)
            nextEarningsDate = date.toISOString().split('T')[0]
            console.log(`✅ FinanceBird Earnings (PRIMARY): ${nextEarningsDate}`)
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
    } catch (e) {
      console.log(`⚠️ FinanceBird API failed for ${ticker}`)
    }
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
  
  // Fetch company data from multiple sources
  const yahooData = await fetchYahooFinanceData(data.ticker.toUpperCase(), c.env)
  
  const result = await c.env.DB.prepare(`
    INSERT INTO companies (
      user_id, ticker, company_name, market_cap, exchange, 
      sector, industry, buy_price, is_wonderful, research_score, anti_fragile_score, next_earnings_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId, 
    data.ticker.toUpperCase(), 
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
    ticker: data.ticker.toUpperCase(),
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
    // Get company ticker
    const company = await DB.prepare(`
      SELECT ticker FROM companies WHERE id = ? AND user_id = ?
    `).bind(companyId, userId).first()
    
    if (!company) {
      return c.json({ error: 'Company not found' }, 404)
    }
    
    const ticker = company.ticker
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

    // Check if account exists and belongs to user
    const account = await DB.prepare(`
      SELECT id FROM accounts WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).first();

    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Check if balance was already updated this month
    const existingHistory = await DB.prepare(`
      SELECT id, created_at FROM account_balance_history
      WHERE account_id = ? AND month = ? AND year = ?
    `).bind(accountId, currentMonth, currentYear).first() as any;

    if (existingHistory) {
      return c.json({
        canUpdate: false,
        month: currentMonth,
        year: currentYear,
        lastUpdate: existingHistory.created_at,
        message: 'Balance already updated this month'
      });
    }

    return c.json({
      canUpdate: true,
      month: currentMonth,
      year: currentYear,
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

    // Check if balance was already updated this month
    const existingHistory = await DB.prepare(`
      SELECT id FROM account_balance_history
      WHERE account_id = ? AND month = ? AND year = ?
    `).bind(accountId, currentMonth, currentYear).first();

    if (existingHistory) {
      return c.json({ 
        error: 'Balance already updated this month',
        canUpdate: false,
        month: currentMonth,
        year: currentYear
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

    // Get exchange rates for history
    const rateResponse = await fetch(`${c.req.url.split('/api')[0]}/api/exchange-rate?month=${currentMonth}&year=${currentYear}`, {
      headers: { 'Authorization': c.req.header('Authorization') || '' }
    });
    const rates = await rateResponse.json() as any;

    // Save to history
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
      currentMonth,
      currentYear,
      rates.cad_to_usd || (1 / rates.usd_to_cad),
      rates.usd_to_cad || 1.35
    ).run();

    return c.json({ 
      success: true,
      updated: true,
      month: currentMonth,
      year: currentYear,
      historySaved: true
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
    const { month, year } = await c.req.json();

    // Get current account details
    const account = await DB.prepare(`
      SELECT account_id, balance_cad, balance_usd, cash_balance_usd, default_currency
      FROM accounts
      WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).first() as any;

    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Get exchange rates
    const rateResponse = await fetch(`${c.req.url.split('/api')[0]}/api/exchange-rate?month=${month}&year=${year}`, {
      headers: { 'Authorization': c.req.header('Authorization') || '' }
    });
    const rates = await rateResponse.json() as any;

    // Determine balance and currency based on default_currency
    const balance = account.default_currency === 'USD' ? account.balance_usd : account.balance_cad;
    const cashBalance = account.default_currency === 'USD' ? account.cash_balance_usd : 
                        (account.cash_balance_usd * rates.usd_to_cad);

    // Save snapshot
    await DB.prepare(`
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

    return c.json({ success: true });
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
    if (!rates) {
      rates = { usd_to_cad: 1.35, cad_to_usd: 1 / 1.35 };
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
        year
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
      // Get YTD P/L from closed stock trades
      // Use LIKE pattern for year matching since close_date is stored as DATE string
      const stockPL = await DB.prepare(`
        SELECT COALESCE(SUM(profit_loss), 0) as total_pl
        FROM stock_trades
        WHERE user_id = ? 
        AND account_type = ?
        AND is_open = 0
        AND close_date LIKE ?
      `).bind(userId, account.account_type, `${currentYear}%`).first() as any;

      // Get YTD P/L from closed option trades
      const optionPL = await DB.prepare(`
        SELECT COALESCE(SUM(profit_loss), 0) as total_pl
        FROM option_trades
        WHERE user_id = ?
        AND account_type = ?
        AND is_open = 0
        AND close_date LIKE ?
      `).bind(userId, account.account_type, `${currentYear}%`).first() as any;

      const ytdPL = (stockPL?.total_pl || 0) + (optionPL?.total_pl || 0);
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
      st.*,
      a.account_name,
      c.ticker as company_ticker,
      c.company_name,
      (SELECT COALESCE(SUM(amount), 0) 
       FROM cost_basis_adjustments 
       WHERE stock_trade_id = st.id AND adjustment_type IN ('DIVIDEND', 'COVERED_CALL')) as total_adjustments,
      (SELECT MIN(expiration_date)
       FROM option_trades
       WHERE user_id = st.user_id 
         AND ticker = st.ticker 
         AND strategy_type = 'COVERED_CALL' 
         AND is_open = 1) as nearest_cc_expiration
    FROM stock_trades st
    LEFT JOIN accounts a ON st.account_id = a.id
    LEFT JOIN companies c ON st.company_id = c.id
    WHERE st.user_id = ?
  `
  let params = [userId]
  
  if (isOpen !== undefined) {
    query += ' AND st.is_open = ?'
    params.push(isOpen === 'true' ? 1 : 0)
  } else if (isClosed !== undefined) {
    query += ' AND st.is_open = ?'
    params.push(isClosed === 'true' ? 0 : 1)
  }
  
  query += ' ORDER BY st.trade_date DESC'
  
  const stmt = DB.prepare(query)
  const stocks = await stmt.bind(...params).all()
  
  // Calculate avg price, cost basis, and covered call status for each stock
  const enhancedStocks = stocks.results.map((stock: any) => {
    const avgPrice = stock.price
    const costBasis = avgPrice - (stock.total_adjustments / stock.quantity || 0)
    
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
    
    return {
      ...stock,
      avg_price: avgPrice,
      cost_basis: costBasis,
      cc_status: ccStatus,
      cc_expiration: stock.nearest_cc_expiration,
      days_until_cc_expiration: daysUntilExpiration
    }
  })
  
  return c.json(enhancedStocks)
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
    
    const result = await DB.prepare(`
      INSERT INTO stock_trades (
        user_id, company_id, ticker, trade_type, quantity, price, 
        account_id, account_type, trade_date, commission, notes, is_open
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      data.company_id,
      data.ticker,
      data.trade_type,
      data.quantity,
      data.price,
      data.account_id,
      account.account_type,  // Get from accounts table
      data.trade_date,
      data.commission || 0,
      data.notes || null,
      1  // Always open when created
    ).run()
    
    return c.json({ 
      id: result.meta.last_row_id,
      ...data,
      is_open: true
    }, 201)
  } catch (error) {
    console.error('Create stock trade error:', error)
    return c.json({ error: 'Failed to create stock trade' }, 500)
  }
})

app.put('/api/stocks/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Verify trade belongs to user
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
    const tradeId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Verify trade belongs to user and is open
    const trade = await DB.prepare(`
      SELECT * FROM stock_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()
    
    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    if (trade.is_open === 0) {
      return c.json({ error: 'Trade is already closed' }, 400)
    }
    
    // Calculate P/L
    const saleProceeds = data.close_price * trade.quantity
    const costBasis = trade.price * trade.quantity
    const openingCommission = trade.commission || 0
    const closingCommission = data.commission || 0
    const profitLoss = saleProceeds - costBasis - openingCommission - closingCommission
    
    // Close the trade with data
    await DB.prepare(`
      UPDATE stock_trades SET
        is_open = 0,
        close_date = ?,
        close_price = ?,
        profit_loss = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      data.close_date,
      data.close_price,
      profitLoss,
      tradeId,
      userId
    ).run()
    
    return c.json({ success: true, message: 'Trade closed successfully', profit_loss: profitLoss })
  } catch (error) {
    console.error('Close stock trade error:', error)
    return c.json({ error: 'Failed to close stock trade' }, 500)
  }
})

app.put('/api/stocks/:id/reopen', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const { DB } = c.env
    
    // Verify trade belongs to user
    const trade = await DB.prepare(`
      SELECT id, is_open FROM stock_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()
    
    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    if (trade.is_open === 1) {
      return c.json({ error: 'Trade is already open' }, 400)
    }
    
    // Re-open the trade and clear closing data
    await DB.prepare(`
      UPDATE stock_trades SET
        is_open = 1,
        close_date = NULL,
        close_price = NULL,
        close_commission = NULL,
        profit_loss = NULL
      WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).run()
    
    return c.json({ success: true, message: 'Trade re-opened successfully' })
  } catch (error) {
    console.error('Re-open stock trade error:', error)
    return c.json({ error: 'Failed to re-open stock trade' }, 500)
  }
})

app.delete('/api/stocks/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const tradeId = c.req.param('id')
  
  await c.env.DB.prepare(`
    DELETE FROM stock_trades WHERE id = ? AND user_id = ?
  `).bind(tradeId, userId).run()
  
  return c.json({ success: true })
})

// ============================================================================
// STOCK TRADE - DIVIDENDS & COVERED CALLS
// ============================================================================

// Get dividend history for a stock trade
app.get('/api/stocks/:id/dividends', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const { DB } = c.env
    
    // Verify trade belongs to user
    const trade = await DB.prepare(`
      SELECT id FROM stock_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()
    
    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    // Get dividend adjustments
    const dividends = await DB.prepare(`
      SELECT * FROM cost_basis_adjustments
      WHERE stock_trade_id = ? AND adjustment_type = 'DIVIDEND'
      ORDER BY adjustment_date DESC
    `).bind(tradeId).all()
    
    return c.json(dividends.results || [])
  } catch (error) {
    console.error('Get dividends error:', error)
    return c.json({ error: 'Failed to fetch dividends' }, 500)
  }
})

// Record a dividend payment
app.post('/api/stocks/:id/dividends', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Validation
    if (!data.amount || !data.payment_date) {
      return c.json({ error: 'Amount and payment date are required' }, 400)
    }
    
    // Verify trade belongs to user
    const trade = await DB.prepare(`
      SELECT id FROM stock_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()
    
    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    // Insert dividend adjustment
    const result = await DB.prepare(`
      INSERT INTO cost_basis_adjustments (
        user_id, stock_trade_id, adjustment_type, amount, adjustment_date, notes
      ) VALUES (?, ?, 'DIVIDEND', ?, ?, ?)
    `).bind(
      userId,
      tradeId,
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

// Get covered call history for a stock trade
app.get('/api/stocks/:id/covered-calls', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const { DB } = c.env
    
    // Verify trade belongs to user
    const trade = await DB.prepare(`
      SELECT id, ticker FROM stock_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()
    
    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    // Get covered calls for this ticker in the same account
    // We link by ticker since covered calls are separate option trades
    const coveredCalls = await DB.prepare(`
      SELECT * FROM option_trades
      WHERE user_id = ? AND ticker = ? AND strategy_type = 'COVERED_CALL'
      ORDER BY trade_date DESC
    `).bind(userId, trade.ticker).all()
    
    return c.json(coveredCalls.results || [])
  } catch (error) {
    console.error('Get covered calls error:', error)
    return c.json({ error: 'Failed to fetch covered calls' }, 500)
  }
})

// Record a covered call
app.post('/api/stocks/:id/covered-calls', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Validation
    if (!data.strike_price || !data.premium || !data.quantity || !data.expiration_date || !data.trade_date) {
      return c.json({ error: 'All fields are required' }, 400)
    }
    
    // Verify trade belongs to user and get details
    const trade = await DB.prepare(`
      SELECT id, ticker, quantity, company_id, account_id FROM stock_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()
    
    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    // Verify user has enough shares (need 100 shares per contract)
    const sharesNeeded = data.quantity * 100
    if (trade.quantity < sharesNeeded) {
      return c.json({ 
        error: `Insufficient shares. Need ${sharesNeeded} shares, have ${trade.quantity}` 
      }, 400)
    }
    
    // Insert covered call as an option trade
    const optionResult = await DB.prepare(`
      INSERT INTO option_trades (
        user_id, company_id, ticker, strategy_type, strike_price, premium, quantity,
        expiration_date, account_type, trade_date, is_open, commission, notes
      ) VALUES (?, ?, ?, 'COVERED_CALL', ?, ?, ?, ?, 
        (SELECT account_type FROM stock_trades WHERE id = ?), ?, 1, ?, ?)
    `).bind(
      userId,
      trade.company_id,
      trade.ticker,
      data.strike_price,
      data.premium,
      data.quantity,
      data.expiration_date,
      trade.id, // Get account_type from the stock trade
      data.trade_date,
      data.commission || 0,
      data.notes || null
    ).run()
    
    // Also record as cost basis adjustment (premium received reduces cost basis)
    // Premium is per share, so: Total = Premium × Contracts × 100 shares/contract
    const totalPremium = data.premium * data.quantity * 100
    await DB.prepare(`
      INSERT INTO cost_basis_adjustments (
        user_id, stock_trade_id, adjustment_type, amount, adjustment_date, notes
      ) VALUES (?, ?, 'COVERED_CALL', ?, ?, ?)
    `).bind(
      userId,
      tradeId,
      totalPremium,
      data.trade_date,
      `Covered call: ${data.quantity} contracts @ $${data.strike_price} strike, premium $${data.premium}/share ($${totalPremium} total), exp ${data.expiration_date}`
    ).run()
    
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
      SELECT ot.*, st.id as stock_trade_id
      FROM option_trades ot
      LEFT JOIN stock_trades st ON st.ticker = ot.ticker AND st.user_id = ot.user_id AND st.is_open = 1
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
    
    // Update the existing cost basis adjustment with the net P/L
    // When the covered call was opened, we created an adjustment with the premium received
    // Now we need to update it to reflect the actual profit/loss after closing
    if (cc.stock_trade_id && profitLoss !== undefined) {
      // Find the existing adjustment created when this covered call was opened
      const existingAdjustment = await DB.prepare(`
        SELECT id, amount FROM cost_basis_adjustments
        WHERE stock_trade_id = ? 
          AND adjustment_type = 'COVERED_CALL'
          AND notes LIKE ?
        ORDER BY created_at DESC
        LIMIT 1
      `).bind(
        cc.stock_trade_id,
        `%${cc.quantity} contracts%$${cc.strike_price} strike%`
      ).first()
      
      if (existingAdjustment) {
        // Update the existing adjustment to reflect the net P/L
        await DB.prepare(`
          UPDATE cost_basis_adjustments SET
            amount = ?,
            adjustment_date = ?,
            notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          profitLoss, // Net P/L (premium - close cost - commission)
          data.close_date || new Date().toISOString().split('T')[0],
          `Covered call closed - Net P/L: $${profitLoss.toFixed(2)} (${cc.quantity} contracts @ $${cc.strike_price}, closed @ $${data.close_price})`,
          existingAdjustment.id
        ).run()
      } else {
        // If no existing adjustment found, create a new one
        await DB.prepare(`
          INSERT INTO cost_basis_adjustments (user_id, stock_trade_id, adjustment_type, amount, adjustment_date, notes)
          VALUES (?, ?, 'COVERED_CALL', ?, ?, ?)
        `).bind(
          userId,
          cc.stock_trade_id,
          profitLoss,
          data.close_date || new Date().toISOString().split('T')[0],
          `Covered call closed - P/L: $${profitLoss.toFixed(2)}`
        ).run()
      }
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
    
    // Update the covered call
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

// ============================================================================
// OPTION TRADES ROUTES
// ============================================================================

app.get('/api/options', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const isOpen = c.req.query('open')
  const isClosed = c.req.query('closed')
  
  let query = 'SELECT * FROM option_trades WHERE user_id = ?'
  let params = [userId]
  
  if (isOpen !== undefined) {
    query += ' AND is_open = ?'
    params.push(isOpen === 'true' ? 1 : 0)
  } else if (isClosed !== undefined) {
    query += ' AND is_open = ?'
    params.push(isClosed === 'true' ? 0 : 1)
  }
  
  query += ' ORDER BY trade_date DESC'
  
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
        user_id, company_id, ticker, strategy_type, strike_price,
        strike_price_2, strike_price_3, strike_price_4, premium, quantity,
        expiration_date, account_type, trade_date, commission, is_open, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      data.company_id,
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
    
    // If account_id is provided, fetch account_type
    let accountType = data.account_type
    if (data.account_id) {
      const account = await DB.prepare(`
        SELECT account_type FROM accounts WHERE id = ? AND user_id = ?
      `).bind(data.account_id, userId).first() as any
      
      if (account) {
        accountType = account.account_type
      }
    }
    
    await DB.prepare(`
      UPDATE option_trades SET
        ticker = ?, strategy_type = ?, strike_price = ?,
        strike_price_2 = ?, strike_price_3 = ?, strike_price_4 = ?,
        premium = ?, quantity = ?, expiration_date = ?,
        account_type = ?, trade_date = ?, commission = ?,
        close_date = ?, close_price = ?, close_price_2 = ?, close_price_3 = ?, close_price_4 = ?,
        close_commission = ?,
        notes = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      data.ticker,
      data.strategy_type,
      data.strike_price,
      data.strike_price_2 || null,
      data.strike_price_3 || null,
      data.strike_price_4 || null,
      data.premium,
      data.quantity,
      data.expiration_date,
      accountType,
      data.trade_date,
      data.commission || 0,
      data.close_date || null,
      data.close_price || null,
      data.close_price_2 || null,
      data.close_price_3 || null,
      data.close_price_4 || null,
      data.close_commission || null,
      data.notes || null,
      tradeId,
      userId
    ).run()
    
    // Recalculate profit_loss and is_open if close fields are provided
    if (data.close_date && data.close_price !== null && data.close_price !== undefined) {
      const openCommission = data.commission || 0
      const closeCommission = data.close_commission || 0
      const contracts = data.quantity
      const strategyType = data.strategy_type
      
      let profitLoss = 0
      
      // Calculate P/L based on strategy type
      if (strategyType === 'CREDIT_SPREAD' || strategyType === 'DEBIT_SPREAD') {
        // Two-leg spread
        const shortOpenPremium = data.premium  // strike_price (short leg)
        const longOpenPremium = data.strike_price_2 || 0  // strike_price_2 (long leg)
        const shortClosePremium = data.close_price || 0
        const longClosePremium = data.close_price_2 || 0
        
        const openCredit = (shortOpenPremium - longOpenPremium) * contracts * 100
        const closeDebit = (shortClosePremium - longClosePremium) * contracts * 100
        profitLoss = openCredit - closeDebit - openCommission - closeCommission
        
      } else if (strategyType === 'IRON_CONDOR' || strategyType === 'ZERO_DTE_SPX_IC') {
        // Four-leg iron condor
        const scOpen = data.premium || 0  // Short Call
        const lcOpen = data.strike_price_2 || 0  // Long Call
        const spOpen = data.strike_price_3 || 0  // Short Put
        const lpOpen = data.strike_price_4 || 0  // Long Put
        
        const scClose = data.close_price || 0
        const lcClose = data.close_price_2 || 0
        const spClose = data.close_price_3 || 0
        const lpClose = data.close_price_4 || 0
        
        const openCredit = ((scOpen - lcOpen) + (spOpen - lpOpen)) * contracts * 100
        const closeDebit = ((scClose - lcClose) + (spClose - lpClose)) * contracts * 100
        profitLoss = openCredit - closeDebit - openCommission - closeCommission
        
      } else {
        // Single-leg (SELLING_PUT, SELLING_PUT_LONG_TERM, BUYING_PUT, LONG_CALL, COVERED_CALL)
        const openPremium = data.premium
        const closePremium = data.close_price
        
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
        target_premium_min: 10.00,
        target_premium_max: 15.00,
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
          target_premium_min = ?,
          target_premium_max = ?,
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
        data.target_premium_min,
        data.target_premium_max,
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
          target_premium_min,
          target_premium_max,
          strike_width,
          default_contracts,
          profit_target_percent,
          atm_proximity_limit,
          time_exit,
          default_account_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId,
        data.max_contract_limit,
        data.rolling_profit_window,
        data.target_premium_min,
        data.target_premium_max,
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

    const result = await env.DB.prepare(`
      INSERT INTO daily_trades (
        user_id, account_id, trade_date, entry_time, strategy_type, contracts, strike_width,
        call_enabled, call_short_strike, call_total_credit,
        put_enabled, put_short_strike, put_total_credit,
        spx_entry_price, vix_entry_price, total_credit, commission, notes, is_open
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      userId,
      data.account_id || null,
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
      params.push(limit)
    } else if (period === 'month') {
      query += ` AND strftime('%Y-%m', trade_date) = strftime('%Y-%m', 'now')`
    } else if (period === 'year') {
      query += ` AND strftime('%Y', trade_date) = strftime('%Y', 'now')`
    }

    const result = await env.DB.prepare(query).bind(...params).first()

    const winRate = result.total_trades > 0 
      ? ((result.winning_trades / result.total_trades) * 100).toFixed(1)
      : 0

    return c.json({ 
      ...result,
      win_rate: winRate
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return c.json({ error: 'Failed to fetch statistics' }, 500)
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

// Export to CSV endpoint
app.get('/api/reports/export', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const type = c.req.query('type') || 'stocks'
  const year = c.req.query('year')
  
  let query = ''
  let params = [userId]
  
  if (type === 'stocks') {
    query = `SELECT * FROM stock_trades WHERE user_id = ?`
    if (year) {
      query += ` AND strftime('%Y', trade_date) = ?`
      params.push(year)
    }
    query += ` ORDER BY trade_date DESC`
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
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
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
                                <i class="fas fa-chart-line mr-2 text-orange-400"></i>Daily Trade
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
                                        <i class="fas fa-shield-alt text-orange-600 mr-2"></i>Risk Management
                                    </h3>
                                    <div class="space-y-4">
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Max Contract Limit (Absolute)</label>
                                            <input type="number" id="dt-max-contract-limit" value="25" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="25">
                                            <small class="text-gray-500">Maximum contracts allowed regardless of profit</small>
                                        </div>
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Rolling Profit Window (Number of Trades)</label>
                                            <input type="number" id="dt-rolling-profit-window" value="50" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="50">
                                            <small class="text-gray-500">Number of recent trades to calculate profit-based contract sizing</small>
                                        </div>
                                        <div class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                            <div class="flex items-start">
                                                <i class="fas fa-info-circle text-blue-600 mr-2 mt-1"></i>
                                                <div class="text-sm text-gray-700">
                                                    <strong>Profit-Based Contract Sizing:</strong> Contract limit per trade is calculated based on profit from the configured rolling window of recent trades. Minimum starts at 1 contract. Max risk per trade is auto-calculated each time based on configured credit strike width. <em>No daily trade maximums or daily loss limits.</em>
                                                </div>
                                            </div>
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
                                    </div>
                                    <div class="text-center p-4 bg-red-50 rounded-lg">
                                        <div id="dt-perf-worst-trade" class="text-2xl font-bold text-red-600">-</div>
                                        <div class="text-sm text-gray-600">Worst Trade</div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- P/L Chart Placeholder -->
                            <div class="card mb-6">
                                <h3 class="text-xl font-bold text-gray-800 mb-4" id="dt-chart-title">P/L Trend (Last 50 Trades)</h3>
                                <div class="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
                                    <i class="fas fa-chart-line text-6xl mb-4"></i>
                                    <p>Chart visualization will be added when data is available</p>
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
                                
                                <!-- No Open Position State (shown when no active trades) -->
                                <div id="dt-no-open-position" class="text-center py-8">
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
                                        <span class="text-sm text-gray-600">Profit-Based Sizing</span>
                                        <label class="relative inline-block w-12 h-6">
                                            <input type="checkbox" id="dt-profit-sizing-toggle" class="sr-only peer" onchange="toggleProfitSizing()">
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
                                        <small class="text-xs text-gray-500 mt-1 block" id="dt-contracts-hint">Manual sizing</small>
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
                            
                            <!-- Active Positions -->
                            <div class="card mb-6">
                                <h3 class="text-xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-chart-line text-blue-600 mr-2"></i>Active Positions
                                </h3>
                                <div id="dt-active-positions-container" class="overflow-x-auto">
                                    <div class="text-center py-8 text-gray-500 italic">
                                        <i class="fas fa-spinner fa-spin mr-2"></i>Loading active positions...
                                    </div>
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
                    
                    <!-- Reports Section -->
                    <div id="reports-section" class="section hidden">
                        <h2 class="text-3xl font-bold text-brand-teal mb-6">P/L Reports</h2>
                        
                        <div class="card mb-6">
                            <div class="flex gap-4 items-end">
                                <div>
                                    <label class="block text-gray-700 mb-2">Year</label>
                                    <select id="report-year" class="px-4 py-2 border border-gray-300 rounded-lg">
                                        <option value="">All Years</option>
                                        <option value="2026">2026</option>
                                        <option value="2025">2025</option>
                                        <option value="2024">2024</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-gray-700 mb-2">Month</label>
                                    <select id="report-month" class="px-4 py-2 border border-gray-300 rounded-lg">
                                        <option value="">All Months</option>
                                        <option value="1">January</option>
                                        <option value="2">February</option>
                                        <option value="3">March</option>
                                        <option value="4">April</option>
                                        <option value="5">May</option>
                                        <option value="6">June</option>
                                        <option value="7">July</option>
                                        <option value="8">August</option>
                                        <option value="9">September</option>
                                        <option value="10">October</option>
                                        <option value="11">November</option>
                                        <option value="12">December</option>
                                    </select>
                                </div>
                                <button onclick="loadReport()" class="btn-primary">Generate Report</button>
                                <div class="flex gap-2 ml-auto">
                                    <button onclick="exportData('stocks')" class="btn-secondary">
                                        <i class="fas fa-download mr-2"></i>Export Stocks
                                    </button>
                                    <button onclick="exportData('options')" class="btn-secondary">
                                        <i class="fas fa-download mr-2"></i>Export Options
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div id="report-results" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <!-- Dynamic content -->
                        </div>
                        
                        <!-- Closed Trades Report (within Reports section) -->
                        <div class="mt-8">
                            <div class="flex justify-between items-center mb-6">
                                <h3 class="text-2xl font-bold text-brand-teal">Closed Trades</h3>
                                <div class="flex gap-4">
                                    <select id="closed-trade-type" class="px-4 py-2 border border-gray-300 rounded-lg">
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
                                                    <th class="px-4 py-3 text-left">Trade Date</th>
                                                    <th class="px-4 py-3 text-left">Ticker</th>
                                                    <th class="px-4 py-3 text-left">Type</th>
                                                    <th class="px-4 py-3 text-right">Quantity</th>
                                                    <th class="px-4 py-3 text-right">Price</th>
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
        
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app
