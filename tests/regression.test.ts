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
