# Dividend Fetch API Update - June 18, 2026

## Issue Identified

After updating the dividend repository to collect dividends from 2025-01-01, we discovered that the **API calls themselves** were not fetching 2025 data. The Polygon.io and EODHD API calls were not filtering by date, so they returned all historical dividends (which the code then filtered to 2026-01-01).

## Root Cause

The dividend fetch API calls did not include date parameters:

**Polygon.io (Before):**
```
https://api.polygon.io/v3/reference/dividends?ticker=AAPL&apiKey={key}
```
- Returns ALL dividends in history (could be hundreds)
- Code then filtered to 2026-01-01 in application layer

**EODHD (Before):**
```
https://eodhd.com/api/div/AAPL.TO?from=2000-01-01&api_token={key}
```
- Returns dividends from 2000 onwards (24+ years of data)
- Code then filtered to 2026-01-01 in application layer

## Solution

Added date filtering parameters directly to the API calls to fetch only 2025+ dividends:

### 1. Polygon.io API Updates

**Added `ex_dividend_date.gte` parameter:**

```typescript
// ✅ NEW (all 3 locations updated):
const response = await fetch(
  `https://api.polygon.io/v3/reference/dividends?ticker=${ticker}&ex_dividend_date.gte=2025-01-01&apiKey=${MASSIVE_API_KEY}`
)
```

**Locations updated:**
1. Line 6747: Background dividend fetch
2. Line 7195: Manual dividend fetch helper
3. Line 11091: Test/preview dividend fetch

**API Documentation:**
- Polygon.io v3 API supports date filtering via:
  - `ex_dividend_date.gte` - Greater than or equal
  - `ex_dividend_date.lte` - Less than or equal
  - `ex_dividend_date.gt` - Greater than
  - `ex_dividend_date.lt` - Less than

### 2. EODHD API Updates

**Changed `from` parameter from 2000-01-01 to 2025-01-01:**

```typescript
// ✅ NEW (both locations updated):
const eodhd_response = await fetch(
  `https://eodhd.com/api/div/${ticker}?from=2025-01-01&api_token=${EODHD_API_KEY}&fmt=json`
)
```

**Locations updated:**
1. Line 6788: Background dividend fetch (Canadian stocks fallback)
2. Line 11119: Test/preview dividend fetch (Canadian stocks fallback)

## Benefits

### 1. Performance Improvement
- **Reduced API response size**: Only fetches relevant dividends from 2025+
- **Faster processing**: Less data to parse and filter
- **Lower bandwidth**: Smaller JSON payloads

### 2. Consistency
- **Server-side filtering**: API filters at source instead of application layer
- **Alignment with MIN_DATE**: API date matches MIN_DATE = '2025-01-01'
- **Prevents drift**: Can't accidentally miss filtering in code

### 3. API Efficiency
- **Polygon.io**: Reduces response from potentially 1000+ dividends to ~100
- **EODHD**: Reduces response from 24 years to 2 years of data

## Example: NFLY Trade

**User's NFLY holding in TFSA:**
- Opened: Jan 28, 2025 (210 shares)
- Additional purchase: Mar 5, 2025 (590 shares)
- Current total: 800 shares

**Before this fix:**
- Dividend fetch returned 0 results for 2025
- Only 2026 dividends were available
- User couldn't see or add 2025 dividends

**After this fix:**
- Dividend fetch will return 2025 dividends
- Feb 2025 dividends: Should show 210 shares (pre-March purchase)
- Apr 2025 dividends: Should show 800 shares (post-March purchase)

## Testing Recommendations

### 1. Test Polygon.io Date Filtering

Run dividend fetch for US stock (e.g., AAPL):
```bash
POST /api/dividends/fetch
```

Verify:
- API returns only 2025+ dividends
- Console logs show dividends from Jan 2025 onwards
- No 2024 or earlier dividends in response

### 2. Test EODHD Date Filtering

Run dividend fetch for Canadian stock (e.g., TD.TO):
```bash
POST /api/dividends/fetch
```

Verify:
- EODHD fallback triggers for Canadian stocks
- API returns only 2025+ dividends
- No 2024 or earlier dividends in response

### 3. Test NFLY Specifically

Run dividend fetch for user's account:
```bash
POST /api/dividends/fetch
```

Then check NFLY missing dividends:
```bash
GET /api/stocks/27/missing-dividends
```

Verify:
- 2025 dividends appear in repository
- Feb 2025 dividends show 210 shares
- Apr 2025 dividends show 800 shares

## Deployment

- **Build**: ✅ Successful (412.65 kB)
- **Deployed**: ✅ https://83167df6.generational-investing.pages.dev
- **Commit**: bc9bd12
- **Date**: June 18, 2026

## Related Changes

This change works in conjunction with:
1. **DIVIDEND_REPOSITORY_UPDATE.md** - MIN_DATE changed to 2025-01-01
2. **DIVIDEND_CALCULATION_FIX.md** - Share ownership history calculation fix

All three changes together enable:
- ✅ Fetching 2025 dividends from APIs
- ✅ Storing 2025 dividends in repository
- ✅ Calculating correct share ownership per ex-date
- ✅ Showing accurate dividend amounts in modal

## Next Steps

1. **Run dividend fetch** for all users to populate 2025 data
2. **Monitor API logs** for any date filtering issues
3. **Verify NFLY** and other holdings show correct 2025 dividends
4. **Check performance** - should see faster fetch times

## API Endpoints Changed

1. `POST /api/dividends/fetch` - Background dividend fetch
2. Manual fetch helper (line 7195)
3. Test/preview fetch (line 11091 + 11119)

All endpoints now consistently fetch from 2025-01-01 onwards.
