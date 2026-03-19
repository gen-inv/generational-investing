# Dividend Repository Framework v2.1 - User-Agnostic Update

**Date**: March 19, 2026  
**Version**: 2.1.0  
**Status**: ✅ Complete and Ready for Production  
**Commit**: b680a65

## Key Change: User-Agnostic Dividends

### What Changed

**Before (v2.0)**: Dividends were stored per-user
```sql
dividend_repository (
  user_id,  -- ❌ Removed
  ticker,
  ex_date,
  ...
  UNIQUE(user_id, ticker, ex_date)
)
```

**After (v2.1)**: Dividends are universal data
```sql
dividend_repository (
  ticker,   -- ✅ User-agnostic
  ex_date,
  ...
  UNIQUE(ticker, ex_date)  -- Global uniqueness
)
```

### Why This Makes Sense

1. **Dividends are universal facts**: Apple's $0.24 dividend on March 15, 2024 is the same for all users
2. **No data duplication**: One dividend record per ticker/ex_date globally
3. **Simpler application logic**: Match holdings to dividends by ticker + dates only
4. **More efficient**: Less storage, faster queries, simpler code

### How Application Will Work (Future Feature)

```
When applying dividends to holdings:

1. User selects dividend from repository:
   ticker: AAPL
   ex_date: 2024-03-15
   pay_date: 2024-03-29
   amount: 0.24

2. System finds ALL user's holdings matching ticker:
   SELECT * FROM stock_holdings
   WHERE user_id = ? AND ticker = 'AAPL'
     AND opened_date < '2024-03-15'

3. For each matching holding:
   - Calculate: 0.24 × shares_held
   - Create cost_basis_adjustment with pay_date
   - Link back to dividend_repository

4. Result: Multiple holdings can reference same dividend
```

## Database Structure (Updated)

### dividend_repository Table
```sql
CREATE TABLE dividend_repository (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  
  -- Dividend details
  ex_date DATE NOT NULL,
  record_date DATE,
  pay_date DATE,
  declared_date DATE,
  amount REAL NOT NULL,
  frequency TEXT,
  currency TEXT DEFAULT 'USD',
  
  -- API tracking
  api_source TEXT DEFAULT 'rapidapi_dividend_tracker',
  fetch_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Status
  status TEXT DEFAULT 'active',  -- active, deprecated, corrected
  notes TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(ticker, ex_date)  -- Global uniqueness
);
```

### Key Changes from v2.0

| Field | v2.0 | v2.1 |
|-------|------|------|
| `user_id` | Required | ❌ Removed |
| `status` | 'pending', 'applied' | 'active', 'deprecated', 'corrected' |
| Unique constraint | (user_id, ticker, ex_date) | (ticker, ex_date) |
| Ownership | Per-user | Global/shared |

## Code Changes

### 1. Fetch Endpoint (Manual & Scheduled)

**Before**:
```typescript
const existing = await DB.prepare(`
  SELECT id FROM dividend_repository
  WHERE user_id = ? AND ticker = ? AND ex_date = ?
`).bind(userId, holding.ticker, exDate).first()

await DB.prepare(`
  INSERT INTO dividend_repository (
    user_id, ticker, ex_date, ...
  ) VALUES (?, ?, ?, ...)
`).bind(userId, holding.ticker, exDate, ...).run()
```

**After**:
```typescript
const existing = await DB.prepare(`
  SELECT id FROM dividend_repository
  WHERE ticker = ? AND ex_date = ?
`).bind(holding.ticker, exDate).first()

await DB.prepare(`
  INSERT INTO dividend_repository (
    ticker, ex_date, ...
  ) VALUES (?, ?, ...)
`).bind(holding.ticker, exDate, ...).run()
```

### 2. Query Endpoint

**Before**:
```typescript
let query = `
  SELECT dr.*, c.company_name
  FROM dividend_repository dr
  LEFT JOIN companies c ON dr.ticker = c.ticker AND c.user_id = dr.user_id
  WHERE dr.user_id = ?
`
```

**After**:
```typescript
let query = `
  SELECT dr.*, c.company_name
  FROM dividend_repository dr
  LEFT JOIN companies c ON dr.ticker = c.ticker AND c.user_id = ?
  WHERE 1=1
`
// User-agnostic dividends, user-specific company names
```

### 3. Status Values

**Before**: `'pending'`, `'applied'`  
**After**: `'active'`, `'deprecated'`, `'corrected'`

**Reasoning**:
- `'active'`: Current, valid dividend data
- `'deprecated'`: Old data, superseded by correction
- `'corrected'`: Updated/corrected dividend amount

## Migration Details

### Migration File: 0026_make_dividends_user_agnostic.sql

```sql
-- Drop old table with user_id
DROP TABLE IF EXISTS dividend_repository;

-- Recreate without user_id
CREATE TABLE dividend_repository (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  ex_date DATE NOT NULL,
  ...
  UNIQUE(ticker, ex_date)
);

-- Indexes
CREATE INDEX idx_dividend_repository_ticker ON dividend_repository(ticker);
CREATE INDEX idx_dividend_repository_ex_date ON dividend_repository(ex_date);
CREATE INDEX idx_dividend_repository_pay_date ON dividend_repository(pay_date);
CREATE INDEX idx_dividend_repository_status ON dividend_repository(status);
```

## API Behavior

### Fetch Dividends
```
POST /api/dividend-repository/fetch

Behavior:
1. Get all unique tickers from user's stock_holdings
2. For each ticker:
   - Call RapidAPI /history/{ticker}
   - For each dividend:
     * Check if exists: WHERE ticker = ? AND ex_date = ?
     * If exists: UPDATE (deduplicated globally)
     * If not: INSERT (new dividend for all users)
3. Multiple users fetching same ticker = no duplicates
```

### Query Dividends
```
GET /api/dividend-repository?ticker=AAPL

Behavior:
1. Return all dividends matching filters
2. Join with user's companies table for company names
3. All users see same dividend data
```

## Benefits of User-Agnostic Approach

### 1. **Data Efficiency**
- Before: 1,000 users × 100 tickers = 100,000 dividend records
- After: 100 unique tickers = 100 dividend records
- **Savings**: 99.9% reduction in storage

### 2. **Fetch Efficiency**
- Before: Each user fetches same dividends separately
- After: First user fetches, all users benefit
- **Bonus**: Subsequent fetches just update existing data

### 3. **Data Consistency**
- Before: User A and User B might have different amounts for same dividend
- After: Single source of truth for each dividend
- **Benefit**: No data conflicts

### 4. **Simpler Application Logic**
```
Before (user-specific):
- Find user's dividends for ticker
- Find user's holdings for ticker
- Match and calculate

After (user-agnostic):
- Find global dividends for ticker
- Find user's holdings for ticker
- Match and calculate
- (Same logic, simpler queries)
```

## Testing Results

```
✅ All 93 regression tests passing
✅ Build successful (364.26 kB)
✅ Migration applied locally
✅ Service restarted and online
✅ Git committed: b680a65
```

## Future: Dividend Application Workflow

### When User Applies Dividends

```sql
-- Step 1: User views dividends
SELECT * FROM dividend_repository
WHERE ticker IN (
  SELECT DISTINCT ticker FROM stock_holdings WHERE user_id = ?
)
AND status = 'active'
ORDER BY ex_date DESC;

-- Step 2: User selects dividend to apply
-- dividend_id = 123 (ticker: AAPL, ex_date: 2024-03-15, amount: 0.24)

-- Step 3: Find eligible holdings
SELECT * FROM stock_holdings
WHERE user_id = ?
  AND ticker = 'AAPL'
  AND opened_date < '2024-03-15'  -- Before ex_date
  -- Note: Don't check closed_date - dividend earned based on ex_date

-- Step 4: For each holding, create adjustment
INSERT INTO cost_basis_adjustments (
  user_id,
  stock_trade_id,
  adjustment_type,
  amount,
  adjustment_date,
  notes,
  dividend_repository_id  -- Link to global dividend
) VALUES (
  ?,
  holding.id,
  'DIVIDEND',
  0.24 × holding.shares_held,
  '2024-03-29',  -- pay_date
  'AAPL dividend: $0.24 × 100 shares',
  123  -- dividend_repository.id
);

-- Step 5: Track application
INSERT INTO dividend_applications (
  user_id,
  dividend_repository_id,
  holding_id,
  shares_applied,
  amount_applied,
  applied_at
) VALUES (?, 123, holding.id, 100, 24.00, NOW());
```

## Deployment Checklist

### Local Development
- [x] Migration 0026 created
- [x] Migration applied locally
- [x] Code updated (fetch, query, scheduled)
- [x] Build successful
- [x] Service restarted
- [x] All tests passing
- [x] Git committed

### Production Deployment
- [ ] Apply migration: `npx wrangler d1 migrations apply webapp-production`
- [ ] Deploy: `npx wrangler pages deploy dist --project-name webapp`
- [ ] Verify Cloudflare cron status
- [ ] Test manual fetch
- [ ] Monitor first scheduled run

## Documentation Updates

### Files Updated
1. **migrations/0026_make_dividends_user_agnostic.sql** (new)
2. **src/index.tsx** (fetch, query, scheduled handlers updated)
3. **This file** - v2.1 update summary

### Files to Update
- [ ] DIVIDEND_REPOSITORY_V2.md (add v2.1 section)
- [ ] DIVIDEND_REPOSITORY_V2_SUMMARY.md (add v2.1 section)
- [ ] DIVIDEND_REPOSITORY_QUICK_REFERENCE.md (update structure)
- [ ] README.md (mention user-agnostic dividends)

## Key Points to Remember

1. **Dividends are global**: One record per (ticker, ex_date) for all users
2. **No data duplication**: Massive storage and efficiency gains
3. **Application is still per-user**: Each user applies dividends to their own holdings
4. **Status changed**: 'active' instead of 'pending' (not user-specific state)
5. **Future-proof**: Application feature will link cost_basis_adjustments to global dividends

## Summary

Version 2.1 removes user_id from dividend_repository, making dividends universal data that all users share. This is more efficient, consistent, and aligns with the fact that dividends are universal market events.

When the application feature is built, users will:
1. View global dividend repository filtered by their holdings
2. Select dividends to apply
3. System creates user-specific cost_basis_adjustments
4. Adjustments link back to global dividend records

**Status**: ✅ Ready for production deployment

---

**Version History**:
- v1.0: Initial implementation with holding_id and shares calculation
- v2.0: Removed holding_id, simplified to ticker-based with user_id
- v2.1: Removed user_id, made dividends user-agnostic (current)

**Commit**: b680a65  
**Date**: March 19, 2026  
**All Tests Passing**: 93/93 ✅
