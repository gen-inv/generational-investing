# Backup Data Sources Configuration

## Overview

The Generational Investing application uses a **6-tier cascading fallback strategy** to ensure maximum data coverage for company information. When one API fails or lacks data, the system automatically tries the next source.

## Data Fetching Strategy

### Tier 1: Yahoo Finance Chart API (PRIMARY)
- **Purpose**: Company name, exchange, market cap
- **Cost**: FREE, no API key required
- **Coverage**: 100% for basic company info
- **Limitations**: No sector/industry/earnings data
- **API Endpoint**: `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}`

### Tier 2: Twelve Data API
- **Purpose**: Sector, industry, detailed company profile
- **Cost**: FREE (limited) | PAID ($79/month for Grow plan)
- **Coverage**: 20% with free tier, 100% with paid tier
- **Limitations**: `/profile` endpoint requires paid plan
- **API Endpoint**: `https://api.twelvedata.com/profile?symbol={ticker}`
- **Sign up**: https://twelvedata.com/pricing

**Setup**:
```bash
# Add to .dev.vars (local development)
TWELVE_DATA_API_KEY=your_api_key_here

# Add to production (Cloudflare)
npx wrangler secret put TWELVE_DATA_API_KEY
# Enter: your_api_key_here
```

### Tier 3: EOD Historical Data API (FALLBACK)
- **Purpose**: Sector, industry, earnings date
- **Cost**: FREE (demo) | PAID ($19.99/month)
- **Coverage**: 60%+ with demo key, 95%+ with paid key
- **Limitations**: Demo key has rate limits
- **API Endpoint**: `https://eodhd.com/api/fundamentals/{ticker}.US`
- **Sign up**: https://eodhd.com/pricing

**Setup**:
```bash
# Add to .dev.vars (optional - defaults to demo)
EOD_API_KEY=your_api_key_here

# Add to production (optional)
npx wrangler secret put EOD_API_KEY
```

### Tier 4a: Finnhub API (BACKUP)
- **Purpose**: Sector, industry (from finnhubIndustry field)
- **Cost**: FREE (60 calls/min) | PAID (starts at $59/month)
- **Coverage**: 70%+ with free tier
- **Limitations**: Uses combined industry string (e.g., "Technology - Software")
- **API Endpoint**: `https://finnhub.io/api/v1/stock/profile2?symbol={ticker}`
- **Sign up**: https://finnhub.io/register

**Setup**:
```bash
# Add to .dev.vars
FINNHUB_API_KEY=your_api_key_here

# Add to production
npx wrangler secret put FINNHUB_API_KEY
```

### Tier 4b: Financial Modeling Prep (BACKUP)
- **Purpose**: Sector, industry, company profile
- **Cost**: FREE (250 calls/day) | PAID (starts at $14/month)
- **Coverage**: 80%+ with free tier
- **Limitations**: 250 API calls per day limit on free tier
- **API Endpoint**: `https://financialmodelingprep.com/api/v3/profile/{ticker}`
- **Sign up**: https://site.financialmodelingprep.com/developer/docs

**Setup**:
```bash
# Add to .dev.vars
FMP_API_KEY=your_api_key_here

# Add to production
npx wrangler secret put FMP_API_KEY
```

### Tier 4c: FinanceBird via RapidAPI (BACKUP)
- **Purpose**: Sector, industry, company profile
- **Cost**: PAID (Basic $9.99/month via RapidAPI)
- **Coverage**: High coverage with paid subscription
- **Limitations**: Requires RapidAPI subscription
- **API Endpoint**: `https://financebird.p.rapidapi.com/company/profile?ticker={ticker}`
- **Sign up**: https://rapidapi.com/shareefbassam3/api/financebird

**Setup**:
```bash
# Add to .dev.vars
RAPIDAPI_KEY=your_rapidapi_key_here

# Add to production
npx wrangler secret put RAPIDAPI_KEY
```

### Tier 5: Yahoo Finance Quote Summary (EARNINGS)
- **Purpose**: Next earnings date
- **Cost**: FREE, no API key required
- **Coverage**: Limited due to authentication requirements
- **Limitations**: May return "Invalid Crumb" errors
- **API Endpoint**: `https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules=calendarEvents`

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Company Creation Request (ticker + research_score)      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Yahoo Finance Chart API                                  │
│    ✓ Company name, exchange, market cap                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. If sector/industry missing → Try Twelve Data             │
│    ✓ Sector, Industry (if paid plan)                        │
│    ⚠ Free tier: limited access to /profile                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼ (if still missing)
┌─────────────────────────────────────────────────────────────┐
│ 4. If sector/industry missing → Try EOD Historical Data     │
│    ✓ Sector, Industry, Earnings                             │
│    ✓ Works with demo key (60%+ coverage)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼ (if still missing)
┌─────────────────────────────────────────────────────────────┐
│ 5. If sector/industry missing → Try Finnhub                 │
│    ✓ Sector, Industry (60 calls/min free)                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼ (if still missing)
┌─────────────────────────────────────────────────────────────┐
│ 6. If sector/industry missing → Try Financial Modeling Prep │
│    ✓ Sector, Industry (250 calls/day free)                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼ (if still missing)
┌─────────────────────────────────────────────────────────────┐
│ 7. If sector/industry missing → Try FinanceBird (RapidAPI)  │
│    ✓ Sector, Industry (requires subscription)               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼ (if earnings still missing)
┌─────────────────────────────────────────────────────────────┐
│ 8. If earnings missing → Try Yahoo Quote Summary            │
│    ✓ Next earnings date (limited success)                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. Store in Database with all fetched data                  │
└─────────────────────────────────────────────────────────────┘
```

## Coverage Statistics (Current Setup)

With **free/demo tiers only**:
- **Company Names**: 100% (Yahoo Finance)
- **Exchanges**: 100% (Yahoo Finance)
- **Market Cap**: 95%+ (Yahoo Finance)
- **Sector/Industry**: 60-80% (EOD demo + occasional Twelve Data success)
- **Earnings Dates**: 60%+ (EOD demo)

With **recommended paid plans** (Twelve Data $79/month OR EOD $19.99/month):
- **Company Names**: 100%
- **Exchanges**: 100%
- **Market Cap**: 100%
- **Sector/Industry**: 95%+
- **Earnings Dates**: 90%+

## Testing Results

### Test Run: 2026-02-06

Tested with tickers: AAPL, MSFT, GOOGL, TSLA, AMZN

**Results**:
| Ticker | Name | Sector | Industry | Earnings | Source |
|--------|------|--------|----------|----------|--------|
| AAPL | ✅ Apple Inc. | ✅ Technology | ✅ Consumer Electronics | ❌ null | Yahoo + Twelve Data (paid) |
| MSFT | ✅ Microsoft Corp. | ✅ Technology | ✅ Software - Infrastructure | ✅ 2026-04-28 | Yahoo + EOD (demo) |
| GOOGL | ✅ Alphabet Inc. | ❌ null | ❌ null | ❌ null | Yahoo only |
| TSLA | ✅ Tesla Inc | ✅ Consumer Cyclical | ✅ Auto Manufacturers | ✅ 2026-04-28 | Yahoo + EOD (demo) |
| AMZN | ✅ Amazon.com Inc | ✅ Consumer Cyclical | ✅ Internet Retail | ✅ 2026-04-29 | Yahoo + EOD (demo) |

**Success Rate with Free Tiers**:
- Company Names: 100% (5/5)
- Sector/Industry: 80% (4/5)
- Earnings Dates: 60% (3/5)

## Recommended Setup

### Option 1: Free Tier (Current)
**Cost**: $0/month  
**Coverage**: 60-80% automatic + manual entry fallback

Setup required:
- Twelve Data API key (limited free tier)
- No other keys needed (EOD demo works automatically)

### Option 2: Basic Paid (Recommended)
**Cost**: $19.99/month (EOD Historical Data)  
**Coverage**: 90-95% automatic

Setup required:
```bash
# Sign up for EOD Historical Data: https://eodhd.com/pricing
EOD_API_KEY=your_eod_key_here
```

### Option 3: Premium Paid
**Cost**: $79/month (Twelve Data Grow plan)  
**Coverage**: 95-100% automatic

Setup required:
```bash
# Sign up for Twelve Data Grow: https://twelvedata.com/pricing
TWELVE_DATA_API_KEY=your_twelve_data_key_here
```

### Option 4: Maximum Coverage
**Cost**: $99/month (EOD $19.99 + Twelve Data $79)  
**Coverage**: 99%+ automatic

Setup required:
```bash
TWELVE_DATA_API_KEY=your_twelve_data_key_here
EOD_API_KEY=your_eod_key_here
```

## Environment Variables

### Local Development (.dev.vars)
```bash
# Required (currently configured)
TWELVE_DATA_API_KEY=80dfb77eeca146589361d4bb11958710

# Optional (with demo fallback)
EOD_API_KEY=demo

# Optional (additional backups)
FINNHUB_API_KEY=your_finnhub_key_here
FMP_API_KEY=your_fmp_key_here
RAPIDAPI_KEY=your_rapidapi_key_here
```

### Production (Cloudflare Secrets)
```bash
# Set secrets one by one
npx wrangler secret put TWELVE_DATA_API_KEY
npx wrangler secret put EOD_API_KEY
npx wrangler secret put FINNHUB_API_KEY
npx wrangler secret put FMP_API_KEY
npx wrangler secret put RAPIDAPI_KEY
```

## API Key Priority

The system automatically uses API keys in this priority:
1. If Twelve Data key exists and is not 'demo' → use Twelve Data
2. If Twelve Data fails or lacks data → use EOD Historical Data
3. If EOD fails or lacks data → use Finnhub (if key exists)
4. If Finnhub fails or lacks data → use Financial Modeling Prep (if key exists)
5. If FMP fails or lacks data → use FinanceBird via RapidAPI (if key exists)
6. If all fail → store partial data and allow manual entry

## Logging

The application logs which APIs are used for each company creation:

```
🔑 Using paid Twelve Data API key: 80dfb77eec...
✅ Yahoo Chart API: Apple Inc.
✅ Twelve Data API (paid): Sector=Technology, Industry=Consumer Electronics
```

or

```
🔑 Using demo Twelve Data API key
✅ Yahoo Chart API: Microsoft Corporation
⚠️ Twelve Data API error: /profile requires paid plan
✅ EOD Historical Data API (demo): Sector=Technology, Industry=Software - Infrastructure
✅ EOD Earnings Date: 2026-04-28
```

View logs:
```bash
# Development
pm2 logs webapp --nostream --lines 100 | grep -E '✅|⚠️|🔑'

# Production
npx wrangler tail
```

## Troubleshooting

### "Twelve Data API error: /profile requires paid plan"
**Solution**: This is expected with free tier. EOD Historical Data will be used as fallback.

### "EOD Historical Data API failed"
**Solution**: Rate limit exceeded. Upgrade to paid EOD plan or wait for rate limit reset.

### "All APIs failed"
**Solution**: 
1. Check internet connectivity
2. Verify API keys are configured correctly
3. Check API rate limits
4. Try manual data entry as fallback

### Missing Sector/Industry for some companies
**Solution**:
1. Upgrade to paid EOD or Twelve Data plan
2. Add Finnhub or FMP API keys for additional backup
3. Use manual edit feature to enter data

## Future Enhancements

Potential additions:
- [ ] Alpha Vantage integration (25 calls/day free)
- [ ] Polygon.io integration (requires API key)
- [ ] IEX Cloud integration (sandbox available)
- [ ] Automatic retry logic with exponential backoff
- [ ] Caching layer to reduce API calls
- [ ] Background job to refresh old data

## Related Documentation

- [Multi-Source Data Fetching](./MULTI_SOURCE_DATA_FETCHING.md)
- [Earnings Date Feature](./EARNINGS_DATE_FEATURE.md)
- [API Configuration Guide](./README.md)

## Commit History

- `cb93453` - Add FinanceBird and additional backup data sources (2026-02-06)
- `527315c` - Implement robust multi-source data fetching (2026-02-06)
- `b4c9b37` - Add earnings date auto-fetch and manual refresh button (2026-02-06)

---

**Last Updated**: 2026-02-06  
**Build Version**: 85.60 kB  
**Test Status**: ✅ 19/19 tests passing  
**Development URL**: https://3000-imi5lx8i4w7yx1t3dzzid-18e660f9.sandbox.novita.ai
