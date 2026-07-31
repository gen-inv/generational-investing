# Dividend Transaction Reconciliation Fix

**Date:** 2026-07-31  
**Issue:** FTN.TO dividends showing incorrect amounts due to missing transaction history  
**Status:** ✅ FIXED

## Problem Description

User reported that FTN.TO dividends for June and July 2026 in the TFSA account were showing much lower amounts than expected:

**Expected (2,057 shares):**
- June: 2,057 × $0.126 × 0.8 (withholding) = $207.34
- July: 2,057 × $0.1257 × 0.8 (withholding) = $206.86

**What was recorded:**
- June: $120.96 (based on 1,200 shares)
- July: $120.67 (based on 1,200 shares)

## Root Cause Analysis

### The Discrepancy
- `stock_holdings.total_shares` showed **2,057 shares** (CORRECT - matches real life)
- `stock_transactions` only had **1,200 shares** worth of BUY transactions
- Missing: **857 shares**

### Why This Happened

1. **Migration Background**: Migration `0020_create_stock_holdings_and_transactions.sql` created the dual-table architecture by:
   - Calculating `total_shares` from `stock_trades` table (line 61)
   - Creating transaction records from `stock_trades` table (lines 73-88)

2. **The Problem**: At the time of migration, the `stock_trades` table only had 2 transactions:
   - 2025-02-24: BUY 1,000 shares @ $6.65
   - 2025-03-05: BUY 200 shares @ $5.99
   - **Total: 1,200 shares**

3. **How total_shares became 2,057**: The likely scenario is:
   - In the old system, user directly updated share counts (like editing a spreadsheet)
   - The migration preserved this correct value (2,057)
   - But only created transactions for the explicitly entered trades (1,200)
   - Missing 857 shares had no transaction records

### Similar to Previous Issue

User mentioned: *"I know after one of our updates the entire cost_basis_adjustments table got deleted, and we did the best we could re-creating it."*

This confirms that data reconstruction has happened before, and some historical transaction details were lost in the process.

## Solution Implemented

### Step 1: Add Reconciliation Transaction

Added a reconciliation BUY transaction for the missing 857 shares:

```sql
INSERT INTO stock_transactions (
  user_id, holding_id, transaction_type, shares, price_per_share, 
  transaction_date, commission, notes, created_at
) VALUES (
  1, 3, 'BUY', 857, 3.35, 
  '2025-02-24', 0, 
  '[RECONCILIATION] Missing transaction - calculated to match total_shares and average_price', 
  CURRENT_TIMESTAMP
)
```

**How the price was calculated:**
- Current `average_price` in `stock_holdings`: $5.212236
- Known purchases cost: 1,000 × $6.65 + 200 × $5.99 = $7,848
- Total cost for 2,057 shares: 2,057 × $5.212236 = $10,721.68
- Missing cost: $10,721.68 - $7,848 = $2,873.68
- Price per missing share: $2,873.68 / 857 = **$3.35**

### Step 2: Update Dividend Records

Updated the June and July dividends to reflect the correct share count:

```sql
-- June 2026 dividend
UPDATE cost_basis_adjustments
SET amount = 207.34,
    notes = 'Added 07/17/2026. Ex-date: 2026-06-30 [CORRECTED: Updated to reflect 2,057 shares]'
WHERE id = 638;

-- July 2026 dividend  
UPDATE cost_basis_adjustments
SET amount = 206.86,
    notes = 'Added 07/31/2026. Ex-date: 2026-07-31 [CORRECTED: Updated to reflect 2,057 shares]'
WHERE id = 661;
```

## Verification

### Transaction History (after fix):
```
Date         Shares  Price   Total Cost
2025-02-24   1,000   $6.65   $6,650.00
2025-02-24   857     $3.35   $2,870.95  [RECONCILIATION]
2025-03-05   200     $5.99   $1,198.00
----------------------------------------
TOTAL        2,057           $10,718.95
Average Price: $5.21 ✅ (matches stock_holdings)
```

### Dividend Verification:
```
Month   Per Share (repo)  Shares  Withholding  Amount
June    $0.126            2,057   20%          $207.34 ✅
July    $0.1257           2,057   20%          $206.86 ✅
```

## Impact

### Before Fix
- ❌ Dividends calculated on 1,200 shares instead of 2,057
- ❌ Missing $86.38 in June dividend
- ❌ Missing $86.19 in July dividend
- ❌ Total underreporting: $172.57 per month

### After Fix
- ✅ Transaction history now matches total_shares
- ✅ Dividends correctly calculated on 2,057 shares
- ✅ Historical dividend amounts corrected
- ✅ Future dividend calculations will be accurate
- ✅ Average price preserved correctly

## Prevention

To prevent this issue in the future:

1. **Never update total_shares directly** - Always create transactions
2. **Reconciliation checks** - Periodically verify that SUM(transactions) = total_shares
3. **Migration validation** - When migrating data, validate transaction completeness
4. **Transaction immutability** - Mark reconciliation transactions clearly for audit trail

## Files Modified

**Database changes only** - no code changes required:
- Added 1 transaction to `stock_transactions` table (holding_id 3)
- Updated 2 records in `cost_basis_adjustments` table (IDs 638, 661)

## Related Issues

- **Cost Basis Adjustments Rebuild**: Previous incident where cost_basis_adjustments table was deleted and reconstructed
- **Dividend Calculation Logic**: No changes needed - withholding calculation (20% for TFSA/Cash) is working correctly
- **Historical Share Calculation**: System correctly uses transaction history to calculate shares held on ex-dates

## Notes for Other Holdings

This same issue may exist for other FTN.TO holdings and other tickers. If you notice dividends that seem too low:

1. Check if `total_shares` matches SUM of transactions:
   ```sql
   SELECT 
     sh.id,
     sh.ticker,
     sh.total_shares,
     COALESCE(SUM(CASE WHEN st.transaction_type = 'BUY' THEN st.shares ELSE -st.shares END), 0) as calculated_shares
   FROM stock_holdings sh
   LEFT JOIN stock_transactions st ON sh.holding_id = st.holding_id
   WHERE sh.user_id = ?
   GROUP BY sh.id
   HAVING total_shares != calculated_shares
   ```

2. If discrepancy found, add reconciliation transaction following the same methodology

## Conclusion

The dividend calculation code was working correctly - it properly:
- ✅ Used historical transaction data to determine shares owned on ex-date
- ✅ Applied 20% withholding for TFSA and Cash accounts
- ✅ Used correct per-share amounts from dividend repository

The issue was **missing transaction data** from incomplete historical records, not a bug in the calculation logic. The fix adds the missing transaction and updates the affected dividend records.
