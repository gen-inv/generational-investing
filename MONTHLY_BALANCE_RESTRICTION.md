# Monthly Balance Update Restriction with History Tracking

## Overview
Implemented monthly restriction on balance updates to ensure data consistency and automatic historical tracking for future portfolio growth analysis.

## Key Features

### 1. **Once-Per-Month Update Rule**
- Account balances can only be updated once per calendar month
- Restriction is based on `(account_id, month, year)` combination
- Prevents accidental multiple updates in the same month
- Enforced at both backend and frontend levels

### 2. **Automatic History Tracking**
- Every balance update automatically saves to `account_balance_history` table
- Tracks both total balance and cash balance
- Records in the account's default currency
- Includes exchange rates for future currency conversion
- Perfect for building portfolio growth charts

### 3. **User-Friendly Interface**
- Yellow warning banner if already updated this month
- Form fields disabled when update not allowed
- Shows last update timestamp
- Clear messaging about monthly restriction
- Success confirmation with month/year saved

## Implementation Details

### Backend Endpoints

#### 1. Check Update Permission
```
GET /api/accounts/:id/can-update
```

**Response (Can Update):**
```json
{
  "canUpdate": true,
  "month": 1,
  "year": 2026,
  "message": "Balance can be updated"
}
```

**Response (Already Updated):**
```json
{
  "canUpdate": false,
  "month": 1,
  "year": 2026,
  "lastUpdate": "2026-01-28 16:28:20",
  "message": "Balance already updated this month"
}
```

#### 2. Update Balance with History
```
PUT /api/accounts/:id/balance
{
  "balance": 65000,
  "cash_balance": 13000
}
```

**Success Response:**
```json
{
  "success": true,
  "updated": true,
  "month": 1,
  "year": 2026,
  "historySaved": true
}
```

**Error Response (Already Updated):**
```json
{
  "error": "Balance already updated this month",
  "canUpdate": false,
  "month": 1,
  "year": 2026
}
```

### Database Schema

#### account_balance_history Table
```sql
CREATE TABLE account_balance_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  balance REAL NOT NULL,              -- In default currency
  cash_balance REAL NOT NULL,         -- In default currency
  currency TEXT NOT NULL,             -- CAD or USD
  month INTEGER NOT NULL,             -- 1-12
  year INTEGER NOT NULL,              -- YYYY
  exchange_rate_to_usd REAL,          -- For future conversion
  exchange_rate_to_cad REAL,          -- For future conversion
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, month, year)     -- Enforces once-per-month rule
);
```

**Key Points:**
- `UNIQUE(account_id, month, year)` prevents duplicate updates
- Stores balance in default currency (not both CAD and USD)
- Exchange rates cached for future portfolio value calculations
- Cascading delete: history removed if account deleted

### Frontend Updates

#### Update Balance Modal - Before Update
```
┌────────────────────────────────────┐
│  Update Balance                    │
├────────────────────────────────────┤
│  My TFSA Account                   │
│  Account Type: TFSA                │
│  Currency: CAD                     │
│  Last Updated: 1/28/26, 4:13pm     │
│  Update Period: 1/2026             │
│                                    │
│  Total Balance (CAD) *             │
│  [65000.00]         ✓ Enabled      │
│                                    │
│  Cash Balance (CAD) *              │
│  [13000.00]         ✓ Enabled      │
│                                    │
│  [Update Balance] [Close]          │
└────────────────────────────────────┘
```

#### Update Balance Modal - Already Updated
```
┌────────────────────────────────────┐
│  Update Balance                    │
├────────────────────────────────────┤
│  ⚠️ Already Updated This Month     │
│  Balance was updated on 1/28/26.   │
│  You can only update account       │
│  balances once per month.          │
├────────────────────────────────────┤
│  My TFSA Account                   │
│  Account Type: TFSA                │
│  Currency: CAD                     │
│  Last Updated: 1/28/26, 4:28pm     │
│  Update Period: 1/2026             │
│                                    │
│  Total Balance (CAD) *             │
│  [65000.00]         ✗ Disabled     │
│                                    │
│  Cash Balance (CAD) *              │
│  [13000.00]         ✗ Disabled     │
│                                    │
│  [Cannot Update] [Close]           │
└────────────────────────────────────┘
```

## Update Workflow

### Successful Update Flow
1. User clicks $ (dollar sign) icon
2. System checks `GET /api/accounts/:id/can-update`
3. Modal shows: `canUpdate: true`
4. User enters new balances
5. System calls `PUT /api/accounts/:id/balance`
6. Backend:
   - Updates account balances
   - Fetches current exchange rates
   - Saves snapshot to `account_balance_history`
   - Updates `updated_at` timestamp
7. Success alert: "Balance updated successfully! History saved for 1/2026"
8. UI refreshes: accounts list, dashboard totals

### Blocked Update Flow
1. User clicks $ icon
2. System checks `GET /api/accounts/:id/can-update`
3. Modal shows: `canUpdate: false`
4. Yellow warning banner displayed
5. Form fields disabled
6. "Cannot Update" button (disabled)
7. User can only close modal

## Testing Results

### Test 1: Check Update Permission
```bash
GET /api/accounts/15/can-update
Response: canUpdate: true ✓
```

### Test 2: First Update of Month
```bash
PUT /api/accounts/15/balance
{"balance": 65000, "cash_balance": 13000}

Response:
{
  "success": true,
  "updated": true,
  "month": 1,
  "year": 2026,
  "historySaved": true
}
```

### Test 3: Verify History Saved
```sql
SELECT * FROM account_balance_history WHERE account_id = 15;

Results:
{
  "id": 1,
  "user_id": 3,
  "account_id": 15,
  "balance": 65000,
  "cash_balance": 13000,
  "currency": "CAD",
  "month": 1,
  "year": 2026,
  "exchange_rate_to_usd": 0.7407,
  "exchange_rate_to_cad": 1.35,
  "created_at": "2026-01-28 16:28:20"
}
```

### Test 4: Try Second Update (Blocked)
```bash
GET /api/accounts/15/can-update
Response: canUpdate: false ✓

PUT /api/accounts/15/balance
{"balance": 70000, "cash_balance": 14000}

Response:
{
  "error": "Balance already updated this month",
  "canUpdate": false,
  "month": 1,
  "year": 2026
}
```

## Benefits

### 1. Data Integrity
- Prevents accidental overwrites
- Ensures one clean snapshot per month
- Consistent historical data for analysis

### 2. Portfolio Growth Tracking
- Monthly snapshots enable time-series analysis
- Can build charts showing:
  - Account balance growth over time
  - Portfolio value trends
  - Cash vs invested breakdown
  - Multi-account comparisons

### 3. User Protection
- Clear visual indicators
- Can't accidentally update twice
- Shows last update timestamp

### 4. Future-Ready
- Exchange rates stored for historical conversion
- Data structure ready for graphing
- Can calculate year-over-year growth
- Supports multiple currency portfolios

## Example Historical Data

After 6 months of updates:

```sql
SELECT month, year, balance, cash_balance 
FROM account_balance_history 
WHERE account_id = 15 
ORDER BY year, month;
```

| Month | Year | Balance | Cash | Growth |
|-------|------|---------|------|--------|
| 1     | 2026 | 65,000  | 13,000 | - |
| 2     | 2026 | 68,500  | 14,200 | +5.4% |
| 3     | 2026 | 71,200  | 15,000 | +3.9% |
| 4     | 2026 | 69,800  | 14,500 | -2.0% |
| 5     | 2026 | 73,400  | 15,800 | +5.2% |
| 6     | 2026 | 76,900  | 16,500 | +4.8% |

**6-month growth: +18.3%** 📈

## Future Enhancements (Not Implemented)

### Phase 2 - Portfolio Analytics
1. **Growth Charts**
   - Line chart showing balance over time
   - Separate lines for each account
   - Total portfolio value trend
   
2. **Growth Metrics**
   - Month-over-month growth %
   - Year-over-year comparison
   - Average monthly growth
   - Best/worst performing accounts

3. **Cash Flow Analysis**
   - Cash balance trends
   - Investment vs cash ratio
   - Rebalancing suggestions

4. **Export Reports**
   - PDF reports with charts
   - CSV export for analysis
   - Year-end summaries

## Files Modified

1. **Backend** (`src/index.tsx`):
   - Added `GET /api/accounts/:id/can-update`
   - Added `PUT /api/accounts/:id/balance`
   - History tracking on update
   - Monthly restriction validation

2. **Frontend** (`public/static/app.js`):
   - Updated `showUpdateBalanceForm()`
   - Check permission before showing form
   - Display warning if already updated
   - Disable form when restricted
   - Success message shows month/year

## Git Commit

```
Commit: d84bb88
Message: "Add monthly balance update restriction with automatic history tracking"
Files: 2 changed, 211 insertions, 27 deletions
```

## Application URL

https://3000-imi5lx8i4w7yx1t3dzzid-02b9cc79.sandbox.novita.ai

## Testing Steps

### Test Allowed Update
1. ✅ Login to application
2. ✅ Navigate to Accounts
3. ✅ Click $ icon on any account not updated this month
4. ✅ Modal shows green "Update" button enabled
5. ✅ Form fields are editable
6. ✅ Enter new balances
7. ✅ Click "Update Balance"
8. ✅ See success message with month/year
9. ✅ Verify account card shows new balances

### Test Blocked Update
1. ✅ Click $ icon on same account again
2. ✅ Yellow warning banner appears
3. ✅ Form fields are disabled (grayed out)
4. ✅ "Cannot Update" button is disabled
5. ✅ Warning shows last update date
6. ✅ Can only close the modal

### Verify History
```bash
# Check database for saved history
npx wrangler d1 execute webapp-production --local \
  --command="SELECT * FROM account_balance_history WHERE account_id = 15"
```

## Production Deployment

No new migrations needed - `account_balance_history` table already exists from migration 0003.

The system is production-ready and will automatically:
- Track all balance updates
- Enforce monthly restrictions
- Save historical snapshots
- Prepare data for future portfolio analysis

Perfect foundation for building portfolio growth charts! 📊
