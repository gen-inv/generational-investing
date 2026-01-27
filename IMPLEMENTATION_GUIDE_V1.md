# Implementation Guide - Full Update v1

## 🎯 Overview
This document provides the complete implementation details for all requested features.

## 📝 Backend Changes Required

### 1. NEW API ENDPOINTS TO ADD

#### A. Individual Accounts Management

```typescript
// GET /api/accounts/list - Get all user's accounts
app.get('/api/accounts/list', authMiddleware, async (c) => {
  const userId = c.get('userId')
  
  const accounts = await c.env.DB.prepare(`
    SELECT * FROM accounts WHERE user_id = ? ORDER BY account_type, account_name
  `).bind(userId).all()
  
  return c.json(accounts.results)
})

// POST /api/accounts/create - Create new account
app.post('/api/accounts/create', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const { account_name, account_type, balance_cad, balance_usd, cash_balance_usd } = await c.req.json()
  
  const result = await c.env.DB.prepare(`
    INSERT INTO accounts (user_id, account_name, account_type, balance_cad, balance_usd, cash_balance_usd)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(userId, account_name, account_type, balance_cad || 0, balance_usd || 0, cash_balance_usd || 0).run()
  
  return c.json({ id: result.meta.last_row_id, account_name, account_type, balance_cad, balance_usd, cash_balance_usd })
})

// PUT /api/accounts/:id - Update account
app.put('/api/accounts/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const accountId = c.req.param('id')
  const { account_name, balance_cad, balance_usd, cash_balance_usd } = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE accounts SET
      account_name = ?, balance_cad = ?, balance_usd = ?, cash_balance_usd = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(account_name, balance_cad, balance_usd, cash_balance_usd, accountId, userId).run()
  
  return c.json({ success: true })
})

// DELETE /api/accounts/:id - Delete account
app.delete('/api/accounts/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const accountId = c.req.param('id')
  
  await c.env.DB.prepare(`
    DELETE FROM accounts WHERE id = ? AND user_id = ?
  `).bind(accountId, userId).run()
  
  return c.json({ success: true })
})
```

#### B. Earnings Date Fetch

```typescript
// POST /api/companies/:id/fetch-earnings - Fetch earnings date
app.post('/api/companies/:id/fetch-earnings', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const companyId = c.req.param('id')
  
  // Get company ticker
  const company = await c.env.DB.prepare(`
    SELECT ticker FROM companies WHERE id = ? AND user_id = ?
  `).bind(companyId, userId).first()
  
  if (!company) {
    return c.json({ error: 'Company not found' }, 404)
  }
  
  try {
    // Alpha Vantage API call
    const apiKey = 'demo' // Replace with actual API key or environment variable
    const response = await fetch(
      `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${company.ticker}&apikey=${apiKey}`
    )
    
    const data = await response.text()
    
    // Parse CSV response (Alpha Vantage returns CSV format)
    const lines = data.split('\\n')
    if (lines.length > 1) {
      const headers = lines[0].split(',')
      const values = lines[1].split(',')
      const reportDate = values[headers.indexOf('reportDate')]
      
      if (reportDate) {
        // Update database
        await c.env.DB.prepare(`
          UPDATE companies SET next_earnings_date = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?
        `).bind(reportDate, companyId, userId).run()
        
        return c.json({ success: true, earnings_date: reportDate })
      }
    }
    
    return c.json({ error: 'No earnings date found' }, 404)
  } catch (error) {
    return c.json({ error: 'Failed to fetch earnings date' }, 500)
  }
})
```

#### C. Enhanced P/L Reporting

```typescript
// GET /api/reports/pl-by-strategy - P/L breakdown by strategy
app.get('/api/reports/pl-by-strategy', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const year = c.req.query('year')
  
  let query = `
    SELECT 
      strategy_type,
      COUNT(*) as trade_count,
      SUM(premium * quantity * 100) as total_premium,
      SUM(CASE WHEN profit_loss IS NOT NULL THEN profit_loss ELSE 0 END) as realized_pl
    FROM option_trades
    WHERE user_id = ?
  `
  
  const params = [userId]
  
  if (year) {
    query += ` AND strftime('%Y', trade_date) = ?`
    params.push(year)
  }
  
  query += ` GROUP BY strategy_type ORDER BY strategy_type`
  
  const results = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(results.results)
})

// GET /api/reports/pl-by-month - P/L by month
app.get('/api/reports/pl-by-month', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const year = c.req.query('year') || new Date().getFullYear().toString()
  
  const stockPL = await c.env.DB.prepare(`
    SELECT 
      strftime('%m', trade_date) as month,
      SUM(CASE WHEN trade_type = 'SELL' THEN (price * quantity) ELSE -(price * quantity) END) as total
    FROM stock_trades
    WHERE user_id = ? AND strftime('%Y', trade_date) = ?
    GROUP BY month
    ORDER BY month
  `).bind(userId, year).all()
  
  const optionPL = await c.env.DB.prepare(`
    SELECT 
      strftime('%m', trade_date) as month,
      SUM(premium * quantity * 100) as total_premium,
      SUM(CASE WHEN profit_loss IS NOT NULL THEN profit_loss ELSE 0 END) as realized_pl
    FROM option_trades
    WHERE user_id = ? AND strftime('%Y', trade_date) = ?
    GROUP BY month
    ORDER BY month
  `).bind(userId, year).all()
  
  return c.json({
    year,
    stocks: stockPL.results,
    options: optionPL.results
  })
})

// GET /api/reports/pl-ytd - Year-to-date P/L
app.get('/api/reports/pl-ytd', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const year = new Date().getFullYear().toString()
  
  const stockPL = await c.env.DB.prepare(`
    SELECT 
      SUM(CASE WHEN trade_type = 'SELL' THEN (price * quantity) ELSE -(price * quantity) END) as total
    FROM stock_trades
    WHERE user_id = ? AND strftime('%Y', trade_date) = ?
  `).bind(userId, year).first()
  
  const optionPL = await c.env.DB.prepare(`
    SELECT 
      SUM(premium * quantity * 100) as total_premium,
      SUM(CASE WHEN profit_loss IS NOT NULL THEN profit_loss ELSE 0 END) as realized_pl
    FROM option_trades
    WHERE user_id = ? AND strftime('%Y', trade_date) = ?
  `).bind(userId, year).first()
  
  return c.json({
    year,
    stock_pl: stockPL?.total || 0,
    option_premium: optionPL?.total_premium || 0,
    option_realized: optionPL?.realized_pl || 0,
    total: (stockPL?.total || 0) + (optionPL?.total_premium || 0) + (optionPL?.realized_pl || 0)
  })
})

// GET /api/reports/portfolio-history - Portfolio balance over time
app.get('/api/reports/portfolio-history', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const period = c.req.query('period') || '1y'
  
  let dateFilter = ''
  if (period === '1y') {
    dateFilter = `AND created_at >= datetime('now', '-1 year')`
  }
  
  const history = await c.env.DB.prepare(`
    SELECT 
      year,
      month,
      SUM(balance_cad) as total_cad,
      SUM(balance_usd) as total_usd,
      MIN(created_at) as date
    FROM account_balances
    WHERE user_id = ? ${dateFilter}
    GROUP BY year, month
    ORDER BY year, month
  `).bind(userId).all()
  
  return c.json(history.results)
})
```

### 2. MODIFY EXISTING ENDPOINTS

#### Update Stock Trades to use account_id

Find and update in `app.post('/api/stocks'`:
```typescript
// OLD:
const result = await c.env.DB.prepare(`
  INSERT INTO stock_trades (
    user_id, company_id, ticker, trade_type, quantity, price, 
    account_type, trade_date, is_open, cost_basis_adjustment, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).bind(
  userId,
  data.company_id || null,
  data.ticker,
  data.trade_type,
  data.quantity,
  data.price,
  data.account_type,  // REMOVE THIS
  data.trade_date,
  data.is_open !== undefined ? (data.is_open ? 1 : 0) : 1,
  data.cost_basis_adjustment || 0,
  data.notes || null
).run()

// NEW:
const result = await c.env.DB.prepare(`
  INSERT INTO stock_trades (
    user_id, company_id, ticker, trade_type, quantity, price, 
    account_id, trade_date, is_open, cost_basis_adjustment, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).bind(
  userId,
  data.company_id || null,
  data.ticker,
  data.trade_type,
  data.quantity,
  data.price,
  data.account_id,  // ADD THIS
  data.trade_date,
  1,  // Always set to 1 (open) on creation
  data.cost_basis_adjustment || 0,
  data.notes || null
).run()
```

#### Update Option Trades to use new strike fields

Find and update in `app.post('/api/options')`:
```typescript
// NEW:
const result = await c.env.DB.prepare(`
  INSERT INTO option_trades (
    user_id, company_id, ticker, strategy_type,
    short_strike, long_strike, spread_width,
    premium, quantity, expiration_date, account_id, trade_date, is_open, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).bind(
  userId,
  data.company_id || null,
  data.ticker,
  data.strategy_type,
  data.short_strike || null,
  data.long_strike || null,
  data.spread_width || null,
  data.premium,
  data.quantity,
  data.expiration_date,
  data.account_id,
  data.trade_date,
  1,  // Always set to 1 (open) on creation
  data.notes || null
).run()
```

## 📝 Frontend Changes Required

This is too long to fit in one response. Would you like me to:

1. **Create the complete updated backend file now** (src/index.tsx)
2. **Then create the updated frontend file** (public/static/app.js)
3. **Then update the HTML** with new sections

Or would you prefer I provide this as separate files you can review?

Let me know and I'll proceed with the full implementation!
