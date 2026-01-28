# Initial Balance History Tracking

## Overview

**Status**: ✅ **FULLY IMPLEMENTED**

When a new account is created, the system **automatically saves the initial balance to the `account_balance_history` table**. This ensures that every account has a complete historical record from day one, enabling accurate portfolio growth tracking over time.

## How It Works

### 1. Account Creation Flow

When you create a new account via `POST /api/accounts`:

```json
{
  "account_name": "My TFSA - CAD",
  "account_type": "TFSA",
  "default_currency": "CAD",
  "balance_cad": 50000,
  "balance_usd": 0,
  "cash_balance_cad": 10000,
  "cash_balance_usd": 0
}
```

**The system automatically:**

1. **Inserts the account** into the `accounts` table
2. **Gets the current month and year** (e.g., January 2026)
3. **Fetches exchange rates** for the current month
4. **Determines the balance in default currency**:
   - CAD account: uses `balance_cad` and `cash_balance_cad`
   - USD account: uses `balance_usd` and `cash_balance_usd`
5. **Saves initial snapshot** to `account_balance_history` table

### 2. History Record Structure

Each initial balance record includes:

```json
{
  "id": 1,
  "user_id": 3,
  "account_id": 5,
  "balance": 50000,
  "cash_balance": 10000,
  "currency": "CAD",
  "month": 1,
  "year": 2026,
  "exchange_rate_to_usd": 0.7407407407407407,
  "exchange_rate_to_cad": 1.35,
  "created_at": "2026-01-28 17:38:53"
}
```

### 3. Code Implementation

**Location**: `src/index.tsx` lines 329-361

```typescript
// Save initial balance to history
const now = new Date();
const currentMonth = now.getMonth() + 1;
const currentYear = now.getFullYear();

// Get exchange rates
const rateResponse = await fetch(`${c.req.url.split('/api')[0]}/api/exchange-rate?month=${currentMonth}&year=${currentYear}`, {
  headers: { 'Authorization': c.req.header('Authorization') || '' }
});
const rates = await rateResponse.json() as any;

// Determine balance and currency based on default_currency
const historyBalance = default_currency === 'CAD' ? balance_cad : balance_usd;
const historyCash = default_currency === 'CAD' ? cash_balance_cad : cash_balance_usd;

// Save initial snapshot to history
await DB.prepare(`
  INSERT INTO account_balance_history (
    user_id, account_id, balance, cash_balance, currency,
    month, year, exchange_rate_to_usd, exchange_rate_to_cad
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).bind(
  userId,
  accountId,
  historyBalance,
  historyCash,
  default_currency,
  currentMonth,
  currentYear,
  rates.cad_to_usd || (1 / rates.usd_to_cad),
  rates.usd_to_cad || 1.35
).run();
```

## Benefits

### 1. Complete Historical Record
- **Every account** has history from creation date
- **No gaps** in historical data
- **Accurate baseline** for growth calculations

### 2. Portfolio Growth Tracking
With initial balances saved, you can:
- Calculate **month-over-month growth**
- Generate **portfolio growth charts**
- Track **year-over-year performance**
- Compare **accounts over time**

### 3. Future-Ready
This foundation enables future features:
- **Growth charts** (line charts showing balance over time)
- **Performance metrics** (ROI, CAGR, etc.)
- **Historical comparisons** (compare accounts, years, etc.)
- **Export reports** with complete history

## Examples

### Example 1: CAD Account

**Create Account:**
```bash
POST /api/accounts
{
  "account_name": "My TFSA - CAD",
  "account_type": "TFSA",
  "default_currency": "CAD",
  "balance_cad": 50000,
  "cash_balance_cad": 10000
}
```

**History Record Created:**
```json
{
  "account_id": 5,
  "balance": 50000,
  "cash_balance": 10000,
  "currency": "CAD",
  "month": 1,
  "year": 2026
}
```

### Example 2: USD Account

**Create Account:**
```bash
POST /api/accounts
{
  "account_name": "My RRSP - USD",
  "account_type": "RRSP",
  "default_currency": "USD",
  "balance_usd": 80000,
  "cash_balance_usd": 15000
}
```

**History Record Created:**
```json
{
  "account_id": 6,
  "balance": 80000,
  "cash_balance": 15000,
  "currency": "USD",
  "month": 1,
  "year": 2026
}
```

## Testing

### Run Comprehensive Test

```bash
cd /home/user/webapp
./test_initial_balance_history.sh
```

### Test Results

**Test accounts created:**
- ✅ CAD Account (TFSA): $50,000 CAD total, $10,000 CAD cash
- ✅ USD Account (RRSP): $80,000 USD total, $15,000 USD cash

**History records verified:**
- ✅ Each account has exactly ONE initial history record
- ✅ Balances match account creation values
- ✅ Currency matches account's default currency
- ✅ Month and year are current (January 2026)
- ✅ Exchange rates are included

### Manual Verification

**Check all history records:**
```bash
cd /home/user/webapp
npx wrangler d1 execute webapp-production --local \
  --command="SELECT abh.account_id, a.account_name, abh.balance, abh.cash_balance, 
             abh.currency, abh.month, abh.year, abh.created_at 
             FROM account_balance_history abh 
             JOIN accounts a ON abh.account_id = a.id 
             ORDER BY abh.created_at DESC"
```

## Database Schema

### account_balance_history Table

```sql
CREATE TABLE account_balance_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  balance REAL NOT NULL,
  cash_balance REAL NOT NULL,
  currency TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  exchange_rate_to_usd REAL DEFAULT 1.0,
  exchange_rate_to_cad REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, month, year)
);
```

**Key Constraints:**
- `UNIQUE(account_id, month, year)` - One history record per account per month
- `ON DELETE CASCADE` - History deleted when account deleted
- Exchange rates included for future conversions

## Future Enhancements

With this foundation in place, we can build:

### 1. Portfolio Growth Chart
```typescript
// Get historical balances for chart
SELECT month, year, 
       SUM(balance * exchange_rate_to_cad) as total_cad,
       SUM(balance * exchange_rate_to_usd) as total_usd
FROM account_balance_history
WHERE user_id = ?
GROUP BY year, month
ORDER BY year, month
```

### 2. Account Performance Metrics
```typescript
// Calculate ROI for an account
const initialBalance = // First history record
const currentBalance = // Latest history record
const roi = ((currentBalance - initialBalance) / initialBalance) * 100
```

### 3. Year-over-Year Comparison
```typescript
// Compare same month across years
SELECT year, month, SUM(balance) as total
FROM account_balance_history
WHERE user_id = ? AND month = 1
GROUP BY year
ORDER BY year
```

## Key Takeaways

✅ **Automatic**: No manual action needed - happens on account creation  
✅ **Complete**: Every account has history from day one  
✅ **Accurate**: Uses default currency and current exchange rates  
✅ **Future-Ready**: Foundation for growth charts and analytics  
✅ **Tested**: Comprehensive tests verify functionality  

## Related Features

- **Monthly Balance Updates**: Users update balances once per month
- **Balance History Tracking**: Updates also saved to history
- **Multi-Currency Support**: Accounts use default currency (CAD or USD)
- **Exchange Rate Caching**: Monthly rates cached for conversions

## Support

- **Test Script**: `/home/user/webapp/test_initial_balance_history.sh`
- **Code**: `/home/user/webapp/src/index.tsx` lines 329-361
- **Migration**: `/home/user/webapp/migrations/0003_account_history_and_currency.sql`

---

**Last Updated**: January 28, 2026  
**Status**: ✅ Fully Implemented and Tested
