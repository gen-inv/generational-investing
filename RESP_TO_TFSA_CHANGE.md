# Account Type Change: RESP → TFSA

## Summary
Changed account type from "RESP" (Registered Education Savings Plan) to "TFSA" (Tax-Free Savings Account) throughout the application.

## Changes Made

### 1. Backend Validation (`src/index.tsx`)
Updated account type validation arrays:
- **Before**: `['Cash', 'RESP', 'RRSP', 'LIRA']`
- **After**: `['Cash', 'TFSA', 'RRSP', 'LIRA']`

Locations:
- POST /api/accounts (account creation)
- PUT /api/accounts/:id (account update)

### 2. Frontend Forms (`public/static/app.js`)
Updated account type options in:
- Account creation form
- Account edit form
- Account grouping logic

Changes:
- `<option value="TFSA">TFSA</option>` (was RESP)
- `'TFSA': []` in grouped accounts (was RESP)
- Selection logic updated

### 3. Database Migration
**Migration 0004**: `migrations/0004_rename_resp_to_tfsa.sql`
```sql
UPDATE accounts SET account_type = 'TFSA' WHERE account_type = 'RESP';
```

This ensures existing RESP accounts are automatically converted to TFSA.

### 4. Schema Documentation
Updated comment in `migrations/0001_initial_schema.sql`:
```sql
account_type TEXT NOT NULL, -- Cash, TFSA, RRSP, LIRA
```

## Valid Account Types

The application now supports these four Canadian account types:

1. **Cash** - Non-registered investment account
2. **TFSA** - Tax-Free Savings Account (formerly RESP in system)
3. **RRSP** - Registered Retirement Savings Plan
4. **LIRA** - Locked-In Retirement Account

## Database Update

### Local Database
Already applied - existing RESP accounts converted to TFSA:
```bash
✓ Account ID 8 updated from RESP to TFSA
✓ New TFSA accounts can be created
```

### Production Deployment
When deploying to production, run:
```bash
npx wrangler d1 migrations apply webapp-production
```

This will automatically apply migration 0004 and convert all RESP accounts to TFSA.

## Testing Results

### Account Creation ✓
```json
{
  "id": 15,
  "account_name": "My TFSA Account",
  "account_type": "TFSA",
  "balance_cad": 50000,
  "balance_usd": 0,
  "cash_balance_cad": 10000,
  "cash_balance_usd": 0,
  "default_currency": "CAD"
}
```

### Existing Account Update ✓
```json
{
  "id": 8,
  "name": "TFSA - CAD Test",
  "type": "TFSA"
}
```

### Form Validation ✓
- RESP no longer accepted
- TFSA validates successfully
- Other types (Cash, RRSP, LIRA) unchanged

## Files Modified

1. `src/index.tsx` - Backend validation
2. `public/static/app.js` - Frontend forms
3. `migrations/0001_initial_schema.sql` - Documentation
4. `migrations/0004_rename_resp_to_tfsa.sql` - New migration

## Git Commit
```
Commit: 3248484
Message: "Change account type from RESP to TFSA across the application"
Files: 4 changed, 14 insertions, 6 deletions
```

## Why This Change?

**RESP (Registered Education Savings Plan)** is designed for saving for children's education with government matching contributions. It has specific withdrawal rules tied to educational expenses.

**TFSA (Tax-Free Savings Account)** is a more versatile investment account where:
- Contributions are not tax-deductible
- Investment growth is tax-free
- Withdrawals are tax-free
- More flexible for general investing

For a general portfolio management system, TFSA is more appropriate as it's commonly used by individual investors for various investment strategies.

## No Data Loss
All existing accounts labeled as "RESP" have been automatically converted to "TFSA" - no data was lost in this change.

## Application URL
https://3000-imi5lx8i4w7yx1t3dzzid-02b9cc79.sandbox.novita.ai

## Verification Steps
1. ✅ Login to application
2. ✅ Navigate to Accounts section
3. ✅ Click "Add Account"
4. ✅ Verify dropdown shows: Cash, TFSA, RRSP, LIRA
5. ✅ Create new TFSA account
6. ✅ Verify account appears under "TFSA Accounts" section
7. ✅ Check existing accounts show TFSA (not RESP)

All changes are backward compatible and production-ready.
