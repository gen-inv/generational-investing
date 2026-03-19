# Dividend API Investigation - Issue Report

**Date**: March 19, 2026  
**Status**: ⚠️ API Not Accessible  
**Issue**: HTTP 404 errors for all tickers

## Problem Summary

When attempting to fetch dividends from the DividendTracker API, all requests return HTTP 404 errors:
- Tested tickers: ACN, CMG, FTN.TO, GOOGL, LULU, MSTY, NFLX, NVDA, OXY, SEG, UNH
- Error: HTTP 404 for all requests
- API Host: `dividendtracker1.p.rapidapi.com`
- API Key: `5ff5e3f871mshc8a7432cf8d3651p1fa404jsn0cfc7560bb4e`

## Investigation Results

### Endpoints Tested

1. **`/history/{ticker}`** (from original curl example)
   ```bash
   curl https://dividendtracker1.p.rapidapi.com/history/AAPL
   Result: "No such app" (Heroku error page)
   ```

2. **`/v1/dividends?ticker={ticker}`**
   ```bash
   curl https://dividendtracker1.p.rapidapi.com/v1/dividends?ticker=AAPL
   Result: {"message":"Endpoint '/v1/dividends' does not exist"}
   ```

3. **`/{ticker}`** (ticker at root)
   ```bash
   curl https://dividendtracker1.p.rapidapi.com/AAPL
   Result: {"message":"Endpoint '/AAPL' does not exist"}
   ```

4. **`/?ticker={ticker}`** (query parameter)
   ```bash
   curl https://dividendtracker1.p.rapidapi.com/?ticker=AAPL
   Result: {"message":"Endpoint '/' does not exist"}
   ```

## Root Cause Analysis

The API appears to be either:
1. **Not active/deployed**: The Heroku "No such app" error suggests the service isn't running
2. **Subscription issue**: The API key might not be subscribed to this API
3. **Incorrect API host**: The endpoint URL might have changed

## Recommended Solutions

### Option 1: Use Yahoo Finance API (Recommended)

Yahoo Finance provides comprehensive dividend data through RapidAPI.

**API**: `yahoo-finance15.p.rapidapi.com`  
**Endpoint**: `/api/v1/markets/stock/dividends?symbol={ticker}`  
**Subscription**: Need to subscribe with RapidAPI key

**Advantages**:
- Well-documented and reliable
- Comprehensive dividend history
- Supports all major stock exchanges
- Active and maintained

**Sample Request**:
```bash
curl --request GET \
  --url "https://yahoo-finance15.p.rapidapi.com/api/v1/markets/stock/dividends?symbol=AAPL" \
  --header 'x-rapidapi-host: yahoo-finance15.p.rapidapi.com' \
  --header 'x-rapidapi-key: YOUR_KEY_HERE'
```

**Expected Response**:
```json
{
  "body": [
    {
      "date": "2026-02-14",
      "amount": 0.25,
      "type": "DIVIDEND"
    }
  ]
}
```

### Option 2: Use Free Alternative APIs

#### A. Financial Modeling Prep (FMP)
- **Website**: https://financialmodelingprep.com/
- **Free Tier**: 250 requests/day
- **Endpoint**: `/api/v3/historical-price-full/stock_dividend/{ticker}`
- **No RapidAPI required**

**Sample Request**:
```bash
curl "https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/AAPL?apikey=YOUR_KEY"
```

#### B. Alpha Vantage
- **Website**: https://www.alphavantage.co/
- **Free Tier**: 500 requests/day
- **Function**: `DIVIDENDS`
- **No RapidAPI required**

**Sample Request**:
```bash
curl "https://www.alphavantage.co/query?function=DIVIDENDS&symbol=AAPL&apikey=YOUR_KEY"
```

#### C. Polygon.io
- **Website**: https://polygon.io/
- **Free Tier**: 5 API calls/minute
- **Endpoint**: `/v3/reference/dividends`
- **No RapidAPI required**

### Option 3: Use yfinance (Python Library) via API wrapper

Create a simple Python service that uses `yfinance` library:

**Pros**:
- Free and unlimited
- No API key required
- Comprehensive data

**Cons**:
- Requires hosting a Python service
- Not as real-time as paid APIs

## Immediate Action Required

**For user**: Please choose one of the following options:

### Option A: Subscribe to Yahoo Finance API on RapidAPI
1. Go to: https://rapidapi.com/sparior/api/yahoo-finance15
2. Subscribe with your RapidAPI key
3. Update API configuration in the app

### Option B: Get Free API Key
1. **Financial Modeling Prep** (Recommended for free tier):
   - Sign up at: https://financialmodelingprep.com/register
   - Get free API key (250 requests/day)
   - Update app to use FMP endpoint

2. **Alpha Vantage**:
   - Sign up at: https://www.alphavantage.co/support/#api-key
   - Get free API key (500 requests/day)  
   - Update app to use Alpha Vantage endpoint

### Option C: Manual Data Entry (Temporary)
- Manually add dividend data to repository
- Use for testing until API is configured

## Code Changes Needed

Once we select an API, I'll need to update:

1. **API endpoint URL** in `src/index.tsx`
2. **Request format** to match new API
3. **Response parsing** to extract dividend data
4. **Date filtering** to only fetch dividends from Jan 1, 2026 onwards

## Additional Requirement

**Date Filter**: Only fetch dividends from **January 1, 2026** onwards

This will be implemented in the code by:
1. Adding `from_date` parameter to API requests (if supported)
2. Filtering response data to exclude dividends before 2026-01-01
3. Reducing API calls and storage

**Implementation**:
```typescript
const MIN_DATE = '2026-01-01';

// Filter dividends
const recentDividends = dividends.filter(div => {
  return div.ex_date >= MIN_DATE;
});
```

## Next Steps

1. **User Decision**: Choose API provider (Option A or B recommended)
2. **Get API Key**: Subscribe or sign up for chosen API
3. **Update Code**: I'll modify the dividend fetching code
4. **Test**: Verify dividends are fetched correctly
5. **Deploy**: Push updated code to production

## Estimated Timeline

- **API subscription**: 5 minutes
- **Code updates**: 30 minutes
- **Testing**: 15 minutes
- **Deployment**: 5 minutes
- **Total**: ~1 hour

## Recommendation

I recommend **Financial Modeling Prep (FMP)** because:
- ✅ Free tier with 250 requests/day
- ✅ No RapidAPI dependency
- ✅ Comprehensive dividend data
- ✅ Simple REST API
- ✅ Well-documented
- ✅ Reliable uptime

Once you decide which API to use, I'll update the code immediately.

---

**Status**: Waiting for user decision on API provider  
**Blocker**: DividendTracker API not accessible  
**Action**: Choose alternative API and provide key
