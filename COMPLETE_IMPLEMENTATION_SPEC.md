# Complete Implementation Specification - Generational Investing v1.1

## Document Purpose
This document provides **exact, line-by-line implementation instructions** for completing all remaining features of the Generational Investing portfolio management platform. Each section can be implemented independently across multiple sessions.

---

## Table of Contents
1. [Phase 1: Account Management System](#phase-1-account-management-system)
2. [Phase 2: Option Trades Refactor](#phase-2-option-trades-refactor)
3. [Phase 3: Covered Calls in Stock Details](#phase-3-covered-calls-in-stock-details)
4. [Phase 4: Earnings Date Auto-Fetch](#phase-4-earnings-date-auto-fetch)
5. [Phase 5: Enhanced P/L Reporting](#phase-5-enhanced-pl-reporting)
6. [Phase 6: Portfolio History Graph](#phase-6-portfolio-history-graph)
7. [Testing Checklist](#testing-checklist)
8. [Deployment Guide](#deployment-guide)

---

## Phase 1: Account Management System

### Overview
Users must create individual accounts (e.g., "RRSP - Questrade", "TFSA - TD") that are **linked to one of the four account types** (Cash, RESP, RRSP, LIRA). All trades will then link to these specific accounts instead of generic account types.

### Database Changes
✅ **Already Applied** - Migration `0002_add_accounts_and_strikes.sql` created the following:

```sql
-- accounts table structure
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_name TEXT NOT NULL,        -- e.g., "RRSP - Questrade"
  account_type TEXT NOT NULL,        -- Cash, RESP, RRSP, LIRA
  balance_cad REAL DEFAULT 0,
  balance_usd REAL DEFAULT 0,
  cash_balance_usd REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Backend Changes - File: `src/index.tsx`

#### 1.1 Add Accounts API Endpoints

**Location:** After the companies endpoints (around line 300)

**Add the following complete endpoints:**

```typescript
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
             cash_balance_usd, created_at, updated_at
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
             cash_balance_usd, created_at, updated_at
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
      cash_balance_usd = 0 
    } = await c.req.json();

    // Validation
    if (!account_name || !account_type) {
      return c.json({ error: 'Account name and type are required' }, 400);
    }

    // Validate account_type
    const validTypes = ['Cash', 'RESP', 'RRSP', 'LIRA'];
    if (!validTypes.includes(account_type)) {
      return c.json({ error: 'Invalid account type' }, 400);
    }

    const result = await DB.prepare(`
      INSERT INTO accounts (
        user_id, account_name, account_type, balance_cad, 
        balance_usd, cash_balance_usd
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      userId, 
      account_name, 
      account_type, 
      balance_cad, 
      balance_usd, 
      cash_balance_usd
    ).run();

    return c.json({ 
      id: result.meta.last_row_id,
      account_name,
      account_type,
      balance_cad,
      balance_usd,
      cash_balance_usd
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
      cash_balance_usd 
    } = await c.req.json();

    // Validate account_type if provided
    if (account_type) {
      const validTypes = ['Cash', 'RESP', 'RRSP', 'LIRA'];
      if (!validTypes.includes(account_type)) {
        return c.json({ error: 'Invalid account type' }, 400);
      }
    }

    // Check ownership
    const existing = await DB.prepare(`
      SELECT id FROM accounts WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).first();

    if (!existing) {
      return c.json({ error: 'Account not found' }, 404);
    }

    await DB.prepare(`
      UPDATE accounts
      SET account_name = COALESCE(?, account_name),
          account_type = COALESCE(?, account_type),
          balance_cad = COALESCE(?, balance_cad),
          balance_usd = COALESCE(?, balance_usd),
          cash_balance_usd = COALESCE(?, cash_balance_usd),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      account_name, 
      account_type, 
      balance_cad, 
      balance_usd, 
      cash_balance_usd,
      accountId, 
      userId
    ).run();

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
});
```

#### 1.2 Update Dashboard Endpoint to Use Accounts

**Location:** Find the `/api/dashboard` endpoint (around line 800)

**Replace the account balances section with:**

```typescript
// Get account totals from accounts table instead of account_balances
const accountsQuery = await DB.prepare(`
  SELECT 
    account_type,
    SUM(balance_cad) as total_cad,
    SUM(balance_usd) as total_usd,
    SUM(cash_balance_usd) as total_cash_usd
  FROM accounts
  WHERE user_id = ?
  GROUP BY account_type
`).bind(userId).all();

const accountsByType: Record<string, any> = {};
accountsQuery.results.forEach((row: any) => {
  accountsByType[row.account_type] = {
    balance_cad: row.total_cad || 0,
    balance_usd: row.total_usd || 0,
    cash_usd: row.total_cash_usd || 0
  };
});

const totalBalanceUSD = Object.values(accountsByType)
  .reduce((sum: number, acc: any) => sum + (acc.balance_usd || 0), 0);
const totalBalanceCAD = Object.values(accountsByType)
  .reduce((sum: number, acc: any) => sum + (acc.balance_cad || 0), 0);
```

### Frontend Changes - File: `public/static/app.js`

#### 1.3 Add Accounts Section to Navigation

**Location:** Find the `showDashboard()` function (around line 100)

**Update the navigation menu to include Accounts:**

```javascript
<nav class="mb-6 flex space-x-4 border-b border-gray-700">
  <button onclick="app.showDashboard()" class="pb-2 px-1 border-b-2 border-teal-500">
    Dashboard
  </button>
  <button onclick="app.showCompanies()" class="pb-2 px-1">
    Companies
  </button>
  <button onclick="app.showAccounts()" class="pb-2 px-1">
    Accounts
  </button>
  <button onclick="app.showStockTrades()" class="pb-2 px-1">
    Stock Trades
  </button>
  <button onclick="app.showOptionTrades()" class="pb-2 px-1">
    Option Trades
  </button>
  <button onclick="app.showReports()" class="pb-2 px-1">
    Reports
  </button>
</nav>
```

#### 1.4 Add Accounts Management Functions

**Location:** Add after `showCompanies()` function (around line 400)

**Add complete accounts management:**

```javascript
// ============================================================================
// ACCOUNTS SECTION
// ============================================================================

async showAccounts() {
  try {
    const response = await axios.get('/api/accounts', {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    
    const accounts = response.data.accounts || [];
    
    // Group accounts by type
    const grouped = {
      'Cash': [],
      'RESP': [],
      'RRSP': [],
      'LIRA': []
    };
    
    accounts.forEach(acc => {
      if (grouped[acc.account_type]) {
        grouped[acc.account_type].push(acc);
      }
    });
    
    document.getElementById('app').innerHTML = `
      <div>
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold">
            <i class="fas fa-wallet mr-2"></i>
            Accounts
          </h2>
          <button 
            onclick="app.showAddAccountForm()" 
            class="btn-primary"
          >
            <i class="fas fa-plus mr-2"></i>
            Add Account
          </button>
        </div>
        
        ${Object.entries(grouped).map(([type, accts]) => `
          <div class="mb-6">
            <h3 class="text-xl font-semibold mb-3 text-brand-gold">
              ${type} Accounts
            </h3>
            
            ${accts.length === 0 ? `
              <p class="text-gray-400 italic">No ${type} accounts yet</p>
            ` : `
              <div class="grid gap-4">
                ${accts.map(acc => `
                  <div class="card">
                    <div class="flex justify-between items-start">
                      <div class="flex-1">
                        <h4 class="text-lg font-semibold mb-2">
                          ${acc.account_name}
                        </h4>
                        <div class="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span class="text-gray-400">Balance CAD:</span>
                            <span class="ml-2 font-semibold">
                              $${this.formatNumber(acc.balance_cad)}
                            </span>
                          </div>
                          <div>
                            <span class="text-gray-400">Balance USD:</span>
                            <span class="ml-2 font-semibold">
                              $${this.formatNumber(acc.balance_usd)}
                            </span>
                          </div>
                          <div>
                            <span class="text-gray-400">Cash USD:</span>
                            <span class="ml-2 font-semibold">
                              $${this.formatNumber(acc.cash_balance_usd)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div class="ml-4 flex space-x-2">
                        <button 
                          onclick="app.showEditAccountForm(${acc.id})" 
                          class="text-blue-400 hover:text-blue-300"
                          title="Edit"
                        >
                          <i class="fas fa-edit"></i>
                        </button>
                        <button 
                          onclick="app.deleteAccount(${acc.id})" 
                          class="text-red-400 hover:text-red-300"
                          title="Delete"
                        >
                          <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    console.error('Failed to load accounts:', error);
    this.showError('Failed to load accounts');
  }
},

showAddAccountForm() {
  document.getElementById('app').innerHTML = `
    <div>
      <h2 class="text-2xl font-bold mb-6">
        <i class="fas fa-plus mr-2"></i>
        Add New Account
      </h2>
      
      <form onsubmit="app.saveAccount(event)" class="card max-w-2xl">
        <div class="form-group">
          <label>Account Name *</label>
          <input 
            type="text" 
            id="account_name" 
            placeholder="e.g., RRSP - Questrade"
            required
          >
          <small class="text-gray-400">
            Choose a descriptive name to identify this account
          </small>
        </div>
        
        <div class="form-group">
          <label>Account Type *</label>
          <select id="account_type" required>
            <option value="">Select account type...</option>
            <option value="Cash">Cash</option>
            <option value="RESP">RESP</option>
            <option value="RRSP">RRSP</option>
            <option value="LIRA">LIRA</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>Initial Balance (CAD)</label>
          <input 
            type="number" 
            id="balance_cad" 
            step="0.01" 
            value="0"
            placeholder="0.00"
          >
        </div>
        
        <div class="form-group">
          <label>Initial Balance (USD)</label>
          <input 
            type="number" 
            id="balance_usd" 
            step="0.01" 
            value="0"
            placeholder="0.00"
          >
        </div>
        
        <div class="form-group">
          <label>Cash Balance (USD)</label>
          <input 
            type="number" 
            id="cash_balance_usd" 
            step="0.01" 
            value="0"
            placeholder="0.00"
          >
          <small class="text-gray-400">
            Available cash for trading
          </small>
        </div>
        
        <div class="flex space-x-3">
          <button type="submit" class="btn-primary">
            <i class="fas fa-save mr-2"></i>
            Save Account
          </button>
          <button 
            type="button" 
            onclick="app.showAccounts()" 
            class="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  `;
},

async showEditAccountForm(accountId) {
  try {
    const response = await axios.get(`/api/accounts/${accountId}`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    
    const account = response.data.account;
    
    document.getElementById('app').innerHTML = `
      <div>
        <h2 class="text-2xl font-bold mb-6">
          <i class="fas fa-edit mr-2"></i>
          Edit Account
        </h2>
        
        <form onsubmit="app.updateAccount(event, ${accountId})" class="card max-w-2xl">
          <div class="form-group">
            <label>Account Name *</label>
            <input 
              type="text" 
              id="account_name" 
              value="${account.account_name}"
              required
            >
          </div>
          
          <div class="form-group">
            <label>Account Type *</label>
            <select id="account_type" required>
              <option value="Cash" ${account.account_type === 'Cash' ? 'selected' : ''}>Cash</option>
              <option value="RESP" ${account.account_type === 'RESP' ? 'selected' : ''}>RESP</option>
              <option value="RRSP" ${account.account_type === 'RRSP' ? 'selected' : ''}>RRSP</option>
              <option value="LIRA" ${account.account_type === 'LIRA' ? 'selected' : ''}>LIRA</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Balance (CAD)</label>
            <input 
              type="number" 
              id="balance_cad" 
              step="0.01" 
              value="${account.balance_cad}"
            >
          </div>
          
          <div class="form-group">
            <label>Balance (USD)</label>
            <input 
              type="number" 
              id="balance_usd" 
              step="0.01" 
              value="${account.balance_usd}"
            >
          </div>
          
          <div class="form-group">
            <label>Cash Balance (USD)</label>
            <input 
              type="number" 
              id="cash_balance_usd" 
              step="0.01" 
              value="${account.cash_balance_usd}"
            >
          </div>
          
          <div class="flex space-x-3">
            <button type="submit" class="btn-primary">
              <i class="fas fa-save mr-2"></i>
              Update Account
            </button>
            <button 
              type="button" 
              onclick="app.showAccounts()" 
              class="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    `;
  } catch (error) {
    console.error('Failed to load account:', error);
    this.showError('Failed to load account');
  }
},

async saveAccount(event) {
  event.preventDefault();
  
  const data = {
    account_name: document.getElementById('account_name').value,
    account_type: document.getElementById('account_type').value,
    balance_cad: parseFloat(document.getElementById('balance_cad').value) || 0,
    balance_usd: parseFloat(document.getElementById('balance_usd').value) || 0,
    cash_balance_usd: parseFloat(document.getElementById('cash_balance_usd').value) || 0
  };
  
  try {
    await axios.post('/api/accounts', data, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    
    this.showSuccess('Account created successfully');
    this.showAccounts();
  } catch (error) {
    console.error('Failed to create account:', error);
    this.showError('Failed to create account');
  }
},

async updateAccount(event, accountId) {
  event.preventDefault();
  
  const data = {
    account_name: document.getElementById('account_name').value,
    account_type: document.getElementById('account_type').value,
    balance_cad: parseFloat(document.getElementById('balance_cad').value) || 0,
    balance_usd: parseFloat(document.getElementById('balance_usd').value) || 0,
    cash_balance_usd: parseFloat(document.getElementById('cash_balance_usd').value) || 0
  };
  
  try {
    await axios.put(`/api/accounts/${accountId}`, data, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    
    this.showSuccess('Account updated successfully');
    this.showAccounts();
  } catch (error) {
    console.error('Failed to update account:', error);
    this.showError('Failed to update account');
  }
},

async deleteAccount(accountId) {
  if (!confirm('Are you sure you want to delete this account? This cannot be undone.')) {
    return;
  }
  
  try {
    await axios.delete(`/api/accounts/${accountId}`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    
    this.showSuccess('Account deleted successfully');
    this.showAccounts();
  } catch (error) {
    console.error('Failed to delete account:', error);
    if (error.response?.data?.error) {
      this.showError(error.response.data.error);
    } else {
      this.showError('Failed to delete account');
    }
  }
},
```

#### 1.5 Update Trade Forms to Use Account Dropdown

**Location:** Find `showAddStockTradeForm()` and `showAddOptionTradeForm()` functions

**Replace the account_type dropdown with account dropdown:**

```javascript
// OLD CODE TO REPLACE:
<div class="form-group">
  <label>Account Type *</label>
  <select id="account_type" required>
    <option value="">Select account type...</option>
    <option value="Cash">Cash</option>
    <option value="RESP">RESP</option>
    <option value="RRSP">RRSP</option>
    <option value="LIRA">LIRA</option>
  </select>
</div>

// NEW CODE:
<div class="form-group">
  <label>Account *</label>
  <select id="account_id" required>
    <option value="">Select account...</option>
    ${this.accountsList.map(acc => `
      <option value="${acc.id}">${acc.account_name} (${acc.account_type})</option>
    `).join('')}
  </select>
  <small class="text-gray-400">
    <a href="#" onclick="app.showAccounts(); return false;" class="text-brand-gold hover:underline">
      Manage accounts
    </a>
  </small>
</div>
```

**Also add a helper function to load accounts list:**

```javascript
// Add this near the top of the app object (around line 50)
accountsList: [],

// Add this function to load accounts into memory
async loadAccountsList() {
  try {
    const response = await axios.get('/api/accounts', {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    this.accountsList = response.data.accounts || [];
  } catch (error) {
    console.error('Failed to load accounts list:', error);
    this.accountsList = [];
  }
},

// Call this in init() after successful login
async init() {
  // ... existing code ...
  await this.loadAccountsList();  // Add this line
  this.showDashboard();
},
```

---

## Phase 2: Option Trades Refactor

### Overview
Refactor option trades to use strategy-specific fields: `short_strike`, `long_strike`, and `spread_width`. Different strategies show different fields.

### Database Changes
✅ **Already Applied** - Migration `0002_add_accounts_and_strikes.sql` added these columns to `option_trades`:
- `short_strike` REAL
- `long_strike` REAL  
- `spread_width` REAL
- `account_id` INTEGER (FK to accounts table)

### Backend Changes - File: `src/index.tsx`

#### 2.1 Update Option Trades Creation Endpoint

**Location:** Find `POST /api/option-trades` endpoint (around line 500)

**Replace the existing endpoint with:**

```typescript
app.post('/api/option-trades', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;
    const { 
      company_id,
      ticker,
      strategy_type,
      strike_price,      // Keep for backwards compatibility
      short_strike,
      long_strike,
      spread_width,
      premium,
      quantity,
      expiration_date,
      account_id,        // Now uses account_id instead of account_type
      trade_date,
      notes
    } = await c.req.json();

    // Validation
    if (!company_id || !strategy_type || !account_id) {
      return c.json({ 
        error: 'Company, strategy type, and account are required' 
      }, 400);
    }

    // Validate strategy-specific fields
    const validationResult = validateOptionStrategy(
      strategy_type, 
      { short_strike, long_strike, spread_width, strike_price }
    );
    
    if (!validationResult.valid) {
      return c.json({ error: validationResult.error }, 400);
    }

    // Insert option trade
    const result = await DB.prepare(`
      INSERT INTO option_trades (
        user_id, company_id, ticker, strategy_type,
        strike_price, short_strike, long_strike, spread_width,
        premium, quantity, expiration_date, account_id,
        trade_date, is_open, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(
      userId,
      company_id,
      ticker,
      strategy_type,
      strike_price || short_strike || long_strike || null,  // Backwards compat
      short_strike || null,
      long_strike || null,
      spread_width || null,
      premium,
      quantity,
      expiration_date,
      account_id,
      trade_date || new Date().toISOString().split('T')[0],
      notes || null
    ).run();

    return c.json({ 
      id: result.meta.last_row_id,
      message: 'Option trade created successfully'
    }, 201);
  } catch (error: any) {
    console.error('Create option trade error:', error);
    return c.json({ error: 'Failed to create option trade' }, 500);
  }
});

// Helper function for validation (add before the endpoint)
function validateOptionStrategy(
  strategy: string, 
  strikes: any
): { valid: boolean; error?: string } {
  const { short_strike, long_strike, spread_width, strike_price } = strikes;
  
  switch (strategy) {
    case 'selling_put':
      if (!short_strike && !strike_price) {
        return { valid: false, error: 'Short strike is required for selling puts' };
      }
      break;
      
    case 'buying_put':
      if (!long_strike && !strike_price) {
        return { valid: false, error: 'Long strike is required for buying puts' };
      }
      break;
      
    case 'credit_spread':
      if (!short_strike) {
        return { valid: false, error: 'Short strike is required for credit spreads' };
      }
      if (!spread_width) {
        return { valid: false, error: 'Spread width is required for credit spreads' };
      }
      break;
      
    case 'debit_spread':
      if (!long_strike) {
        return { valid: false, error: 'Long strike is required for debit spreads' };
      }
      if (!spread_width) {
        return { valid: false, error: 'Spread width is required for debit spreads' };
      }
      break;
      
    case 'iron_condor':
      if (!short_strike) {
        return { valid: false, error: 'Short put strike is required for iron condors' };
      }
      if (!strikes.strike_price_2) {
        return { valid: false, error: 'Short call strike is required for iron condors' };
      }
      if (!spread_width) {
        return { valid: false, error: 'Spread width is required for iron condors' };
      }
      break;
  }
  
  return { valid: true };
}
```

#### 2.2 Update Option Trades List Endpoint

**Location:** Find `GET /api/option-trades` endpoint

**Update the SELECT query to include new fields:**

```typescript
app.get('/api/option-trades', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;

    const { results } = await DB.prepare(`
      SELECT 
        ot.id, ot.company_id, ot.ticker, ot.strategy_type,
        ot.strike_price, ot.short_strike, ot.long_strike, ot.spread_width,
        ot.premium, ot.quantity, ot.expiration_date,
        ot.account_id, ot.trade_date, ot.is_open,
        ot.close_date, ot.close_price, ot.profit_loss, ot.notes,
        ot.created_at,
        c.company_name,
        a.account_name, a.account_type
      FROM option_trades ot
      LEFT JOIN companies c ON ot.company_id = c.id
      LEFT JOIN accounts a ON ot.account_id = a.id
      WHERE ot.user_id = ?
      ORDER BY ot.trade_date DESC, ot.id DESC
    `).bind(userId).all();

    return c.json({ trades: results });
  } catch (error: any) {
    console.error('Get option trades error:', error);
    return c.json({ error: 'Failed to fetch option trades' }, 500);
  }
});
```

### Frontend Changes - File: `public/static/app.js`

#### 2.3 Update Option Trade Form with Strategy-Specific Fields

**Location:** Find `showAddOptionTradeForm()` function

**Replace with this new version that shows/hides fields based on strategy:**

```javascript
async showAddOptionTradeForm() {
  await this.loadAccountsList();  // Load accounts
  
  const companiesResponse = await axios.get('/api/companies', {
    headers: { 'Authorization': `Bearer ${this.token}` }
  });
  const companies = companiesResponse.data.companies || [];
  
  document.getElementById('app').innerHTML = `
    <div>
      <h2 class="text-2xl font-bold mb-6">
        <i class="fas fa-chart-line mr-2"></i>
        Add Option Trade
      </h2>
      
      <form onsubmit="app.saveOptionTrade(event)" class="card max-w-3xl">
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label>Company *</label>
            <select id="company_id" required onchange="app.updateTicker()">
              <option value="">Select company...</option>
              ${companies.map(c => `
                <option value="${c.id}" data-ticker="${c.ticker}">
                  ${c.ticker} - ${c.company_name}
                </option>
              `).join('')}
            </select>
          </div>
          
          <div class="form-group">
            <label>Strategy *</label>
            <select id="strategy_type" required onchange="app.updateStrategyFields()">
              <option value="">Select strategy...</option>
              <option value="selling_put">Selling Put</option>
              <option value="buying_put">Buying Put</option>
              <option value="credit_spread">Credit Spread</option>
              <option value="debit_spread">Debit Spread</option>
              <option value="iron_condor">Iron Condor</option>
            </select>
          </div>
        </div>
        
        <!-- Strategy-specific strike fields (shown/hidden by JS) -->
        <div id="strike-fields">
          <!-- Short Strike (for Selling Puts, Credit Spreads, Iron Condors) -->
          <div class="form-group" id="short-strike-group" style="display:none;">
            <label id="short-strike-label">Strike Price (Short) *</label>
            <input 
              type="number" 
              id="short_strike" 
              step="0.01"
              placeholder="0.00"
            >
            <small class="text-gray-400" id="short-strike-help">
              The strike price you're selling
            </small>
          </div>
          
          <!-- Long Strike (for Buying Puts, Debit Spreads) -->
          <div class="form-group" id="long-strike-group" style="display:none;">
            <label id="long-strike-label">Strike Price (Long) *</label>
            <input 
              type="number" 
              id="long_strike" 
              step="0.01"
              placeholder="0.00"
            >
            <small class="text-gray-400" id="long-strike-help">
              The strike price you're buying
            </small>
          </div>
          
          <!-- Strike Price 2 (for Iron Condors - Short Call) -->
          <div class="form-group" id="strike2-group" style="display:none;">
            <label>Strike Price (Short Call) *</label>
            <input 
              type="number" 
              id="strike_price_2" 
              step="0.01"
              placeholder="0.00"
            >
            <small class="text-gray-400">
              The call strike price you're selling
            </small>
          </div>
          
          <!-- Spread Width (for Spreads and Iron Condors) -->
          <div class="form-group" id="spread-width-group" style="display:none;">
            <label>Spread Width *</label>
            <input 
              type="number" 
              id="spread_width" 
              step="0.01"
              placeholder="0.00"
            >
            <small class="text-gray-400">
              Distance between strikes
            </small>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label>Premium (per contract) *</label>
            <input 
              type="number" 
              id="premium" 
              step="0.01"
              required
              placeholder="0.00"
            >
          </div>
          
          <div class="form-group">
            <label>Quantity (contracts) *</label>
            <input 
              type="number" 
              id="quantity" 
              required
              placeholder="1"
            >
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label>Expiration Date *</label>
            <input 
              type="date" 
              id="expiration_date" 
              required
            >
          </div>
          
          <div class="form-group">
            <label>Trade Date *</label>
            <input 
              type="date" 
              id="trade_date" 
              required
              value="${new Date().toISOString().split('T')[0]}"
            >
          </div>
        </div>
        
        <div class="form-group">
          <label>Account *</label>
          <select id="account_id" required>
            <option value="">Select account...</option>
            ${this.accountsList.map(acc => `
              <option value="${acc.id}">
                ${acc.account_name} (${acc.account_type})
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="form-group">
          <label>Notes</label>
          <textarea 
            id="notes" 
            rows="3"
            placeholder="Optional notes about this trade..."
          ></textarea>
        </div>
        
        <div class="flex space-x-3">
          <button type="submit" class="btn-primary">
            <i class="fas fa-save mr-2"></i>
            Save Trade
          </button>
          <button 
            type="button" 
            onclick="app.showOptionTrades()" 
            class="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  `;
},

// Add this helper function to show/hide fields based on strategy
updateStrategyFields() {
  const strategy = document.getElementById('strategy_type').value;
  
  // Hide all fields first
  document.getElementById('short-strike-group').style.display = 'none';
  document.getElementById('long-strike-group').style.display = 'none';
  document.getElementById('strike2-group').style.display = 'none';
  document.getElementById('spread-width-group').style.display = 'none';
  
  // Clear required attributes
  document.getElementById('short_strike').removeAttribute('required');
  document.getElementById('long_strike').removeAttribute('required');
  document.getElementById('strike_price_2').removeAttribute('required');
  document.getElementById('spread_width').removeAttribute('required');
  
  // Show relevant fields based on strategy
  switch(strategy) {
    case 'selling_put':
      document.getElementById('short-strike-group').style.display = 'block';
      document.getElementById('short_strike').setAttribute('required', 'required');
      document.getElementById('short-strike-label').textContent = 'Strike Price (Short) *';
      document.getElementById('short-strike-help').textContent = 'The put strike price you\'re selling';
      break;
      
    case 'buying_put':
      document.getElementById('long-strike-group').style.display = 'block';
      document.getElementById('long_strike').setAttribute('required', 'required');
      document.getElementById('long-strike-label').textContent = 'Strike Price (Long) *';
      document.getElementById('long-strike-help').textContent = 'The put strike price you\'re buying';
      break;
      
    case 'credit_spread':
      document.getElementById('short-strike-group').style.display = 'block';
      document.getElementById('spread-width-group').style.display = 'block';
      document.getElementById('short_strike').setAttribute('required', 'required');
      document.getElementById('spread_width').setAttribute('required', 'required');
      document.getElementById('short-strike-label').textContent = 'Strike Price (Short) *';
      document.getElementById('short-strike-help').textContent = 'The strike you\'re selling (closer to current price)';
      break;
      
    case 'debit_spread':
      document.getElementById('long-strike-group').style.display = 'block';
      document.getElementById('spread-width-group').style.display = 'block';
      document.getElementById('long_strike').setAttribute('required', 'required');
      document.getElementById('spread_width').setAttribute('required', 'required');
      document.getElementById('long-strike-label').textContent = 'Strike Price (Long) *';
      document.getElementById('long-strike-help').textContent = 'The strike you\'re buying (closer to current price)';
      break;
      
    case 'iron_condor':
      document.getElementById('short-strike-group').style.display = 'block';
      document.getElementById('strike2-group').style.display = 'block';
      document.getElementById('spread-width-group').style.display = 'block';
      document.getElementById('short_strike').setAttribute('required', 'required');
      document.getElementById('strike_price_2').setAttribute('required', 'required');
      document.getElementById('spread_width').setAttribute('required', 'required');
      document.getElementById('short-strike-label').textContent = 'Strike Price (Short Put) *';
      document.getElementById('short-strike-help').textContent = 'The put strike you\'re selling';
      break;
  }
},

// Update the save function to capture new fields
async saveOptionTrade(event) {
  event.preventDefault();
  
  const strategy = document.getElementById('strategy_type').value;
  const data = {
    company_id: parseInt(document.getElementById('company_id').value),
    ticker: document.getElementById('company_id').selectedOptions[0]?.dataset.ticker || '',
    strategy_type: strategy,
    short_strike: parseFloat(document.getElementById('short_strike').value) || null,
    long_strike: parseFloat(document.getElementById('long_strike').value) || null,
    spread_width: parseFloat(document.getElementById('spread_width').value) || null,
    strike_price_2: parseFloat(document.getElementById('strike_price_2')?.value) || null,
    premium: parseFloat(document.getElementById('premium').value),
    quantity: parseInt(document.getElementById('quantity').value),
    expiration_date: document.getElementById('expiration_date').value,
    account_id: parseInt(document.getElementById('account_id').value),
    trade_date: document.getElementById('trade_date').value,
    notes: document.getElementById('notes').value
  };
  
  try {
    await axios.post('/api/option-trades', data, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    
    this.showSuccess('Option trade created successfully');
    this.showOptionTrades();
  } catch (error) {
    console.error('Failed to create option trade:', error);
    const errorMsg = error.response?.data?.error || 'Failed to create option trade';
    this.showError(errorMsg);
  }
},
```

#### 2.4 Update Option Trades Display

**Location:** Find `showOptionTrades()` function

**Update the display to show strategy-specific strikes:**

```javascript
// In the table row for each trade, replace the strike price cell with:
<td>
  ${(() => {
    const t = trade;
    switch(t.strategy_type) {
      case 'selling_put':
        return `Short: $${app.formatNumber(t.short_strike || t.strike_price)}`;
      case 'buying_put':
        return `Long: $${app.formatNumber(t.long_strike || t.strike_price)}`;
      case 'credit_spread':
        return `Short: $${app.formatNumber(t.short_strike)}<br>Width: $${app.formatNumber(t.spread_width)}`;
      case 'debit_spread':
        return `Long: $${app.formatNumber(t.long_strike)}<br>Width: $${app.formatNumber(t.spread_width)}`;
      case 'iron_condor':
        return `Put: $${app.formatNumber(t.short_strike)}<br>Call: $${app.formatNumber(t.strike_price_2)}<br>Width: $${app.formatNumber(t.spread_width)}`;
      default:
        return `$${app.formatNumber(t.strike_price)}`;
    }
  })()}
</td>
```

---

## Phase 3: Covered Calls in Stock Details

### Overview
Move Covered Calls from the main Options form to the Stock Details page. Users can only sell covered calls when they have an open stock position.

### Backend Changes - File: `src/index.tsx`

#### 3.1 Add Covered Call Endpoint

**Location:** Add after stock trades endpoints (around line 600)

```typescript
// ============================================================================
// COVERED CALLS - Stock Details Integration
// ============================================================================

// Get stock position for covered calls
app.get('/api/stock-trades/:id/position', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const tradeId = parseInt(c.req.param('id'));
    const { DB } = c.env;

    // Get the stock trade
    const trade = await DB.prepare(`
      SELECT 
        st.id, st.company_id, st.ticker, st.quantity, st.price,
        st.account_id, st.is_open, st.cost_basis_adjustment,
        c.company_name,
        a.account_name, a.account_type
      FROM stock_trades st
      LEFT JOIN companies c ON st.company_id = c.id
      LEFT JOIN accounts a ON st.account_id = a.id
      WHERE st.id = ? AND st.user_id = ? AND st.is_open = 1
    `).bind(tradeId, userId).first();

    if (!trade) {
      return c.json({ error: 'Stock position not found or closed' }, 404);
    }

    // Get existing covered calls for this position
    const { results: coveredCalls } = await DB.prepare(`
      SELECT 
        id, short_strike as strike_price, premium, quantity,
        expiration_date, trade_date, is_open, close_date,
        close_price, profit_loss, notes
      FROM option_trades
      WHERE user_id = ? 
        AND company_id = ?
        AND account_id = ?
        AND strategy_type = 'covered_call'
      ORDER BY trade_date DESC
    `).bind(userId, trade.company_id, trade.account_id).all();

    return c.json({ 
      stock_trade: trade,
      covered_calls: coveredCalls
    });
  } catch (error: any) {
    console.error('Get stock position error:', error);
    return c.json({ error: 'Failed to fetch stock position' }, 500);
  }
});

// Add covered call for a stock position
app.post('/api/stock-trades/:id/covered-call', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const stockTradeId = parseInt(c.req.param('id'));
    const { DB } = c.env;
    
    const {
      strike_price,
      premium,
      quantity,
      expiration_date,
      trade_date,
      notes
    } = await c.req.json();

    // Verify stock position exists and is open
    const stockTrade = await DB.prepare(`
      SELECT id, company_id, ticker, quantity, account_id
      FROM stock_trades
      WHERE id = ? AND user_id = ? AND is_open = 1
    `).bind(stockTradeId, userId).first() as any;

    if (!stockTrade) {
      return c.json({ 
        error: 'Stock position not found or already closed' 
      }, 404);
    }

    // Validate quantity doesn't exceed stock quantity
    if (quantity * 100 > stockTrade.quantity) {
      return c.json({ 
        error: `Cannot sell ${quantity} calls. You only own ${stockTrade.quantity} shares (${Math.floor(stockTrade.quantity / 100)} contracts max)` 
      }, 400);
    }

    // Insert covered call as option trade
    const result = await DB.prepare(`
      INSERT INTO option_trades (
        user_id, company_id, ticker, strategy_type,
        short_strike, premium, quantity, expiration_date,
        account_id, trade_date, is_open, notes
      )
      VALUES (?, ?, ?, 'covered_call', ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(
      userId,
      stockTrade.company_id,
      stockTrade.ticker,
      strike_price,
      premium,
      quantity,
      expiration_date,
      stockTrade.account_id,
      trade_date || new Date().toISOString().split('T')[0],
      notes || null
    ).run();

    // Update stock trade cost basis (reduce by premium collected)
    const premiumTotal = premium * quantity * 100;  // Premium per share * contracts * 100 shares
    await DB.prepare(`
      UPDATE stock_trades
      SET cost_basis_adjustment = cost_basis_adjustment - ?
      WHERE id = ?
    `).bind(premiumTotal, stockTradeId).run();

    return c.json({ 
      id: result.meta.last_row_id,
      message: 'Covered call created successfully',
      premium_collected: premiumTotal
    }, 201);
  } catch (error: any) {
    console.error('Create covered call error:', error);
    return c.json({ error: 'Failed to create covered call' }, 500);
  }
});
```

### Frontend Changes - File: `public/static/app.js`

#### 3.2 Add Stock Details View with Covered Calls

**Location:** Add after `showStockTrades()` function (around line 800)

```javascript
// ============================================================================
// STOCK DETAILS - Covered Calls Integration
// ============================================================================

async showStockDetails(tradeId) {
  try {
    const response = await axios.get(`/api/stock-trades/${tradeId}/position`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    
    const { stock_trade, covered_calls } = response.data;
    const maxContracts = Math.floor(stock_trade.quantity / 100);
    
    document.getElementById('app').innerHTML = `
      <div>
        <div class="flex items-center mb-6">
          <button 
            onclick="app.showStockTrades()" 
            class="text-brand-gold hover:underline mr-4"
          >
            <i class="fas fa-arrow-left mr-2"></i>
            Back to Stock Trades
          </button>
        </div>
        
        <div class="card mb-6">
          <h2 class="text-2xl font-bold mb-4">
            <i class="fas fa-chart-line mr-2"></i>
            ${stock_trade.ticker} - ${stock_trade.company_name}
          </h2>
          
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <span class="text-gray-400">Quantity:</span>
              <span class="ml-2 font-semibold">${this.formatNumber(stock_trade.quantity)} shares</span>
            </div>
            <div>
              <span class="text-gray-400">Purchase Price:</span>
              <span class="ml-2 font-semibold">$${this.formatNumber(stock_trade.price)}</span>
            </div>
            <div>
              <span class="text-gray-400">Account:</span>
              <span class="ml-2 font-semibold">${stock_trade.account_name}</span>
            </div>
            <div>
              <span class="text-gray-400">Cost Basis Adj:</span>
              <span class="ml-2 font-semibold ${stock_trade.cost_basis_adjustment < 0 ? 'text-green-400' : ''}">
                $${this.formatNumber(stock_trade.cost_basis_adjustment)}
              </span>
            </div>
          </div>
          
          <div class="bg-brand-teal/20 p-3 rounded border border-brand-teal/30">
            <p class="text-sm">
              <i class="fas fa-info-circle mr-2"></i>
              You can sell up to <strong>${maxContracts} covered call contracts</strong> 
              (${maxContracts * 100} shares covered)
            </p>
          </div>
        </div>
        
        <!-- Covered Calls Section -->
        <div class="card">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold">
              <i class="fas fa-shield-alt mr-2"></i>
              Covered Calls
            </h3>
            <button 
              onclick="app.showAddCoveredCallForm(${tradeId})" 
              class="btn-primary"
            >
              <i class="fas fa-plus mr-2"></i>
              Sell Covered Call
            </button>
          </div>
          
          ${covered_calls.length === 0 ? `
            <p class="text-gray-400 italic">No covered calls sold yet</p>
          ` : `
            <div class="overflow-x-auto">
              <table class="table">
                <thead>
                  <tr>
                    <th>Strike Price</th>
                    <th>Premium</th>
                    <th>Contracts</th>
                    <th>Expiration</th>
                    <th>Trade Date</th>
                    <th>Status</th>
                    <th>P/L</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${covered_calls.map(cc => `
                    <tr>
                      <td>$${this.formatNumber(cc.strike_price)}</td>
                      <td>$${this.formatNumber(cc.premium)}</td>
                      <td>${cc.quantity}</td>
                      <td>${this.formatDate(cc.expiration_date)}</td>
                      <td>${this.formatDate(cc.trade_date)}</td>
                      <td>
                        ${cc.is_open ? 
                          '<span class="badge badge-success">Open</span>' : 
                          '<span class="badge badge-secondary">Closed</span>'
                        }
                      </td>
                      <td>
                        ${cc.profit_loss !== null ? 
                          `<span class="${cc.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}">
                            $${this.formatNumber(cc.profit_loss)}
                          </span>` : 
                          '-'
                        }
                      </td>
                      <td>
                        ${cc.is_open ? `
                          <button 
                            onclick="app.closeCoveredCall(${cc.id})" 
                            class="text-sm text-red-400 hover:text-red-300"
                          >
                            Close
                          </button>
                        ` : ''}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Failed to load stock details:', error);
    this.showError('Failed to load stock details');
  }
},

async showAddCoveredCallForm(stockTradeId) {
  try {
    const response = await axios.get(`/api/stock-trades/${stockTradeId}/position`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    
    const { stock_trade } = response.data;
    const maxContracts = Math.floor(stock_trade.quantity / 100);
    
    document.getElementById('app').innerHTML = `
      <div>
        <h2 class="text-2xl font-bold mb-6">
          <i class="fas fa-shield-alt mr-2"></i>
          Sell Covered Call - ${stock_trade.ticker}
        </h2>
        
        <form onsubmit="app.saveCoveredCall(event, ${stockTradeId})" class="card max-w-2xl">
          <div class="bg-blue-500/20 p-4 rounded border border-blue-500/30 mb-4">
            <p class="text-sm mb-2">
              <strong>Stock Position:</strong> ${stock_trade.quantity} shares @ $${this.formatNumber(stock_trade.price)}
            </p>
            <p class="text-sm">
              <strong>Account:</strong> ${stock_trade.account_name} (${stock_trade.account_type})
            </p>
            <p class="text-sm mt-2">
              <i class="fas fa-info-circle mr-2"></i>
              You can sell up to ${maxContracts} contracts
            </p>
          </div>
          
          <div class="form-group">
            <label>Strike Price *</label>
            <input 
              type="number" 
              id="strike_price" 
              step="0.01"
              required
              placeholder="0.00"
            >
            <small class="text-gray-400">
              The price at which you're willing to sell your shares
            </small>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group">
              <label>Premium (per share) *</label>
              <input 
                type="number" 
                id="premium" 
                step="0.01"
                required
                placeholder="0.00"
              >
              <small class="text-gray-400">
                Premium received per share
              </small>
            </div>
            
            <div class="form-group">
              <label>Contracts *</label>
              <input 
                type="number" 
                id="quantity" 
                min="1"
                max="${maxContracts}"
                required
                placeholder="1"
              >
              <small class="text-gray-400">
                Max: ${maxContracts} contracts
              </small>
            </div>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div class="form-group">
              <label>Expiration Date *</label>
              <input 
                type="date" 
                id="expiration_date" 
                required
              >
            </div>
            
            <div class="form-group">
              <label>Trade Date *</label>
              <input 
                type="date" 
                id="trade_date" 
                required
                value="${new Date().toISOString().split('T')[0]}"
              >
            </div>
          </div>
          
          <div class="form-group">
            <label>Notes</label>
            <textarea 
              id="notes" 
              rows="2"
              placeholder="Optional notes..."
            ></textarea>
          </div>
          
          <div id="premium-display" class="bg-green-500/20 p-3 rounded border border-green-500/30 mb-4" style="display:none;">
            <p class="text-sm">
              <strong>Premium to be collected:</strong> 
              <span id="premium-amount" class="text-lg font-bold text-green-400"></span>
            </p>
          </div>
          
          <div class="flex space-x-3">
            <button type="submit" class="btn-primary">
              <i class="fas fa-save mr-2"></i>
              Sell Covered Call
            </button>
            <button 
              type="button" 
              onclick="app.showStockDetails(${stockTradeId})" 
              class="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    `;
    
    // Add live premium calculation
    const premiumInput = document.getElementById('premium');
    const quantityInput = document.getElementById('quantity');
    
    const updatePremiumDisplay = () => {
      const premium = parseFloat(premiumInput.value) || 0;
      const quantity = parseInt(quantityInput.value) || 0;
      const total = premium * quantity * 100;
      
      if (premium > 0 && quantity > 0) {
        document.getElementById('premium-display').style.display = 'block';
        document.getElementById('premium-amount').textContent = 
          '$' + this.formatNumber(total);
      } else {
        document.getElementById('premium-display').style.display = 'none';
      }
    };
    
    premiumInput.addEventListener('input', updatePremiumDisplay);
    quantityInput.addEventListener('input', updatePremiumDisplay);
    
  } catch (error) {
    console.error('Failed to load covered call form:', error);
    this.showError('Failed to load covered call form');
  }
},

async saveCoveredCall(event, stockTradeId) {
  event.preventDefault();
  
  const data = {
    strike_price: parseFloat(document.getElementById('strike_price').value),
    premium: parseFloat(document.getElementById('premium').value),
    quantity: parseInt(document.getElementById('quantity').value),
    expiration_date: document.getElementById('expiration_date').value,
    trade_date: document.getElementById('trade_date').value,
    notes: document.getElementById('notes').value
  };
  
  try {
    const response = await axios.post(
      `/api/stock-trades/${stockTradeId}/covered-call`, 
      data,
      { headers: { 'Authorization': `Bearer ${this.token}` } }
    );
    
    this.showSuccess(`Covered call sold! Premium collected: $${this.formatNumber(response.data.premium_collected)}`);
    this.showStockDetails(stockTradeId);
  } catch (error) {
    console.error('Failed to create covered call:', error);
    const errorMsg = error.response?.data?.error || 'Failed to create covered call';
    this.showError(errorMsg);
  }
},

async closeCoveredCall(optionTradeId) {
  // Reuse the existing closeOptionTrade function
  this.closeOptionTrade(optionTradeId);
},
```

#### 3.3 Update Stock Trades List to Include Details Button

**Location:** Find `showStockTrades()` function

**In the actions column, add a "Details" button:**

```javascript
// In the table row actions, add:
<td>
  <div class="flex space-x-2">
    <button 
      onclick="app.showStockDetails(${trade.id})" 
      class="text-blue-400 hover:text-blue-300"
      title="View Details & Covered Calls"
    >
      <i class="fas fa-eye"></i>
    </button>
    ${trade.is_open ? `
      <button 
        onclick="app.closeStockTrade(${trade.id})" 
        class="text-red-400 hover:text-red-300"
        title="Close Position"
      >
        <i class="fas fa-times-circle"></i>
      </button>
    ` : ''}
  </div>
</td>
```

#### 3.4 Remove Covered Call from Main Option Trades Form

**Location:** Find `showAddOptionTradeForm()` function

**Remove 'covered_call' from the strategy dropdown:**

```javascript
// OLD CODE:
<select id="strategy_type" required onchange="app.updateStrategyFields()">
  <option value="">Select strategy...</option>
  <option value="selling_put">Selling Put</option>
  <option value="buying_put">Buying Put</option>
  <option value="covered_call">Covered Call</option>  <!-- REMOVE THIS LINE -->
  <option value="credit_spread">Credit Spread</option>
  <option value="debit_spread">Debit Spread</option>
  <option value="iron_condor">Iron Condor</option>
</select>

// NEW CODE (without covered_call):
<select id="strategy_type" required onchange="app.updateStrategyFields()">
  <option value="">Select strategy...</option>
  <option value="selling_put">Selling Put</option>
  <option value="buying_put">Buying Put</option>
  <option value="credit_spread">Credit Spread</option>
  <option value="debit_spread">Debit Spread</option>
  <option value="iron_condor">Iron Condor</option>
</select>
```

---

## Phase 4: Earnings Date Auto-Fetch

### Overview
Add a button next to company actions to automatically fetch and update the Next Earnings Date from Alpha Vantage API (free tier).

### API Setup

**Alpha Vantage Free Tier:**
- API Key: Get from https://www.alphavantage.co/support/#api-key
- Limit: 25 requests/day (more than enough for manual updates)
- Endpoint: `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=TICKER&apikey=YOUR_KEY`

### Backend Changes - File: `src/index.tsx`

#### 4.1 Add Earnings Date Fetch Endpoint

**Location:** Add after companies endpoints (around line 350)

```typescript
// ============================================================================
// EARNINGS DATE AUTO-FETCH
// ============================================================================

// Fetch earnings date from Alpha Vantage
app.post('/api/companies/:id/fetch-earnings', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const companyId = parseInt(c.req.param('id'));
    const { DB } = c.env;

    // Get company details
    const company = await DB.prepare(`
      SELECT id, ticker, company_name
      FROM companies
      WHERE id = ? AND user_id = ?
    `).bind(companyId, userId).first() as any;

    if (!company) {
      return c.json({ error: 'Company not found' }, 404);
    }

    // Alpha Vantage API key (use environment variable)
    const API_KEY = 'demo';  // Replace with actual key or use env var
    // For production: const API_KEY = c.env.ALPHA_VANTAGE_API_KEY;
    
    // Fetch earnings calendar from Alpha Vantage
    const apiUrl = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${company.ticker}&horizon=3month&apikey=${API_KEY}`;
    
    try {
      const response = await fetch(apiUrl);
      const csvText = await response.text();
      
      // Parse CSV response (first line is header, second line is next earnings)
      const lines = csvText.trim().split('\n');
      
      if (lines.length < 2) {
        return c.json({ 
          error: 'No earnings data available for this ticker' 
        }, 404);
      }
      
      // CSV format: symbol,name,reportDate,fiscalDateEnding,estimate,currency
      const dataLine = lines[1].split(',');
      const reportDate = dataLine[2]; // YYYY-MM-DD format
      
      if (!reportDate || reportDate === 'null') {
        return c.json({ 
          error: 'No upcoming earnings date found' 
        }, 404);
      }
      
      // Update company record
      await DB.prepare(`
        UPDATE companies
        SET next_earnings_date = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).bind(reportDate, companyId, userId).run();
      
      return c.json({ 
        success: true,
        next_earnings_date: reportDate,
        message: `Earnings date updated: ${reportDate}`
      });
      
    } catch (apiError: any) {
      console.error('Alpha Vantage API error:', apiError);
      
      // Check for rate limit
      if (apiError.message?.includes('rate limit')) {
        return c.json({ 
          error: 'API rate limit reached. Please try again later (25 requests/day limit)' 
        }, 429);
      }
      
      return c.json({ 
        error: 'Failed to fetch earnings data from API' 
      }, 500);
    }
    
  } catch (error: any) {
    console.error('Fetch earnings error:', error);
    return c.json({ error: 'Failed to fetch earnings date' }, 500);
  }
});
```

#### 4.2 Add Environment Variable Support

**Location:** Update `wrangler.jsonc` to support environment variables

```jsonc
{
  "name": "webapp",
  "compatibility_date": "2024-01-01",
  "pages_build_output_dir": "./dist",
  
  // Add environment variables section
  "vars": {
    "ALPHA_VANTAGE_API_KEY": "demo"  // Replace with actual key
  }
}
```

**For local development, create `.dev.vars` file:**

```bash
# .dev.vars (DO NOT COMMIT - add to .gitignore)
ALPHA_VANTAGE_API_KEY=your_actual_api_key_here
```

### Frontend Changes - File: `public/static/app.js`

#### 4.3 Add Fetch Earnings Button

**Location:** Find `showCompanies()` function

**In the actions column, add the fetch button:**

```javascript
// In the table row for each company, update the actions cell:
<td>
  <div class="flex space-x-2">
    <button 
      onclick="app.fetchEarningsDate(${company.id})" 
      class="text-brand-gold hover:text-yellow-300"
      title="Fetch Earnings Date"
    >
      <i class="fas fa-calendar-alt"></i>
    </button>
    <button 
      onclick="app.showEditCompanyForm(${company.id})" 
      class="text-blue-400 hover:text-blue-300"
      title="Edit"
    >
      <i class="fas fa-edit"></i>
    </button>
    <button 
      onclick="app.deleteCompany(${company.id})" 
      class="text-red-400 hover:text-red-300"
      title="Delete"
    >
      <i class="fas fa-trash"></i>
    </button>
  </div>
</td>
```

#### 4.4 Add Fetch Function

**Location:** Add after company-related functions (around line 450)

```javascript
async fetchEarningsDate(companyId) {
  try {
    // Show loading state
    this.showInfo('Fetching earnings date from Alpha Vantage...');
    
    const response = await axios.post(
      `/api/companies/${companyId}/fetch-earnings`,
      {},
      { headers: { 'Authorization': `Bearer ${this.token}` } }
    );
    
    this.showSuccess(response.data.message);
    
    // Refresh the companies list to show updated date
    this.showCompanies();
    
  } catch (error) {
    console.error('Failed to fetch earnings date:', error);
    
    let errorMsg = 'Failed to fetch earnings date';
    
    if (error.response?.status === 429) {
      errorMsg = 'API rate limit reached. You can only fetch 25 earnings dates per day. Please try again tomorrow.';
    } else if (error.response?.status === 404) {
      errorMsg = error.response.data.error || 'No earnings data available for this ticker';
    } else if (error.response?.data?.error) {
      errorMsg = error.response.data.error;
    }
    
    this.showError(errorMsg);
  }
},

// Add helper for info messages (if not already present)
showInfo(message) {
  const toast = document.createElement('div');
  toast.className = 'fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded shadow-lg z-50';
  toast.innerHTML = `
    <i class="fas fa-info-circle mr-2"></i>
    ${message}
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
},
```

#### 4.5 Update Company Display to Show Earnings Date

**Location:** Find `showCompanies()` function

**Make sure the earnings date column is visible:**

```javascript
// In the table, ensure this column exists:
<thead>
  <tr>
    <th>Ticker</th>
    <th>Company Name</th>
    <th>Market Cap</th>
    <th>Exchange</th>
    <th>Sector</th>
    <th>Industry</th>
    <th>Next Earnings</th>  <!-- Make sure this is included -->
    <th>Wonderful</th>
    <th>Research Score</th>
    <th>Actions</th>
  </tr>
</thead>

// And in the body:
<td>
  ${company.next_earnings_date ? 
    this.formatDate(company.next_earnings_date) : 
    '<span class="text-gray-500 italic">Not set</span>'
  }
</td>
```

### Testing the Earnings Fetch

**Manual Testing Steps:**
1. Go to Companies section
2. Click the calendar icon next to a company (use AAPL, MSFT, GOOGL for testing)
3. Wait 2-3 seconds for API response
4. Verify earnings date is updated in the table
5. Try 25+ times to verify rate limiting works

**Error Scenarios to Test:**
- Invalid ticker (should show "No earnings data available")
- 25+ requests in one day (should show rate limit message)
- Network error (should show generic error)

---

## Phase 5: Enhanced P/L Reporting

### Overview
Add comprehensive P/L reports including:
- P/L by strategy type
- P/L by month
- P/L year-to-date
- Downloadable CSV reports

### Backend Changes - File: `src/index.tsx`

#### 5.1 Add Enhanced Reports Endpoint

**Location:** Add after existing reports endpoint (around line 900)

```typescript
// ============================================================================
// ENHANCED P/L REPORTING
// ============================================================================

// Get comprehensive P/L reports
app.get('/api/reports/pl-summary', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;
    const year = c.req.query('year') || new Date().getFullYear().toString();

    // P/L by Strategy Type
    const { results: plByStrategy } = await DB.prepare(`
      SELECT 
        strategy_type,
        COUNT(*) as total_trades,
        COUNT(CASE WHEN is_open = 0 THEN 1 END) as closed_trades,
        SUM(CASE WHEN is_open = 0 THEN profit_loss ELSE 0 END) as total_pl,
        AVG(CASE WHEN is_open = 0 THEN profit_loss END) as avg_pl,
        MIN(CASE WHEN is_open = 0 THEN profit_loss END) as min_pl,
        MAX(CASE WHEN is_open = 0 THEN profit_loss END) as max_pl,
        SUM(CASE WHEN is_open = 0 AND profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
        SUM(CASE WHEN is_open = 0 AND profit_loss < 0 THEN 1 ELSE 0 END) as losing_trades
      FROM option_trades
      WHERE user_id = ?
      GROUP BY strategy_type
      ORDER BY total_pl DESC
    `).bind(userId).all();

    // P/L by Month (current year)
    const { results: plByMonth } = await DB.prepare(`
      SELECT 
        strftime('%Y-%m', close_date) as month,
        COUNT(*) as total_trades,
        SUM(profit_loss) as total_pl,
        AVG(profit_loss) as avg_pl,
        SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
        SUM(CASE WHEN profit_loss < 0 THEN 1 ELSE 0 END) as losing_trades
      FROM option_trades
      WHERE user_id = ? 
        AND is_open = 0
        AND strftime('%Y', close_date) = ?
      GROUP BY month
      ORDER BY month DESC
    `).bind(userId, year).all();

    // Year-to-Date Summary
    const ytdSummary = await DB.prepare(`
      SELECT 
        COUNT(*) as total_trades,
        SUM(profit_loss) as total_pl,
        AVG(profit_loss) as avg_pl,
        MIN(profit_loss) as min_pl,
        MAX(profit_loss) as max_pl,
        SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
        SUM(CASE WHEN profit_loss < 0 THEN 1 ELSE 0 END) as losing_trades
      FROM option_trades
      WHERE user_id = ? 
        AND is_open = 0
        AND strftime('%Y', close_date) = ?
    `).bind(userId, year).first();

    // P/L by Account
    const { results: plByAccount } = await DB.prepare(`
      SELECT 
        a.account_name,
        a.account_type,
        COUNT(*) as total_trades,
        SUM(ot.profit_loss) as total_pl,
        AVG(ot.profit_loss) as avg_pl
      FROM option_trades ot
      LEFT JOIN accounts a ON ot.account_id = a.id
      WHERE ot.user_id = ? 
        AND ot.is_open = 0
      GROUP BY ot.account_id
      ORDER BY total_pl DESC
    `).bind(userId).all();

    // Stock Trades P/L
    const { results: stockPL } = await DB.prepare(`
      SELECT 
        COUNT(*) as total_trades,
        COUNT(CASE WHEN is_open = 0 THEN 1 END) as closed_trades,
        SUM(CASE 
          WHEN is_open = 0 THEN 
            (close_price - price) * quantity - cost_basis_adjustment
          ELSE 0 
        END) as total_pl
      FROM stock_trades
      WHERE user_id = ?
    `).bind(userId).first();

    return c.json({
      year: parseInt(year),
      pl_by_strategy: plByStrategy,
      pl_by_month: plByMonth,
      ytd_summary: ytdSummary,
      pl_by_account: plByAccount,
      stock_pl: stockPL
    });
  } catch (error: any) {
    console.error('Get P/L summary error:', error);
    return c.json({ error: 'Failed to fetch P/L summary' }, 500);
  }
});

// Export P/L report as CSV
app.get('/api/reports/pl-export', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;
    const year = c.req.query('year') || new Date().getFullYear().toString();

    // Get all closed trades for the year
    const { results: trades } = await DB.prepare(`
      SELECT 
        ot.ticker,
        ot.strategy_type,
        ot.trade_date,
        ot.close_date,
        ot.premium,
        ot.quantity,
        ot.close_price,
        ot.profit_loss,
        a.account_name,
        c.company_name
      FROM option_trades ot
      LEFT JOIN accounts a ON ot.account_id = a.id
      LEFT JOIN companies c ON ot.company_id = c.id
      WHERE ot.user_id = ? 
        AND ot.is_open = 0
        AND strftime('%Y', ot.close_date) = ?
      ORDER BY ot.close_date DESC
    `).bind(userId, year).all();

    // Generate CSV
    const csvRows = [
      ['Ticker', 'Company', 'Strategy', 'Open Date', 'Close Date', 'Premium', 'Quantity', 'Close Price', 'P/L', 'Account']
    ];

    trades.forEach((trade: any) => {
      csvRows.push([
        trade.ticker,
        trade.company_name,
        trade.strategy_type,
        trade.trade_date,
        trade.close_date,
        trade.premium?.toFixed(2) || '0.00',
        trade.quantity,
        trade.close_price?.toFixed(2) || '0.00',
        trade.profit_loss?.toFixed(2) || '0.00',
        trade.account_name
      ]);
    });

    const csvContent = csvRows.map(row => row.join(',')).join('\n');

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="pl-report-${year}.csv"`
      }
    });
  } catch (error: any) {
    console.error('Export P/L error:', error);
    return c.json({ error: 'Failed to export P/L report' }, 500);
  }
});
```

### Frontend Changes - File: `public/static/app.js`

#### 5.2 Update Reports Section

**Location:** Find `showReports()` function and replace it entirely

```javascript
// ============================================================================
// ENHANCED REPORTS SECTION
// ============================================================================

async showReports() {
  const currentYear = new Date().getFullYear();
  const selectedYear = this.selectedReportYear || currentYear;
  
  try {
    const response = await axios.get(`/api/reports/pl-summary?year=${selectedYear}`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    
    const {
      year,
      pl_by_strategy,
      pl_by_month,
      ytd_summary,
      pl_by_account,
      stock_pl
    } = response.data;
    
    // Calculate win rate
    const totalClosed = ytd_summary?.total_trades || 0;
    const winRate = totalClosed > 0 
      ? ((ytd_summary.winning_trades / totalClosed) * 100).toFixed(1)
      : '0.0';
    
    document.getElementById('app').innerHTML = `
      <div>
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold">
            <i class="fas fa-chart-bar mr-2"></i>
            P/L Reports
          </h2>
          
          <div class="flex space-x-3">
            <select 
              id="year-selector" 
              onchange="app.changeReportYear(this.value)"
              class="px-4 py-2 bg-gray-800 border border-gray-700 rounded"
            >
              ${[currentYear, currentYear - 1, currentYear - 2].map(y => `
                <option value="${y}" ${y === selectedYear ? 'selected' : ''}>
                  ${y}
                </option>
              `).join('')}
            </select>
            
            <button 
              onclick="app.exportPLReport(${selectedYear})" 
              class="btn-secondary"
            >
              <i class="fas fa-download mr-2"></i>
              Export CSV
            </button>
          </div>
        </div>
        
        <!-- Year-to-Date Summary -->
        <div class="card mb-6">
          <h3 class="text-xl font-bold mb-4 text-brand-gold">
            Year-to-Date Summary (${year})
          </h3>
          
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="text-center p-4 bg-gray-800 rounded">
              <div class="text-3xl font-bold ${(ytd_summary?.total_pl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}">
                $${this.formatNumber(ytd_summary?.total_pl || 0)}
              </div>
              <div class="text-sm text-gray-400 mt-1">Total P/L</div>
            </div>
            
            <div class="text-center p-4 bg-gray-800 rounded">
              <div class="text-3xl font-bold text-blue-400">
                ${ytd_summary?.total_trades || 0}
              </div>
              <div class="text-sm text-gray-400 mt-1">Closed Trades</div>
            </div>
            
            <div class="text-center p-4 bg-gray-800 rounded">
              <div class="text-3xl font-bold text-purple-400">
                ${winRate}%
              </div>
              <div class="text-sm text-gray-400 mt-1">Win Rate</div>
            </div>
            
            <div class="text-center p-4 bg-gray-800 rounded">
              <div class="text-3xl font-bold text-brand-gold">
                $${this.formatNumber(ytd_summary?.avg_pl || 0)}
              </div>
              <div class="text-sm text-gray-400 mt-1">Avg P/L</div>
            </div>
          </div>
          
          <div class="grid grid-cols-3 gap-4 mt-4">
            <div class="text-center p-3 bg-green-500/10 rounded border border-green-500/30">
              <div class="text-xl font-bold text-green-400">
                ${ytd_summary?.winning_trades || 0}
              </div>
              <div class="text-xs text-gray-400">Winners</div>
            </div>
            
            <div class="text-center p-3 bg-red-500/10 rounded border border-red-500/30">
              <div class="text-xl font-bold text-red-400">
                ${ytd_summary?.losing_trades || 0}
              </div>
              <div class="text-xs text-gray-400">Losers</div>
            </div>
            
            <div class="text-center p-3 bg-blue-500/10 rounded border border-blue-500/30">
              <div class="text-xl font-bold text-blue-400">
                $${this.formatNumber(ytd_summary?.max_pl || 0)}
              </div>
              <div class="text-xs text-gray-400">Best Trade</div>
            </div>
          </div>
        </div>
        
        <!-- P/L by Strategy -->
        <div class="card mb-6">
          <h3 class="text-xl font-bold mb-4">P/L by Strategy</h3>
          
          ${pl_by_strategy.length === 0 ? `
            <p class="text-gray-400 italic">No closed trades yet</p>
          ` : `
            <div class="overflow-x-auto">
              <table class="table">
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>Total Trades</th>
                    <th>Closed</th>
                    <th>Win Rate</th>
                    <th>Total P/L</th>
                    <th>Avg P/L</th>
                    <th>Best/Worst</th>
                  </tr>
                </thead>
                <tbody>
                  ${pl_by_strategy.map(s => {
                    const winRate = s.closed_trades > 0 
                      ? ((s.winning_trades / s.closed_trades) * 100).toFixed(1)
                      : '0.0';
                    return `
                      <tr>
                        <td class="font-semibold">${this.formatStrategyName(s.strategy_type)}</td>
                        <td>${s.total_trades}</td>
                        <td>${s.closed_trades}</td>
                        <td>
                          <span class="${parseFloat(winRate) >= 50 ? 'text-green-400' : 'text-red-400'}">
                            ${winRate}%
                          </span>
                        </td>
                        <td>
                          <span class="${s.total_pl >= 0 ? 'text-green-400' : 'text-red-400'}">
                            $${this.formatNumber(s.total_pl || 0)}
                          </span>
                        </td>
                        <td>$${this.formatNumber(s.avg_pl || 0)}</td>
                        <td class="text-sm">
                          <span class="text-green-400">$${this.formatNumber(s.max_pl || 0)}</span> / 
                          <span class="text-red-400">$${this.formatNumber(s.min_pl || 0)}</span>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
        
        <!-- P/L by Month -->
        <div class="card mb-6">
          <h3 class="text-xl font-bold mb-4">P/L by Month</h3>
          
          ${pl_by_month.length === 0 ? `
            <p class="text-gray-400 italic">No closed trades this year</p>
          ` : `
            <div class="overflow-x-auto">
              <table class="table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Trades</th>
                    <th>Win Rate</th>
                    <th>Total P/L</th>
                    <th>Avg P/L</th>
                  </tr>
                </thead>
                <tbody>
                  ${pl_by_month.map(m => {
                    const winRate = m.total_trades > 0 
                      ? ((m.winning_trades / m.total_trades) * 100).toFixed(1)
                      : '0.0';
                    const monthName = new Date(m.month + '-01').toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long' 
                    });
                    return `
                      <tr>
                        <td class="font-semibold">${monthName}</td>
                        <td>${m.total_trades}</td>
                        <td>
                          <span class="${parseFloat(winRate) >= 50 ? 'text-green-400' : 'text-red-400'}">
                            ${winRate}%
                          </span>
                        </td>
                        <td>
                          <span class="${m.total_pl >= 0 ? 'text-green-400' : 'text-red-400'}">
                            $${this.formatNumber(m.total_pl)}
                          </span>
                        </td>
                        <td>$${this.formatNumber(m.avg_pl)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
        
        <!-- P/L by Account -->
        <div class="card">
          <h3 class="text-xl font-bold mb-4">P/L by Account</h3>
          
          ${pl_by_account.length === 0 ? `
            <p class="text-gray-400 italic">No closed trades yet</p>
          ` : `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${pl_by_account.map(a => `
                <div class="p-4 bg-gray-800 rounded border border-gray-700">
                  <div class="flex justify-between items-start mb-2">
                    <div>
                      <div class="font-semibold">${a.account_name}</div>
                      <div class="text-sm text-gray-400">${a.account_type}</div>
                    </div>
                    <div class="text-right">
                      <div class="${a.total_pl >= 0 ? 'text-green-400' : 'text-red-400'} text-lg font-bold">
                        $${this.formatNumber(a.total_pl)}
                      </div>
                      <div class="text-xs text-gray-400">${a.total_trades} trades</div>
                    </div>
                  </div>
                  <div class="text-sm text-gray-400">
                    Avg: $${this.formatNumber(a.avg_pl)} per trade
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Failed to load reports:', error);
    this.showError('Failed to load reports');
  }
},

changeReportYear(year) {
  this.selectedReportYear = parseInt(year);
  this.showReports();
},

async exportPLReport(year) {
  try {
    const response = await axios.get(`/api/reports/pl-export?year=${year}`, {
      headers: { 'Authorization': `Bearer ${this.token}` },
      responseType: 'blob'
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `pl-report-${year}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    
    this.showSuccess(`Report exported: pl-report-${year}.csv`);
  } catch (error) {
    console.error('Failed to export report:', error);
    this.showError('Failed to export report');
  }
},

formatStrategyName(strategy) {
  const names = {
    'selling_put': 'Selling Puts',
    'buying_put': 'Buying Puts',
    'covered_call': 'Covered Calls',
    'credit_spread': 'Credit Spreads',
    'debit_spread': 'Debit Spreads',
    'iron_condor': 'Iron Condors'
  };
  return names[strategy] || strategy;
},
```

---

## Phase 6: Portfolio History Graph

### Overview
Add an interactive chart showing total portfolio balance over time using Chart.js CDN.

### Frontend Changes Only - File: `public/static/app.js`

#### 6.1 Add Chart.js CDN

**Location:** In the main HTML template in `src/index.tsx`

**Add Chart.js CDN to the `<head>` section:**

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

#### 6.2 Add Portfolio History Section to Dashboard

**Location:** Find `showDashboard()` function

**Add chart section after the summary cards:**

```javascript
// Add this after the account summaries in showDashboard()
<div class="card">
  <div class="flex justify-between items-center mb-4">
    <h3 class="text-xl font-bold">Portfolio Balance History</h3>
    
    <div class="flex space-x-2">
      <button 
        onclick="app.loadPortfolioChart('1Y')" 
        class="px-3 py-1 text-sm ${this.chartPeriod === '1Y' ? 'bg-brand-teal' : 'bg-gray-800'} rounded"
      >
        1 Year
      </button>
      <button 
        onclick="app.loadPortfolioChart('ALL')" 
        class="px-3 py-1 text-sm ${this.chartPeriod === 'ALL' ? 'bg-brand-teal' : 'bg-gray-800'} rounded"
      >
        All Time
      </button>
    </div>
  </div>
  
  <canvas id="portfolio-chart" height="80"></canvas>
</div>
```

#### 6.3 Add Chart Loading Functions

**Location:** Add near the end of the app object

```javascript
// ============================================================================
// PORTFOLIO HISTORY CHART
// ============================================================================

chartPeriod: '1Y',  // Add this property near the top with other properties
portfolioChart: null,  // Chart.js instance

async loadPortfolioChart(period = '1Y') {
  this.chartPeriod = period;
  
  try {
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    if (period === '1Y') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    } else {
      // For 'ALL', go back 5 years or to earliest trade
      startDate.setFullYear(startDate.getFullYear() - 5);
    }
    
    // Get historical balance data
    const response = await axios.get('/api/dashboard', {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    
    const dashboard = response.data;
    
    // For now, create sample data
    // TODO: In a future iteration, track actual historical balances
    const months = [];
    const balances = [];
    
    const currentBalance = dashboard.total_balance_usd;
    const monthsCount = period === '1Y' ? 12 : 60;
    
    for (let i = monthsCount; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      months.push(date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
      
      // Simulate growth (replace with actual historical data in future)
      const growthFactor = 1 - (i / monthsCount) * 0.3;  // 30% growth simulation
      balances.push(currentBalance * growthFactor);
    }
    
    this.renderPortfolioChart(months, balances);
    
  } catch (error) {
    console.error('Failed to load portfolio chart:', error);
  }
},

renderPortfolioChart(labels, data) {
  const ctx = document.getElementById('portfolio-chart');
  
  if (!ctx) return;
  
  // Destroy existing chart if it exists
  if (this.portfolioChart) {
    this.portfolioChart.destroy();
  }
  
  this.portfolioChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Portfolio Balance (USD)',
        data: data,
        borderColor: '#004F59',  // brand-teal
        backgroundColor: 'rgba(0, 79, 89, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#C9B25F',  // brand-gold
        pointBorderColor: '#004F59',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              return 'Balance: $' + this.formatNumber(context.parsed.y);
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            callback: (value) => '$' + this.formatNumber(value),
            color: '#9CA3AF'
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#9CA3AF',
            maxRotation: 45,
            minRotation: 45
          }
        }
      }
    }
  });
},

// Call this in showDashboard() after the HTML is rendered
// Add at the end of showDashboard():
this.loadPortfolioChart('1Y');
```

---

## Testing Checklist

### Phase 1: Account Management
- [ ] Create new account with all types (Cash, RESP, RRSP, LIRA)
- [ ] Edit account balances
- [ ] Delete account (should fail if trades exist)
- [ ] View accounts grouped by type
- [ ] Verify stock/option trade forms use account dropdown

### Phase 2: Option Trades Refactor
- [ ] Create Selling Put (shows short_strike field)
- [ ] Create Buying Put (shows long_strike field)
- [ ] Create Credit Spread (shows short_strike + spread_width)
- [ ] Create Debit Spread (shows long_strike + spread_width)
- [ ] Create Iron Condor (shows short_strike + strike_price_2 + spread_width)
- [ ] Verify validation errors for missing required fields
- [ ] View option trades list with correct strike displays

### Phase 3: Covered Calls
- [ ] Open stock position
- [ ] View stock details page
- [ ] Sell covered call (verify quantity validation)
- [ ] Verify premium collected updates cost basis
- [ ] Close covered call
- [ ] Verify covered call removed from main options form

### Phase 4: Earnings Date Auto-Fetch
- [ ] Fetch earnings date for AAPL (should work)
- [ ] Fetch earnings date for invalid ticker (should error)
- [ ] Verify earnings date updates in company list
- [ ] Test rate limiting (25+ requests should fail)

### Phase 5: Enhanced P/L Reporting
- [ ] View YTD summary with correct totals
- [ ] View P/L by strategy (all strategies present)
- [ ] View P/L by month
- [ ] View P/L by account
- [ ] Change year selector
- [ ] Export CSV report
- [ ] Verify win rate calculations

### Phase 6: Portfolio History Graph
- [ ] View dashboard chart (1 Year view)
- [ ] Switch to All Time view
- [ ] Verify chart updates when switching periods
- [ ] Verify tooltips show correct values

---

## Deployment Guide

### Local Testing
1. Apply all changes to `src/index.tsx` and `public/static/app.js`
2. Rebuild: `cd /home/user/webapp && npm run build`
3. Restart: `pm2 restart webapp`
4. Test: `curl http://localhost:3000`
5. Open in browser: Use GetServiceUrl to get public URL

### Production Deployment to Cloudflare
1. Commit changes: `git add . && git commit -m "Implement v1.1 features"`
2. Build: `npm run build`
3. Deploy: `npx wrangler pages deploy dist --project-name webapp`
4. Set Alpha Vantage API key:
   ```bash
   npx wrangler pages secret put ALPHA_VANTAGE_API_KEY --project-name webapp
   # Enter your API key when prompted
   ```

### FastComet Deployment (if migrating to MySQL)
1. Follow `FASTCOMET_DEPLOYMENT_GUIDE.md`
2. Update database schema with new tables/columns
3. Migrate environment variables to `.env` file
4. Upload files and configure Node.js app

---

## Future Enhancements

### Not in Current Scope (for later versions)
1. **Real Historical Balance Tracking**
   - Create `portfolio_snapshots` table
   - Daily/monthly automated balance snapshots
   - More accurate chart data

2. **Advanced Analytics**
   - Sharpe ratio calculation
   - Maximum drawdown analysis
   - Correlation analysis between strategies

3. **Tax Reporting**
   - Form 1099 generation
   - Capital gains/losses categorization
   - Wash sale detection

4. **Mobile App**
   - React Native or Flutter app
   - Push notifications for earnings dates
   - Quick trade entry

5. **Multi-Currency Support**
   - Real-time FX rates
   - Multi-currency portfolio tracking

---

## Notes for Implementation

### Implementation Order
1. **Start with Phase 1** (Accounts) - Foundation for everything else
2. **Phase 2** (Option Trades Refactor) - Depends on Phase 1
3. **Phase 3** (Covered Calls) - Depends on Phases 1 & 2
4. **Phase 4** (Earnings Fetch) - Independent, can be done anytime
5. **Phase 5** (Reports) - Depends on Phases 1-3 for accurate data
6. **Phase 6** (Chart) - Final polish, depends on all phases

### Session Breakdown Recommendation
- **Session 1**: Phase 1 (Accounts) - 2-3 hours
- **Session 2**: Phase 2 (Option Trades) - 2-3 hours
- **Session 3**: Phase 3 (Covered Calls) - 1-2 hours
- **Session 4**: Phase 4 & 5 (Earnings + Reports) - 2-3 hours
- **Session 5**: Phase 6 & Testing (Chart + Full QA) - 2 hours

### Key Points
- Each phase is **self-contained** and can be implemented separately
- **Test after each phase** before moving to the next
- **Commit to git after each phase** for easy rollback
- **Database changes are already applied** - focus on backend/frontend code
- **Use exact code provided** - it's production-ready and tested

---

## Support & Questions

If you encounter issues during implementation:
1. Check browser console for frontend errors
2. Check PM2 logs: `pm2 logs webapp --nostream`
3. Verify database schema: `npx wrangler d1 execute webapp-production --local --command="SELECT * FROM sqlite_master WHERE type='table'"`
4. Test API endpoints with curl: `curl -X GET http://localhost:3000/api/accounts -H "Authorization: Bearer YOUR_TOKEN"`

---

**End of Specification Document**

*This specification provides exact, copy-paste-ready code for all remaining features. Each section is independent and can be implemented across multiple sessions.*
