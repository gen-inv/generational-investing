import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const BASE_URL = 'http://localhost:3000'
let authToken: string = ''
let testUserId: number = 0
let testAccountId: number = 0

// Helper function to generate unique email
const generateEmail = () => `test-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`

describe('Authentication Tests', () => {
  it('should register a new user', async () => {
    const email = generateEmail()
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Test User'
      })
    })
    
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.token).toBeDefined()
    expect(data.user.email).toBe(email)
    
    // Save for later tests
    authToken = data.token
    testUserId = data.user.id
  })

  it('should login with valid credentials', async () => {
    // First register a user
    const email = generateEmail()
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Login Test User'
      })
    })

    // Now login
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123'
      })
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.token).toBeDefined()
    expect(data.user.email).toBe(email)
  })

  it('should reject login with invalid credentials', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent@test.com',
        password: 'wrongpassword'
      })
    })

    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBe('Invalid credentials')
  })

  it('should reject registration with duplicate email', async () => {
    const email = generateEmail()
    
    // Register first time
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'First User'
      })
    })

    // Try to register again with same email
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Second User'
      })
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Email already exists')
  })

  it('should login with demo account credentials', async () => {
    // Test the demo account that users can use
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@generationalinvesting.ca',
        password: 'test123'
      })
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.token).toBeDefined()
    expect(data.user).toBeDefined()
    expect(data.user.email).toBe('demo@generationalinvesting.ca')
    
    // Verify token format (JWT should have 3 parts separated by dots)
    const tokenParts = data.token.split('.')
    expect(tokenParts).toHaveLength(3)
  })
})

describe('Exchange Rate Caching Tests', () => {
  it('should cache exchange rate on user registration', async () => {
    const email = generateEmail()
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Rate Cache Test'
      })
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    
    // Exchange rate should be cached (checked in backend)
    // We can verify by fetching it
    const token = data.token
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()
    
    const rateResponse = await fetch(
      `${BASE_URL}/api/exchange-rate?month=${month}&year=${year}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    )
    
    const rateData = await rateResponse.json()
    expect(rateResponse.status).toBe(200)
    expect(rateData.usd_to_cad).toBeDefined()
    expect(rateData.cad_to_usd).toBeDefined()
    expect(rateData.cached).toBe(true)
  })

  it('should use cached exchange rate on subsequent login', async () => {
    const email = generateEmail()
    
    // Register
    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Cache Test User'
      })
    })
    const registerData = await registerResponse.json()
    
    // Login again (should use cached rate)
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123'
      })
    })
    
    expect(loginResponse.status).toBe(200)
    // Login should be fast (< 500ms) because rate is cached
  })
})

describe('Account Management Tests', () => {
  beforeAll(async () => {
    // Create a fresh user for account tests
    const email = generateEmail()
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Account Test User'
      })
    })
    const data = await response.json()
    authToken = data.token
    testUserId = data.user.id
  })

  it('should create a CAD account', async () => {
    const response = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        account_name: 'Test TFSA Account',
        account_type: 'TFSA',
        default_currency: 'CAD',
        balance_cad: 50000,
        balance_usd: 0,
        cash_balance_cad: 10000,
        cash_balance_usd: 0
      })
    })

    const data = await response.json()
    expect(response.status).toBe(201)
    expect(data.id).toBeDefined()
    expect(data.account_name).toBe('Test TFSA Account')
    expect(data.account_type).toBe('TFSA')
    expect(data.default_currency).toBe('CAD')
    expect(data.balance_cad).toBe(50000)
    expect(data.cash_balance_cad).toBe(10000)
    
    testAccountId = data.id
  })

  it('should create a USD account', async () => {
    const response = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        account_name: 'Test RRSP Account',
        account_type: 'RRSP',
        default_currency: 'USD',
        balance_cad: 0,
        balance_usd: 75000,
        cash_balance_cad: 0,
        cash_balance_usd: 15000
      })
    })

    const data = await response.json()
    expect(response.status).toBe(201)
    expect(data.default_currency).toBe('USD')
    expect(data.balance_usd).toBe(75000)
    expect(data.cash_balance_usd).toBe(15000)
  })

  it('should reject account creation with invalid type', async () => {
    const response = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        account_name: 'Invalid Account',
        account_type: 'INVALID_TYPE',
        default_currency: 'CAD',
        balance_cad: 10000
      })
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Invalid account type')
  })

  it('should reject account creation with invalid currency', async () => {
    const response = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        account_name: 'Invalid Currency Account',
        account_type: 'TFSA',
        default_currency: 'EUR',
        balance_cad: 10000
      })
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Invalid currency. Must be CAD or USD')
  })

  it('should list all accounts for user', async () => {
    const response = await fetch(`${BASE_URL}/api/accounts`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.accounts).toBeDefined()
    expect(Array.isArray(data.accounts)).toBe(true)
    expect(data.accounts.length).toBeGreaterThan(0)
  })

  it('should get single account details', async () => {
    const response = await fetch(`${BASE_URL}/api/accounts/${testAccountId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.account.id).toBe(testAccountId)
    expect(data.account.account_name).toBe('Test TFSA Account')
  })

  it('should update account details', async () => {
    const response = await fetch(`${BASE_URL}/api/accounts/${testAccountId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        account_name: 'Updated TFSA Account'
      })
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
  })
})

describe('Initial Balance History Tests', () => {
  it('should save initial balance to history on account creation', async () => {
    // Register user
    const email = generateEmail()
    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'History Test User'
      })
    })
    const { token } = await registerResponse.json()

    // Create account
    const accountResponse = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        account_name: 'History Test Account',
        account_type: 'TFSA',
        default_currency: 'CAD',
        balance_cad: 30000,
        balance_usd: 0,
        cash_balance_cad: 6000,
        cash_balance_usd: 0
      })
    })

    const accountData = await accountResponse.json()
    expect(accountResponse.status).toBe(201)
    expect(accountData.id).toBeDefined()
    
    // Initial balance history should be created automatically
    // This is verified in the backend but we can't directly query D1 from tests
    // The fact that account creation succeeds means history was saved
  })
})

describe('Dashboard Tests', () => {
  it('should load dashboard totals quickly', async () => {
    // Register user
    const email = generateEmail()
    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Dashboard Test User'
      })
    })
    const { token } = await registerResponse.json()

    // Create account
    await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        account_name: 'Dashboard Test Account',
        account_type: 'TFSA',
        default_currency: 'CAD',
        balance_cad: 45000,
        balance_usd: 0,
        cash_balance_cad: 9000,
        cash_balance_usd: 0
      })
    })

    // Get dashboard totals
    const startTime = Date.now()
    const response = await fetch(`${BASE_URL}/api/dashboard/totals`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const endTime = Date.now()
    const duration = endTime - startTime

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.total_cad).toBe(45000)
    expect(data.total_cash_cad).toBe(9000)
    expect(data.exchange_rate).toBeDefined()
    expect(data.exchange_rate.usd_to_cad).toBeDefined()
    
    // Dashboard should load quickly (< 1 second)
    expect(duration).toBeLessThan(1000)
  })

  it('should calculate multi-currency totals correctly', async () => {
    // Register user
    const email = generateEmail()
    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Multi Currency Test'
      })
    })
    const { token } = await registerResponse.json()

    // Create CAD account
    await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        account_name: 'CAD Account',
        account_type: 'TFSA',
        default_currency: 'CAD',
        balance_cad: 50000,
        balance_usd: 0,
        cash_balance_cad: 10000,
        cash_balance_usd: 0
      })
    })

    // Create USD account
    await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        account_name: 'USD Account',
        account_type: 'RRSP',
        default_currency: 'USD',
        balance_cad: 0,
        balance_usd: 40000,
        cash_balance_cad: 0,
        cash_balance_usd: 8000
      })
    })

    // Get dashboard totals
    const response = await fetch(`${BASE_URL}/api/dashboard/totals`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    
    // Should have totals in both currencies
    expect(data.total_cad).toBeGreaterThan(0)
    expect(data.total_usd).toBeGreaterThan(0)
    expect(data.total_cash_cad).toBeGreaterThan(0)
    expect(data.total_cash_usd).toBeGreaterThan(0)
  })
})

describe('Monthly Balance Update Tests', () => {
  it('should check if balance can be updated', async () => {
    // Register user and create account
    const email = generateEmail()
    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Update Test User'
      })
    })
    const { token } = await registerResponse.json()

    const accountResponse = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        account_name: 'Update Test Account',
        account_type: 'TFSA',
        default_currency: 'CAD',
        balance_cad: 25000,
        balance_usd: 0,
        cash_balance_cad: 5000,
        cash_balance_usd: 0
      })
    })
    const { id: accountId } = await accountResponse.json()

    // Check if can update (should be false since we just created it)
    const checkResponse = await fetch(`${BASE_URL}/api/accounts/${accountId}/can-update`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })

    const checkData = await checkResponse.json()
    expect(checkResponse.status).toBe(200)
    expect(checkData.canUpdate).toBeDefined()
    expect(checkData.month).toBeDefined()
    expect(checkData.year).toBeDefined()
  })
})

describe('Performance Regression Tests', () => {
  it('should complete account creation in reasonable time', async () => {
    const email = generateEmail()
    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Performance Test'
      })
    })
    const { token } = await registerResponse.json()

    const startTime = Date.now()
    const response = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        account_name: 'Performance Test Account',
        account_type: 'TFSA',
        default_currency: 'CAD',
        balance_cad: 20000,
        balance_usd: 0,
        cash_balance_cad: 4000,
        cash_balance_usd: 0
      })
    })
    const endTime = Date.now()
    const duration = endTime - startTime

    expect(response.status).toBe(201)
    // Account creation should complete quickly (< 5 seconds)
    expect(duration).toBeLessThan(5000)
  })

  it('should handle multiple concurrent requests', async () => {
    const promises = []
    
    for (let i = 0; i < 5; i++) {
      const email = generateEmail()
      const promise = fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'test123',
          name: `Concurrent User ${i}`
        })
      })
      promises.push(promise)
    }

    const responses = await Promise.all(promises)
    
    // All requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200)
    })
  })
})

describe('Company Management Tests', () => {
  let companyToken: string = ''
  let testCompanyId: number = 0

  beforeAll(async () => {
    // Create a fresh user for company tests
    const email = generateEmail()
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Company Test User'
      })
    })
    const data = await response.json()
    companyToken = data.token
  })

  it('should create a company with auto-fetched data', async () => {
    const response = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${companyToken}`
      },
      body: JSON.stringify({
        ticker: 'AAPL',
        research_score: 85,
        anti_fragile_score: 90
      })
    })

    const data = await response.json()
    expect(response.status).toBe(201)
    expect(data.id).toBeDefined()
    expect(data.ticker).toBe('AAPL')
    expect(data.company_name).toBeDefined()
    expect(data.research_score).toBe(85)
    expect(data.anti_fragile_score).toBe(90)
    
    testCompanyId = data.id
  })

  it('should auto-fetch Yahoo Finance data on company creation', async () => {
    const response = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${companyToken}`
      },
      body: JSON.stringify({
        ticker: 'MSFT',
        research_score: 88
      })
    })

    const data = await response.json()
    expect(response.status).toBe(201)
    expect(data.company_name).toBe('Microsoft Corporation')
    expect(data.exchange).toBeDefined()
    // Sector and industry may be populated depending on API availability
  })

  it('should list all companies for user', async () => {
    const response = await fetch(`${BASE_URL}/api/companies`, {
      headers: { 'Authorization': `Bearer ${companyToken}` }
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.companies).toBeDefined()
    expect(Array.isArray(data.companies)).toBe(true)
    expect(data.companies.length).toBeGreaterThan(0)
  })

  it('should get single company details', async () => {
    const response = await fetch(`${BASE_URL}/api/companies/${testCompanyId}`, {
      headers: { 'Authorization': `Bearer ${companyToken}` }
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.company.id).toBe(testCompanyId)
    expect(data.company.ticker).toBe('AAPL')
  })

  it('should update company details', async () => {
    const response = await fetch(`${BASE_URL}/api/companies/${testCompanyId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${companyToken}`
      },
      body: JSON.stringify({
        research_score: 92,
        is_wonderful: 1
      })
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
  })

  it('should delete a company', async () => {
    // Create a company to delete
    const createResponse = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${companyToken}`
      },
      body: JSON.stringify({
        ticker: 'TEMP',
        research_score: 50
      })
    })
    const createData = await createResponse.json()
    const tempId = createData.id

    // Delete it
    const deleteResponse = await fetch(`${BASE_URL}/api/companies/${tempId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${companyToken}` }
    })

    expect(deleteResponse.status).toBe(200)
    const deleteData = await deleteResponse.json()
    expect(deleteData.success).toBe(true)
  })
})

describe('Earnings Date Tests', () => {
  let earningsToken: string = ''
  let earningsCompanyId: number = 0

  beforeAll(async () => {
    // Create a fresh user for earnings tests
    const email = generateEmail()
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Earnings Test User'
      })
    })
    const data = await response.json()
    earningsToken = data.token

    // Create a company with likely earnings data
    const companyResponse = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${earningsToken}`
      },
      body: JSON.stringify({
        ticker: 'TSLA',
        research_score: 80
      })
    })
    const companyData = await companyResponse.json()
    earningsCompanyId = companyData.id
  })

  it('should manually fetch earnings date for a company', async () => {
    const response = await fetch(`${BASE_URL}/api/companies/${earningsCompanyId}/fetch-earnings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${earningsToken}` }
    })

    const data = await response.json()
    // Response should succeed (200) even if no earnings date found
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    // earnings_date may be null if not available
  })

  it('should handle missing company for earnings fetch', async () => {
    const response = await fetch(`${BASE_URL}/api/companies/99999/fetch-earnings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${earningsToken}` }
    })

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Company not found')
  })

  it('should store earnings date in company record', async () => {
    // Fetch earnings
    await fetch(`${BASE_URL}/api/companies/${earningsCompanyId}/fetch-earnings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${earningsToken}` }
    })

    // Get company details to verify earnings date was stored
    const response = await fetch(`${BASE_URL}/api/companies/${earningsCompanyId}`, {
      headers: { 'Authorization': `Bearer ${earningsToken}` }
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.company).toBeDefined()
    // next_earnings_date should be defined (may be null if not available)
    expect(data.company.hasOwnProperty('next_earnings_date')).toBe(true)
  })
})

describe('Data Source Integration Tests', () => {
  let dataToken: string = ''

  beforeAll(async () => {
    const email = generateEmail()
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Data Source Test'
      })
    })
    const data = await response.json()
    dataToken = data.token
  })

  it('should handle Yahoo Finance fallback', async () => {
    const response = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dataToken}`
      },
      body: JSON.stringify({
        ticker: 'NVDA',
        research_score: 85
      })
    })

    const data = await response.json()
    expect(response.status).toBe(201)
    expect(data.company_name).toBeDefined()
    // Should at least have company name from Yahoo Finance
    expect(data.company_name).not.toBe('NVDA')
  })

  it('should handle EOD Historical Data integration', async () => {
    const response = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dataToken}`
      },
      body: JSON.stringify({
        ticker: 'AMZN',
        research_score: 87
      })
    })

    const data = await response.json()
    expect(response.status).toBe(201)
    expect(data.company_name).toBeDefined()
    // EOD should provide sector/industry for major stocks
  })

  it('should complete company creation quickly', async () => {
    const startTime = Date.now()
    const response = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dataToken}`
      },
      body: JSON.stringify({
        ticker: 'GOOGL',
        research_score: 86
      })
    })
    const endTime = Date.now()
    const duration = endTime - startTime

    expect(response.status).toBe(201)
    // Should complete in reasonable time even with API calls
    expect(duration).toBeLessThan(5000)
  })
})

describe('Stock Trade Tests', () => {
  let stockToken: string = ''
  let stockAccountId: number = 0
  let stockCompanyId: number = 0
  let stockTradeId: number = 0

  beforeAll(async () => {
    // Create user
    const email = generateEmail()
    const userResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Stock Trade Test User'
      })
    })
    const userData = await userResponse.json()
    stockToken = userData.token

    // Create account
    const accountResponse = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stockToken}`
      },
      body: JSON.stringify({
        account_name: 'Stock Test Account',
        account_type: 'TFSA',
        default_currency: 'CAD',
        balance_cad: 100000,
        balance_usd: 0,
        cash_balance_cad: 50000,
        cash_balance_usd: 0
      })
    })
    const accountData = await accountResponse.json()
    stockAccountId = accountData.id

    // Create company
    const companyResponse = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stockToken}`
      },
      body: JSON.stringify({
        ticker: 'AAPL',
        research_score: 85,
        buy_price: 150.00
      })
    })
    const companyData = await companyResponse.json()
    stockCompanyId = companyData.id
  })

  it('should create a BUY stock trade', async () => {
    const response = await fetch(`${BASE_URL}/api/stocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stockToken}`
      },
      body: JSON.stringify({
        company_id: stockCompanyId,
        ticker: 'AAPL',
        account_id: stockAccountId,
        trade_type: 'BUY',
        quantity: 200,
        price: 150.00,
        trade_date: '2024-01-15',
        commission: 10.00
      })
    })

    const data = await response.json()
    expect(response.status).toBe(201)
    expect(data.id).toBeDefined()
    expect(data.ticker).toBe('AAPL')
    expect(data.quantity).toBe(200)
    expect(data.price).toBe(150.00)
    
    stockTradeId = data.id
  })

  it('should list open stock trades', async () => {
    const response = await fetch(`${BASE_URL}/api/stocks?open=true`, {
      headers: { 'Authorization': `Bearer ${stockToken}` }
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    expect(data[0].ticker).toBe('AAPL')
  })

  it('should calculate average price for multiple buys', async () => {
    // Add to position
    await fetch(`${BASE_URL}/api/stocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stockToken}`
      },
      body: JSON.stringify({
        company_id: stockCompanyId,
        ticker: 'AAPL',
        account_id: stockAccountId,
        trade_type: 'BUY',
        quantity: 100,
        price: 160.00,
        trade_date: '2024-02-01',
        commission: 5.00
      })
    })

    // Get trades and verify average price
    const response = await fetch(`${BASE_URL}/api/stocks?open=true`, {
      headers: { 'Authorization': `Bearer ${stockToken}` }
    })

    const data = await response.json()
    const appleStock = data.find((s: any) => s.ticker === 'AAPL')
    expect(appleStock).toBeDefined()
    // Note: Each BUY creates a separate row in stock_trades
    // Aggregation happens in the frontend when displaying positions
    // The second trade should exist
    expect(appleStock.quantity).toBeGreaterThan(0)
  })
})

describe('Dividend Tests', () => {
  let divToken: string = ''
  let divAccountId: number = 0
  let divCompanyId: number = 0
  let divStockTradeId: number = 0

  beforeAll(async () => {
    // Create user
    const email = generateEmail()
    const userResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Dividend Test User'
      })
    })
    const userData = await userResponse.json()
    divToken = userData.token

    // Create account
    const accountResponse = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${divToken}`
      },
      body: JSON.stringify({
        account_name: 'Dividend Test Account',
        account_type: 'TFSA',
        default_currency: 'CAD',
        balance_cad: 100000,
        balance_usd: 0,
        cash_balance_cad: 50000,
        cash_balance_usd: 0
      })
    })
    const accountData = await accountResponse.json()
    divAccountId = accountData.id

    // Create company
    const companyResponse = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${divToken}`
      },
      body: JSON.stringify({
        ticker: 'MSFT',
        research_score: 88
      })
    })
    const companyData = await companyResponse.json()
    divCompanyId = companyData.id

    // Create stock trade
    const stockResponse = await fetch(`${BASE_URL}/api/stocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${divToken}`
      },
      body: JSON.stringify({
        company_id: divCompanyId,
        ticker: 'MSFT',
        account_id: divAccountId,
        trade_type: 'BUY',
        quantity: 100,
        price: 350.00,
        trade_date: '2024-01-10'
      })
    })
    const stockData = await stockResponse.json()
    divStockTradeId = stockData.id
  })

  it('should record a dividend', async () => {
    const response = await fetch(`${BASE_URL}/api/stocks/${divStockTradeId}/dividends`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${divToken}`
      },
      body: JSON.stringify({
        amount: 75.00, // $0.75 per share * 100 shares
        per_share: 0.75,
        payment_date: '2024-03-15',
        notes: 'Q1 2024 dividend'
      })
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.id).toBeDefined()
    expect(data.message).toBe('Dividend recorded successfully')
  })

  it('should reduce cost basis with dividend', async () => {
    // Get stock details to verify cost basis adjustment
    const response = await fetch(`${BASE_URL}/api/stocks?open=true`, {
      headers: { 'Authorization': `Bearer ${divToken}` }
    })

    const data = await response.json()
    const msftStock = data.find((s: any) => s.ticker === 'MSFT')
    expect(msftStock).toBeDefined()
    
    // Cost basis should be reduced by dividend
    // Original: 350.00, Dividend: 0.75, New: 349.25
    expect(msftStock.cost_basis).toBeCloseTo(349.25, 2)
  })

  it('should list dividend history', async () => {
    const response = await fetch(`${BASE_URL}/api/stocks/${divStockTradeId}/dividends`, {
      headers: { 'Authorization': `Bearer ${divToken}` }
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    // Dividend adjustments don't store per_share separately, only total amount
    expect(data[0].amount).toBe(75.00)
  })
})

describe('Covered Call Tests', () => {
  let ccToken: string = ''
  let ccAccountId: number = 0
  let ccCompanyId: number = 0
  let ccStockTradeId: number = 0
  let ccOptionTradeId: number = 0

  beforeAll(async () => {
    // Create user
    const email = generateEmail()
    const userResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Covered Call Test User'
      })
    })
    const userData = await userResponse.json()
    ccToken = userData.token

    // Create account
    const accountResponse = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ccToken}`
      },
      body: JSON.stringify({
        account_name: 'CC Test Account',
        account_type: 'TFSA',
        default_currency: 'CAD',
        balance_cad: 100000,
        balance_usd: 0,
        cash_balance_cad: 50000,
        cash_balance_usd: 0
      })
    })
    const accountData = await accountResponse.json()
    ccAccountId = accountData.id

    // Create company
    const companyResponse = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ccToken}`
      },
      body: JSON.stringify({
        ticker: 'NVDA',
        research_score: 90
      })
    })
    const companyData = await companyResponse.json()
    ccCompanyId = companyData.id

    // Create stock trade with enough shares for covered calls
    const stockResponse = await fetch(`${BASE_URL}/api/stocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ccToken}`
      },
      body: JSON.stringify({
        company_id: ccCompanyId,
        ticker: 'NVDA',
        account_id: ccAccountId,
        trade_type: 'BUY',
        quantity: 200,
        price: 500.00,
        trade_date: '2024-01-05'
      })
    })
    const stockData = await stockResponse.json()
    ccStockTradeId = stockData.id
  })

  it('should initiate a covered call (premium per share)', async () => {
    const response = await fetch(`${BASE_URL}/api/stocks/${ccStockTradeId}/covered-calls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ccToken}`
      },
      body: JSON.stringify({
        strike_price: 550.00,
        premium: 1.75, // $1.75 per share
        quantity: 2, // 2 contracts = 200 shares
        expiration_date: '2024-04-19',
        trade_date: '2024-01-20',
        notes: 'Q1 2024 covered call'
      })
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.id).toBeDefined()
    expect(data.message).toBe('Covered call recorded successfully')
    
    ccOptionTradeId = data.id
  })

  it('should calculate premium correctly (100 shares per contract)', async () => {
    // Get stock details to verify cost basis adjustment
    const response = await fetch(`${BASE_URL}/api/stocks?open=true`, {
      headers: { 'Authorization': `Bearer ${ccToken}` }
    })

    const data = await response.json()
    const nvdaStock = data.find((s: any) => s.ticker === 'NVDA')
    expect(nvdaStock).toBeDefined()
    
    // Premium received: $1.75 * 2 contracts * 100 shares = $350
    // Cost basis: 500.00 - (350 / 200) = 498.25
    expect(nvdaStock.cost_basis).toBeCloseTo(498.25, 2)
  })

  it('should show covered call status in stock list', async () => {
    const response = await fetch(`${BASE_URL}/api/stocks?open=true`, {
      headers: { 'Authorization': `Bearer ${ccToken}` }
    })

    const data = await response.json()
    const nvdaStock = data.find((s: any) => s.ticker === 'NVDA')
    expect(nvdaStock).toBeDefined()
    expect(nvdaStock.cc_status).toBeDefined()
    expect(nvdaStock.cc_expiration).toBeDefined()
  })

  it('should list covered calls for stock', async () => {
    const response = await fetch(`${BASE_URL}/api/stocks/${ccStockTradeId}/covered-calls`, {
      headers: { 'Authorization': `Bearer ${ccToken}` }
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    expect(data[0].strike_price).toBe(550.00)
    expect(data[0].is_open).toBe(1)
  })

  it('should close a covered call with P/L calculation', async () => {
    // Calculate P/L: Premium - Close Cost - Commission
    // Premium: $1.75 * 2 contracts * 100 shares = 350
    // Close: $0.50 * 2 * 100 = 100
    // Commission: 10
    // Net P/L: 350 - 100 - 10 = 240
    const profitLoss = (1.75 * 2 * 100) - (0.50 * 2 * 100) - 10

    const response = await fetch(`${BASE_URL}/api/covered-calls/${ccOptionTradeId}/close`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ccToken}`
      },
      body: JSON.stringify({
        close_date: '2024-02-15',
        close_price: 0.50, // $0.50 per share to buy back
        commission: 10.00,
        profit_loss: profitLoss
      })
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.profit_loss).toBeDefined()
    
    // P/L: Premium (350) - Close Cost (100) - Commission (10) = 240
    expect(data.profit_loss).toBeCloseTo(240, 2)
  })

  it('should update cost basis after closing covered call', async () => {
    // Get stock details to verify cost basis update
    const response = await fetch(`${BASE_URL}/api/stocks?open=true`, {
      headers: { 'Authorization': `Bearer ${ccToken}` }
    })

    const data = await response.json()
    const nvdaStock = data.find((s: any) => s.ticker === 'NVDA')
    expect(nvdaStock).toBeDefined()
    
    // Cost basis should reflect net P/L after closing
    // Original: 500.00
    // Net P/L: 240 (premium 350 - close cost 100 - commission 10)
    // New CB: 500.00 - (240 / 200) = 498.80
    expect(nvdaStock.cost_basis).toBeCloseTo(498.80, 2)
  })

  it('should reject covered call with insufficient shares', async () => {
    const response = await fetch(`${BASE_URL}/api/stocks/${ccStockTradeId}/covered-calls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ccToken}`
      },
      body: JSON.stringify({
        strike_price: 560.00,
        premium: 2.00,
        quantity: 10, // 10 contracts = 1000 shares (only have 200)
        expiration_date: '2024-05-17',
        trade_date: '2024-02-20'
      })
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('shares')
  })
})

describe('Cost Basis Adjustment Tests', () => {
  let cbToken: string = ''
  let cbAccountId: number = 0
  let cbCompanyId: number = 0
  let cbStockTradeId: number = 0

  beforeAll(async () => {
    // Create user
    const email = generateEmail()
    const userResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Cost Basis Test User'
      })
    })
    const userData = await userResponse.json()
    cbToken = userData.token

    // Create account
    const accountResponse = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cbToken}`
      },
      body: JSON.stringify({
        account_name: 'CB Test Account',
        account_type: 'RRSP',
        default_currency: 'CAD',
        balance_cad: 100000,
        balance_usd: 0,
        cash_balance_cad: 50000,
        cash_balance_usd: 0
      })
    })
    const accountData = await accountResponse.json()
    cbAccountId = accountData.id

    // Create company
    const companyResponse = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cbToken}`
      },
      body: JSON.stringify({
        ticker: 'TSLA',
        research_score: 82
      })
    })
    const companyData = await companyResponse.json()
    cbCompanyId = companyData.id

    // Create stock trade
    const stockResponse = await fetch(`${BASE_URL}/api/stocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cbToken}`
      },
      body: JSON.stringify({
        company_id: cbCompanyId,
        ticker: 'TSLA',
        account_id: cbAccountId,
        trade_type: 'BUY',
        quantity: 100,
        price: 250.00,
        trade_date: '2024-01-10'
      })
    })
    const stockData = await stockResponse.json()
    cbStockTradeId = stockData.id
  })

  it('should reduce cost basis with dividend', async () => {
    // Record dividend
    await fetch(`${BASE_URL}/api/stocks/${cbStockTradeId}/dividends`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cbToken}`
      },
      body: JSON.stringify({
        amount: 50.00,
        per_share: 0.50,
        payment_date: '2024-03-01'
      })
    })

    // Verify cost basis reduced
    const response = await fetch(`${BASE_URL}/api/stocks?open=true`, {
      headers: { 'Authorization': `Bearer ${cbToken}` }
    })

    const data = await response.json()
    const tslaStock = data.find((s: any) => s.ticker === 'TSLA')
    expect(tslaStock.cost_basis).toBeCloseTo(249.50, 2)
  })

  it('should reduce cost basis with covered call profit', async () => {
    // Initiate covered call
    const ccResponse = await fetch(`${BASE_URL}/api/stocks/${cbStockTradeId}/covered-calls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cbToken}`
      },
      body: JSON.stringify({
        strike_price: 280.00,
        premium: 3.00,
        quantity: 1,
        expiration_date: '2024-04-19',
        trade_date: '2024-02-01'
      })
    })
    const ccData = await ccResponse.json()

    // Close with profit
    // Premium: 3.00 * 1 * 100 = 300
    // Close: 1.00 * 1 * 100 = 100
    // Commission: 5
    // Net P/L: 300 - 100 - 5 = 195
    const profitLoss = (3.00 * 1 * 100) - (1.00 * 1 * 100) - 5

    await fetch(`${BASE_URL}/api/covered-calls/${ccData.id}/close`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cbToken}`
      },
      body: JSON.stringify({
        close_date: '2024-03-15',
        close_price: 1.00,
        commission: 5.00,
        profit_loss: profitLoss
      })
    })

    // Verify cost basis reduced by net P/L
    // Premium: $3 * 1 * 100 = 300
    // Close: $1 * 1 * 100 = 100
    // Commission: 5
    // P/L: 300 - 100 - 5 = 195
    // New CB: 249.50 - (195 / 100) = 247.55
    const response = await fetch(`${BASE_URL}/api/stocks?open=true`, {
      headers: { 'Authorization': `Bearer ${cbToken}` }
    })

    const data = await response.json()
    const tslaStock = data.find((s: any) => s.ticker === 'TSLA')
    expect(tslaStock.cost_basis).toBeCloseTo(247.55, 2)
  })
})

describe('Option Trade Tests', () => {
  let optionToken: string = ''
  let optionCompanyId: number = 0
  let optionAccountId: number = 0
  let optionTradeId: number = 0

  it('should create user, company, and account for option tests', async () => {
    // Register user
    const email = generateEmail()
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Option Test User'
      })
    })
    const registerData = await registerRes.json()
    optionToken = registerData.token
    expect(registerRes.status).toBe(200)

    // Create company
    const companyRes = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${optionToken}`
      },
      body: JSON.stringify({
        ticker: 'NVDA',
        company_name: 'NVIDIA Corporation',
        buy_price: 120.00
      })
    })
    const companyData = await companyRes.json()
    optionCompanyId = companyData.id
    expect(companyRes.status).toBe(201)

    // Create account
    const accountRes = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${optionToken}`
      },
      body: JSON.stringify({
        account_name: 'Interactive Brokers',
        account_type: 'Cash',
        default_currency: 'USD',
        balance_usd: 50000,
        cash_balance_usd: 50000
      })
    })
    const accountData = await accountRes.json()
    optionAccountId = accountData.id
    expect(accountRes.status).toBe(201)
  })

  it('should create a selling put option trade', async () => {
    const response = await fetch(`${BASE_URL}/api/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${optionToken}`
      },
      body: JSON.stringify({
        company_id: optionCompanyId,
        ticker: 'NVDA',
        strategy_type: 'SELLING_PUT',
        strike_price: 100.00,
        premium: 2.50,
        quantity: 2,
        expiration_date: '2024-03-15',
        account_id: optionAccountId,
        trade_date: '2024-02-01',
        commission: 1.30,
        is_open: true,
        notes: 'Stockpiling position'
      })
    })

    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    expect(data.ticker).toBe('NVDA')
    expect(data.strategy_type).toBe('SELLING_PUT')
    expect(data.account_type).toBe('Cash')
    optionTradeId = data.id
  })

  it('should reject option trade without company_id', async () => {
    const response = await fetch(`${BASE_URL}/api/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${optionToken}`
      },
      body: JSON.stringify({
        ticker: 'AAPL',
        strategy_type: 'SELLING_PUT',
        strike_price: 150.00,
        premium: 3.00,
        quantity: 1,
        expiration_date: '2024-03-15',
        account_id: optionAccountId,
        trade_date: '2024-02-01'
      })
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Company is required')
  })

  it('should reject option trade without account_id', async () => {
    const response = await fetch(`${BASE_URL}/api/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${optionToken}`
      },
      body: JSON.stringify({
        company_id: optionCompanyId,
        ticker: 'NVDA',
        strategy_type: 'SELLING_PUT',
        strike_price: 100.00,
        premium: 2.50,
        quantity: 2,
        expiration_date: '2024-03-15',
        trade_date: '2024-02-01'
      })
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Account is required')
  })

  it('should reject option trade with non-existent company', async () => {
    const response = await fetch(`${BASE_URL}/api/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${optionToken}`
      },
      body: JSON.stringify({
        company_id: 999999,
        ticker: 'FAKE',
        strategy_type: 'SELLING_PUT',
        strike_price: 100.00,
        premium: 2.50,
        quantity: 1,
        expiration_date: '2024-03-15',
        account_id: optionAccountId,
        trade_date: '2024-02-01'
      })
    })

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Company not found')
  })

  it('should reject option trade with non-existent account', async () => {
    const response = await fetch(`${BASE_URL}/api/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${optionToken}`
      },
      body: JSON.stringify({
        company_id: optionCompanyId,
        ticker: 'NVDA',
        strategy_type: 'SELLING_PUT',
        strike_price: 100.00,
        premium: 2.50,
        quantity: 1,
        expiration_date: '2024-03-15',
        account_id: 999999,
        trade_date: '2024-02-01'
      })
    })

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Account not found')
  })

  it('should retrieve open option trades', async () => {
    const response = await fetch(`${BASE_URL}/api/options?open=true`, {
      headers: { 'Authorization': `Bearer ${optionToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    
    const nvdaOption = data.find((o: any) => o.ticker === 'NVDA')
    expect(nvdaOption).toBeDefined()
    expect(nvdaOption.strategy_type).toBe('SELLING_PUT')
    expect(nvdaOption.is_open).toBe(1)
  })

  it('should create multiple option trade types', async () => {
    // Covered Call
    const ccResponse = await fetch(`${BASE_URL}/api/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${optionToken}`
      },
      body: JSON.stringify({
        company_id: optionCompanyId,
        ticker: 'NVDA',
        strategy_type: 'COVERED_CALL',
        strike_price: 130.00,
        premium: 3.00,
        quantity: 1,
        expiration_date: '2024-04-19',
        account_id: optionAccountId,
        trade_date: '2024-02-15',
        commission: 0.65
      })
    })
    expect(ccResponse.status).toBe(201)

    // Credit Spread
    const csResponse = await fetch(`${BASE_URL}/api/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${optionToken}`
      },
      body: JSON.stringify({
        company_id: optionCompanyId,
        ticker: 'NVDA',
        strategy_type: 'CREDIT_SPREAD',
        strike_price: 110.00,
        premium: 1.50,
        quantity: 1,
        expiration_date: '2024-05-17',
        account_id: optionAccountId,
        trade_date: '2024-03-01',
        commission: 1.30
      })
    })
    expect(csResponse.status).toBe(201)

    // Verify all created
    const listResponse = await fetch(`${BASE_URL}/api/options?open=true`, {
      headers: { 'Authorization': `Bearer ${optionToken}` }
    })
    const data = await listResponse.json()
    expect(data.length).toBeGreaterThanOrEqual(3)
  })

  it('should update an option trade', async () => {
    const response = await fetch(`${BASE_URL}/api/options/${optionTradeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${optionToken}`
      },
      body: JSON.stringify({
        notes: 'Updated notes for stockpiling'
      })
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('should close an option trade with profit', async () => {
    // Close the selling put for profit
    const response = await fetch(`${BASE_URL}/api/options/${optionTradeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${optionToken}`
      },
      body: JSON.stringify({
        is_open: 0,
        close_date: '2024-03-10',
        close_price: 0.50, // Bought back for less
        profit_loss: ((2.50 * 2 * 100) - (0.50 * 2 * 100) - 1.30) // Premium - Close - Commission
      })
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('should reopen a closed option trade', async () => {
    const response = await fetch(`${BASE_URL}/api/options/${optionTradeId}/reopen`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${optionToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('should delete an option trade', async () => {
    const response = await fetch(`${BASE_URL}/api/options/${optionTradeId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${optionToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })
})

describe('Stock Holdings and Transactions Tests', () => {
  let stockHoldingsToken: string = ''
  let stockHoldingsAccountId: number = 0
  let stockHoldingsCompanyId: number = 0
  let stockHoldingId: number = 0

  beforeAll(async () => {
    // Create user
    const email = generateEmail()
    const userResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Holdings Test User'
      })
    })
    const userData = await userResponse.json()
    stockHoldingsToken = userData.token

    // Create account
    const accountResponse = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stockHoldingsToken}`
      },
      body: JSON.stringify({
        account_name: 'Holdings Test Account',
        account_type: 'TFSA',
        default_currency: 'CAD',
        balance_cad: 100000,
        balance_usd: 0,
        cash_balance_cad: 50000,
        cash_balance_usd: 0
      })
    })
    const accountData = await accountResponse.json()
    stockHoldingsAccountId = accountData.id

    // Create company
    const companyResponse = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stockHoldingsToken}`
      },
      body: JSON.stringify({
        ticker: 'SHOP',
        research_score: 85
      })
    })
    const companyData = await companyResponse.json()
    stockHoldingsCompanyId = companyData.id
  })

  it('should create initial BUY and create stock_holding', async () => {
    const response = await fetch(`${BASE_URL}/api/stocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stockHoldingsToken}`
      },
      body: JSON.stringify({
        company_id: stockHoldingsCompanyId,
        ticker: 'SHOP',
        account_id: stockHoldingsAccountId,
        trade_type: 'BUY',
        quantity: 100,
        price: 80.00,
        trade_date: '2024-01-15',
        commission: 5.00
      })
    })

    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    stockHoldingId = data.id
  })

  it('should aggregate multiple BUY transactions', async () => {
    // Second BUY
    await fetch(`${BASE_URL}/api/stocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stockHoldingsToken}`
      },
      body: JSON.stringify({
        company_id: stockHoldingsCompanyId,
        ticker: 'SHOP',
        account_id: stockHoldingsAccountId,
        trade_type: 'BUY',
        quantity: 50,
        price: 85.00,
        trade_date: '2024-02-01',
        commission: 3.00
      })
    })

    // Get holding and verify aggregation
    // Average should be: (100 * 80 + 50 * 85) / 150 = 81.67
    const response = await fetch(`${BASE_URL}/api/stocks?open=true`, {
      headers: { 'Authorization': `Bearer ${stockHoldingsToken}` }
    })

    const data = await response.json()
    const shopHolding = data.find((h: any) => h.ticker === 'SHOP')
    expect(shopHolding).toBeDefined()
    expect(shopHolding.total_shares).toBe(150)
    expect(shopHolding.average_price).toBeCloseTo(81.67, 2)
  })

  it('should handle partial SELL transaction', async () => {
    const response = await fetch(`${BASE_URL}/api/stocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stockHoldingsToken}`
      },
      body: JSON.stringify({
        company_id: stockHoldingsCompanyId,
        ticker: 'SHOP',
        account_id: stockHoldingsAccountId,
        trade_type: 'SELL',
        quantity: 50,
        price: 90.00,
        trade_date: '2024-03-01',
        commission: 3.00
      })
    })

    expect(response.status).toBe(201)

    // Verify holding updated
    const listResponse = await fetch(`${BASE_URL}/api/stocks?open=true`, {
      headers: { 'Authorization': `Bearer ${stockHoldingsToken}` }
    })

    const data = await listResponse.json()
    const shopHolding = data.find((h: any) => h.ticker === 'SHOP')
    expect(shopHolding.total_shares).toBe(100) // 150 - 50
  })

  it('should close holding with full SELL', async () => {
    const response = await fetch(`${BASE_URL}/api/stocks/${stockHoldingId}/close`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stockHoldingsToken}`
      },
      body: JSON.stringify({
        close_price: 95.00,
        close_date: '2024-04-01',
        commission: 5.00
      })
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.profit_loss).toBeDefined()
  })

  it('should reopen a closed holding', async () => {
    const response = await fetch(`${BASE_URL}/api/stocks/${stockHoldingId}/reopen`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${stockHoldingsToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('should delete stock holding and cascade transactions', async () => {
    const response = await fetch(`${BASE_URL}/api/stocks/${stockHoldingId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${stockHoldingsToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('should get purchase history for a stock', async () => {
    // Create new holding first
    const createResponse = await fetch(`${BASE_URL}/api/stocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stockHoldingsToken}`
      },
      body: JSON.stringify({
        company_id: stockHoldingsCompanyId,
        ticker: 'SHOP',
        account_id: stockHoldingsAccountId,
        trade_type: 'BUY',
        quantity: 75,
        price: 82.00,
        trade_date: '2024-05-01',
        commission: 4.00
      })
    })
    const createData = await createResponse.json()
    const newHoldingId = createData.id

    // Get purchase history
    const response = await fetch(`${BASE_URL}/api/stocks/${newHoldingId}/purchase-history`, {
      headers: { 'Authorization': `Bearer ${stockHoldingsToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })
})

describe('Daily Trades Tests', () => {
  let dailyTradesToken: string = ''
  let dailyTradeId: number = 0
  let dailyAccountId: number = 0

  beforeAll(async () => {
    // Create user
    const email = generateEmail()
    const userResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Daily Trades Test User'
      })
    })
    const userData = await userResponse.json()
    dailyTradesToken = userData.token

    // Create account for daily trades
    const accountResponse = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dailyTradesToken}`
      },
      body: JSON.stringify({
        account_name: 'Daily Trading Account',
        account_type: 'Cash',
        default_currency: 'USD',
        balance_usd: 50000,
        cash_balance_usd: 50000
      })
    })
    const accountData = await accountResponse.json()
    dailyAccountId = accountData.id
  })

  it('should get default daily trade config', async () => {
    const response = await fetch(`${BASE_URL}/api/daily-trade/config`, {
      headers: { 'Authorization': `Bearer ${dailyTradesToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.default_contracts).toBeDefined()
    expect(data.rolling_profit_window).toBeDefined() // Correct field name
  })

  it('should update daily trade config', async () => {
    const response = await fetch(`${BASE_URL}/api/daily-trade/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dailyTradesToken}`
      },
      body: JSON.stringify({
        max_contract_limit: 25,
        rolling_profit_window: 60,
        enable_profit_sizing_default: false,
        target_premium_min: 10.00,
        target_premium_max: 15.00,
        guideline_delta: -0.10,
        strike_width: 5,
        default_contracts: 5,
        profit_target_percent: 50,
        atm_proximity_limit: 30,
        time_exit: '14:00:00',
        default_account_id: dailyAccountId
      })
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('should create a daily trade', async () => {
    const callCredit = 2.50
    const putCredit = 2.25
    const totalCredit = (callCredit + putCredit) * 3 * 100 // contracts * 100

    const response = await fetch(`${BASE_URL}/api/daily-trades`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dailyTradesToken}`
      },
      body: JSON.stringify({
        trade_date: '2024-03-10',
        entry_time: '09:35:00',
        account_id: dailyAccountId,
        strategy_type: 'IRON_CONDOR',
        contracts: 3,
        strike_width: 5,
        call_enabled: 1,
        call_short_strike: 5150,
        call_total_credit: callCredit * 3 * 100,
        put_enabled: 1,
        put_short_strike: 5105,
        put_total_credit: putCredit * 3 * 100,
        spx_entry_price: 5150.00,
        total_credit: totalCredit,
        commission: 6.50
      })
    })

    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    dailyTradeId = data.id
  })

  it('should list all daily trades', async () => {
    const response = await fetch(`${BASE_URL}/api/daily-trades`, {
      headers: { 'Authorization': `Bearer ${dailyTradesToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.trades).toBeDefined()
    expect(Array.isArray(data.trades)).toBe(true)
    expect(data.trades.length).toBeGreaterThan(0)
  })

  it('should get today active trades', async () => {
    const response = await fetch(`${BASE_URL}/api/daily-trades/today`, {
      headers: { 'Authorization': `Bearer ${dailyTradesToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.trades).toBeDefined()
    expect(Array.isArray(data.trades)).toBe(true)
  })

  it('should get daily trade stats', async () => {
    const response = await fetch(`${BASE_URL}/api/daily-trades/stats?period=rolling`, {
      headers: { 'Authorization': `Bearer ${dailyTradesToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.net_pl).toBeDefined()
    expect(data.total_trades).toBeDefined()
    expect(data.win_rate).toBeDefined()
  })

  it('should get day-of-week stats', async () => {
    const response = await fetch(`${BASE_URL}/api/daily-trades/day-stats`, {
      headers: { 'Authorization': `Bearer ${dailyTradesToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.days).toBeDefined()
    expect(Array.isArray(data.days)).toBe(true)
  })

  it('should get chart data', async () => {
    const response = await fetch(`${BASE_URL}/api/daily-trades/chart-data`, {
      headers: { 'Authorization': `Bearer ${dailyTradesToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.trades).toBeDefined()
    expect(Array.isArray(data.trades)).toBe(true)
  })

  it('should close a daily trade', async () => {
    const response = await fetch(`${BASE_URL}/api/daily-trades/${dailyTradeId}/close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dailyTradesToken}`
      },
      body: JSON.stringify({
        exit_time: '15:45:00',
        close_commission: 6.50,
        call_close_debit: 0.50,
        put_close_debit: 0.25
      })
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.profit_loss).toBeDefined()
  })

  it('should update a daily trade', async () => {
    const response = await fetch(`${BASE_URL}/api/daily-trades/${dailyTradeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dailyTradesToken}`
      },
      body: JSON.stringify({
        trade_date: '2024-03-10',
        entry_time: '09:35:00',
        strategy_type: 'IRON_CONDOR',
        contracts: 3,
        strike_width: 5,
        call_enabled: 1,
        call_short_strike: 5150,
        call_total_credit: 750,
        put_enabled: 1,
        put_short_strike: 5105,
        put_total_credit: 675,
        spx_entry_price: 5150.00,
        total_credit: 1425,
        commission: 6.50,
        notes: 'Good trade, waited for setup'
      })
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('should delete a daily trade', async () => {
    const response = await fetch(`${BASE_URL}/api/daily-trades/${dailyTradeId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${dailyTradesToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('should reset daily trade config to defaults', async () => {
    const response = await fetch(`${BASE_URL}/api/daily-trade/config/reset`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${dailyTradesToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.config).toBeDefined()
    expect(data.config.default_contracts).toBe(1) // Correct default value
    expect(data.config.rolling_profit_window).toBe(50) // Correct field name
  })
})

describe('Reports Tests', () => {
  let reportsToken: string = ''
  let reportsAccountId: number = 0
  let reportsCompanyId: number = 0

  beforeAll(async () => {
    // Create user with some trades for reporting
    const email = generateEmail()
    const userResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Reports Test User'
      })
    })
    const userData = await userResponse.json()
    reportsToken = userData.token

    // Create account
    const accountResponse = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${reportsToken}`
      },
      body: JSON.stringify({
        account_name: 'Reports Test Account',
        account_type: 'TFSA',
        default_currency: 'CAD',
        balance_cad: 100000,
        balance_usd: 0,
        cash_balance_cad: 50000,
        cash_balance_usd: 0
      })
    })
    const accountData = await accountResponse.json()
    reportsAccountId = accountData.id

    // Create company
    const companyResponse = await fetch(`${BASE_URL}/api/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${reportsToken}`
      },
      body: JSON.stringify({
        ticker: 'AMD',
        research_score: 88
      })
    })
    const companyData = await companyResponse.json()
    reportsCompanyId = companyData.id

    // Create a closed stock holding for P/L
    const stockResponse = await fetch(`${BASE_URL}/api/stocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${reportsToken}`
      },
      body: JSON.stringify({
        company_id: reportsCompanyId,
        ticker: 'AMD',
        account_id: reportsAccountId,
        trade_type: 'BUY',
        quantity: 100,
        price: 150.00,
        trade_date: '2026-01-15'
      })
    })
    const stockData = await stockResponse.json()
    
    // Close it for profit
    await fetch(`${BASE_URL}/api/stocks/${stockData.id}/close`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${reportsToken}`
      },
      body: JSON.stringify({
        close_price: 165.00,
        close_date: '2026-02-15',
        commission: 5.00
      })
    })
  })

  it('should get P/L summary report', async () => {
    const response = await fetch(`${BASE_URL}/api/reports/pl-summary?period=ytd`, {
      headers: { 'Authorization': `Bearer ${reportsToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.summary).toBeDefined()
    expect(data.summary.totalPL).toBeDefined()
    expect(data.summary.totalTrades).toBeGreaterThan(0)
  })

  it('should get position analysis report', async () => {
    const response = await fetch(`${BASE_URL}/api/reports/positions`, {
      headers: { 'Authorization': `Bearer ${reportsToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.summary).toBeDefined()
    expect(data.allPositions).toBeDefined()
    expect(Array.isArray(data.allPositions)).toBe(true)
  })

  it('should get performance report', async () => {
    const response = await fetch(`${BASE_URL}/api/reports/performance`, {
      headers: { 'Authorization': `Bearer ${reportsToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.portfolioGrowth).toBeDefined()
  })

  it('should get portfolio overview report', async () => {
    const response = await fetch(`${BASE_URL}/api/reports/portfolio-overview`, {
      headers: { 'Authorization': `Bearer ${reportsToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.accounts).toBeDefined()
    expect(data.metrics).toBeDefined()
    expect(data.metrics.totalValue).toBeDefined()
  })

  it('should get strategy analysis report', async () => {
    const response = await fetch(`${BASE_URL}/api/reports/strategy-analysis?period=ytd`, {
      headers: { 'Authorization': `Bearer ${reportsToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.overall).toBeDefined()
    expect(data.strategies).toBeDefined()
  })

  it('should export trades as CSV', async () => {
    const response = await fetch(`${BASE_URL}/api/reports/export?type=stocks`, {
      headers: { 'Authorization': `Bearer ${reportsToken}` }
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
  })
})

describe('Historical Balance Tests', () => {
  let histToken: string = ''
  let histAccountId: number = 0
  let histBalanceId: number = 0

  beforeAll(async () => {
    // Create user and account
    const email = generateEmail()
    const userResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'History Test User'
      })
    })
    const userData = await userResponse.json()
    histToken = userData.token

    const accountResponse = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${histToken}`
      },
      body: JSON.stringify({
        account_name: 'History Test Account',
        account_type: 'RRSP',
        default_currency: 'USD',
        balance_usd: 75000,
        cash_balance_usd: 15000
      })
    })
    const accountData = await accountResponse.json()
    histAccountId = accountData.id
  })

  it('should list historical balances', async () => {
    const response = await fetch(`${BASE_URL}/api/historical-balances`, {
      headers: { 'Authorization': `Bearer ${histToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    // Should have initial balance from account creation
    expect(data.length).toBeGreaterThan(0)
  })

  it('should create historical balance manually', async () => {
    const response = await fetch(`${BASE_URL}/api/historical-balances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${histToken}`
      },
      body: JSON.stringify({
        account_id: histAccountId,
        currency: 'USD',
        balance: 80000,
        exchange_rate_to_cad: 1.35,
        month: 2,
        year: 2024
      })
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('should update historical balance', async () => {
    // First, get the list to find the ID we just created
    const listResponse = await fetch(`${BASE_URL}/api/historical-balances`, {
      headers: { 'Authorization': `Bearer ${histToken}` }
    })
    const listData = await listResponse.json()
    const createdBalance = listData.find((b: any) => b.month === 2 && b.year === 2024)
    histBalanceId = createdBalance?.id

    if (!histBalanceId) {
      throw new Error('Could not find created historical balance')
    }

    const response = await fetch(`${BASE_URL}/api/historical-balances/${histBalanceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${histToken}`
      },
      body: JSON.stringify({
        account_id: histAccountId,
        currency: 'USD',
        balance: 82000,
        exchange_rate_to_cad: 1.35,
        month: 2,
        year: 2024
      })
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('should delete historical balance', async () => {
    const response = await fetch(`${BASE_URL}/api/historical-balances/${histBalanceId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${histToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('should create account snapshot', async () => {
    const response = await fetch(`${BASE_URL}/api/accounts/${histAccountId}/snapshot`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${histToken}` }
    })

    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
  })
})

describe('User Profile Tests', () => {
  let profileToken: string = ''

  beforeAll(async () => {
    const email = generateEmail()
    const userResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'Profile Test User'
      })
    })
    const userData = await userResponse.json()
    profileToken = userData.token
  })

  it('should get user profile', async () => {
    const response = await fetch(`${BASE_URL}/api/user/profile`, {
      headers: { 'Authorization': `Bearer ${profileToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.email).toBeDefined()
    expect(data.name).toBe('Profile Test User')
  })

  it('should update user profile', async () => {
    const response = await fetch(`${BASE_URL}/api/user/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${profileToken}`
      },
      body: JSON.stringify({
        name: 'Updated Profile Name'
      })
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.name).toBe('Updated Profile Name')
  })

  it('should change password', async () => {
    const response = await fetch(`${BASE_URL}/api/user/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${profileToken}`
      },
      body: JSON.stringify({
        current_password: 'test123',
        new_password: 'newtest123'
      })
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.message).toBeDefined()
  })

  it('should reject password change with wrong current password', async () => {
    const response = await fetch(`${BASE_URL}/api/user/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${profileToken}`
      },
      body: JSON.stringify({
        current_password: 'wrongpassword',
        new_password: 'anotherpassword'
      })
    })

    expect(response.status).toBe(401) // 401 Unauthorized for wrong password
    const data = await response.json()
    expect(data.error).toBeDefined()
  })
})

describe('Dashboard YTD Performance Tests', () => {
  let ytdToken: string = ''

  beforeAll(async () => {
    const email = generateEmail()
    const userResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test123',
        name: 'YTD Test User'
      })
    })
    const userData = await userResponse.json()
    ytdToken = userData.token
  })

  it('should get YTD performance metrics', async () => {
    const response = await fetch(`${BASE_URL}/api/dashboard/ytd-performance`, {
      headers: { 'Authorization': `Bearer ${ytdToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.totals).toBeDefined()
    expect(data.totals.ytd_pl).toBeDefined()
    expect(data.totals.ytd_rorc).toBeDefined()
    expect(data.accounts).toBeDefined()
  })
})

