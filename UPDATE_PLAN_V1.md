# Website Update v1 - Implementation Plan

## ✅ COMPLETED

### 1. Database Schema Updates
- ✅ Added `account_name` field to `account_balances` table
- ✅ Created new `accounts` table for individual account tracking
- ✅ Added `short_strike`, `long_strike`, `spread_width` fields to `option_trades`
- ✅ Added `account_id` to both `option_trades` and `stock_trades` tables
- ✅ Created necessary indexes for performance
- ✅ Migration applied successfully

## 🔄 IN PROGRESS - REQUIRES IMPLEMENTATION

### 2. Company Updates

**Requirements:**
- ✅ Next Earnings Date field already exists in database
- ⏳ Add "Fetch Earnings Date" button in Company Actions
- ⏳ Implement earnings date lookup from Nasdaq.com or Yahoo Finance

**Implementation Notes:**
- Need to integrate with financial API (Alpha Vantage, Financial Modeling Prep, or Yahoo Finance)
- Button should appear next to Edit/Delete in company table
- Should update the `next_earnings_date` field automatically

### 3. Account Management

**Requirements:**
- ⏳ Create new "Accounts" section separate from "Account Balances"
- ⏳ Ability to add individual accounts (e.g., "RRSP - Questrade", "TFSA - TD")
- ⏳ Each account has: name, type (Cash/RESP/RRSP/LIRA), balances (CAD/USD), cash
- ⏳ Update balances per account (not just by type)
- ⏳ Update cash per account

**Implementation Notes:**
- New table `accounts` is created
- Need new API endpoints: GET /api/accounts, POST /api/accounts, PUT /api/accounts/:id
- Update frontend to have "Accounts" tab
- Link trades to specific account IDs instead of account types

### 4. Option Trades - Major Refactor

**Current Issues:**
- Generic "Strike Price" fields don't match trading terminology
- Missing spread width for multi-leg strategies
- Covered Calls shouldn't be in options form

**Required Changes:**

#### A. Selling Puts (Stockpiling)
- Strike Price → "Strike Price (Short)"
- Store in: `short_strike` field
- Keep: premium, quantity, expiration, account_id

#### B. Buying Puts
- Strike Price → "Strike Price (Long)"
- Store in: `long_strike` field
- Keep: premium, quantity, expiration, account_id

#### C. Credit Spreads
- Strike Price → "Strike Price (Short)"
- Add: "Spread Width" field
- Store in: `short_strike` and `spread_width`
- Keep: premium, quantity, expiration, account_id

#### D. Debit Spreads
- Strike Price → "Strike Price (Long)"
- Add: "Spread Width" field
- Store in: `long_strike` and `spread_width`
- Keep: premium, quantity, expiration, account_id

#### E. Iron Condors
- Two strike fields needed:
  - "Strike Price (Short Put)"
  - "Strike Price (Short Call)"
- Add: "Spread Width" field
- Store in: `short_strike` (put), `strike_price_2` (call), `spread_width`
- Keep: premium, quantity, expiration, account_id

#### F. Covered Calls - REMOVE from Options Form
- Move to Stock Details screen
- Only available when viewing a specific stock position
- Automatically associates with the stock position

#### G. UI Changes
- Hide "Position Open" checkbox
- Auto-set `is_open = 1` on save
- Link to specific account (dropdown of user's accounts), not account type
- Dynamic form that changes fields based on strategy selected

### 5. Stock Trades Updates

**Requirements:**
- ⏳ Add Covered Call button/section in stock details view
- ⏳ Link to specific account_id instead of account_type
- ⏳ Show covered call history for that stock position

**Implementation Notes:**
- When viewing a stock position, show "Sell Covered Call" button
- Form should auto-fill ticker from stock position
- Record covered call premium as cost basis reduction

### 6. Reporting Enhancements

**Requirements:**
- ⏳ P/L per strategy (breakdown by SELLING_PUT, CREDIT_SPREAD, etc.)
- ⏳ P/L per month (current year, month-by-month)
- ⏳ P/L YTD (Year-to-Date total)
- ⏳ Portfolio balance graph over time (1 Year view, All-time view)

**Implementation Notes:**
- New endpoint: GET /api/reports/pl-by-strategy
- New endpoint: GET /api/reports/pl-by-month?year=2026
- New endpoint: GET /api/reports/pl-ytd
- New endpoint: GET /api/reports/portfolio-history?period=1y|all
- Add Chart.js for graphing
- Create new "Analytics" or enhanced "Reports" tab

### 7. Account Linking

**Requirements:**
- ⏳ Update all trades to use `account_id` instead of `account_type`
- ⏳ Migrate existing data if needed
- ⏳ Update all forms to show account dropdown

**Implementation Notes:**
- Backend: All trade creation/update must include account_id
- Frontend: Replace account_type dropdowns with account selection
- Display: Show account name in trade lists

## 📊 DATABASE CHANGES SUMMARY

### New Tables
```sql
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  account_name VARCHAR(100) NOT NULL,  -- e.g., "RRSP - Questrade"
  account_type TEXT NOT NULL,          -- Cash, RESP, RRSP, LIRA
  balance_cad DECIMAL(15, 2),
  balance_usd DECIMAL(15, 2),
  cash_balance_usd DECIMAL(15, 2),
  created_at DATETIME,
  updated_at DATETIME
)
```

### Modified Tables

**option_trades:**
- Added: `short_strike` DECIMAL(10, 2)
- Added: `long_strike` DECIMAL(10, 2)
- Added: `spread_width` DECIMAL(10, 2)
- Added: `account_id` INTEGER
- Deprecated: `strike_price`, `strike_price_2`, `strike_price_3`, `strike_price_4`

**stock_trades:**
- Added: `account_id` INTEGER

**account_balances:**
- Added: `account_name` VARCHAR(100)

## 🎯 IMPLEMENTATION PRIORITY

### Phase 1: Critical (Do First)
1. ✅ Database migration
2. Create Accounts management (add, edit, list)
3. Update option trades form with strategy-specific fields
4. Link trades to account_id

### Phase 2: Important (Do Next)
5. Move Covered Calls to Stock details
6. Implement earnings date fetch button
7. Enhanced P/L reporting

### Phase 3: Nice to Have (Do Last)
8. Portfolio balance history graph
9. Additional analytics and visualizations

## 📝 NOTES

- All existing data needs to be carefully migrated
- Old strike_price fields kept for backward compatibility
- Forms need conditional rendering based on strategy type
- Need API key for financial data (earnings dates)
- Chart.js CDN already included for graphing

## 🚀 ESTIMATED EFFORT

- Phase 1: 6-8 hours
- Phase 2: 4-6 hours
- Phase 3: 3-4 hours
- **Total: 13-18 hours of development time**

## ⚠️ BREAKING CHANGES

- Option trade form structure changes significantly
- Account management moves from type-based to individual accounts
- Covered calls removed from main options form

## 🔄 MIGRATION STRATEGY

1. Run database migration (✅ Done)
2. Create default accounts for existing account types
3. Migrate existing trades to link to account_ids
4. Update API endpoints
5. Update frontend forms
6. Test all functionality
7. Deploy updates

---

**Status:** Database migration complete. Ready to implement frontend/backend changes.
**Next Step:** Choose which phase to implement first, or implement all phases together.
