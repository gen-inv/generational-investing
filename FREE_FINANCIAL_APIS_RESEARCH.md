# Free Financial APIs Research - 10 Years of Historical Data

## Objective
Find free APIs that provide 10 years of historical financial data for:
- Revenue
- EPS (Earnings Per Share)
- Book Value
- Equity
- Operating Cash Flow
- Net Income
- Debt
- Invested Capital
- Dividends
- Stock Buybacks

## Executive Summary

**❌ TRUE "FREE FOREVER" WITH 10 YEARS: NONE FOUND**

Unfortunately, **NO API** offers completely free access to 10 years of fundamental financial data (income statements, balance sheets, cash flow) for all the metrics you need. Here's why:

### Key Findings:
1. **Financial Modeling Prep (FMP)** - Best option for free tier
   - ✅ 250 calls/day FREE (covers ~5 years of annual statements)
   - ✅ Includes ALL metrics you need
   - ❌ Only 5 years on free tier (need $22/mo for 30 years)
   - ✅ US stocks only on free tier

2. **Alpha Vantage** - Limited fundamental data
   - ✅ Free tier available
   - ❌ Fundamental data is premium-only (income statement, balance sheet, cash flow)
   - ❌ NOT suitable for your needs

3. **EODHD** - Best paid option
   - ❌ NO truly free tier for fundamentals
   - ✅ $19.99/mo for 30+ years of data
   - ✅ Global coverage (US, Canada, UK, EU, Asia)

## Detailed API Comparison

### 1. Financial Modeling Prep (FMP) ⭐ RECOMMENDED

**Free Tier:**
- **Cost**: FREE
- **Rate Limits**: 250 API calls per day
- **Historical Data**: Up to 5 years of annual financial statements
- **Coverage**: US stocks only (NYSE, NASDAQ, AMEX)

**✅ Your Metrics Coverage (FREE Tier):**
| Metric | Available | API Endpoint |
|--------|-----------|--------------|
| Revenue | ✅ Yes | `/income-statement/` |
| EPS | ✅ Yes | `/income-statement/` (eps field) |
| Book Value | ✅ Yes | `/balance-sheet-statement/` |
| Equity | ✅ Yes | `/balance-sheet-statement/` (totalStockholdersEquity) |
| Operating Cash Flow | ✅ Yes | `/cash-flow-statement/` |
| Net Income | ✅ Yes | `/income-statement/` |
| Debt | ✅ Yes | `/balance-sheet-statement/` (totalDebt) |
| Invested Capital | ✅ Calculated | Equity + Debt |
| Dividends | ✅ Yes | `/historical-price-full/stock_dividend/` |
| Stock Buybacks | ⚠️ Partial | Can infer from shares outstanding changes |

**Example API Call (Free Tier):**
```bash
# Get 5 years of income statements
https://financialmodelingprep.com/api/v3/income-statement/AAPL?limit=5&apikey=YOUR_KEY

# Get balance sheet
https://financialmodelingprep.com/api/v3/balance-sheet-statement/AAPL?limit=5&apikey=YOUR_KEY

# Get cash flow
https://financialmodelingprep.com/api/v3/cash-flow-statement/AAPL?limit=5&apikey=YOUR_KEY
```

**Response Example:**
```json
{
  "symbol": "AAPL",
  "date": "2023-09-30",
  "revenue": 383285000000,
  "netIncome": 96995000000,
  "eps": 6.16,
  "operatingCashFlow": 110543000000,
  "totalDebt": 111088000000,
  "totalStockholdersEquity": 62146000000
}
```

**Limitations:**
- ❌ Only 5 years on free tier (need Starter plan $22/mo for 30 years)
- ❌ US stocks only (need Premium $59/mo for Canada/UK)
- ❌ 250 calls/day limit (can fetch ~50 companies per day with 5 endpoints each)
- ❌ Stock buybacks not explicitly provided

**Upgrade Path:**
- **Starter ($22/mo)**: 30 years of data, US only
- **Premium ($59/mo)**: 30 years, Canada + UK coverage
- **Professional ($149/mo)**: Global coverage

### 2. Alpha Vantage ❌ NOT RECOMMENDED

**Free Tier:**
- **Cost**: FREE
- **Rate Limits**: 25 API calls per day (500 calls per day on paid plans)
- **Historical Data**: 20+ years

**❌ Problem: Fundamental Data is PREMIUM ONLY**

Alpha Vantage's free tier does NOT include:
- ❌ Income statements
- ❌ Balance sheets
- ❌ Cash flow statements

The free tier only offers:
- ✅ Stock prices (daily, weekly, monthly)
- ✅ Technical indicators
- ❌ NO fundamental data

**Verdict**: Not suitable for your needs unless you pay for premium.

### 3. EODHD (EOD Historical Data) 💰 BEST PAID OPTION

**Free Tier:**
- **Cost**: FREE (very limited)
- **Coverage**: Demo data only
- ❌ NO real fundamental data on free tier

**Paid Tier ($19.99/mo):**
- ✅ 30+ years of historical fundamental data
- ✅ Global coverage (60+ exchanges)
- ✅ 150,000+ tickers
- ✅ Income statements, balance sheets, cash flow

**✅ Your Metrics Coverage:**
| Metric | Available |
|--------|-----------|
| Revenue | ✅ Yes |
| EPS | ✅ Yes |
| Book Value | ✅ Yes |
| Equity | ✅ Yes |
| Operating Cash Flow | ✅ Yes |
| Net Income | ✅ Yes |
| Debt | ✅ Yes |
| Invested Capital | ✅ Calculated |
| Dividends | ✅ Yes |
| Stock Buybacks | ✅ Yes (share repurchases) |

**Example API Call:**
```bash
https://eodhd.com/api/fundamentals/AAPL.US?api_token=YOUR_TOKEN
```

**Pricing:**
- All Plan: $19.99/mo (30+ years, global coverage)
- All-World Plan: $79.99/mo (everything + real-time data)

### 4. Yahoo Finance (Unofficial/Scraped) ⚠️ RISKY

**Free Tier:**
- **Cost**: FREE (no official API)
- **Coverage**: Global
- **Historical Data**: 10+ years

**✅ Your Metrics Coverage:**
| Metric | Available |
|--------|-----------|
| Revenue | ✅ Yes (via web scraping) |
| EPS | ✅ Yes |
| Book Value | ✅ Yes |
| Equity | ✅ Yes |
| Operating Cash Flow | ✅ Yes |
| Net Income | ✅ Yes |
| Debt | ✅ Yes |
| Invested Capital | ✅ Calculated |
| Dividends | ✅ Yes |
| Stock Buybacks | ⚠️ Partial |

**⚠️ Major Risks:**
- ❌ NO official API (Yahoo discontinued it in 2017)
- ❌ Must use web scraping or unofficial libraries (yfinance Python library)
- ❌ Can break at any time if Yahoo changes their website
- ❌ Violates Terms of Service for commercial use
- ❌ Rate limiting and IP blocking risks

**Example (Python yfinance):**
```python
import yfinance as yf

ticker = yf.Ticker("AAPL")

# Get financials
income_stmt = ticker.financials  # Annual income statement
balance_sheet = ticker.balance_sheet  # Annual balance sheet
cash_flow = ticker.cashflow  # Annual cash flow
```

**Verdict**: Use only for personal projects, NOT for production or commercial applications.

## Recommendation Matrix

| Use Case | Best Option | Cost | Data Range |
|----------|-------------|------|------------|
| **Personal/Learning** | FMP Free or yfinance | FREE | 5 years (FMP) or 10+ (yfinance) |
| **Startup MVP (US only)** | FMP Starter | $22/mo | 30 years |
| **Production (US + Canada)** | FMP Premium | $59/mo | 30 years |
| **Global Coverage** | EODHD All Plan | $19.99/mo | 30 years |
| **Enterprise** | FMP Professional | $149/mo | 30 years, global |

## Final Recommendation: **Financial Modeling Prep**

### Why FMP?
1. **Best free tier**: 250 calls/day, 5 years of data
2. **Covers ALL your metrics**: Revenue, EPS, Book Value, Equity, OCF, Net Income, Debt, Dividends
3. **Clean API**: Well-documented, JSON responses
4. **Affordable upgrades**: $22/mo for 30 years is very reasonable
5. **Reliable**: Official API, not web scraping

### Implementation Strategy:

**Phase 1: Free Tier (5 Years)**
```bash
# Sign up at https://financialmodelingprep.com/
# Get free API key (250 calls/day)

# Fetch 5 years of data for each company:
GET /api/v3/income-statement/{symbol}?limit=5&apikey={key}
GET /api/v3/balance-sheet-statement/{symbol}?limit=5&apikey={key}
GET /api/v3/cash-flow-statement/{symbol}?limit=5&apikey={key}
GET /api/v3/historical-price-full/stock_dividend/{symbol}?apikey={key}

# Calculate derived metrics:
Invested Capital = Total Equity + Total Debt
Book Value Per Share = Total Equity / Shares Outstanding
```

**Phase 2: Upgrade When Needed**
- If you need 10 years: Upgrade to Starter ($22/mo)
- If you need Canadian stocks: Upgrade to Premium ($59/mo)

## Alternative: Hybrid Approach

**For 10 years FREE (with effort):**
1. Use **FMP Free** for recent 5 years
2. Use **yfinance** (Yahoo Finance scraper) for older data (5-10 years ago)
3. Merge the datasets in your application

**Example Python Implementation:**
```python
import requests
import yfinance as yf
import pandas as pd

def get_10_years_free(symbol):
    # Get recent 5 years from FMP (official API)
    fmp_key = "YOUR_FMP_KEY"
    income = requests.get(f"https://financialmodelingprep.com/api/v3/income-statement/{symbol}?limit=5&apikey={fmp_key}").json()
    
    # Get older 5 years from Yahoo Finance (unofficial)
    ticker = yf.Ticker(symbol)
    historical = ticker.financials.T  # Transpose for easier handling
    
    # Merge datasets
    # ... your merge logic here ...
    
    return merged_data
```

## Data Quality Comparison

| API | Data Quality | Reliability | Support |
|-----|--------------|-------------|---------|
| FMP | ⭐⭐⭐⭐⭐ (Excellent) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| EODHD | ⭐⭐⭐⭐⭐ (Excellent) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Alpha Vantage | ⭐⭐⭐ (Fair - premium only) | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| yfinance | ⭐⭐⭐ (Good but unofficial) | ⭐⭐ (Can break) | ⭐ (Community) |

## Next Steps

1. **Start with FMP Free Tier** (no credit card required)
   - Sign up: https://financialmodelingprep.com/
   - Test with 5 years of data
   - Build your application

2. **Monitor Usage**
   - 250 calls/day = ~50 companies with 5 endpoints each
   - Cache data locally to reduce API calls

3. **Upgrade When Ready**
   - If 5 years insufficient: $22/mo for 30 years
   - If need Canada/UK: $59/mo for global coverage

4. **Alternative: Consider EODHD**
   - Better global coverage
   - Slightly cheaper ($19.99/mo)
   - More exchanges (60+ vs FMP's limited)

## Conclusion

**❌ True "Free Forever" with 10 years: Does NOT exist**

**✅ Best realistic options:**
1. **FMP Free (5 years)** - Start here
2. **FMP Starter ($22/mo)** - Upgrade for 10+ years
3. **EODHD ($19.99/mo)** - Best value for global coverage
4. **Hybrid (FMP + yfinance)** - Free but risky

**My recommendation**: Start with FMP free tier, then upgrade to Starter plan ($22/mo) when you need 10 years. It's professional, reliable, and worth the investment for production use.
