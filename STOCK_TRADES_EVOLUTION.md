# Stock Trades Evolution - Complete

**Date**: January 28, 2026  
**Status**: ✅ Complete and Tested

## Overview

Evolved the Stock Trades system with proper database relationships, enhanced UI, and cost basis tracking.

## Changes Implemented

### 1. Database Schema
- ✅ Added `commission` field to stock_trades table (migration 0005)
- ✅ Existing fields: `company_id` (FOREIGN KEY), `account_id` (FOREIGN KEY)

### 2. Backend API

#### GET /api/stocks
- ✅ Joins with `accounts` and `companies` tables
- ✅ Calculates `avg_price` from trade price
- ✅ Calculates `cost_basis` from adjustments (dividends + covered calls)
- ✅ Returns enhanced data with account_name, company_name
- ✅ Filters by `?open=true/false`

#### POST /api/stocks
- ✅ **Requires** `company_id` (validated)
- ✅ **Requires** `account_id` (validated)
- ✅ Auto-fills `ticker` from company
- ✅ Accepts `commission` field
- ✅ Always creates trades as `is_open = 1`
- ✅ Removed `cost_basis_adjustment` from creation (calculated from adjustments table)
- ✅ Removed `is_open` checkbox from form (always open when created)

#### PUT /api/stocks/:id
- ✅ Validates company and account belong to user
- ✅ Updates all fields including commission
- ✅ Proper error handling

#### PUT /api/stocks/:id/close (NEW)
- ✅ Closes position (sets `is_open = 0`)
- ✅ Validation checks
- ✅ Error handling

### 3. Frontend UI

#### Stock Trades Table
**New Column Order:**
1. **Account** - Account name (from accounts table)
2. **Ticker** - Company ticker symbol
3. **Open Date** - Trade date
4. **Shares** - Quantity (renamed from "Quantity")
5. **Avg Price** - Average price per share
6. **Cost Basis** - Cost basis per share (after adjustments)
7. **Actions** - Details, Edit, Close buttons

**Removed Columns:**
- ❌ Trade Type (BUY/SELL) - not needed in open positions view
- ❌ Status - only showing open positions

#### Add/Edit Stock Trade Form

**New Fields:**
- ✅ **Company** dropdown (required) - Lists all companies with ticker + name
- ✅ **Account** dropdown (required) - Lists all accounts
- ✅ **Shares** input (renamed from "Quantity")
- ✅ **Commission** input (with default 0)

**Removed Fields:**
- ❌ Cost Basis Adjustment (calculated from adjustments table)
- ❌ Position Open checkbox (always open when created)

**Smart Features:**
- ✅ Auto-fills ticker from selected company
- ✅ Shows helpful links to manage companies/accounts
- ✅ Pre-fills today's date
- ✅ Validates required fields
- ✅ Clear error messages

#### Stock Details Modal (NEW)
Shows comprehensive position details:
- Account and Company info
- Ticker and Trade Date
- Shares and Avg Price
- **Cost Basis per Share** (highlighted in gold)
- Commission
- Total Value and Total Cost Basis
- **Cost Basis Adjustments** (from dividends/covered calls)
- Notes (if any)
- Actions: Edit Trade, Close Position

#### Actions
1. **Details** (ℹ️) - Opens detailed modal
2. **Edit** (✏️) - Opens edit form
3. **Close** (✓) - Closes position with confirmation

### 4. Data Flow

```
User creates stock trade:
1. Selects Company (required) → auto-fills ticker
2. Selects Account (required)
3. Enters trade details (shares, price, commission, date)
4. Backend validates company_id and account_id
5. Creates trade with is_open = 1
6. Returns success

View stock trades:
1. Frontend calls GET /api/stocks?open=true
2. Backend joins accounts + companies tables
3. Calculates cost basis from adjustments
4. Returns enhanced data
5. Frontend displays in table with proper columns

Close position:
1. User clicks Close button
2. Confirms action
3. Backend sets is_open = 0
4. Position removed from open positions view
```

## Technical Details

### Cost Basis Calculation

```typescript
// Backend calculation
const total_adjustments = SUM(amount) FROM cost_basis_adjustments 
WHERE stock_trade_id = st.id 
AND adjustment_type IN ('DIVIDEND', 'COVERED_CALL')

const cost_basis = avg_price - (total_adjustments / quantity)
```

**Example:**
- Buy 100 shares @ $50.00 = $5,000
- Receive $200 dividend = $2 per share adjustment
- Sell 2 covered calls @ $100 premium each = $2 per share adjustment
- **New Cost Basis**: $50.00 - $2.00 - $2.00 = **$46.00/share**

### Database Relationships

```
stock_trades
├── user_id → users(id)
├── company_id → companies(id) [REQUIRED]
└── account_id → accounts(id) [REQUIRED]

cost_basis_adjustments
└── stock_trade_id → stock_trades(id)
```

## Testing

### Manual Testing
```bash
# 1. Create test data
- Register user
- Create company (e.g., AAPL)
- Create account (e.g., "TFSA - Questrade")

# 2. Create stock trade
- Select company
- Select account
- Enter 100 shares @ $150
- Commission: $5
- Save

# 3. Verify
- Trade appears in table
- Account name shows correctly
- Avg Price: $150.00
- Cost Basis: $150.00 (no adjustments yet)
- Details button shows full info

# 4. Close position
- Click Close button
- Confirm
- Position removed from open view
```

### Regression Tests
✅ All 19 tests passing

## Files Changed

### Backend
- `src/index.tsx`
  - Updated GET /api/stocks (lines ~1166-1230)
  - Updated POST /api/stocks (lines ~1231-1300)
  - Updated PUT /api/stocks/:id (lines ~1301-1350)
  - Added PUT /api/stocks/:id/close (lines ~1351-1380)

### Frontend
- `public/static/app.js`
  - Updated `loadStocks()` - new table columns
  - Replaced `showStockForm()` - new form fields
  - Added `showStockDetails()` - details modal
  - Added `closeStock()` - close position
  - Updated `editStock()` and `deleteStock()`

### Database
- `migrations/0005_add_commission_to_stock_trades.sql`
  - Added commission DECIMAL(10,2) DEFAULT 0

### HTML
- `src/index.tsx` (stocks-section)
  - Updated table headers to new column order

## User Experience

### Before
- Generic "Account Type" field
- No company validation
- Manual ticker entry (error-prone)
- Cost basis mixed with form
- Edit and Delete only

### After
- ✅ Select from existing companies (validated)
- ✅ Select from existing accounts (validated)
- ✅ Ticker auto-filled from company
- ✅ Commission field for accurate tracking
- ✅ Cost basis calculated from adjustments
- ✅ Details modal with full information
- ✅ Three clear actions: Details, Edit, Close
- ✅ Better column organization

## Benefits

1. **Data Integrity**
   - Foreign key constraints
   - Validation at API level
   - Can't create trades without company/account

2. **Accuracy**
   - Commission tracking
   - Cost basis auto-calculated
   - Adjustments from dividends/covered calls

3. **User-Friendly**
   - Company dropdown (no typos)
   - Account dropdown (clear naming)
   - Details modal (full information)
   - Clear action buttons

4. **Professional**
   - Clean table layout
   - Proper cost basis tracking
   - Industry-standard terminology

## Next Steps

**Completed:**
- ✅ Stock trades require company + account
- ✅ Commission field added
- ✅ Cost basis calculation from adjustments
- ✅ New table columns (Account, Shares, Avg Price, Cost Basis)
- ✅ Details/Edit/Close actions
- ✅ All regression tests passing

**Future Enhancements:**
- Add filters (by account, by company, by date range)
- Bulk operations (close multiple positions)
- Export to CSV
- Profit/Loss calculations for closed positions
- Position performance metrics
- Dividend tracking integration
- Covered calls integration (Phase 3)

## URLs

**Application**: https://3000-imi5lx8i4w7yx1t3dzzid-cc2fbc16.sandbox.novita.ai

**Test Flow:**
1. Login/Register
2. Add a company (Companies → Add Company)
3. Create an account (Accounts → Add Account)
4. Add stock trade (Stock Trades → Add Trade)
5. View details, edit, or close position

---

**Git Commit**: 267abfe  
**Status**: ✅ Production Ready  
**All Tests**: ✅ Passing (19/19)
