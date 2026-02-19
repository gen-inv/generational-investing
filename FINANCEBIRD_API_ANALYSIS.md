# FinanceBird API Usage Analysis

## Overview
Your application uses the **FinanceBird API** (via RapidAPI) to fetch financial data for companies. Based on code analysis, here's where the API is being called and potential optimization opportunities.

---

## Current API Call Locations

### 1. **Company Creation** (`POST /api/companies`)
**Trigger**: When user clicks "Add Company" and submits the form with a ticker symbol

**API Calls Made**: **2 FinanceBird API calls per company**
- **Call 1**: Profile endpoint → `https://financebird.p.rapidapi.com/quote/{ticker}/profile`
  - Purpose: Fetch sector and industry data
- **Call 2**: Summary endpoint → `https://financebird.p.rapidapi.com/quote/{ticker}/summary`
  - Purpose: Fetch market cap and earnings date

**Location in Code**:
- Backend: `/src/index.tsx` lines 425-490 (`fetchCompanyData` function)
- Frontend: `/public/static/app.js` line 1376
- Page: **Companies** tab

**Example**:
```
User adds "AAPL" → 2 API calls
User adds "MSFT" → 2 API calls
User adds "GOOGL" → 2 API calls
Total: 6 API calls for 3 companies
```

---

### 2. **Fetch Earnings Date** (`POST /api/companies/:id/fetch-earnings`)
**Trigger**: When user opens company details modal and clicks "Fetch Earnings Date" button

**API Calls Made**: **1 FinanceBird API call**
- **Call**: Summary endpoint → `https://financebird.p.rapidapi.com/quote/{ticker}/summary`
  - Purpose: Fetch updated earnings date

**Location in Code**:
- Backend: `/src/index.tsx` lines 615-721 (`/api/companies/:id/fetch-earnings`)
- Frontend: `/public/static/app.js` line 1510-1554 (`fetchEarningsDate` function)
- Page: **Companies** tab (via company details modal)

**Example**:
```
User clicks "View" on AAPL → modal opens
User clicks "Fetch Earnings Date" → 1 API call
User clicks "View" on MSFT → modal opens
User clicks "Fetch Earnings Date" → 1 API call
Total: 2 API calls for 2 refreshes
```

---

## Total API Usage Summary

| Action | API Calls | Triggered By |
|--------|-----------|--------------|
| Add 1 Company | 2 calls | User submits "Add Company" form |
| Fetch Earnings (1 company) | 1 call | User clicks "Fetch Earnings Date" in modal |

---

## Potential Causes of High API Usage

### 🔴 **High-Usage Scenarios**

1. **Bulk Company Imports**
   - If you imported 50 companies → **100 API calls** (50 × 2)
   - If you imported 100 companies → **200 API calls** (100 × 2)

2. **Repeated Earnings Fetches**
   - Each time "Fetch Earnings Date" is clicked → **1 API call**
   - If done for 50 companies → **50 API calls**

3. **Testing/Development**
   - Repeatedly adding/deleting the same companies for testing
   - Each delete + re-add = 2 new API calls

4. **Multiple Users** (if applicable)
   - Each user adding their own companies = 2 API calls per company per user

---

## Recommended Optimizations

### ✅ **1. Cache FinanceBird Data in Database**
**Problem**: Every company creation makes 2 fresh API calls even if we already have the data

**Solution**: Create a caching table for FinanceBird responses
```sql
CREATE TABLE financebird_cache (
  ticker TEXT PRIMARY KEY,
  sector TEXT,
  industry TEXT,
  market_cap REAL,
  next_earnings_date TEXT,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);
```

**Logic**:
- Before calling FinanceBird API, check cache
- If cache exists and `expires_at > NOW()` → use cached data
- If cache expired or missing → call API and update cache
- Set expiry: 24 hours for most data, 7 days for sector/industry

**Savings**: Could reduce from **2 API calls** to **0 API calls** for duplicate companies

---

### ✅ **2. Reduce Duplicate Calls**
**Problem**: Profile and Summary endpoints both called for same ticker

**Current Flow**:
```
Add AAPL:
  1. Call /profile → get sector, industry
  2. Call /summary → get market cap, earnings
```

**Optimization**: Check if Summary endpoint returns sector/industry too
- If YES → eliminate Profile call, use Summary only → **50% reduction**
- If NO → keep both calls but cache results

---

### ✅ **3. Batch Earnings Updates**
**Problem**: Users might click "Fetch Earnings Date" for many companies

**Solution**: Add "Refresh All Earnings" button
```javascript
// Backend: New endpoint
app.post('/api/companies/batch-fetch-earnings', async (c) => {
  const companies = await DB.prepare('SELECT id, ticker FROM companies WHERE user_id = ?').all()
  const results = []
  
  for (const company of companies.results) {
    const earnings = await fetchEarningsDate(company.ticker)
    await updateEarningsInDB(company.id, earnings)
    results.push({ ticker: company.ticker, earnings })
  }
  
  return c.json({ results })
})
```

**Rate Limiting**: Add delay between calls to respect API limits
```javascript
await new Promise(resolve => setTimeout(resolve, 1000)) // 1 second delay
```

---

### ✅ **4. Smart Earnings Refresh**
**Problem**: Earnings dates only change every 3 months

**Solution**: Only fetch if earnings date is near or past
```javascript
// Before fetching, check if refresh is needed
const company = await getCompany(id)
const earningsDate = new Date(company.next_earnings_date)
const today = new Date()

if (earningsDate > today) {
  // Earnings date is in future and still valid
  return { message: "Earnings date is current, no refresh needed" }
} else {
  // Earnings date has passed, fetch new one
  return await fetchFromFinanceBird(company.ticker)
}
```

**Savings**: Prevents unnecessary API calls for companies with future earnings dates

---

### ✅ **5. Bulk Import with Deduplication**
**Problem**: User might try to add same company multiple times

**Solution**: Check if company already exists before API call
```javascript
// Before fetching from FinanceBird
const existing = await DB.prepare('SELECT * FROM companies WHERE ticker = ? AND user_id = ?')
  .bind(ticker, userId).first()

if (existing) {
  return c.json({ 
    message: "Company already exists in your portfolio",
    company: existing 
  }, 200)
}

// Only call API if company doesn't exist
const apiData = await fetchFromFinanceBird(ticker)
```

---

### ✅ **6. Yahoo Finance as Primary (Free Fallback)**
**Problem**: FinanceBird costs money per call, Yahoo is free

**Solution**: Use Yahoo Finance as primary, FinanceBird as fallback
```javascript
// Try Yahoo first (free)
const yahooData = await fetchFromYahoo(ticker)

if (yahooData.hasAllRequiredFields()) {
  return yahooData // No FinanceBird call needed
} else {
  // Only call FinanceBird if Yahoo is missing critical data
  const financeBirdData = await fetchFromFinanceBird(ticker)
  return mergeData(yahooData, financeBirdData)
}
```

**Current Issue**: Code already calls Yahoo first but ALWAYS calls FinanceBird too (lines 425-490)

**Fix**: Make FinanceBird conditional
```typescript
// Step 2: Only call FinanceBird if Yahoo data is incomplete
if (rapidApiKey && (!sector || !industry || !nextEarningsDate)) {
  // Only fetch missing data from FinanceBird
}
```

---

## Immediate Action Items

### 🎯 **Priority 1: Prevent Duplicate Company Adds**
**Impact**: Biggest immediate savings
```javascript
// Add check before API call in POST /api/companies
const existing = await c.env.DB.prepare(
  'SELECT id FROM companies WHERE ticker = ? AND user_id = ?'
).bind(ticker.toUpperCase(), userId).first()

if (existing) {
  return c.json({ 
    error: 'Company already exists in your portfolio' 
  }, 409)
}
```

### 🎯 **Priority 2: Add Database Caching**
**Impact**: Reduces calls for same ticker across users and re-adds
- Implement `financebird_cache` table
- 24-hour cache for earnings, 7-day cache for sector/industry

### 🎯 **Priority 3: Make FinanceBird Conditional**
**Impact**: Use free Yahoo data when available
- Only call FinanceBird if Yahoo is missing critical fields

---

## Estimated Savings

| Optimization | Current Calls | Optimized Calls | Savings |
|--------------|---------------|-----------------|---------|
| Dedup check | 2 per duplicate add | 0 | 100% |
| Cache (24hr) | 2 per company/day | 2 per company/day (first time only) | ~95% on repeat |
| Yahoo primary | 2 per company | 0-2 per company | 0-100% |
| Smart earnings refresh | 1 per click | 0 if current | ~70% |

**Example**: If you added 50 companies, deleted them, and re-added:
- **Current**: 200 API calls (50 × 2 × 2 times)
- **With dedup**: 100 API calls (50 × 2 × 1 time)
- **With cache**: 100 API calls (cached on second add)
- **Total Savings**: 100 API calls (50%)

---

## Monitoring Recommendations

### Add API Call Logging
```typescript
// Log every FinanceBird API call
console.log(`[FinanceBird API] ${new Date().toISOString()} - ${endpoint} - ${ticker}`)

// Count daily API calls
await DB.prepare(`
  INSERT INTO api_call_logs (service, endpoint, ticker, user_id, timestamp)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
`).bind('FinanceBird', endpoint, ticker, userId).run()
```

### Create Dashboard
- Total API calls today/this month
- Calls per endpoint (profile vs summary)
- Calls per user (identify heavy users)
- Cache hit rate

---

## Questions to Investigate

1. **How many companies do you currently have?**
   - Run: `SELECT COUNT(*) FROM companies`

2. **Are there duplicate tickers across users?**
   - Run: `SELECT ticker, COUNT(*) as count FROM companies GROUP BY ticker HAVING count > 1`

3. **How many times have you clicked "Fetch Earnings Date"?**
   - Check logs or add logging to track

4. **Did you do any bulk imports or testing?**
   - Review recent activity in Companies tab

---

## Next Steps

1. **Run diagnostic queries** (see above)
2. **Implement deduplication check** (Priority 1)
3. **Add database caching** (Priority 2)
4. **Test with a few companies** to verify savings
5. **Deploy optimizations** to production
6. **Monitor API usage** for 1 week
7. **Adjust cache expiry** based on usage patterns

---

## Contact
If you need help implementing any of these optimizations, let me know which ones you'd like to prioritize!
