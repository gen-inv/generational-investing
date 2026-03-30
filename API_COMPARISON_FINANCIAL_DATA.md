# Financial Data APIs Comparison for 10-Year Historical Fundamentals

## Summary Recommendation

**For free 10-year historical fundamentals**: None of the major APIs offer this for free.
- **Alpha Vantage**: Free tier limited to 100 data points, full history requires premium
- **Financial Modeling Prep (FMP)**: Free tier limited to 5 years of annual statements
- **EODHD**: Free tier limited to 1 year of data only, 20 API calls/day

**Best paid option for your needs**: **Financial Modeling Prep Premium ($59/month)** provides 30 years of history with 750 API calls/minute.

---

## Detailed API Comparison

### 1. Alpha Vantage

#### Available Metrics (All Covered)
✅ **Income Statement**: Revenue, EPS, Net Income, Operating Income
✅ **Balance Sheet**: Book Value, Total Equity, Total Debt, Total Assets
✅ **Cash Flow**: Operating Cash Flow, Free Cash Flow
✅ **Dividends**: Historical and future dividend distributions
✅ **Splits**: Historical stock split events
❌ **Stock Buybacks**: Not directly available (may need to calculate from shares outstanding)

#### Pricing & Limits
| Plan | Price | Historical Data | Rate Limit | Coverage |
|------|-------|----------------|------------|----------|
| **Free** | $0 | 100 data points (compact) | 25 calls/day* | US + Global |
| **Premium** | Starting ~$49/mo | 20+ years (full) | Higher | US + Global |

*Note: Free tier rate limit not explicitly stated in docs, but typically 5-25 calls/day

#### API Endpoints
```
# Income Statement (annual & quarterly)
https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=AAPL&apikey=YOUR_KEY

# Balance Sheet (annual & quarterly)
https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=AAPL&apikey=YOUR_KEY

# Cash Flow (annual & quarterly)
https://www.alphavantage.co/query?function=CASH_FLOW&symbol=AAPL&apikey=YOUR_KEY

# Company Overview (ratios, metrics)
https://www.alphavantage.co/query?function=OVERVIEW&symbol=AAPL&apikey=YOUR_KEY

# Earnings History (EPS with estimates)
https://www.alphavantage.co/query?function=EARNINGS&symbol=AAPL&apikey=YOUR_KEY

# Dividends
https://www.alphavantage.co/query?function=DIVIDENDS&symbol=AAPL&apikey=YOUR_KEY

# Splits
https://www.alphavantage.co/query?function=SPLITS&symbol=AAPL&apikey=YOUR_KEY
```

#### Pros
- Simple, well-documented API
- Good free tier for testing
- Global coverage
- JSON and CSV formats

#### Cons
- Free tier severely limited (100 data points)
- Premium required for 10+ years of data
- Lower rate limits compared to FMP

---

### 2. Financial Modeling Prep (FMP)

#### Available Metrics (All Covered)
✅ **Revenue**: Income statement API
✅ **EPS**: Income statement + earnings API
✅ **Book Value**: Balance sheet (total equity / shares)
✅ **Equity**: Balance sheet (total shareholders' equity)
✅ **Operating Cash Flow**: Cash flow statement
✅ **Net Income**: Income statement
✅ **Debt**: Balance sheet (total debt, long-term debt, short-term debt)
✅ **Invested Capital**: Can calculate from balance sheet (debt + equity - cash)
✅ **Dividends**: Historical dividends API
✅ **Stock Buybacks**: Can derive from shares outstanding changes

#### Pricing & Limits
| Plan | Price | API Calls | Historical Data | Coverage |
|------|-------|-----------|----------------|----------|
| **Free** | $0 | 250/day | **5 years** (annual) | US only |
| **Starter** | $22/mo | 300/min | **5 years** | US only |
| **Premium** | $59/mo | 750/min | **30 years** | US + UK + Canada |
| **Enterprise** | $149/mo | 3000/min | **30 years** | Global |

#### API Endpoints
```
# Income Statement (annual & quarterly)
https://financialmodelingprep.com/api/v3/income-statement/AAPL?period=annual&apikey=YOUR_KEY

# Balance Sheet (annual & quarterly)
https://financialmodelingprep.com/api/v3/balance-sheet-statement/AAPL?period=annual&apikey=YOUR_KEY

# Cash Flow Statement (annual & quarterly)
https://financialmodelingprep.com/api/v3/cash-flow-statement/AAPL?period=annual&apikey=YOUR_KEY

# Key Metrics (P/E, ROE, etc.)
https://financialmodelingprep.com/api/v3/key-metrics/AAPL?period=annual&apikey=YOUR_KEY

# Financial Ratios
https://financialmodelingprep.com/api/v3/ratios/AAPL?period=annual&apikey=YOUR_KEY

# Dividends
https://financialmodelingprep.com/api/v3/historical-price-full/stock/dividend/AAPL?apikey=YOUR_KEY

# Stock Splits
https://financialmodelingprep.com/api/v3/historical-price-full/stock/split/AAPL?apikey=YOUR_KEY

# Company Profile
https://financialmodelingprep.com/api/v3/profile/AAPL?apikey=YOUR_KEY

# Enterprise Values
https://financialmodelingprep.com/api/v3/enterprise-values/AAPL?period=annual&apikey=YOUR_KEY

# Historical Market Cap
https://financialmodelingprep.com/api/v3/historical-market-capitalization/AAPL?limit=100&apikey=YOUR_KEY

# Shares Outstanding
https://financialmodelingprep.com/api/v3/shares_float?symbol=AAPL&apikey=YOUR_KEY
```

#### Pros
- **Best value for paid plans** ($59/mo for 30 years)
- Excellent API documentation
- High rate limits (750 calls/min on premium)
- Comprehensive fundamental data coverage
- Free tier offers 5 years (better than most)
- 250 calls/day on free tier (good for testing)

#### Cons
- Free tier limited to 5 years (not 10)
- US-only coverage on free/starter plans
- Premium required for 10+ years of data

---

### 3. EODHD (End of Day Historical Data)

#### Available Metrics (All Covered)
✅ **Revenue, EPS, Net Income**: Fundamental data API
✅ **Book Value, Equity, Debt**: Balance sheet in fundamental API
✅ **Operating Cash Flow**: Cash flow statement
✅ **Dividends**: Historical dividends API
✅ **Stock Buybacks**: May be in fundamental data
✅ **All other metrics**: Comprehensive fundamental data

#### Pricing & Limits
| Plan | Price | API Calls | Historical Data | Coverage |
|------|-------|-----------|----------------|----------|
| **Free** | $0 | 20/day | **1 year** | Limited data types |
| **All-World** | $19.99/mo | 100k/day, 1k/min | **30+ years** | 60+ exchanges, 150k tickers |
| **All-World Extended** | $29.99/mo | 100k/day, 1k/min | **30+ years** | + Intraday data |
| **Data Feed** | $79.99/mo | 100k/day, 1k/min | **30+ years** | + Real-time |

#### Historical Data Coverage
- **Major US Companies**: From 1985 (30+ years)
- **Non-US Companies**: From 2000 (21+ years)
- **Minor Companies**: Last 6 years
- **Dividends & EOD**: From earliest available (e.g., Ford from 1972)

#### API Endpoint
```
# Fundamental Data (all-in-one endpoint)
https://eodhd.com/api/fundamentals/AAPL.US?api_token=YOUR_TOKEN

# Returns comprehensive JSON with:
# - General company info
# - Highlights (market cap, P/E, dividends, etc.)
# - Valuation metrics
# - Financials:
#   - Income Statement (annual & quarterly)
#   - Balance Sheet (annual & quarterly)
#   - Cash Flow (annual & quarterly)
# - Earnings history
# - Dividends & Splits history
# - Outstanding shares
# - ESG scores
```

#### Pros
- **Excellent value** ($19.99/mo for 30+ years)
- **Highest rate limits** (100k calls/day, 1k/min)
- Comprehensive global coverage (60+ exchanges)
- All-in-one fundamental data endpoint
- Very long historical data (back to 1985 for major US stocks)
- Student discount: 50% off for 12 months

#### Cons
- **Free tier severely limited** (20 calls/day, 1 year of data)
- Not suitable for free-tier 10-year requirement
- Must pay to access fundamental data

---

## Comparison Table: Free Tier Capabilities

| Feature | Alpha Vantage | FMP | EODHD |
|---------|---------------|-----|--------|
| **Price** | Free | Free | Free |
| **API Calls/Day** | ~25 (not stated) | 250 | 20 |
| **Historical Fundamental Data** | 100 data points | **5 years** | **1 year** |
| **Revenue** | ❌ (100 pts) | ✅ 5 yrs | ❌ 1 yr |
| **EPS** | ❌ (100 pts) | ✅ 5 yrs | ❌ 1 yr |
| **Balance Sheet** | ❌ (100 pts) | ✅ 5 yrs | ❌ 1 yr |
| **Cash Flow** | ❌ (100 pts) | ✅ 5 yrs | ❌ 1 yr |
| **Dividends** | ❌ (100 pts) | ✅ 5 yrs | ❌ 1 yr |
| **Stock Buybacks** | ❌ | ~✅ (calc) | ❌ |
| **Coverage** | Global | US only | Limited |
| **Best For** | Testing API | **Best free tier** | Not suitable |

---

## Comparison Table: Paid Plans for 10+ Years

| Feature | Alpha Vantage Premium | FMP Premium | EODHD All-World |
|---------|----------------------|-------------|-----------------|
| **Price** | ~$49+/mo | **$59/mo** | **$19.99/mo** |
| **API Calls** | Medium | 750/min | 100k/day, 1k/min |
| **Historical Data** | 20+ years | **30 years** | **30+ years** |
| **Coverage** | Global | US + UK + Canada | 60+ exchanges |
| **Best For** | Basic needs | **Mid-tier best value** | **Best overall value** |

---

## Recommendations

### For Free 10-Year Historical Data
**❌ Not Available** - No API offers 10 years of historical fundamental data for free.

**Best Workaround:**
- Use **FMP Free Tier** ($0, 250 calls/day) for 5 years of data
- For 10 years, you must upgrade to a paid plan

### For Paid 10-Year Historical Data

#### Option 1: EODHD All-World ($19.99/month) ⭐ BEST VALUE
- **Pros**: Cheapest, highest rate limits (100k/day), 30+ years of data, global coverage
- **Cons**: Requires payment immediately (no 5-year free tier to test)
- **Use Case**: Best for production applications, high-volume needs

#### Option 2: FMP Premium ($59/month) ⭐ BEST MID-TIER
- **Pros**: 30 years of data, 750 calls/min, excellent docs, can test with 5-year free tier
- **Cons**: More expensive than EODHD
- **Use Case**: Best if you want to test with free tier first, then upgrade

#### Option 3: Alpha Vantage Premium (~$49+/month)
- **Pros**: Well-established, simple API
- **Cons**: Lower rate limits, less comprehensive than FMP/EODHD
- **Use Case**: Best if you're already familiar with Alpha Vantage

---

## Implementation Strategy

### Recommended Approach: Start with FMP Free, Upgrade as Needed

#### Phase 1: Testing (Free)
```javascript
// Use FMP Free Tier (250 calls/day, 5 years of data)
const FMP_API_KEY = 'your_free_key';
const BASE_URL = 'https://financialmodelingprep.com/api/v3';

// Fetch 5 years of annual data
const incomeStatement = await fetch(
  `${BASE_URL}/income-statement/AAPL?period=annual&apikey=${FMP_API_KEY}`
);
```

#### Phase 2: Production (Premium - $59/mo)
```javascript
// Upgrade to FMP Premium for 30 years of data
const FMP_API_KEY_PREMIUM = process.env.FMP_PREMIUM_KEY;

// Fetch 10+ years of data (or up to 30 years)
const incomeStatement = await fetch(
  `${BASE_URL}/income-statement/AAPL?period=annual&limit=10&apikey=${FMP_API_KEY_PREMIUM}`
);
```

#### Phase 3: Scale (If needed - switch to EODHD $19.99/mo)
```javascript
// Switch to EODHD for cost savings at scale
const EODHD_TOKEN = process.env.EODHD_API_TOKEN;

// All fundamentals in one call
const fundamentals = await fetch(
  `https://eodhd.com/api/fundamentals/AAPL.US?api_token=${EODHD_TOKEN}`
);
```

---

## Example: Extracting All Required Metrics from FMP

### Single Company Analysis
```javascript
async function fetchCompanyFundamentals(symbol) {
  const BASE_URL = 'https://financialmodelingprep.com/api/v3';
  const API_KEY = process.env.FMP_API_KEY;
  
  // Fetch 10 years of annual data
  const [income, balance, cashflow, keyMetrics, dividends, splits, profile] = await Promise.all([
    fetch(`${BASE_URL}/income-statement/${symbol}?period=annual&limit=10&apikey=${API_KEY}`).then(r => r.json()),
    fetch(`${BASE_URL}/balance-sheet-statement/${symbol}?period=annual&limit=10&apikey=${API_KEY}`).then(r => r.json()),
    fetch(`${BASE_URL}/cash-flow-statement/${symbol}?period=annual&limit=10&apikey=${API_KEY}`).then(r => r.json()),
    fetch(`${BASE_URL}/key-metrics/${symbol}?period=annual&limit=10&apikey=${API_KEY}`).then(r => r.json()),
    fetch(`${BASE_URL}/historical-price-full/stock/dividend/${symbol}?apikey=${API_KEY}`).then(r => r.json()),
    fetch(`${BASE_URL}/historical-price-full/stock/split/${symbol}?apikey=${API_KEY}`).then(r => r.json()),
    fetch(`${BASE_URL}/profile/${symbol}?apikey=${API_KEY}`).then(r => r.json())
  ]);
  
  // Extract metrics for each year
  const metrics = income.map((year, idx) => ({
    fiscalYear: year.date,
    // Income Statement
    revenue: year.revenue,
    netIncome: year.netIncome,
    eps: year.eps,
    epsDiluted: year.epsdiluted,
    operatingIncome: year.operatingIncome,
    
    // Balance Sheet
    totalAssets: balance[idx]?.totalAssets,
    totalEquity: balance[idx]?.totalStockholdersEquity,
    bookValue: balance[idx]?.totalStockholdersEquity / keyMetrics[idx]?.sharesOutstanding,
    totalDebt: balance[idx]?.totalDebt,
    longTermDebt: balance[idx]?.longTermDebt,
    shortTermDebt: balance[idx]?.shortTermDebt,
    
    // Cash Flow
    operatingCashFlow: cashflow[idx]?.operatingCashFlow,
    freeCashFlow: cashflow[idx]?.freeCashFlow,
    capex: cashflow[idx]?.capitalExpenditure,
    
    // Invested Capital (Debt + Equity - Cash)
    investedCapital: (balance[idx]?.totalDebt + balance[idx]?.totalStockholdersEquity - balance[idx]?.cashAndCashEquivalents),
    
    // Key Metrics
    sharesOutstanding: keyMetrics[idx]?.sharesOutstanding,
    marketCap: keyMetrics[idx]?.marketCap,
    peRatio: keyMetrics[idx]?.peRatio,
    pbRatio: keyMetrics[idx]?.pbRatio,
    roe: keyMetrics[idx]?.roe,
    roa: keyMetrics[idx]?.roa
  }));
  
  return {
    symbol,
    companyName: profile[0]?.companyName,
    metrics,
    dividends: dividends.historical,
    splits: splits.historical
  };
}

// Usage
const appleData = await fetchCompanyFundamentals('AAPL');
console.log(appleData);
```

### Stock Buybacks Calculation
```javascript
// Calculate stock buybacks from change in shares outstanding
function calculateBuybacks(metrics) {
  return metrics.map((year, idx) => {
    if (idx === metrics.length - 1) return null; // No previous year
    
    const currentShares = year.sharesOutstanding;
    const previousShares = metrics[idx + 1].sharesOutstanding;
    const shareChange = previousShares - currentShares;
    const avgPrice = (year.marketCap + metrics[idx + 1].marketCap) / 2 / previousShares;
    
    return {
      fiscalYear: year.fiscalYear,
      sharesRepurchased: shareChange > 0 ? shareChange : 0,
      estimatedBuybackValue: shareChange > 0 ? shareChange * avgPrice : 0
    };
  }).filter(x => x);
}
```

---

## Cost Analysis for Different Use Cases

### Scenario 1: Personal Portfolio Tracker (50 stocks)
- **Data Needed**: 10 years, quarterly updates
- **API Calls**: ~200 calls/quarter (50 stocks × 4 endpoints)
- **Recommendation**: **FMP Free Tier** (250/day) → Works!
- **Cost**: $0

### Scenario 2: Investment Research App (500 stocks)
- **Data Needed**: 10 years, monthly updates
- **API Calls**: ~2,000 calls/month (500 stocks × 4 endpoints)
- **Recommendation**: **FMP Premium** ($59/mo) → 750 calls/min
- **Cost**: $59/month

### Scenario 3: Hedge Fund Analytics (10,000 stocks)
- **Data Needed**: 10 years, daily updates
- **API Calls**: ~40,000 calls/day
- **Recommendation**: **EODHD All-World** ($19.99/mo) → 100k calls/day
- **Cost**: $19.99/month (best value!)

---

## Final Recommendation

### For Your Project (10 Years of Historical Data):

1. **Start with FMP Free Tier** ($0/month)
   - Test your implementation with 5 years of data
   - 250 API calls per day
   - Covers all required metrics

2. **Upgrade to FMP Premium** ($59/month) when ready for production
   - Get full 30 years of historical data
   - 750 API calls per minute
   - Excellent documentation and support

3. **Consider EODHD All-World** ($19.99/month) if cost becomes an issue
   - Cheapest option for 30+ years of data
   - Highest rate limits (100k/day)
   - Best value for money at scale

### Implementation Priority:
1. ✅ **Start**: FMP Free Tier (test with 5 years)
2. ✅ **Production**: FMP Premium ($59/mo for 10+ years)
3. ✅ **Scale**: EODHD All-World ($19.99/mo for cost optimization)

---

## Additional Resources

### FMP Documentation
- Main Docs: https://site.financialmodelingprep.com/developer/docs
- Pricing: https://site.financialmodelingprep.com/developer/docs/pricing
- API Key: https://site.financialmodelingprep.com/developer/docs/dashboard

### Alpha Vantage Documentation
- Main Docs: https://www.alphavantage.co/documentation/
- API Key: https://www.alphavantage.co/support/#api-key

### EODHD Documentation
- Main Docs: https://eodhd.com/financial-apis/
- Pricing: https://eodhd.com/pricing
- API Key: Register at https://eodhd.com/

---

## Questions to Consider Before Choosing

1. **How many stocks will you track?** (impacts API call volume)
2. **How often will you fetch data?** (daily, weekly, monthly)
3. **Do you need global coverage or just US?**
4. **Is 5 years enough for initial testing?** (FMP free tier)
5. **What's your monthly budget?** ($0, $20, $60, $150+)
6. **Do you need real-time data or EOD is fine?**

Based on your answers, you can choose the optimal API provider and plan.
