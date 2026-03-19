# Canadian Stock Dividend Data - API Options Research

**Date**: March 19, 2026  
**Issue**: FTN.TO (Canadian stock) returns 0 dividends from Polygon.io (Massive)  
**Root Cause**: Polygon.io only supports US exchanges (NYSE, NASDAQ, etc.)

## Current Situation

### Working (US Stocks) ✅
Your US holdings work perfectly with Polygon.io (Massive):
- ACN, CMG, GOOGL, GOOY, LULU, MSTY, NFLX, NFLY, NVDA, NVDY, OXY, SEG, UNH

### Not Working (Canadian Stocks) ❌
Canadian holdings return empty results:
- **FTN.TO** (Middlefield Canadian Income Trust) - TSX listed
- Any other *.TO, *.V (TSX Venture) tickers

## API Options for Canadian Stocks

### Option 1: EODHD (Recommended) ⭐
**Website**: https://eodhd.com  
**Coverage**: Global including TSX and TSXV  
**Pricing**: Free tier with 1 year of dividend history

**Pros:**
- ✅ Supports Canadian stocks (.TO suffix)
- ✅ Has free tier (1 year history)
- ✅ API format similar to Polygon: simple GET requests
- ✅ Comprehensive data: ex-date, payment date, declaration date, record date, amount

**Cons:**
- ❌ Free users must contact support to activate dividend access
- ❌ Need to register and get API key
- ❌ 1 year history limit on free tier (sufficient for your needs)

**API Format:**
```
GET https://eodhd.com/api/div/FTN.TO?from=2026-01-01&api_token={key}&fmt=json
```

**Response:**
```json
[
  {
    "date": "2026-03-15",
    "declarationDate": "2026-02-15",
    "recordDate": "2026-03-01",
    "paymentDate": "2026-03-15",
    "value": 0.105,
    "unadjustedValue": 0.105,
    "currency": "CAD"
  }
]
```

### Option 2: TMX Money/TMX Group
**Website**: https://www.tmx.com  
**Coverage**: TSX and TSXV official data

**Pros:**
- ✅ Official source for Canadian market data
- ✅ Most accurate and up-to-date

**Cons:**
- ❌ No public API - enterprise only
- ❌ Very expensive (institutional pricing)
- ❌ Not practical for individual use

### Option 3: Yahoo Finance (yfinance library)
**Coverage**: Global including Canadian stocks

**Pros:**
- ✅ Free and unlimited
- ✅ Covers Canadian stocks
- ✅ Python library available (yfinance)

**Cons:**
- ❌ Not an official API (web scraping)
- ❌ Rate limiting unpredictable
- ❌ Can break when Yahoo changes website
- ❌ Terms of service concerns
- ❌ Already tried and got blocked ("Too Many Requests")

### Option 4: Manual Entry
**Coverage**: Any stock you manually add

**Pros:**
- ✅ Free
- ✅ 100% accurate (you control the data)
- ✅ No API dependencies
- ✅ Works for any stock worldwide

**Cons:**
- ❌ Time consuming
- ❌ Error prone
- ❌ Requires manual updates
- ❌ Not automated

## Recommended Implementation Strategy

### Phase 1: Dual API Approach (Recommended) ⭐

Implement fallback logic:

```typescript
async function fetchDividends(ticker: string) {
  // Detect exchange
  if (ticker.endsWith('.TO') || ticker.endsWith('.V')) {
    // Canadian stock - use EODHD
    return fetchFromEODHD(ticker)
  } else {
    // US stock - use Polygon.io (Massive)
    return fetchFromPolygon(ticker)
  }
}
```

**Benefits:**
- Best of both worlds
- US stocks: fast, free, 250 calls/day
- Canadian stocks: reliable, structured data
- Single unified dividend repository

**Requirements:**
1. Sign up at https://eodhd.com/register
2. Get free API key
3. Contact support@eodhistoricaldata.com to activate dividend access
4. Add EODHD integration alongside Polygon.io

**Estimated Implementation Time:** 2-3 hours

### Phase 2: Alternative Approaches

**2A: EODHD Only**
- Replace Polygon with EODHD for everything
- Simpler single API
- Free tier limits: 1 year history, need to contact support

**2B: Manual for Canadian**
- Keep Polygon for US stocks
- Manually enter FTN.TO dividends when declared
- Simple, no additional API integration needed

**2C: Wait and Monitor**
- Use Polygon for US stocks now
- Manually track FTN.TO for now
- Evaluate more APIs as needed

## Implementation Details for Dual API

### API Key Storage
```typescript
const POLYGON_API_KEY = 'x4VbKUBkKwYB10ObRLoRt9eDqfcClxEW'  // Current
const EODHD_API_KEY = 'YOUR_KEY_HERE'  // After registration
```

### Ticker Detection
```typescript
function getExchange(ticker: string): 'US' | 'CA' | 'OTHER' {
  if (ticker.endsWith('.TO')) return 'CA'  // TSX
  if (ticker.endsWith('.V')) return 'CA'   // TSXV
  return 'US'  // Default to US
}
```

### API Mapping
```typescript
async function fetchDividendsWithFallback(ticker: string, apiKey: string) {
  const exchange = getExchange(ticker)
  
  if (exchange === 'CA') {
    // EODHD for Canadian stocks
    const url = `https://eodhd.com/api/div/${ticker}?from=2026-01-01&api_token=${EODHD_API_KEY}&fmt=json`
    const response = await fetch(url)
    return parseEODHDResponse(response)
  } else {
    // Polygon for US stocks
    const url = `https://api.polygon.io/v3/reference/dividends?ticker=${ticker}&apiKey=${POLYGON_API_KEY}`
    const response = await fetch(url)
    return parsePolygonResponse(response)
  }
}
```

### Response Normalization
```typescript
interface NormalizedDividend {
  ticker: string
  ex_date: string
  pay_date: string
  record_date?: string
  declared_date?: string
  amount: number
  currency: string
  frequency?: number
}

function parseEODHDResponse(data: any[]): NormalizedDividend[] {
  return data.map(div => ({
    ticker: ticker,
    ex_date: div.date,
    pay_date: div.paymentDate,
    record_date: div.recordDate,
    declared_date: div.declarationDate,
    amount: div.value,
    currency: div.currency || 'CAD',
    frequency: inferFrequency(data) // Calculate from data
  }))
}
```

## Cost Analysis

### Current: Polygon.io Only
- **US Stocks**: ✅ Free (250/day limit)
- **Canadian Stocks**: ❌ No data
- **Monthly Cost**: $0

### Proposed: Polygon + EODHD
- **US Stocks**: ✅ Free via Polygon (250/day)
- **Canadian Stocks**: ✅ Free via EODHD (1 year history)
- **Monthly Cost**: $0
- **Setup**: Contact EODHD support once

### Alternative: EODHD Paid
If you need >1 year history:
- **All-World Plan**: $79.99/month
- **US + CA Coverage**: Full historical data
- **Not needed for your use case** (2026 onwards is <1 year)

## Next Steps

**Recommended Path:**

1. **Sign up for EODHD** (5 minutes)
   - Go to https://eodhd.com/register
   - Create free account
   - Get API key

2. **Request Dividend Access** (1-2 business days)
   - Email support@eodhistoricaldata.com
   - Subject: "Activate dividend access for free account"
   - Message: "Please activate 1-year dividend history access for my free account"

3. **Test FTN.TO** (5 minutes)
   - Test API with your key
   - Verify data quality
   - Check response format

4. **Implement Dual API** (2-3 hours)
   - Add EODHD integration
   - Implement exchange detection
   - Add response normalization
   - Update error handling
   - Test full portfolio

5. **Deploy and Verify** (30 minutes)
   - Build and deploy
   - Run full fetch
   - Verify US and Canadian stocks both work

**Total Time**: ~1 week (mostly waiting for support response)

## Decision Required

Which approach do you prefer?

**Option A**: Dual API (Polygon + EODHD) - Recommended ⭐
- Best coverage, free, reliable
- Requires signup and waiting for support

**Option B**: Manual Canadian Stocks
- Quick solution, no new API
- Requires manual dividend entry for FTN.TO

**Option C**: Wait and Evaluate
- Current system works for US stocks
- Monitor Canadian dividend announcements manually
- Add API later if needed

Let me know your preference and I can implement right away!
