import { describe, it, expect, beforeAll, afterAll } from 'vitest'

/**
 * API Regression Test Suite
 * 
 * IMPORTANT: These tests DO NOT make external API calls.
 * All endpoints tested use local database operations only.
 * 
 * Endpoints that make external API calls (NOT tested here):
 * - /api/exchange-rate (Bank of Canada, Exchange Rate API)
 * - /api/dividend-repository/fetch (Polygon.io, EODHD)
 * - /api/cron/dividend-repository/fetch/* (Cron endpoints)
 * 
 * We trust third-party services to function correctly and avoid
 * testing them to prevent:
 * - API rate limit consumption
 * - Test failures due to external service outages
 * - Slow test execution
 * - API key exposure in CI/CD environments
 */

const BASE_URL = 'http://localhost:3000'
let authToken = ''
let testUserId = null
let testCompanyId = null
let testAccountId = null
let testStockHoldingId = null
let testOptionTradeId = null

// Helper function to make API requests
async function apiRequest(method, path, body = null, token = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  }
  
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`
  }
  
  if (body) {
    options.body = JSON.stringify(body)
  }
  
  const response = await fetch(`${BASE_URL}${path}`, options)
  const data = await response.json()
  
  return { response, data }
}

describe('API Regression Tests', () => {
  // ============================================================================
  // SETUP & AUTHENTICATION
  // ============================================================================
  
  describe('Authentication', () => {
    it('should register a new user', async () => {
      const { response, data } = await apiRequest('POST', '/api/auth/register', {
        email: `test-${Date.now()}@example.com`,
        password: 'test123456',
        name: 'Test User'
      })
      
      expect(response.status).toBe(200)
      expect(data).toHaveProperty('token')
      expect(data).toHaveProperty('user')
      
      authToken = data.token
      testUserId = data.user.id
    })
    
    it('should login with valid credentials', async () => {
      const { response, data } = await apiRequest('POST', '/api/auth/login', {
        email: `test-${testUserId}@example.com`,
        password: 'test123456'
      })
      
      expect(response.status).toBe(200)
      expect(data).toHaveProperty('token')
    })
    
    it('should reject invalid credentials', async () => {
      const { response } = await apiRequest('POST', '/api/auth/login', {
        email: 'invalid@example.com',
        password: 'wrongpassword'
      })
      
      expect(response.status).toBe(401)
    })
  })
  
  // ============================================================================
  // COMPANY MANAGEMENT
  // ============================================================================
  
  describe('Companies', () => {
    it('should create a company', async () => {
      const { response, data } = await apiRequest('POST', '/api/companies', {
        ticker: 'TEST',
        company_name: 'Test Company Inc',
        market_cap: 1000000000,
        exchange: 'NYSE',
        sector: 'Technology',
        industry: 'Software'
      }, authToken)
      
      expect(response.status).toBe(201)
      expect(data).toHaveProperty('id')
      expect(data.ticker).toBe('TEST')
      
      testCompanyId = data.id
    })
    
    it('should get all companies', async () => {
      const { response, data } = await apiRequest('GET', '/api/companies', null, authToken)
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
    })
    
    it('should update a company', async () => {
      const { response, data } = await apiRequest('PUT', `/api/companies/${testCompanyId}`, {
        ticker: 'TEST',
        company_name: 'Test Company Updated',
        market_cap: 2000000000
      }, authToken)
      
      expect(response.status).toBe(200)
      expect(data.company_name).toBe('Test Company Updated')
    })
  })
  
  // ============================================================================
  // ACCOUNT MANAGEMENT
  // ============================================================================
  
  describe('Accounts', () => {
    it('should create an account', async () => {
      const { response, data } = await apiRequest('POST', '/api/accounts/create', {
        account_name: 'Test TFSA Account',
        account_type: 'TFSA'
      }, authToken)
      
      expect(response.status).toBe(201)
      expect(data).toHaveProperty('id')
      expect(data.account_type).toBe('TFSA')
      
      testAccountId = data.id
    })
    
    it('should get all accounts', async () => {
      const { response, data } = await apiRequest('GET', '/api/accounts', null, authToken)
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
    })
  })
  
  // ============================================================================
  // STOCK TRADES & HOLDINGS
  // ============================================================================
  
  describe('Stock Holdings', () => {
    it('should create a stock holding with transaction', async () => {
      const { response, data } = await apiRequest('POST', '/api/stocks', {
        company_id: testCompanyId,
        ticker: 'TEST',
        account_id: testAccountId,
        trade_type: 'BUY',
        quantity: 100,
        price: 50.00,
        trade_date: '2026-06-18',
        commission: 0,
        notes: 'Initial purchase',
        strategy_type: 'STOCKPILING'
      }, authToken)
      
      expect(response.status).toBe(201)
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('transaction_id')
      
      testStockHoldingId = data.id
    })
    
    it('should add to existing position', async () => {
      const { response, data } = await apiRequest('POST', '/api/stocks', {
        company_id: testCompanyId,
        ticker: 'TEST',
        account_id: testAccountId,
        trade_type: 'BUY',
        quantity: 50,
        price: 55.00,
        trade_date: '2026-06-19',
        commission: 0,
        strategy_type: 'STOCKPILING'
      }, authToken)
      
      expect(response.status).toBe(201)
      expect(data).toHaveProperty('transaction_id')
    })
    
    it('should get stock holdings', async () => {
      const { response, data } = await apiRequest('GET', '/api/stocks?open=true', null, authToken)
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
    })
    
    it('should get purchase history for a holding', async () => {
      const { response, data } = await apiRequest('GET', `/api/stocks/${testStockHoldingId}/purchase-history`, null, authToken)
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBe(2) // Two BUY transactions
      expect(data[0]).toHaveProperty('trade_type')
      expect(data[0]).toHaveProperty('quantity')
      expect(data[0]).toHaveProperty('price')
      expect(data[0]).toHaveProperty('trade_date')
    })
    
    it('should verify stock_transactions table is populated', async () => {
      // This implicitly tests that the dual-table architecture is working
      const { response, data } = await apiRequest('GET', `/api/stocks/${testStockHoldingId}/purchase-history`, null, authToken)
      
      expect(data.length).toBeGreaterThan(0)
      // Verify transaction data matches what we inserted
      const firstTx = data.find(tx => tx.quantity === 100)
      expect(firstTx).toBeDefined()
      expect(firstTx.price).toBe(50)
    })
    
    it('should sell partial position', async () => {
      const { response, data } = await apiRequest('POST', '/api/stocks', {
        company_id: testCompanyId,
        ticker: 'TEST',
        account_id: testAccountId,
        trade_type: 'SELL',
        quantity: 50,
        price: 60.00,
        trade_date: '2026-06-20',
        commission: 0
      }, authToken)
      
      expect(response.status).toBe(201)
    })
    
    it('should verify SELL transaction in history', async () => {
      const { response, data } = await apiRequest('GET', `/api/stocks/${testStockHoldingId}/purchase-history`, null, authToken)
      
      expect(data.length).toBe(3) // Two BUYs + One SELL
      const sellTx = data.find(tx => tx.trade_type === 'SELL')
      expect(sellTx).toBeDefined()
      expect(sellTx.quantity).toBe(50)
    })
  })
  
  // ============================================================================
  // WHEEL STRATEGY & OPTION ASSIGNMENTS
  // ============================================================================
  
  describe('Wheel Strategy - Option Assignments', () => {
    let wheelOptionId = null
    let wheelHoldingId = null
    
    it('should create a Selling Put (Wheel) option trade', async () => {
      const { response, data } = await apiRequest('POST', '/api/options', {
        company_id: testCompanyId,
        ticker: 'TEST',
        account_id: testAccountId,
        strategy_type: 'SELLING_PUT_WHEEL',
        strike_price: 45.00,
        premium: 2.00,
        quantity: 2, // 2 contracts = 200 shares
        expiration_date: '2026-07-18',
        trade_date: '2026-06-18',
        commission: 1.00,
        notes: 'Wheel strategy entry'
      }, authToken)
      
      expect(response.status).toBe(201)
      expect(data).toHaveProperty('id')
      expect(data.strategy_type).toBe('SELLING_PUT_WHEEL')
      
      wheelOptionId = data.id
    })
    
    it('should assign stock position from Wheel put option', async () => {
      const { response, data } = await apiRequest('POST', `/api/options/${wheelOptionId}/assign`, {
        assignment_date: '2026-07-18',
        notes: 'Assigned at expiration'
      }, authToken)
      
      expect(response.status).toBe(200)
      expect(data).toHaveProperty('success')
      expect(data.success).toBe(true)
      expect(data).toHaveProperty('shares')
      expect(data.shares).toBe(200) // 2 contracts * 100
      expect(data).toHaveProperty('price')
      expect(data.price).toBe(45.00)
      expect(data).toHaveProperty('strategy_type')
      expect(data.strategy_type).toBe('WHEEL')
      
      wheelHoldingId = data.holding_id
    })
    
    it('should verify option is closed after assignment', async () => {
      const { response, data } = await apiRequest('GET', `/api/options?closed=true`, null, authToken)
      
      const assignedOption = data.find(opt => opt.id === wheelOptionId)
      expect(assignedOption).toBeDefined()
      expect(assignedOption.is_open).toBe(0)
      expect(assignedOption.close_price).toBe(0) // Max loss on assignment
    })
    
    it('should verify stock holding was created with WHEEL strategy', async () => {
      const { response, data } = await apiRequest('GET', '/api/stocks?open=true', null, authToken)
      
      const wheelHolding = data.find(h => h.id === wheelHoldingId)
      expect(wheelHolding).toBeDefined()
      expect(wheelHolding.strategy_type).toBe('WHEEL')
      expect(wheelHolding.total_shares).toBe(200)
      expect(wheelHolding.average_price).toBe(45.00)
    })
    
    it('should verify stock transaction was created for assignment', async () => {
      const { response, data } = await apiRequest('GET', `/api/stocks/${wheelHoldingId}/purchase-history`, null, authToken)
      
      expect(data.length).toBe(1)
      expect(data[0].trade_type).toBe('BUY')
      expect(data[0].quantity).toBe(200)
      expect(data[0].price).toBe(45.00)
    })
    
    it('should verify cost basis adjustment for assignment premium', async () => {
      const { response, data } = await apiRequest('GET', `/api/stocks/${wheelHoldingId}/cost-basis-adjustments`, null, authToken)
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      
      const premiumAdjustment = data.find(adj => adj.adjustment_type === 'SELLING_PUT')
      expect(premiumAdjustment).toBeDefined()
      // Premium: $2.00 * 2 contracts * 100 shares = $400.00
      // Less commission: $400 - $1 = $399.00
      expect(premiumAdjustment.amount).toBeCloseTo(399.00, 2)
    })
    
    it('should verify cost basis is reduced by assignment premium', async () => {
      const { response, data } = await apiRequest('GET', '/api/stocks?open=true', null, authToken)
      
      const wheelHolding = data.find(h => h.id === wheelHoldingId)
      
      // Cost basis should be: average_price - (total_adjustments / shares)
      // $45.00 - ($399.00 / 200) = $45.00 - $1.995 = $43.005
      expect(wheelHolding.cost_basis).toBeLessThan(wheelHolding.average_price)
      expect(wheelHolding.cost_basis).toBeCloseTo(43.005, 2)
    })
  })
  
  describe('Stockpiling Strategy - Option Assignments', () => {
    let stockpilingOptionId = null
    let stockpilingHoldingId = null
    
    it('should create a Selling Put (Stockpiling) option trade', async () => {
      const { response, data } = await apiRequest('POST', '/api/options', {
        company_id: testCompanyId,
        ticker: 'TEST',
        account_id: testAccountId,
        strategy_type: 'SELLING_PUT',
        strike_price: 48.00,
        premium: 1.50,
        quantity: 1,
        expiration_date: '2026-08-21',
        trade_date: '2026-06-18',
        commission: 0.50
      }, authToken)
      
      expect(response.status).toBe(201)
      stockpilingOptionId = data.id
    })
    
    it('should assign stock position from Stockpiling put option', async () => {
      const { response, data } = await apiRequest('POST', `/api/options/${stockpilingOptionId}/assign`, {
        assignment_date: '2026-08-21',
        notes: 'Stockpiling assignment'
      }, authToken)
      
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.strategy_type).toBe('STOCKPILING')
      
      stockpilingHoldingId = data.holding_id
    })
    
    it('should verify STOCKPILING strategy type', async () => {
      const { response, data } = await apiRequest('GET', '/api/stocks?open=true', null, authToken)
      
      const holding = data.find(h => h.id === stockpilingHoldingId)
      expect(holding).toBeDefined()
      expect(holding.strategy_type).toBe('STOCKPILING')
    })
  })
  
  // ============================================================================
  // COVERED CALLS
  // ============================================================================
  
  describe('Covered Calls', () => {
    let coveredCallId = null
    
    it('should create a covered call on existing holding', async () => {
      const { response, data } = await apiRequest('POST', '/api/options', {
        company_id: testCompanyId,
        ticker: 'TEST',
        account_id: testAccountId,
        strategy_type: 'COVERED_CALL',
        strike_price: 65.00,
        premium: 3.00,
        quantity: 1, // 100 shares
        expiration_date: '2026-07-18',
        trade_date: '2026-06-18',
        commission: 0.50
      }, authToken)
      
      expect(response.status).toBe(201)
      expect(data.strategy_type).toBe('COVERED_CALL')
      
      coveredCallId = data.id
    })
    
    it('should NOT create cost basis adjustment when opening covered call', async () => {
      const { response, data } = await apiRequest('GET', `/api/stocks/${testStockHoldingId}/cost-basis-adjustments`, null, authToken)
      
      // Should NOT have COVERED_CALL adjustment yet
      const ccAdjustment = data.find(adj => adj.adjustment_type === 'COVERED_CALL')
      expect(ccAdjustment).toBeUndefined()
    })
    
    it('should close covered call with profit', async () => {
      const { response, data } = await apiRequest('PUT', `/api/options/${coveredCallId}/close`, {
        close_date: '2026-06-25',
        close_price: 1.50, // Bought back for $1.50
        commission: 0.50
      }, authToken)
      
      expect(response.status).toBe(200)
      expect(data).toHaveProperty('profit_loss')
      // P/L = ($3.00 - $1.50) * 100 - $0.50 - $0.50 = $149.00
      expect(data.profit_loss).toBeCloseTo(149.00, 2)
    })
    
    it('should create cost basis adjustment AFTER closing covered call', async () => {
      const { response, data } = await apiRequest('GET', `/api/stocks/${testStockHoldingId}/cost-basis-adjustments`, null, authToken)
      
      const ccAdjustment = data.find(adj => adj.adjustment_type === 'COVERED_CALL')
      expect(ccAdjustment).toBeDefined()
      expect(ccAdjustment.amount).toBeCloseTo(149.00, 2)
      expect(ccAdjustment.notes).toContain('closed')
    })
    
    it('should get covered calls for a holding', async () => {
      const { response, data } = await apiRequest('GET', `/api/stocks/${testStockHoldingId}/covered-calls`, null, authToken)
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
    })
  })
  
  // ============================================================================
  // DIVIDENDS
  // ============================================================================
  
  describe('Dividends', () => {
    it('should record a dividend payment', async () => {
      const { response, data } = await apiRequest('POST', `/api/stocks/${testStockHoldingId}/dividends`, {
        amount: 75.00, // $0.50 per share * 150 shares
        payment_date: '2026-06-30',
        notes: 'Q2 2026 dividend',
        ex_date: '2026-06-15'
      }, authToken)
      
      expect(response.status).toBe(201)
      expect(data).toHaveProperty('id')
    })
    
    it('should get dividend history for a holding', async () => {
      const { response, data } = await apiRequest('GET', `/api/stocks/${testStockHoldingId}/dividends`, null, authToken)
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
      expect(data[0]).toHaveProperty('amount')
      expect(data[0].amount).toBe(75.00)
    })
    
    it('should get missing dividends (if any)', async () => {
      const { response, data } = await apiRequest('GET', `/api/stocks/${testStockHoldingId}/missing-dividends`, null, authToken)
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
    })
  })
  
  // ============================================================================
  // COST BASIS ADJUSTMENTS
  // ============================================================================
  
  describe('Cost Basis Adjustments', () => {
    it('should get all cost basis adjustments for a holding', async () => {
      const { response, data } = await apiRequest('GET', `/api/stocks/${testStockHoldingId}/cost-basis-adjustments`, null, authToken)
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data)).toBe(true)
      
      // Should have:
      // 1. DIVIDEND adjustment (from test above)
      // 2. COVERED_CALL adjustment (from closed CC)
      expect(data.length).toBeGreaterThanOrEqual(2)
      
      const types = data.map(adj => adj.adjustment_type)
      expect(types).toContain('DIVIDEND')
      expect(types).toContain('COVERED_CALL')
    })
    
    it('should verify cost basis reflects all adjustments', async () => {
      const { response, data } = await apiRequest('GET', '/api/stocks?open=true', null, authToken)
      
      const holding = data.find(h => h.id === testStockHoldingId)
      
      // Cost basis should be less than average price due to adjustments
      expect(holding.cost_basis).toBeLessThan(holding.avg_price)
      expect(holding.total_adjustments).toBeGreaterThan(0)
    })
  })
  
  // ============================================================================
  // CLEANUP
  // ============================================================================
  
  describe('Cleanup', () => {
    it('should close stock position', async () => {
      const { response, data } = await apiRequest('POST', `/api/stocks/${testStockHoldingId}/close`, {
        close_date: '2026-06-30',
        close_price: 70.00,
        commission: 1.00,
        notes: 'Test position close'
      }, authToken)
      
      expect(response.status).toBe(200)
      expect(data).toHaveProperty('profit_loss')
      expect(data.success).toBe(true)
    })
    
    it('should verify position is closed', async () => {
      const { response, data } = await apiRequest('GET', '/api/stocks?closed=true', null, authToken)
      
      const closedHolding = data.find(h => h.id === testStockHoldingId)
      expect(closedHolding).toBeDefined()
      expect(closedHolding.is_open).toBe(0)
    })
  })
})
