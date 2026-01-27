# 📋 Complete Implementation Specification v1.0

## Table of Contents
1. [Database Schema](#database-schema)
2. [Backend API Changes](#backend-api-changes)
3. [Frontend JavaScript Changes](#frontend-javascript-changes)
4. [HTML/UI Changes](#htmlui-changes)
5. [Testing Checklist](#testing-checklist)

---

## 1. Database Schema

### ✅ Already Applied (Migration 0002)
- Created `accounts` table
- Added `short_strike`, `long_strike`, `spread_width` to `option_trades`
- Added `account_id` to `stock_trades` and `option_trades`
- Added `account_name` to `account_balances`

### Schema Reference

**accounts table:**
```sql
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_name VARCHAR(100) NOT NULL,     -- User-defined name (e.g., "RRSP - Questrade")
  account_type TEXT NOT NULL,             -- One of: Cash, RESP, RRSP, LIRA
  balance_cad DECIMAL(15, 2) DEFAULT 0,
  balance_usd DECIMAL(15, 2) DEFAULT 0,
  cash_balance_usd DECIMAL(15, 2) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

**option_trades - new fields:**
- `short_strike` DECIMAL(10, 2) - For selling puts, credit spreads, iron condors (put side)
- `long_strike` DECIMAL(10, 2) - For buying puts, debit spreads
- `spread_width` DECIMAL(10, 2) - For all spread strategies
- `account_id` INTEGER - Links to accounts table (replaces account_type)

**stock_trades - new fields:**
- `account_id` INTEGER - Links to accounts table

---

## 2. Backend API Changes

### File: `src/index.tsx`

### 2.1 NEW ENDPOINTS TO ADD

#### A. Accounts Management (CRUD)

**Location:** After Account Balances routes (around line 320)

```typescript
// ============================================================================
// INDIVIDUAL ACCOUNTS ROUTES
// ============================================================================

// GET /api/accounts/list - Get all user's individual accounts
app.get('/api/accounts/list', authMiddleware, async (c) => {
  const userId = c.get('userId')
  
  const accounts = await c.env.DB.prepare(`
    SELECT * FROM accounts 
    WHERE user_id = ? 
    ORDER BY account_type, account_name
  `).bind(userId).all()
  
  return c.json(accounts.results)
})

// GET /api/accounts/:id - Get specific account
app.get('/api/accounts/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const accountId = c.req.param('id')
  
  const account = await c.env.DB.prepare(`
    SELECT * FROM accounts WHERE id = ? AND user_id = ?
  `).bind(accountId, userId).first()
  
  if (!account) {
    return c.json({ error: 'Account not found' }, 404)
  }
  
  return c.json(account)
})

// POST /api/accounts/create - Create new account
app.post('/api/accounts/create', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const { account_name, account_type, balance_cad, balance_usd, cash_balance_usd } = await c.req.json()
  
  if (!account_name || !account_type) {
    return c.json({ error: 'Account name and type are required' }, 400)
  }
  
  const result = await c.env.DB.prepare(`
    INSERT INTO accounts (user_id, account_name, account_type, balance_cad, balance_usd, cash_balance_usd)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    userId, 
    account_name, 
    account_type, 
    balance_cad || 0, 
    balance_usd || 0, 
    cash_balance_usd || 0
  ).run()
  
  return c.json({ 
    id: result.meta.last_row_id, 
    account_name, 
    account_type, 
    balance_cad: balance_cad || 0, 
    balance_usd: balance_usd || 0, 
    cash_balance_usd: cash_balance_usd || 0 
  })
})

// PUT /api/accounts/:id - Update account
app.put('/api/accounts/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const accountId = c.req.param('id')
  const { account_name, balance_cad, balance_usd, cash_balance_usd } = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE accounts SET
      account_name = ?, 
      balance_cad = ?, 
      balance_usd = ?, 
      cash_balance_usd = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(account_name, balance_cad, balance_usd, cash_balance_usd, accountId, userId).run()
  
  return c.json({ success: true })
})

// DELETE /api/accounts/:id - Delete account
app.delete('/api/accounts/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const accountId = c.req.param('id')
  
  // Check if account has trades
  const tradesCount = await c.env.DB.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM stock_trades WHERE account_id = ?) +
      (SELECT COUNT(*) FROM option_trades WHERE account_id = ?) as total
  `).bind(accountId, accountId).first()
  
  if (tradesCount && tradesCount.total > 0) {
    return c.json({ error: 'Cannot delete account with existing trades' }, 400)
  }
  
  await c.env.DB.prepare(`
    DELETE FROM accounts WHERE id = ? AND user_id = ?
  `).bind(accountId, userId).run()
  
  return c.json({ success: true })
})
```

#### B. Earnings Date Fetch

**Location:** After Companies routes (around line 230)

```typescript
// POST /api/companies/:id/fetch-earnings - Fetch earnings date from Alpha Vantage
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
    // Alpha Vantage API key - use demo for now, replace with env variable in production
    const apiKey = 'demo' // TODO: Replace with environment variable
    const ticker = company.ticker
    
    // Alpha Vantage Earnings Calendar endpoint
    const response = await fetch(
      `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${ticker}&horizon=3month&apikey=${apiKey}`
    )
    
    const data = await response.text()
    
    // Parse CSV response
    const lines = data.split('\n').filter(line => line.trim())
    if (lines.length > 1) {
      const headers = lines[0].split(',')
      const values = lines[1].split(',')
      
      // Find reportDate column
      const reportDateIndex = headers.findIndex(h => h.toLowerCase().includes('reportdate'))
      
      if (reportDateIndex >= 0 && values[reportDateIndex]) {
        const reportDate = values[reportDateIndex].trim()
        
        // Update database
        await c.env.DB.prepare(`
          UPDATE companies 
          SET next_earnings_date = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?
        `).bind(reportDate, companyId, userId).run()
        
        return c.json({ success: true, earnings_date: reportDate })
      }
    }
    
    return c.json({ error: 'No upcoming earnings date found' }, 404)
  } catch (error: any) {
    console.error('Earnings fetch error:', error)
    return c.json({ error: 'Failed to fetch earnings date. Please try again.' }, 500)
  }
})
```

#### C. Enhanced P/L Reporting

**Location:** After existing reports routes (around line 680)

```typescript
// GET /api/reports/pl-by-strategy - P/L breakdown by strategy type
app.get('/api/reports/pl-by-strategy', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const year = c.req.query('year')
  
  let query = `
    SELECT 
      strategy_type,
      COUNT(*) as trade_count,
      SUM(premium * quantity * 100) as total_premium,
      SUM(CASE WHEN profit_loss IS NOT NULL THEN profit_loss ELSE 0 END) as realized_pl,
      SUM(CASE WHEN is_open = 1 THEN premium * quantity * 100 ELSE 0 END) as open_premium
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

// GET /api/reports/pl-by-month - Monthly P/L breakdown
app.get('/api/reports/pl-by-month', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const year = c.req.query('year') || new Date().getFullYear().toString()
  
  // Stock trades P/L by month
  const stockPL = await c.env.DB.prepare(`
    SELECT 
      strftime('%m', trade_date) as month,
      SUM(CASE WHEN trade_type = 'SELL' THEN (price * quantity) ELSE -(price * quantity) END) as total
    FROM stock_trades
    WHERE user_id = ? AND strftime('%Y', trade_date) = ?
    GROUP BY month
    ORDER BY month
  `).bind(userId, year).all()
  
  // Option trades P/L by month
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

// GET /api/reports/pl-ytd - Year-to-date P/L summary
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
  
  const total = (stockPL?.total || 0) + (optionPL?.total_premium || 0) + (optionPL?.realized_pl || 0)
  
  return c.json({
    year,
    stock_pl: stockPL?.total || 0,
    option_premium: optionPL?.total_premium || 0,
    option_realized: optionPL?.realized_pl || 0,
    total: total
  })
})

// GET /api/reports/portfolio-history - Portfolio balance over time
app.get('/api/reports/portfolio-history', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const period = c.req.query('period') || '1y'
  
  let dateFilter = ''
  if (period === '1y') {
    dateFilter = `AND date(year || '-' || printf('%02d', month) || '-01') >= date('now', '-1 year')`
  }
  
  const history = await c.env.DB.prepare(`
    SELECT 
      year,
      month,
      SUM(balance_cad) as total_cad,
      SUM(balance_usd) as total_usd
    FROM account_balances
    WHERE user_id = ? ${dateFilter}
    GROUP BY year, month
    ORDER BY year, month
  `).bind(userId).all()
  
  return c.json(history.results)
})
```

#### D. Stock Details with Covered Calls

**Location:** After stock trades routes (around line 520)

```typescript
// GET /api/stocks/:id/details - Get stock details with covered call history
app.get('/api/stocks/:id/details', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const stockId = c.req.param('id')
  
  // Get stock position
  const stock = await c.env.DB.prepare(`
    SELECT * FROM stock_trades WHERE id = ? AND user_id = ?
  `).bind(stockId, userId).first()
  
  if (!stock) {
    return c.json({ error: 'Stock position not found' }, 404)
  }
  
  // Get covered calls for this stock
  const coveredCalls = await c.env.DB.prepare(`
    SELECT * FROM option_trades 
    WHERE user_id = ? 
    AND ticker = ? 
    AND strategy_type = 'COVERED_CALL'
    ORDER BY trade_date DESC
  `).bind(userId, stock.ticker).all()
  
  return c.json({
    stock: stock,
    covered_calls: coveredCalls.results
  })
})
```

### 2.2 MODIFY EXISTING ENDPOINTS

#### A. Stock Trades - Use account_id

**Location:** `app.post('/api/stocks'` around line 450

**FIND:**
```typescript
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
  data.account_type,
  data.trade_date,
  data.is_open !== undefined ? (data.is_open ? 1 : 0) : 1,
  data.cost_basis_adjustment || 0,
  data.notes || null
).run()
```

**REPLACE WITH:**
```typescript
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
  data.account_id,  // CHANGED: use account_id instead of account_type
  data.trade_date,
  1,  // CHANGED: always set to 1 (open) on creation
  data.cost_basis_adjustment || 0,
  data.notes || null
).run()
```

**Location:** `app.put('/api/stocks/:id'` around line 480

**FIND:**
```typescript
await c.env.DB.prepare(`
  UPDATE stock_trades SET
    ticker = ?, trade_type = ?, quantity = ?, price = ?,
    account_type = ?, trade_date = ?, is_open = ?,
    cost_basis_adjustment = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND user_id = ?
`).bind(
  data.ticker,
  data.trade_type,
  data.quantity,
  data.price,
  data.account_type,
  data.trade_date,
  data.is_open ? 1 : 0,
  data.cost_basis_adjustment || 0,
  data.notes || null,
  tradeId,
  userId
).run()
```

**REPLACE WITH:**
```typescript
await c.env.DB.prepare(`
  UPDATE stock_trades SET
    ticker = ?, trade_type = ?, quantity = ?, price = ?,
    account_id = ?, trade_date = ?, is_open = ?,
    cost_basis_adjustment = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND user_id = ?
`).bind(
  data.ticker,
  data.trade_type,
  data.quantity,
  data.price,
  data.account_id,  // CHANGED: use account_id
  data.trade_date,
  data.is_open ? 1 : 0,
  data.cost_basis_adjustment || 0,
  data.notes || null,
  tradeId,
  userId
).run()
```

**Location:** `app.get('/api/stocks'` around line 440

**FIND:**
```typescript
const stocks = await stmt.bind(...params).all()
return c.json(stocks.results)
```

**REPLACE WITH (to include account names):**
```typescript
const stocks = await c.env.DB.prepare(`
  SELECT s.*, a.account_name, a.account_type
  FROM stock_trades s
  LEFT JOIN accounts a ON s.account_id = a.id
  WHERE s.user_id = ?${isOpen !== undefined ? ' AND s.is_open = ?' : ''}
  ORDER BY s.trade_date DESC
`).bind(...params).all()

return c.json(stocks.results)
```

#### B. Option Trades - Use new strike fields

**Location:** `app.post('/api/options'` around line 550

**FIND:**
```typescript
const result = await c.env.DB.prepare(`
  INSERT INTO option_trades (
    user_id, company_id, ticker, strategy_type, strike_price,
    strike_price_2, strike_price_3, strike_price_4, premium, quantity,
    expiration_date, account_type, trade_date, is_open, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  data.is_open !== undefined ? (data.is_open ? 1 : 0) : 1,
  data.notes || null
).run()
```

**REPLACE WITH:**
```typescript
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
  data.account_id,  // CHANGED: use account_id
  data.trade_date,
  1,  // CHANGED: always set to 1 (open) on creation
  data.notes || null
).run()
```

**Location:** `app.put('/api/options/:id'` around line 580

**FIND:**
```typescript
await c.env.DB.prepare(`
  UPDATE option_trades SET
    ticker = ?, strategy_type = ?, strike_price = ?,
    strike_price_2 = ?, strike_price_3 = ?, strike_price_4 = ?,
    premium = ?, quantity = ?, expiration_date = ?,
    account_type = ?, trade_date = ?, is_open = ?,
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
  data.is_open ? 1 : 0,
  data.close_date || null,
  data.close_price || null,
  data.profit_loss || null,
  data.notes || null,
  tradeId,
  userId
).run()
```

**REPLACE WITH:**
```typescript
await c.env.DB.prepare(`
  UPDATE option_trades SET
    ticker = ?, strategy_type = ?,
    short_strike = ?, long_strike = ?, spread_width = ?,
    premium = ?, quantity = ?, expiration_date = ?,
    account_id = ?, trade_date = ?, is_open = ?,
    close_date = ?, close_price = ?, profit_loss = ?,
    notes = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND user_id = ?
`).bind(
  data.ticker,
  data.strategy_type,
  data.short_strike || null,
  data.long_strike || null,
  data.spread_width || null,
  data.premium,
  data.quantity,
  data.expiration_date,
  data.account_id,  // CHANGED
  data.trade_date,
  data.is_open ? 1 : 0,
  data.close_date || null,
  data.close_price || null,
  data.profit_loss || null,
  data.notes || null,
  tradeId,
  userId
).run()
```

**Location:** `app.get('/api/options'` around line 540

**FIND:**
```typescript
const options = await stmt.bind(...params).all()
return c.json(options.results)
```

**REPLACE WITH (to include account names):**
```typescript
const options = await c.env.DB.prepare(`
  SELECT o.*, a.account_name, a.account_type
  FROM option_trades o
  LEFT JOIN accounts a ON o.account_id = a.id
  WHERE o.user_id = ?${isOpen !== undefined ? ' AND o.is_open = ?' : ''}
  ORDER BY o.trade_date DESC
`).bind(...params).all()

return c.json(options.results)
```

---

## 3. Frontend JavaScript Changes

### File: `public/static/app.js`

### 3.1 NEW FUNCTIONS TO ADD

#### A. Individual Accounts Management

**Location:** After account functions (around line 850)

```javascript
// ============================================================================
// INDIVIDUAL ACCOUNTS FUNCTIONS
// ============================================================================

async function loadIndividualAccounts() {
    try {
        const response = await api.get('/api/accounts/list')
        const accounts = response.data
        
        const grid = document.getElementById('individual-accounts-grid')
        grid.innerHTML = ''
        
        if (accounts.length === 0) {
            grid.innerHTML = '<p class="text-gray-500 col-span-2">No accounts created. Click "Add Account" to get started.</p>'
            return
        }
        
        accounts.forEach(account => {
            grid.innerHTML += `
                <div class="card">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h3 class="text-xl font-bold text-brand-teal">${account.account_name}</h3>
                            <p class="text-sm text-gray-500">${account.account_type}</p>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="editAccount(${account.id})" class="text-brand-teal hover:text-brand-gold">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteAccount(${account.id})" class="text-red-600 hover:text-red-800">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="space-y-2">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Balance (CAD):</span>
                            <span class="font-semibold">${formatCurrency(account.balance_cad, 'CAD')}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Balance (USD):</span>
                            <span class="font-semibold">${formatCurrency(account.balance_usd, 'USD')}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Cash (USD):</span>
                            <span class="font-semibold">${formatCurrency(account.cash_balance_usd, 'USD')}</span>
                        </div>
                    </div>
                </div>
            `
        })
    } catch (error) {
        console.error('Error loading accounts:', error)
    }
}

function showAccountModal(accountId = null) {
    const isEdit = accountId !== null
    const title = isEdit ? 'Edit Account' : 'Add Account'
    
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 class="text-2xl font-bold text-brand-teal mb-6">${title}</h3>
            <form id="accountModalForm">
                <div class="space-y-4">
                    <div>
                        <label class="block text-gray-700 mb-2">Account Name *</label>
                        <input type="text" name="account_name" 
                               placeholder="e.g., RRSP - Questrade"
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Account Type *</label>
                        <select name="account_type" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required ${isEdit ? 'disabled' : ''}>
                            <option value="">Select type...</option>
                            <option value="Cash">Cash</option>
                            <option value="RESP">RESP</option>
                            <option value="RRSP">RRSP</option>
                            <option value="LIRA">LIRA</option>
                        </select>
                        ${isEdit ? '<input type="hidden" name="account_type_hidden">' : ''}
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Balance (CAD)</label>
                        <input type="number" step="0.01" name="balance_cad" value="0"
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Balance (USD)</label>
                        <input type="number" step="0.01" name="balance_usd" value="0"
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Cash Balance (USD)</label>
                        <input type="number" step="0.01" name="cash_balance_usd" value="0"
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    </div>
                </div>
                <div class="flex gap-4 mt-6">
                    <button type="submit" class="btn-primary flex-1">Save</button>
                    <button type="button" onclick="this.closest('.fixed').remove()" class="btn-secondary flex-1">Cancel</button>
                </div>
            </form>
        </div>
    `
    
    document.body.appendChild(modal)
    
    document.getElementById('accountModalForm').addEventListener('submit', async (e) => {
        e.preventDefault()
        const formData = new FormData(e.target)
        const data = {
            account_name: formData.get('account_name'),
            account_type: isEdit ? formData.get('account_type_hidden') : formData.get('account_type'),
            balance_cad: parseFloat(formData.get('balance_cad')),
            balance_usd: parseFloat(formData.get('balance_usd')),
            cash_balance_usd: parseFloat(formData.get('cash_balance_usd'))
        }
        
        try {
            if (isEdit) {
                await api.put(`/api/accounts/${accountId}`, data)
            } else {
                await api.post('/api/accounts/create', data)
            }
            modal.remove()
            loadIndividualAccounts()
            loadDashboard() // Refresh dashboard totals
        } catch (error) {
            alert(error.response?.data?.error || 'Operation failed')
        }
    })
    
    if (isEdit) {
        api.get(`/api/accounts/${accountId}`).then(response => {
            const account = response.data
            const form = document.getElementById('accountModalForm')
            form.account_name.value = account.account_name
            form.account_type.value = account.account_type
            form.account_type_hidden.value = account.account_type
            form.balance_cad.value = account.balance_cad
            form.balance_usd.value = account.balance_usd
            form.cash_balance_usd.value = account.cash_balance_usd
        })
    }
}

async function editAccount(id) {
    showAccountModal(id)
}

async function deleteAccount(id) {
    if (!confirm('Are you sure you want to delete this account? This will fail if the account has trades.')) return
    
    try {
        await api.delete(`/api/accounts/${id}`)
        loadIndividualAccounts()
        loadDashboard()
    } catch (error) {
        alert(error.response?.data?.error || 'Delete failed')
    }
}
```

#### B. Load User Accounts for Dropdowns

**Location:** After loadIndividualAccounts function

```javascript
// Global variable to store user's accounts
let userAccounts = []

async function loadUserAccounts() {
    try {
        const response = await api.get('/api/accounts/list')
        userAccounts = response.data
        return userAccounts
    } catch (error) {
        console.error('Error loading user accounts:', error)
        return []
    }
}

function getAccountsDropdownHTML(selectedId = null) {
    if (userAccounts.length === 0) {
        return '<option value="">No accounts created - please create an account first</option>'
    }
    
    let html = '<option value="">Select account...</option>'
    userAccounts.forEach(account => {
        const selected = account.id === selectedId ? 'selected' : ''
        html += `<option value="${account.id}" ${selected}>${account.account_name} (${account.account_type})</option>`
    })
    return html
}
```

#### C. Earnings Date Fetch

**Location:** After company functions (around line 600)

```javascript
async function fetchEarningsDate(companyId) {
    try {
        const button = event.target
        const originalText = button.innerHTML
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching...'
        button.disabled = true
        
        const response = await api.post(`/api/companies/${companyId}/fetch-earnings`)
        
        alert(`Earnings date updated: ${response.data.earnings_date}`)
        loadCompanies() // Refresh the list
    } catch (error) {
        alert(error.response?.data?.error || 'Failed to fetch earnings date')
    } finally {
        if (button) {
            button.innerHTML = originalText
            button.disabled = false
        }
    }
}
```

#### D. Strategy-Specific Option Form

**Location:** Replace the existing showOptionForm function (around line 1100)

```javascript
function showOptionForm(optionId = null) {
    const isEdit = optionId !== null
    const title = isEdit ? 'Edit Option Trade' : 'Add Option Trade'
    
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 class="text-2xl font-bold text-brand-teal mb-6">${title}</h3>
            <form id="optionForm">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-gray-700 mb-2">Ticker *</label>
                        <input type="text" name="ticker" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Strategy Type *</label>
                        <select name="strategy_type" id="strategy_type" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required onchange="updateOptionFormFields()">
                            <option value="">Select strategy...</option>
                            <option value="SELLING_PUT">Selling Put (Stockpiling)</option>
                            <option value="BUYING_PUT">Buying Put</option>
                            <option value="CREDIT_SPREAD">Credit Spread</option>
                            <option value="DEBIT_SPREAD">Debit Spread</option>
                            <option value="IRON_CONDOR">Iron Condor</option>
                        </select>
                    </div>
                    
                    <!-- Dynamic strike fields -->
                    <div id="strike-fields" class="col-span-2 grid grid-cols-2 gap-4">
                        <!-- Will be populated by updateOptionFormFields() -->
                    </div>
                    
                    <div>
                        <label class="block text-gray-700 mb-2">Premium *</label>
                        <input type="number" step="0.01" name="premium" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Quantity (Contracts) *</label>
                        <input type="number" name="quantity" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Expiration Date *</label>
                        <input type="date" name="expiration_date" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Account *</label>
                        <select name="account_id" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                            ${getAccountsDropdownHTML()}
                        </select>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Trade Date *</label>
                        <input type="date" name="trade_date" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div class="col-span-2">
                        <label class="block text-gray-700 mb-2">Notes</label>
                        <textarea name="notes" rows="3" class="w-full px-4 py-2 border border-gray-300 rounded-lg"></textarea>
                    </div>
                </div>
                <div class="flex gap-4 mt-6">
                    <button type="submit" class="btn-primary flex-1">Save</button>
                    <button type="button" onclick="this.closest('.fixed').remove()" class="btn-secondary flex-1">Cancel</button>
                </div>
            </form>
        </div>
    `
    
    document.body.appendChild(modal)
    
    // Initialize form fields
    updateOptionFormFields()
    
    document.getElementById('optionForm').addEventListener('submit', async (e) => {
        e.preventDefault()
        const formData = new FormData(e.target)
        const strategy = formData.get('strategy_type')
        
        // Build data object based on strategy
        const data = {
            ticker: formData.get('ticker'),
            strategy_type: strategy,
            premium: parseFloat(formData.get('premium')),
            quantity: parseInt(formData.get('quantity')),
            expiration_date: formData.get('expiration_date'),
            account_id: parseInt(formData.get('account_id')),
            trade_date: formData.get('trade_date'),
            notes: formData.get('notes') || null
        }
        
        // Add strategy-specific fields
        if (strategy === 'SELLING_PUT' || strategy === 'CREDIT_SPREAD') {
            data.short_strike = parseFloat(formData.get('short_strike'))
        }
        
        if (strategy === 'BUYING_PUT' || strategy === 'DEBIT_SPREAD') {
            data.long_strike = parseFloat(formData.get('long_strike'))
        }
        
        if (strategy === 'CREDIT_SPREAD' || strategy === 'DEBIT_SPREAD' || strategy === 'IRON_CONDOR') {
            data.spread_width = parseFloat(formData.get('spread_width'))
        }
        
        if (strategy === 'IRON_CONDOR') {
            data.short_strike = parseFloat(formData.get('short_put_strike'))
            data.strike_price_2 = parseFloat(formData.get('short_call_strike'))
        }
        
        try {
            if (isEdit) {
                await api.put(`/api/options/${optionId}`, data)
            } else {
                await api.post('/api/options', data)
            }
            modal.remove()
            loadOptions()
            loadDashboard()
        } catch (error) {
            alert(error.response?.data?.error || 'Operation failed')
        }
    })
    
    if (isEdit) {
        api.get(`/api/options/${optionId}`).then(response => {
            const option = response.data
            const form = document.getElementById('optionForm')
            form.ticker.value = option.ticker
            form.strategy_type.value = option.strategy_type
            updateOptionFormFields() // Update fields based on strategy
            form.premium.value = option.premium
            form.quantity.value = option.quantity
            form.expiration_date.value = option.expiration_date
            form.account_id.value = option.account_id
            form.trade_date.value = option.trade_date
            form.notes.value = option.notes || ''
            
            // Set strategy-specific values
            if (form.short_strike) form.short_strike.value = option.short_strike || ''
            if (form.long_strike) form.long_strike.value = option.long_strike || ''
            if (form.spread_width) form.spread_width.value = option.spread_width || ''
            if (form.short_put_strike) form.short_put_strike.value = option.short_strike || ''
            if (form.short_call_strike) form.short_call_strike.value = option.strike_price_2 || ''
        })
    } else {
        const today = new Date().toISOString().split('T')[0]
        document.querySelector('[name="trade_date"]').value = today
    }
}

function updateOptionFormFields() {
    const strategy = document.getElementById('strategy_type')?.value
    const strikeFields = document.getElementById('strike-fields')
    
    if (!strikeFields) return
    
    let html = ''
    
    switch(strategy) {
        case 'SELLING_PUT':
            html = `
                <div>
                    <label class="block text-gray-700 mb-2">Strike Price (Short) *</label>
                    <input type="number" step="0.01" name="short_strike" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                </div>
            `
            break
            
        case 'BUYING_PUT':
            html = `
                <div>
                    <label class="block text-gray-700 mb-2">Strike Price (Long) *</label>
                    <input type="number" step="0.01" name="long_strike" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                </div>
            `
            break
            
        case 'CREDIT_SPREAD':
            html = `
                <div>
                    <label class="block text-gray-700 mb-2">Strike Price (Short) *</label>
                    <input type="number" step="0.01" name="short_strike" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                </div>
                <div>
                    <label class="block text-gray-700 mb-2">Spread Width *</label>
                    <input type="number" step="0.01" name="spread_width" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                </div>
            `
            break
            
        case 'DEBIT_SPREAD':
            html = `
                <div>
                    <label class="block text-gray-700 mb-2">Strike Price (Long) *</label>
                    <input type="number" step="0.01" name="long_strike" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                </div>
                <div>
                    <label class="block text-gray-700 mb-2">Spread Width *</label>
                    <input type="number" step="0.01" name="spread_width" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                </div>
            `
            break
            
        case 'IRON_CONDOR':
            html = `
                <div>
                    <label class="block text-gray-700 mb-2">Strike Price (Short Put) *</label>
                    <input type="number" step="0.01" name="short_put_strike" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                </div>
                <div>
                    <label class="block text-gray-700 mb-2">Strike Price (Short Call) *</label>
                    <input type="number" step="0.01" name="short_call_strike" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                </div>
                <div class="col-span-2">
                    <label class="block text-gray-700 mb-2">Spread Width *</label>
                    <input type="number" step="0.01" name="spread_width" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                </div>
            `
            break
    }
    
    strikeFields.innerHTML = html
}
```

#### E. Enhanced P/L Reporting Functions

**Location:** After existing report functions (around line 1300)

```javascript
async function loadEnhancedReports() {
    const year = document.getElementById('report-year').value
    
    try {
        // Load P/L by strategy
        const strategyResponse = await api.get(`/api/reports/pl-by-strategy${year ? '?year=' + year : ''}`)
        displayPLByStrategy(strategyResponse.data)
        
        // Load P/L by month
        const monthResponse = await api.get(`/api/reports/pl-by-month${year ? '?year=' + year : ''}`)
        displayPLByMonth(monthResponse.data)
        
        // Load YTD P/L
        const ytdResponse = await api.get('/api/reports/pl-ytd')
        displayPLYTD(ytdResponse.data)
        
    } catch (error) {
        console.error('Error loading enhanced reports:', error)
    }
}

function displayPLByStrategy(data) {
    const container = document.getElementById('pl-by-strategy')
    if (!container) return
    
    if (data.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No data available</p>'
        return
    }
    
    let html = '<table class="w-full"><thead><tr class="bg-gray-100">'
    html += '<th class="px-4 py-2 text-left">Strategy</th>'
    html += '<th class="px-4 py-2 text-right">Trades</th>'
    html += '<th class="px-4 py-2 text-right">Premium</th>'
    html += '<th class="px-4 py-2 text-right">Realized P/L</th>'
    html += '</tr></thead><tbody>'
    
    data.forEach(item => {
        html += '<tr class="border-b">'
        html += `<td class="px-4 py-2">${item.strategy_type.replace(/_/g, ' ')}</td>`
        html += `<td class="px-4 py-2 text-right">${item.trade_count}</td>`
        html += `<td class="px-4 py-2 text-right text-green-600">${formatCurrency(item.total_premium, 'USD')}</td>`
        html += `<td class="px-4 py-2 text-right ${item.realized_pl >= 0 ? 'text-green-600' : 'text-red-600'}">${formatCurrency(item.realized_pl, 'USD')}</td>`
        html += '</tr>'
    })
    
    html += '</tbody></table>'
    container.innerHTML = html
}

function displayPLByMonth(data) {
    const container = document.getElementById('pl-by-month')
    if (!container) return
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    
    let html = '<table class="w-full"><thead><tr class="bg-gray-100">'
    html += '<th class="px-4 py-2 text-left">Month</th>'
    html += '<th class="px-4 py-2 text-right">Stocks</th>'
    html += '<th class="px-4 py-2 text-right">Options</th>'
    html += '<th class="px-4 py-2 text-right">Total</th>'
    html += '</tr></thead><tbody>'
    
    for (let i = 1; i <= 12; i++) {
        const month = i.toString().padStart(2, '0')
        const stockData = data.stocks.find(s => s.month === month)
        const optionData = data.options.find(o => o.month === month)
        
        const stockPL = stockData?.total || 0
        const optionPL = (optionData?.total_premium || 0) + (optionData?.realized_pl || 0)
        const total = stockPL + optionPL
        
        if (total !== 0) {
            html += '<tr class="border-b">'
            html += `<td class="px-4 py-2">${months[i-1]}</td>`
            html += `<td class="px-4 py-2 text-right">${formatCurrency(stockPL, 'USD')}</td>`
            html += `<td class="px-4 py-2 text-right">${formatCurrency(optionPL, 'USD')}</td>`
            html += `<td class="px-4 py-2 text-right font-semibold ${total >= 0 ? 'text-green-600' : 'text-red-600'}">${formatCurrency(total, 'USD')}</td>`
            html += '</tr>'
        }
    }
    
    html += '</tbody></table>'
    container.innerHTML = html
}

function displayPLYTD(data) {
    const container = document.getElementById('pl-ytd')
    if (!container) return
    
    container.innerHTML = `
        <div class="grid grid-cols-4 gap-4">
            <div class="text-center">
                <p class="text-gray-600 text-sm">Stocks</p>
                <p class="text-2xl font-bold">${formatCurrency(data.stock_pl, 'USD')}</p>
            </div>
            <div class="text-center">
                <p class="text-gray-600 text-sm">Option Premium</p>
                <p class="text-2xl font-bold text-green-600">${formatCurrency(data.option_premium, 'USD')}</p>
            </div>
            <div class="text-center">
                <p class="text-gray-600 text-sm">Option Realized</p>
                <p class="text-2xl font-bold">${formatCurrency(data.option_realized, 'USD')}</p>
            </div>
            <div class="text-center">
                <p class="text-gray-600 text-sm">Total YTD</p>
                <p class="text-3xl font-bold ${data.total >= 0 ? 'text-green-600' : 'text-red-600'}">${formatCurrency(data.total, 'USD')}</p>
            </div>
        </div>
    `
}
```

#### F. Portfolio History Graph

**Location:** After enhanced reports functions

```javascript
async function loadPortfolioGraph() {
    const period = document.getElementById('graph-period')?.value || '1y'
    
    try {
        const response = await api.get(`/api/reports/portfolio-history?period=${period}`)
        const data = response.data
        
        if (data.length === 0) {
            document.getElementById('portfolio-graph').innerHTML = '<p class="text-gray-500">No historical data available</p>'
            return
        }
        
        // Prepare data for Chart.js
        const labels = data.map(d => `${d.year}-${d.month.toString().padStart(2, '0')}`)
        const cadData = data.map(d => d.total_cad)
        const usdData = data.map(d => d.total_usd)
        
        // Create chart
        const ctx = document.getElementById('portfolioChart').getContext('2d')
        
        // Destroy existing chart if any
        if (window.portfolioChart) {
            window.portfolioChart.destroy()
        }
        
        window.portfolioChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Portfolio Value (CAD)',
                        data: cadData,
                        borderColor: '#004F59',
                        backgroundColor: 'rgba(0, 79, 89, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Portfolio Value (USD)',
                        data: usdData,
                        borderColor: '#C9B25F',
                        backgroundColor: 'rgba(201, 178, 95, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: 'Portfolio Balance Over Time'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString()
                            }
                        }
                    }
                }
            }
        })
    } catch (error) {
        console.error('Error loading portfolio graph:', error)
    }
}
```

### 3.2 MODIFY EXISTING FUNCTIONS

#### A. Update showStockForm to use account dropdown

**Location:** Find showStockForm function (around line 950)

**FIND:**
```javascript
<select name="account_type" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
    <option value="Cash">Cash</option>
    <option value="RESP">RESP</option>
    <option value="RRSP">RRSP</option>
    <option value="LIRA">LIRA</option>
</select>
```

**REPLACE WITH:**
```javascript
<select name="account_id" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
    ${getAccountsDropdownHTML()}
</select>
```

**FIND (in same function):**
```javascript
const data = {
    ticker: formData.get('ticker'),
    trade_type: formData.get('trade_type'),
    quantity: parseInt(formData.get('quantity')),
    price: parseFloat(formData.get('price')),
    account_type: formData.get('account_type'),
    trade_date: formData.get('trade_date'),
    cost_basis_adjustment: parseFloat(formData.get('cost_basis_adjustment')),
    is_open: formData.get('is_open') === 'on',
    notes: formData.get('notes') || null
}
```

**REPLACE WITH:**
```javascript
const data = {
    ticker: formData.get('ticker'),
    trade_type: formData.get('trade_type'),
    quantity: parseInt(formData.get('quantity')),
    price: parseFloat(formData.get('price')),
    account_id: parseInt(formData.get('account_id')),  // CHANGED
    trade_date: formData.get('trade_date'),
    cost_basis_adjustment: parseFloat(formData.get('cost_basis_adjustment')),
    notes: formData.get('notes') || null
}
```

**FIND (remove is_open checkbox from HTML):**
```javascript
<div>
    <label class="flex items-center pt-8">
        <input type="checkbox" name="is_open" checked class="mr-2">
        <span class="text-gray-700">Position Open</span>
    </label>
</div>
```

**REPLACE WITH:**
```javascript
<!-- Position Open removed - auto-set on backend -->
```

#### B. Update showSection to load accounts

**Location:** Find showSection function (around line 300)

**FIND:**
```javascript
switch(sectionName) {
    case 'dashboard':
        loadDashboard()
        break
    case 'companies':
        loadCompanies()
        break
    case 'accounts':
        loadAccounts()
        break
```

**REPLACE WITH:**
```javascript
switch(sectionName) {
    case 'dashboard':
        loadDashboard()
        break
    case 'companies':
        loadCompanies()
        break
    case 'accounts':
        loadIndividualAccounts()  // CHANGED: load individual accounts
        break
    case 'account-balances':  // NEW: separate section for old balance tracking
        loadAccounts()
        break
```

#### C. Update DOMContentLoaded to load accounts

**Location:** Find document.addEventListener('DOMContentLoaded') (around line 50)

**FIND:**
```javascript
document.addEventListener('DOMContentLoaded', () => {
    if (token) {
        showMainApp()
        loadDashboard()
    }
})
```

**REPLACE WITH:**
```javascript
document.addEventListener('DOMContentLoaded', async () => {
    if (token) {
        await loadUserAccounts()  // Load accounts first for dropdowns
        showMainApp()
        loadDashboard()
    }
})
```

#### D. Update loadCompanies to show earnings fetch button

**Location:** Find loadCompanies function (around line 500)

**FIND:**
```javascript
<td class="px-4 py-3 text-center">
    <button onclick="editCompany(${company.id})" class="text-brand-teal hover:text-brand-gold mr-2">
        <i class="fas fa-edit"></i>
    </button>
    <button onclick="deleteCompany(${company.id})" class="text-red-600 hover:text-red-800">
        <i class="fas fa-trash"></i>
    </button>
</td>
```

**REPLACE WITH:**
```javascript
<td class="px-4 py-3 text-center">
    <button onclick="fetchEarningsDate(${company.id})" class="text-brand-gold hover:text-brand-teal mr-2" title="Fetch Earnings Date">
        <i class="fas fa-calendar-alt"></i>
    </button>
    <button onclick="editCompany(${company.id})" class="text-brand-teal hover:text-brand-gold mr-2">
        <i class="fas fa-edit"></i>
    </button>
    <button onclick="deleteCompany(${company.id})" class="text-red-600 hover:text-red-800">
        <i class="fas fa-trash"></i>
    </button>
</td>
```

---

## 4. HTML/UI Changes

### File: `src/index.tsx` - HTML template section

### 4.1 UPDATE NAVIGATION

**Location:** Find navigation section (around line 750)

**FIND:**
```html
<a href="#" onclick="showSection('accounts')" class="nav-link" data-section="accounts">
    <i class="fas fa-wallet mr-2"></i>Accounts
</a>
```

**REPLACE WITH:**
```html
<a href="#" onclick="showSection('accounts')" class="nav-link" data-section="accounts">
    <i class="fas fa-wallet mr-2"></i>Accounts
</a>
```

**KEEP THE SAME** (accounts now means individual accounts, not balance history)

### 4.2 UPDATE ACCOUNTS SECTION

**Location:** Find accounts section (around line 850)

**FIND:**
```html
<!-- Accounts Section -->
<div id="accounts-section" class="section hidden">
    <div class="flex justify-between items-center mb-6">
        <h2 class="text-3xl font-bold text-brand-teal">Account Balances</h2>
        <button onclick="showAccountForm()" class="btn-primary">
            <i class="fas fa-plus mr-2"></i>Update Balances
        </button>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6" id="accounts-grid">
        <!-- Dynamic content -->
    </div>
</div>
```

**REPLACE WITH:**
```html
<!-- Individual Accounts Section -->
<div id="accounts-section" class="section hidden">
    <div class="flex justify-between items-center mb-6">
        <h2 class="text-3xl font-bold text-brand-teal">Accounts</h2>
        <button onclick="showAccountModal()" class="btn-primary">
            <i class="fas fa-plus mr-2"></i>Add Account
        </button>
    </div>
    
    <div class="card mb-6">
        <p class="text-gray-600 mb-4">
            <i class="fas fa-info-circle text-brand-gold mr-2"></i>
            Create individual accounts (e.g., "RRSP - Questrade", "TFSA - TD") to track your portfolios separately.
        </p>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6" id="individual-accounts-grid">
        <!-- Dynamic content -->
    </div>
</div>
```

### 4.3 ADD COMPANIES NEXT EARNINGS DATE COLUMN

**Location:** Find companies table header (around line 870)

**ADD after "Sector" column:**
```html
<th class="px-4 py-3 text-left">Next Earnings</th>
```

**UPDATE companies table body to show earnings date:**

**FIND:**
```javascript
table.innerHTML += `
    <tr class="border-b border-gray-200 hover:bg-gray-50">
        <td class="px-4 py-3 font-semibold text-brand-teal">${company.ticker}</td>
        <td class="px-4 py-3">${company.company_name}</td>
        <td class="px-4 py-3">${company.exchange || '-'}</td>
        <td class="px-4 py-3">${company.sector || '-'}</td>
        <td class="px-4 py-3 text-center">
```

**ADD before closing first row:**
```javascript
<td class="px-4 py-3">${company.next_earnings_date || '-'}</td>
```

### 4.4 UPDATE REPORTS SECTION

**Location:** Find reports section (around line 920)

**REPLACE entire section with:**
```html
<!-- Reports Section -->
<div id="reports-section" class="section hidden">
    <h2 class="text-3xl font-bold text-brand-teal mb-6">Reports & Analytics</h2>
    
    <!-- Filters -->
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
            <button onclick="loadEnhancedReports()" class="btn-primary">
                <i class="fas fa-sync mr-2"></i>Refresh Reports
            </button>
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
    
    <!-- YTD P/L Summary -->
    <div class="card mb-6">
        <h3 class="text-xl font-bold text-brand-teal mb-4">Year-to-Date P/L</h3>
        <div id="pl-ytd">
            <!-- Dynamic content -->
        </div>
    </div>
    
    <!-- Reports Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <!-- P/L by Strategy -->
        <div class="card">
            <h3 class="text-xl font-bold text-brand-teal mb-4">P/L by Strategy</h3>
            <div id="pl-by-strategy" class="overflow-x-auto">
                <!-- Dynamic content -->
            </div>
        </div>
        
        <!-- P/L by Month -->
        <div class="card">
            <h3 class="text-xl font-bold text-brand-teal mb-4">Monthly P/L</h3>
            <div id="pl-by-month" class="overflow-x-auto">
                <!-- Dynamic content -->
            </div>
        </div>
    </div>
    
    <!-- Portfolio History Graph -->
    <div class="card">
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold text-brand-teal">Portfolio Balance History</h3>
            <select id="graph-period" class="px-4 py-2 border border-gray-300 rounded-lg" onchange="loadPortfolioGraph()">
                <option value="1y">Last 12 Months</option>
                <option value="all">All Time</option>
            </select>
        </div>
        <div id="portfolio-graph" style="height: 400px;">
            <canvas id="portfolioChart"></canvas>
        </div>
    </div>
</div>
```

### 4.5 ADD CHART.JS LIBRARY

**Location:** Find script includes before closing </body> tag

**ADD:**
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
<script src="/static/app.js"></script>
```

---

## 5. Testing Checklist

### Phase 1: Individual Accounts
- [ ] Create new account with name and type
- [ ] View list of accounts
- [ ] Edit account balances
- [ ] Delete account (should fail if has trades)
- [ ] Verify accounts appear in dropdowns

### Phase 2: Stock Trades with Accounts
- [ ] Add stock trade with account selection
- [ ] Verify account name shows in trade list
- [ ] Edit stock trade
- [ ] Verify "Position Open" is hidden and auto-set

### Phase 3: Option Trades Strategy Fields
- [ ] Selling Put: Short strike field appears
- [ ] Buying Put: Long strike field appears
- [ ] Credit Spread: Short strike + spread width
- [ ] Debit Spread: Long strike + spread width
- [ ] Iron Condor: Both strikes + spread width
- [ ] Covered Call: REMOVED from options (verify)
- [ ] Verify account dropdown works
- [ ] Verify "Position Open" is hidden

### Phase 4: Earnings Date Fetch
- [ ] Click earnings button on company
- [ ] Verify API call to Alpha Vantage
- [ ] Check earnings date updates in database
- [ ] Verify shows in company list

### Phase 5: Enhanced Reports
- [ ] P/L by strategy shows correct data
- [ ] Monthly P/L displays properly
- [ ] YTD P/L calculates correctly
- [ ] Portfolio graph renders
- [ ] 1Y and All-time views work
- [ ] Export functions still work

### Phase 6: Integration
- [ ] Dashboard loads correctly
- [ ] All navigation works
- [ ] No console errors
- [ ] All forms save properly
- [ ] Data persists across refresh

---

## 6. Implementation Order

### Session 1: Backend API (2-3 hours)
1. Add individual accounts endpoints
2. Add earnings fetch endpoint
3. Add enhanced reporting endpoints
4. Modify stock trades to use account_id
5. Modify option trades with new strike fields
6. Add stock details endpoint
7. Test with curl/Postman

### Session 2: Frontend Forms (2-3 hours)
1. Create account management UI
2. Update stock form with account dropdown
3. Create strategy-specific option form
4. Add earnings fetch button
5. Remove "Position Open" checkboxes
6. Test all forms save correctly

### Session 3: Reports & Polish (1-2 hours)
1. Add enhanced P/L displays
2. Create portfolio graph with Chart.js
3. Update navigation
4. Add help text/tooltips
5. Full integration testing
6. Update README

### Session 4: Deployment
1. Git commit all changes
2. Rebuild application
3. Test locally
4. Deploy to Cloudflare/FastComet
5. Verify production works

---

## 7. Notes & Considerations

### Alpha Vantage API
- Free tier: 500 calls/day
- Need to replace 'demo' with real API key
- Store in environment variable for production
- CSV format response needs parsing

### Data Migration
- Existing trades have account_type, new ones need account_id
- Could create default accounts from existing types
- Or let users create accounts and manually reassign
- Old strike_price fields kept for backward compatibility

### Covered Calls
- Should be in stock details view only
- When viewing a stock position
- Option to sell covered call against that position
- Auto-fills ticker from stock

### UI/UX
- Account dropdown should show: "RRSP - Questrade (RRSP)"
- Strategy form should be dynamic based on selection
- Hide complexity when not needed
- Clear labels for strike prices

---

## 8. Quick Reference

### Strategy Field Mapping

| Strategy | Fields Required |
|----------|----------------|
| Selling Put | short_strike |
| Buying Put | long_strike |
| Credit Spread | short_strike, spread_width |
| Debit Spread | long_strike, spread_width |
| Iron Condor | short_strike (put), strike_price_2 (call), spread_width |
| Covered Call | (In stock details only) |

### API Endpoints Added

```
GET    /api/accounts/list
GET    /api/accounts/:id
POST   /api/accounts/create
PUT    /api/accounts/:id
DELETE /api/accounts/:id

POST   /api/companies/:id/fetch-earnings

GET    /api/reports/pl-by-strategy
GET    /api/reports/pl-by-month
GET    /api/reports/pl-ytd
GET    /api/reports/portfolio-history

GET    /api/stocks/:id/details
```

### Database Fields

**accounts table:**
- id, user_id, account_name, account_type
- balance_cad, balance_usd, cash_balance_usd
- created_at, updated_at

**option_trades (new):**
- short_strike, long_strike, spread_width, account_id

**stock_trades (new):**
- account_id

---

**END OF SPECIFICATION**

This document contains everything needed to implement all requested features. Follow the implementation order for best results. Good luck!
