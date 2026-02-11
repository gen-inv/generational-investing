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
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
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
      data.notes || null,
      tradeId,
      userId
    ).run()
    
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
    const { DB } = c.env
    
    // Verify trade belongs to user and is open
    const trade = await DB.prepare(`
      SELECT id, is_open FROM stock_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()
    
    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    if (trade.is_open === 0) {
      return c.json({ error: 'Trade is already closed' }, 400)
    }
    
    // Close the trade
    await DB.prepare(`
      UPDATE stock_trades SET
        is_open = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).run()
    
    return c.json({ success: true, message: 'Trade closed successfully' })
  } catch (error) {
    console.error('Close stock trade error:', error)
    return c.json({ error: 'Failed to close stock trade' }, 500)
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
      WHERE user_id = ? AND ticker = ? AND strategy_type = 'COVERED_CALL' AND is_open = 1
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
    
    // Close the covered call
    await DB.prepare(`
      UPDATE option_trades SET
        is_open = 0,
        close_date = ?,
        close_price = ?,
        commission = ?,
        profit_loss = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      data.close_date || new Date().toISOString().split('T')[0],
      data.close_price || 0,
      data.commission || 0,
      data.profit_loss || 0,
      ccId,
      userId
    ).run()
    
    // Update the existing cost basis adjustment with the net P/L
    // When the covered call was opened, we created an adjustment with the premium received
    // Now we need to update it to reflect the actual profit/loss after closing
    if (cc.stock_trade_id && data.profit_loss !== undefined) {
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
          data.profit_loss, // Net P/L (premium - close cost - commission)
          data.close_date || new Date().toISOString().split('T')[0],
          `Covered call closed - Net P/L: $${data.profit_loss.toFixed(2)} (${data.quantity} contracts @ $${cc.strike_price}, closed @ $${data.close_price})`,
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
          data.profit_loss,
          data.close_date || new Date().toISOString().split('T')[0],
          `Covered call closed - P/L: $${data.profit_loss.toFixed(2)}`
        ).run()
      }
    }
    
    return c.json({ 
      success: true, 
      message: 'Covered call closed successfully',
      profit_loss: data.profit_loss 
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
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      data.strike_price,
      data.premium,
      data.quantity,
      data.expiration_date,
      data.trade_date,
      data.notes || null,
      ccId,
      userId
    ).run()
    
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
  
  let query = 'SELECT * FROM option_trades WHERE user_id = ?'
  let params = [userId]
  
  if (isOpen !== undefined) {
    query += ' AND is_open = ?'
    params.push(isOpen === 'true' ? 1 : 0)
  }
  
  query += ' ORDER BY trade_date DESC'
  
  const stmt = c.env.DB.prepare(query)
  const options = await stmt.bind(...params).all()
  
  return c.json(options.results)
})

app.post('/api/options', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const data = await c.req.json()
  
  const result = await c.env.DB.prepare(`
    INSERT INTO option_trades (
      user_id, company_id, ticker, strategy_type, strike_price,
      strike_price_2, strike_price_3, strike_price_4, premium, quantity,
      expiration_date, account_type, trade_date, commission, is_open, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    data.company_id || null,
    data.ticker,
    data.strategy_type,
    data.strike_price,
    data.strike_price_2 || null,
    data.strike_price_3 || null,
    data.strike_price_4 || null,
    data.premium,
    data.quantity,
    data.expiration_date,
    data.account_type,
    data.trade_date,
    data.commission || 0,
    data.is_open !== undefined ? (data.is_open ? 1 : 0) : 1,
    data.notes || null
  ).run()
  
  return c.json({ id: result.meta.last_row_id, ...data })
})

app.put('/api/options/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const tradeId = c.req.param('id')
  const data = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE option_trades SET
      ticker = ?, strategy_type = ?, strike_price = ?,
      strike_price_2 = ?, strike_price_3 = ?, strike_price_4 = ?,
      premium = ?, quantity = ?, expiration_date = ?,
      account_type = ?, trade_date = ?, commission = ?, is_open = ?,
      close_date = ?, close_price = ?, profit_loss = ?,
      notes = ?, updated_at = CURRENT_TIMESTAMP
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
    data.account_type,
    data.trade_date,
    data.commission || 0,
    data.is_open ? 1 : 0,
    data.close_date || null,
    data.close_price || null,
    data.profit_loss || null,
    data.notes || null,
    tradeId,
    userId
  ).run()
  
  return c.json({ success: true })
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
                                <i class="fas fa-layer-group mr-2"></i>Options
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
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="card">
                                <h3 class="text-xl font-bold text-brand-teal mb-4">Open Stock Positions</h3>
                                <div id="open-stocks-list" class="space-y-2"></div>
                            </div>
                            <div class="card">
                                <h3 class="text-xl font-bold text-brand-teal mb-4">Open Option Trades</h3>
                                <div id="open-options-list" class="space-y-2"></div>
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
                            <button onclick="showOptionForm()" class="btn-primary">
                                <i class="fas fa-plus mr-2"></i>Add Option Trade
                            </button>
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
                    </div>
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
