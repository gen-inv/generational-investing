# Dividend Repository Framework - Automated Dividend Tracking

## Overview
The Dividend Repository is an automated system for fetching, tracking, and managing dividend payments for your stock holdings. It integrates with RapidAPI's Dividend Tracker to discover dividends and automatically determines eligibility based on your holding dates.

## Features

### 1. Automated Dividend Fetching
- Connects to RapidAPI Dividend Tracker API
- Fetches dividend data for all open stock holdings
- Processes dividend information (ex-date, pay-date, amount, frequency)
- Stores results in local repository for review

### 2. Eligibility Determination
- **Rule**: A holding is eligible for a dividend if `opened_date < ex_date`
- Automatically calculates: `total_dividend = amount_per_share * shares_held`
- Tracks eligibility status for each dividend
- Shows which dividends you'll receive vs. which you missed

### 3. Manual Review & Application
- View all discovered dividends in organized table
- Filter by status (eligible, pending, applied, not eligible)
- Filter by ticker symbol
- Apply eligible dividends to cost_basis_adjustments with one click
- Track application history

### 4. Fetch Logging
- Records every fetch operation
- Tracks: tickers processed, dividends found, API calls made, duration
- Shows errors and partial successes
- Complete audit trail

## Database Schema

### dividend_repository Table
```sql
CREATE TABLE dividend_repository (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  
  -- Dividend details
  ex_date DATE NOT NULL,
  record_date DATE,
  pay_date DATE,
  declared_date DATE,
  amount REAL NOT NULL,
  frequency TEXT,
  currency TEXT DEFAULT 'USD',
  
  -- Eligibility
  is_eligible INTEGER DEFAULT 0,
  shares_held INTEGER,
  total_dividend REAL,
  
  -- Application tracking
  is_applied INTEGER DEFAULT 0,
  applied_date DATETIME,
  cost_basis_adjustment_id INTEGER,
  
  -- Metadata
  api_source TEXT DEFAULT 'rapidapi_dividend_tracker',
  fetch_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### api_configurations Table
```sql
CREATE TABLE api_configurations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  api_name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  api_host TEXT,
  settings TEXT,
  is_active INTEGER DEFAULT 1,
  last_used DATETIME,
  rate_limit_remaining INTEGER,
  rate_limit_reset DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, api_name)
);
```

### dividend_fetch_logs Table
```sql
CREATE TABLE dividend_fetch_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  fetch_type TEXT NOT NULL,
  status TEXT NOT NULL,
  tickers_processed TEXT,
  dividends_found INTEGER DEFAULT 0,
  dividends_eligible INTEGER DEFAULT 0,
  api_calls_made INTEGER DEFAULT 0,
  error_message TEXT,
  fetch_duration_ms INTEGER,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
```

## API Endpoints

### 1. Get API Configuration
```http
GET /api/dividend-repository/config
Authorization: Bearer {token}
```

**Response**:
```json
{
  "configured": true,
  "config": {
    "api_name": "rapidapi_dividend_tracker",
    "api_host": "dividendtracker1.p.rapidapi.com",
    "is_active": true,
    "last_used": "2026-03-19T17:30:00Z",
    "rate_limit_remaining": 95,
    "rate_limit_reset": "2026-03-20T00:00:00Z"
  }
}
```

### 2. Save/Update API Configuration
```http
POST /api/dividend-repository/config
Authorization: Bearer {token}
Content-Type: application/json

{
  "api_key": "your-rapidapi-key",
  "api_host": "dividendtracker1.p.rapidapi.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "API configuration saved"
}
```

### 3. Fetch Dividends
```http
POST /api/dividend-repository/fetch
Authorization: Bearer {token}
```

**Response**:
```json
{
  "success": true,
  "message": "Processed 15 holdings",
  "dividends_found": 45,
  "dividends_eligible": 23,
  "api_calls_made": 15,
  "duration_ms": 12450,
  "errors": ["TICKER1: HTTP 429", "TICKER2: Not found"]
}
```

### 4. Get Dividend Repository
```http
GET /api/dividend-repository?status={all|eligible|pending|applied}&ticker={SYMBOL}
Authorization: Bearer {token}
```

**Response**:
```json
{
  "dividends": [
    {
      "id": 1,
      "holding_id": 42,
      "ticker": "AAPL",
      "ex_date": "2026-02-15",
      "pay_date": "2026-03-01",
      "amount": 0.25,
      "shares_held": 100,
      "total_dividend": 25.00,
      "is_eligible": 1,
      "is_applied": 0,
      "status": "eligible",
      "account_name": "TFSA",
      "account_type": "TFSA"
    }
  ],
  "count": 1
}
```

### 5. Apply Dividend
```http
POST /api/dividend-repository/{id}/apply
Authorization: Bearer {token}
```

**Response**:
```json
{
  "success": true,
  "message": "Dividend applied to cost basis adjustments",
  "cost_basis_adjustment_id": 127
}
```

### 6. Get Fetch Logs
```http
GET /api/dividend-repository/logs?limit=10
Authorization: Bearer {token}
```

**Response**:
```json
{
  "logs": [
    {
      "id": 5,
      "fetch_type": "manual",
      "status": "success",
      "tickers_processed": "AAPL,MSFT,GOOGL",
      "dividends_found": 12,
      "dividends_eligible": 8,
      "api_calls_made": 3,
      "fetch_duration_ms": 4200,
      "started_at": "2026-03-19T17:30:00Z",
      "completed_at": "2026-03-19T17:30:04Z"
    }
  ]
}
```

## RapidAPI Integration

### API Details
- **Service**: RapidAPI Dividend Tracker
- **URL**: https://rapidapi.com/matrisian/api/dividendtracker1
- **Host**: dividendtracker1.p.rapidapi.com
- **Endpoint**: GET /ticker/{ticker}/dividends

### Example API Call
```javascript
const response = await fetch(
  `https://dividendtracker1.p.rapidapi.com/ticker/AAPL/dividends`,
  {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': 'your-api-key',
      'X-RapidAPI-Host': 'dividendtracker1.p.rapidapi.com'
    }
  }
)

const data = await response.json()
// data.dividends = [{ ex_date, pay_date, amount, frequency, ... }]
```

### Rate Limiting
- Configured delay: 500ms between requests
- Respects API rate limits
- Logs remaining calls
- Handles 429 errors gracefully

## User Interface

### Location
**Utilities → Dividend Repository**

### Sections

#### 1. API Configuration
- Input field for RapidAPI key
- Optional API host field
- Save/Load configuration buttons
- Status indicator (configured/not configured)

#### 2. Fetch Dividends
- Large "Fetch Dividends for All Holdings" button
- Progress indicator during fetch
- Success/error status messages
- Fetch statistics display

#### 3. Filters
- Status filter (All, Eligible, Pending, Applied, Not Eligible)
- Ticker search box
- Search button

#### 4. Summary Statistics
- Total Found (blue badge)
- Eligible (green badge)
- Pending (yellow badge)
- Total Eligible Amount (gold, $XXX.XX)

#### 5. Dividend Repository Table
Columns:
- **Ticker**: Symbol + Account name/type
- **Ex-Date**: Ex-dividend date
- **Pay Date**: Payment date
- **Amount/Share**: Dividend per share
- **Shares**: Shares held on ex-date
- **Total**: Total dividend ($)
- **Status**: Badge (Eligible/Not Eligible/Applied)
- **Actions**: "Apply" button (if eligible and not applied)

#### 6. Fetch History Logs
- Collapsible section
- Shows last 10 fetch operations
- Details: date, status, tickers, counts, duration, errors

## Workflow

### Setup (One-Time)
1. Navigate to Utilities → Dividend Repository
2. Get RapidAPI key from https://rapidapi.com/matrisian/api/dividendtracker1
3. Enter API key and save configuration
4. Verify "API configured" status shows green

### Regular Usage (Weekly)
1. Navigate to Utilities → Dividend Repository
2. Click "Fetch Dividends for All Holdings"
3. Wait for fetch to complete (may take 1-2 minutes for many holdings)
4. Review results:
   - Green "Eligible" badges = you'll receive these dividends
   - Red "Not Eligible" badges = holding opened after ex-date
5. Click "Apply" on eligible dividends to add to cost_basis_adjustments
6. Applied dividends will show in Dividends Report

### Eligibility Logic

**Eligible**:
```
holding.opened_date < dividend.ex_date
```

**Example 1** (Eligible):
- Opened holding: Jan 1, 2026
- Dividend ex-date: Feb 15, 2026
- Result: ✅ Eligible (owned before ex-date)
- Total dividend: $0.25/share × 100 shares = $25.00

**Example 2** (Not Eligible):
- Opened holding: Feb 20, 2026
- Dividend ex-date: Feb 15, 2026
- Result: ❌ Not Eligible (bought after ex-date)
- Total dividend: $0.00

## Benefits

### For Accuracy
- Never miss tracking a dividend payment
- Automatic calculation of dividend amounts
- Accurate cost basis adjustments
- Complete dividend history

### For Analysis
- See which stocks pay dividends regularly
- Track dividend frequency (quarterly, monthly, annual)
- Compare dividend yields across holdings
- Identify high-dividend payers

### For Tax Reporting
- Complete dividend records by account
- Separation by account type (TFSA, RRSP, Cash)
- Application dates for tax year assignment
- Export-ready data

### For Efficiency
- Automated vs. manual tracking
- One-click application to cost basis
- Batch processing of all holdings
- API integration eliminates data entry

## Error Handling

### API Errors
- **429 Rate Limit**: Logged, continues with next ticker
- **404 Not Found**: Ticker not found in dividend tracker, logged
- **401 Unauthorized**: Invalid API key, stops and shows error
- **Timeout**: Logged, continues with next ticker

### Application Errors
- Checks if dividend already applied
- Validates eligibility before applying
- Prevents duplicate cost_basis_adjustments
- Transaction logging for audit

## Future Enhancements (Potential)

- [ ] Scheduled weekly automatic fetching
- [ ] Email notifications for new dividends
- [ ] Dividend calendar view
- [ ] Projected annual dividend income
- [ ] Dividend growth rate tracking
- [ ] Comparison with expected dividends
- [ ] Bulk apply for all eligible dividends
- [ ] Export to CSV for external analysis

## Testing

### Local Development
```bash
# Apply migration
npm run db:migrate:local

# Start server
npm run build
pm2 start ecosystem.config.cjs

# Test endpoints
curl http://localhost:3000/api/dividend-repository/config \
  -H "Authorization: Bearer your-token"
```

### Production Deployment
```bash
# Apply migration
npm run db:migrate:prod

# Deploy
npm run deploy
```

## Security Considerations

- API keys stored in database (consider encryption)
- User-isolated data (user_id foreign keys)
- Authentication required for all endpoints
- Rate limiting respected to avoid API abuse
- No sensitive dividend data exposed

## Support

### Common Issues

**"API not configured"**:
- Get RapidAPI key from https://rapidapi.com/matrisian/api/dividendtracker1
- Enter key in configuration section
- Click "Save Configuration"

**"No dividends found"**:
- Ensure you have open stock holdings
- Some stocks don't pay dividends (growth stocks)
- API may not have data for all tickers

**"Not eligible"**:
- Holding was opened after ex-dividend date
- You won't receive this dividend payment
- Future dividends may be eligible

**"Rate limit exceeded"**:
- Free API tier has limits
- Upgrade RapidAPI plan
- Wait for rate limit reset (usually 24 hours)

## Documentation Files

- `DIVIDENDS_FEATURE.md` - Main dividends tracking documentation
- `DIVIDEND_REPOSITORY.md` - This file (repository framework)
- `README.md` - Updated with dividend repository info
- `migrations/0024_create_dividend_repository.sql` - Database schema

## Status

✅ **PRODUCTION READY**

All features implemented, tested, and documented. Ready for deployment to production.

**Development URL**: https://3000-imi5lx8i4w7yx1t3dzzid-18e660f9.sandbox.novita.ai

Navigate to Utilities → Dividend Repository to test the framework.
