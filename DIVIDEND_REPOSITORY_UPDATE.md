# Dividend Repository Update - June 18, 2026

## Summary
Updated the dividend repository collection logic to focus on **open stock holdings** with dividends starting from **January 1, 2025**.

## Changes Made

### 1. Date Range Filter
**Before:**
- MIN_DATE = '2026-01-01'
- Only collected dividends from 2026 onwards

**After:**
- MIN_DATE = '2025-01-01'
- Now collects dividends from January 1, 2025 onwards

**Impact:** Captures an additional year of dividend history

### 2. Holdings Filter
**Before:**
```sql
SELECT * FROM stock_holdings sh
WHERE sh.user_id = ?
ORDER BY sh.ticker
```
- Collected dividends for ALL holdings (both open and closed)

**After:**
```sql
SELECT * FROM stock_holdings sh
WHERE sh.user_id = ? AND sh.is_open = 1
ORDER BY sh.ticker
```
- Only collects dividends for OPEN holdings (is_open = 1)

**Impact:** Focuses API calls on active positions only, improving efficiency

## Technical Details

### API Rate Limiting
- **Polygon.io**: 5 calls per minute (unchanged)
- **EODHD**: Fallback for Canadian stocks (.TO, .V) (unchanged)

### Affected Code Sections
1. **Line 6656**: MIN_DATE constant updated
2. **Line 6668**: Added `AND sh.is_open = 1` filter to holdings query
3. **Line 6808**: MIN_DATE redefined in processing loop (kept for clarity)

### Data Flow
1. Fetch all **open** stock holdings for user
2. Deduplicate tickers to avoid redundant API calls
3. For each unique ticker:
   - Call Polygon.io API for dividend data
   - Filter dividends by MIN_DATE (2025-01-01)
   - Fallback to EODHD for Canadian stocks if needed
   - Store in `dividend_repository` table

## Deployment
- **Build**: ✅ Successful (412.51 kB bundle)
- **Deployed**: ✅ https://53b7efd3.generational-investing.pages.dev
- **Commit**: f411759
- **Date**: June 18, 2026 17:19 UTC

## Testing Recommendations
1. Run dividend fetch for a user with open positions
2. Verify only open holdings are processed
3. Confirm dividends from 2025-01-01 onwards are collected
4. Check that closed positions are skipped

## Notes
- Dividend repository is **user-agnostic** - stores one record per ticker/ex_date globally
- Manually edited dividends are preserved (not overwritten by API data)
- Eligibility check: holding must be opened before ex_date
- Application to individual holdings happens later based on pay_date
