# DividendMax.com Web Scraping Option for Canadian Stocks

**Date**: March 19, 2026  
**Use Case**: Get dividend data for Canadian stocks (FTN.TO) when Polygon.io returns empty

## URL Pattern Analysis

### Example: FTN.TO (Financial 15 Split Corp)
**Full URL**: https://www.dividendmax.com/canada/toronto-stock-exchange/financial-services/financial-15-split-corp-class-a-shares/dividends

**Pattern Breakdown**:
```
https://www.dividendmax.com/{country}/{exchange}/{sector}/{company-slug}/dividends
```

**Problem**: URL requires:
- Country (canada)
- Exchange (toronto-stock-exchange)
- Sector (financial-services)
- **Company slug** (financial-15-split-corp-class-a-shares) ❌ Not easily derivable from ticker

## Data Available

### Free (Without Signup) ✅
- **Historical dividends**: Full history visible
- **Ex-dividend dates**: Yes
- **Pay dates**: Yes  
- **Declared amounts**: Yes for historical (2013-2026)
- **Status**: Paid/Declared/Forecast
- **Frequency**: Monthly (inferred from data)

### Example Data Scraped from FTN.TO:
```
| Status   | Ex-div date    | Pay date       | Amount  |
|----------|---------------|----------------|---------|
| Declared | 31 Mar 2026   | 10 Apr 2026    | 12.57c  |
| Paid     | 27 Feb 2026   | 10 Mar 2026    | 12.57c  |
| Paid     | 30 Jan 2026   | 10 Feb 2026    | 12.57c  |
```

### Requires Signup ❌
- Forecast amounts for future dividends
- Optimized yield calculations
- Exact next ex-div date countdown

## Web Scraping Implementation

### Pros ✅
- **Free**: No API key or subscription needed
- **Complete data**: Historical dividends fully visible
- **Reliable**: DividendMax specializes in dividend tracking
- **Canadian coverage**: TSX and TSXV stocks included
- **HTML table**: Easy to parse structure

### Cons ❌
- **URL discovery**: Need to map ticker → company slug
  - FTN.TO → "financial-15-split-corp-class-a-shares"
  - This mapping is not straightforward
- **Terms of Service**: Web scraping may violate ToS
- **Fragile**: Website changes break the scraper
- **Rate limiting**: Risk of IP blocks if too many requests
- **Maintenance**: Requires ongoing updates when site changes
- **Legal risk**: Could face cease & desist

## Mapping Challenge

To scrape dividendmax.com, we need:

### Input: 
- Ticker symbol: `FTN.TO`

### Required:
- Full URL with company slug: `financial-15-split-corp-class-a-shares`

### Mapping Options:

**Option A: Search TSX Listings**
```
1. Go to https://www.dividendmax.com/stock-exchange-listings/canada/toronto-stock-exchange
2. Search/scrape for ticker "FTN"
3. Extract the company slug from the link
4. Build dividend page URL
```

**Option B: Manual Mapping Table**
```typescript
const CANADIAN_TICKER_MAP = {
  'FTN.TO': 'financial-15-split-corp-class-a-shares',
  'REI.UN.TO': 'reit-company-slug',
  // Add as needed
}
```

**Option C: Search API/Google**
Search Google for: `site:dividendmax.com FTN.TO` and extract URL

## Implementation Example

### Step 1: Discover Company URL
```typescript
async function findDividendMaxURL(ticker: string): Promise<string | null> {
  // Remove .TO suffix
  const symbol = ticker.replace('.TO', '')
  
  // Search TSX listings page
  const listingPage = await fetch('https://www.dividendmax.com/stock-exchange-listings/canada/toronto-stock-exchange')
  const html = await listingPage.text()
  
  // Parse HTML and find ticker
  // Extract href from table row containing ticker
  // Return full dividend page URL
}
```

### Step 2: Scrape Dividend Data
```typescript
async function scrapeDividendMaxDividends(url: string): Promise<Dividend[]> {
  const response = await fetch(url)
  const html = await response.text()
  
  // Parse HTML table
  // Extract rows where Status = "Paid" or "Declared"
  // Filter for dates >= 2026-01-01
  
  return dividends.map(row => ({
    ticker: ticker,
    ex_date: parseDate(row.exDivDate),
    pay_date: parseDate(row.payDate),
    amount: parseAmount(row.amount), // "12.57c" → 0.1257
    currency: 'CAD',
    frequency: inferFrequency(dividends)
  }))
}
```

### Step 3: Integration with Existing System
```typescript
async function fetchDividendsWithFallback(ticker: string) {
  // Try Polygon first
  const polygonData = await fetchFromPolygon(ticker)
  
  if (polygonData.length > 0) {
    return polygonData // US stock, got data
  }
  
  // Polygon returned empty, try DividendMax for Canadian stocks
  if (ticker.endsWith('.TO')) {
    const url = await findDividendMaxURL(ticker)
    if (url) {
      return await scrapeDividendMaxDividends(url)
    }
  }
  
  return [] // No data available
}
```

## Legal & Ethical Considerations

### Terms of Service Check Required ⚠️
Before implementing, must verify:
1. Does DividendMax ToS allow web scraping?
2. Do they have a robots.txt blocking automated access?
3. Is there a stated rate limit?

### Robots.txt Check
```bash
curl https://www.dividendmax.com/robots.txt
```

### Alternative: Contact DividendMax
Email support and ask:
- Do you have an API?
- Is web scraping allowed?
- Can we use your data for personal portfolio tracking?

## Comparison: EODHD vs DividendMax Scraping

| Feature | EODHD API | DividendMax Scraping |
|---------|-----------|---------------------|
| **Cost** | Free (1 year) | Free |
| **Legal** | ✅ Official API | ❌ Unclear/risky |
| **Reliability** | ✅ Stable | ❌ Breaks on updates |
| **Setup** | Sign up + support email | Build scraper |
| **Maintenance** | ✅ None | ❌ Ongoing |
| **Data Quality** | ✅ Structured JSON | ❌ Parse HTML |
| **Rate Limits** | ✅ Documented | ❌ Unknown |
| **Coverage** | Global + TSX | TSX only |
| **Implementation** | 2-3 hours | 4-6 hours |

## Recommendation ⚠️

**Do NOT pursue web scraping** for the following reasons:

### Legal Risks
1. **Terms of Service**: May explicitly prohibit scraping
2. **Copyright**: Dividend data may be proprietary
3. **IP blocks**: Risk getting banned
4. **Cease & desist**: Could receive legal notice

### Technical Risks
1. **Fragile**: Breaks when website updates
2. **Mapping complexity**: Ticker → URL not straightforward
3. **Rate limiting**: Unknown limits, risk of blocks
4. **Maintenance burden**: Requires ongoing updates

### Better Alternative: EODHD
1. **Official API**: Legal and supported
2. **Free tier**: 1 year history (sufficient)
3. **Reliable**: Stable JSON responses
4. **No maintenance**: Updates handled by EODHD
5. **Setup time**: Same as scraping (2-3 hours)

## Recommended Implementation Path

### Phase 1: Dual API (Recommended) ⭐
1. **US stocks**: Continue using Polygon.io (working now)
2. **Canadian stocks**: Implement EODHD API
3. **Total cost**: $0/month
4. **Maintenance**: None
5. **Legal**: ✅ Clear

### Phase 2: Manual Entry (Temporary)
1. **US stocks**: Polygon.io
2. **FTN.TO only**: Manual entry until EODHD set up
3. **Time**: 0 hours (immediate)
4. **Temporary**: Until EODHD activated

### Phase 3: Web Scraping (NOT Recommended)
**Only if**:
1. EODHD activation denied
2. No other API options exist
3. Terms of Service explicitly allow scraping
4. Accept maintenance burden and legal risk

## Action Items

**Recommended**:
1. ✅ Sign up for EODHD (5 minutes)
2. ✅ Email support to activate dividend access
3. ✅ Wait 1-2 business days
4. ✅ Implement EODHD integration
5. ✅ Deploy dual API solution

**Not Recommended**:
1. ❌ Build DividendMax scraper
2. ❌ Risk ToS violation
3. ❌ Accept maintenance burden

## Conclusion

While DividendMax has excellent visible data, **web scraping is not recommended** due to:
- Legal risks (ToS, copyright)
- Technical fragility (breaks on updates)
- Mapping complexity (ticker → URL)
- Maintenance burden

**EODHD API is the superior choice**: legal, reliable, free, and maintainable.

**Decision**: Proceed with EODHD integration as documented in CANADIAN_DIVIDEND_API_OPTIONS.md
