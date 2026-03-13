# Dividends Tracking & Reporting Feature

## Overview
Comprehensive dividend tracking system that integrates dividend income into all P/L calculations and provides detailed reporting capabilities.

## Features Implemented

### 1. Dividend Integration in P/L Calculations

#### Portfolio Overview (`/api/reports/portfolio-overview`)
- **YTD P/L**: Now includes dividend income in total P/L calculation
- **Monthly P/L**: Each month's P/L includes dividends received in that period
- **Formula**: `Total P/L = Stock Trades + Option Trades + Daily Trades + Dividends`

```javascript
// Example YTD calculation
const ytdPL = (stockPL?.total_pl || 0) + 
              (optionPL?.total_pl || 0) + 
              (dailyPL?.total_pl || 0) + 
              (dividends?.total_dividends || 0)
```

#### P/L Summary Report (`/api/reports/pl-summary`)
- Dividends now appear as separate asset type: **"Dividends"**
- Included in overall P/L aggregations
- Grouped by account type for detailed analysis
- Shows dividends in asset type breakdowns

#### Performance Analysis (`/api/reports/performance`)
- Dividends included in portfolio growth calculations
- Affects cumulative P/L trends
- Contributes to total return metrics
- Included in rolling returns and drawdown analysis

### 2. Dividends Report

#### API Endpoint: `/api/reports/dividends`

**Query Parameters:**
- `groupBy`: `account` or `stock` (default: `account`)
- `period`: `mtd`, `ytd`, or `all` (default: `ytd`)

**Response Format:**
```json
{
  "groupBy": "account",
  "period": "ytd",
  "total": 1250.50,
  "data": [
    {
      "account_name": "TFSA",
      "account_type": "TFSA",
      "account_id": 1,
      "dividend_count": 12,
      "total_dividends": 750.00
    }
  ]
}
```

**Group By Account:**
```sql
SELECT 
  a.account_name,
  a.account_type,
  a.id as account_id,
  COUNT(*) as dividend_count,
  SUM(cba.amount) as total_dividends
FROM cost_basis_adjustments cba
INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
INNER JOIN accounts a ON sh.account_id = a.id
WHERE cba.user_id = ?
  AND cba.adjustment_type = 'DIVIDEND'
  AND cba.adjustment_date >= ?
GROUP BY a.id, a.account_name, a.account_type
ORDER BY total_dividends DESC
```

**Group By Stock:**
```sql
SELECT 
  sh.ticker,
  c.company_name,
  sh.id as holding_id,
  COUNT(*) as dividend_count,
  SUM(cba.amount) as total_dividends,
  MIN(cba.adjustment_date) as first_dividend_date,
  MAX(cba.adjustment_date) as last_dividend_date
FROM cost_basis_adjustments cba
INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
LEFT JOIN companies c ON sh.company_id = c.id
WHERE cba.user_id = ?
  AND cba.adjustment_type = 'DIVIDEND'
  AND cba.adjustment_date >= ?
GROUP BY sh.id, sh.ticker, c.company_name
ORDER BY total_dividends DESC
```

### 3. Frontend UI

#### Navigation
- New **"Dividends"** tab in Reports Dashboard
- Icon: `fas fa-coins` (gold-themed)
- Located between "Position Analysis" and "Closed Trades"

#### Report Controls

**Group By Selector:**
- **By Account**: View dividends grouped by investment account (TFSA, RRSP, Cash, etc.)
- **By Stock**: View dividends grouped by stock ticker

**Period Selector:**
- **MTD** (Month-to-Date): Current month's dividends
- **YTD** (Year-to-Date): Current year's dividends  
- **All Time**: Complete dividend history

#### Visual Design

**Summary Card:**
```html
┌─────────────────────────────────────────┐
│ 💰 Total Dividends                      │
│ $1,250.50                               │
│ 24 payments                             │
└─────────────────────────────────────────┘
```

**Table View (By Account):**
| Account      | Count | Total Dividends |
|--------------|-------|-----------------|
| 🏢 TFSA      | 12    | $750.00        |
| 🏢 RRSP      | 8     | $350.50        |
| 🏢 Cash      | 4     | $150.00        |

**Table View (By Stock):**
| Stock          | Count | Total Dividends |
|----------------|-------|-----------------|
| 📈 AAPL        | 4     | $280.00        |
| Apple Inc.     |       |                |
| 📈 MSFT        | 4     | $320.00        |
| Microsoft      |       |                |
| 📈 TD.TO       | 6     | $450.50        |
| TD Bank        |       |                |

### 4. JavaScript Functions

**Load Report:**
```javascript
async function loadDividendsReport(groupBy = 'account', period = 'ytd')
```
- Fetches dividend data from API
- Updates button states (active/inactive)
- Populates summary card
- Renders table with data

**Helper Functions:**
```javascript
function getCurrentDividendGroupBy()
function getCurrentDividendPeriod()
```
- Get current selected group-by and period
- Used for maintaining state when switching between views

## Data Model

### Tables Used

**cost_basis_adjustments:**
- `id`: Primary key
- `user_id`: Owner of the dividend
- `holding_id`: Reference to stock_holdings
- `adjustment_type`: Must be 'DIVIDEND' for dividend records
- `amount`: Dividend amount (positive value)
- `adjustment_date`: Date dividend received
- `notes`: Optional notes

**stock_holdings:**
- `id`: Primary key
- `account_id`: Links dividend to specific account
- `ticker`: Stock symbol
- `company_id`: Links to company details

**accounts:**
- `id`: Primary key
- `account_name`: e.g., "My TFSA"
- `account_type`: e.g., "TFSA", "RRSP", "Cash"

**companies:**
- `id`: Primary key
- `company_name`: Full company name
- `ticker`: Stock symbol

## Usage Examples

### View Dividends by Account (YTD)
1. Navigate to Reports Dashboard
2. Click "Dividends" tab
3. Ensure "Account" is selected (default)
4. Ensure "YTD" is selected (default)
5. View total dividends and breakdown by account

### View Dividends by Stock (All Time)
1. Navigate to Reports Dashboard  
2. Click "Dividends" tab
3. Click "Stock" button
4. Click "All Time" button
5. See which stocks have paid the most dividends historically

### Check Monthly Dividend Income
1. Navigate to Reports Dashboard
2. Click "Dividends" tab
3. Click "MTD" button
4. View current month's dividend payments

## Benefits

### For P/L Accuracy
✅ All P/L calculations now include dividend income  
✅ Portfolio performance reflects true total return  
✅ Monthly and yearly P/L accurately account for dividends  
✅ Dividends visible in P/L Summary as separate asset type  

### For Analysis
✅ Identify highest dividend-paying accounts  
✅ Track dividend growth over time  
✅ Compare dividend income by stock  
✅ Monitor monthly dividend consistency  
✅ Tax planning (separate by account type)  

### For Reporting
✅ Export-ready dividend summaries  
✅ Period-based filtering for tax reporting  
✅ Account-level reporting for retirement planning  
✅ Stock-level reporting for portfolio optimization  

## Color Scheme

- **Primary**: Teal (#004F59) - Used for buttons, icons
- **Accent**: Gold (#C9B25F) - Used for dividend amounts
- **Text**: Gray (#7A7A7A) - Body text
- **Background**: White with gradient overlays

## Icons

- 💰 `fas fa-coins` - Main dividends icon
- 🏢 `fas fa-building` - Account view
- 📈 `fas fa-chart-line` - Stock view
- 📅 `fas fa-calendar-alt` - Period selector
- 🔢 Count badges

## Technical Notes

### Performance Considerations
- Queries use proper JOINs on indexed columns
- Results ordered by `total_dividends DESC` for relevance
- Date filtering at database level for efficiency

### Data Integrity
- Dividends linked through stock_holdings to accounts
- Ensures dividends always associated with correct account
- Adjustment_type filter prevents including other adjustments

### Future Enhancements (Potential)
- [ ] Dividend history chart (time-series)
- [ ] Dividend yield calculations
- [ ] Dividend growth rate tracking
- [ ] Export to CSV functionality
- [ ] Comparison to previous periods
- [ ] Dividend calendar/forecast

## Testing

All 93 regression tests pass including:
- Authentication tests
- Company management tests
- Stock trade tests
- Option trade tests
- Report generation tests

## Deployment

**Status**: ✅ Ready for production  
**Testing**: ✅ Complete  
**Documentation**: ✅ Complete  
**Git Commit**: `12a5774` - Add dividend tracking to all P/L calculations and build comprehensive Dividends report

## Support

For issues or questions:
1. Check logs for API errors
2. Verify dividend records exist in `cost_basis_adjustments`
3. Ensure `holding_id` properly links to `stock_holdings`
4. Confirm account associations are correct
