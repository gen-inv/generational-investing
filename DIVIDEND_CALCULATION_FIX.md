# Critical Fix: Dividend Calculation Using Historical Share Ownership

## Date
June 18, 2026

## Problem Identified

**User Report:**
> "The calculations to add dividends to a stock holding from the repository is wrong. When looking at the stock detail modal, the yellow/amber section shows incorrect share amounts for historical dividends. We need to use the share ownership history when showing what dividends to add. If we only owned 200 shares at the time a dividend was issued, that's all we should be allowing the user to Add. Not the entire current share balance."

## Root Cause

The `GET /api/stocks/:id/missing-dividends` endpoint had a **fundamentally flawed fallback logic** that used the **current** `total_shares` value for ALL historical dividend calculations when transaction history was missing.

### Problematic Code (Before Fix)

```typescript
const getSharesHeldOnDate = (targetDate: string) => {
  // If no transactions exist, fallback to stock_holdings.total_shares
  if (!transactions.results || transactions.results.length === 0) {
    // ❌ WRONG: Uses CURRENT total_shares for ALL dates
    if (targetDate >= holding.opened_date) {
      return holding.total_shares || 0
    }
    return 0
  }
  
  // Calculate shares from transactions...
}
```

### Why This Was Wrong

**Example Scenario:**
1. User bought 100 shares of AAPL on January 15, 2025
2. User bought 100 more shares on March 20, 2025
3. AAPL paid dividend on February 1, 2025 (ex-date)
4. User's current holding: 200 shares

**Wrong Behavior (Before Fix):**
- February 1 dividend showed **200 shares** (current total)
- Calculated dividend = $1.00 × 200 = $200.00

**Correct Behavior (After Fix):**
- February 1 dividend shows **100 shares** (actual ownership on ex-date)
- Calculated dividend = $1.00 × 100 = $100.00

## Solution

**Removed the fallback logic entirely** and now require proper transaction history:

```typescript
const getSharesHeldOnDate = (targetDate: string) => {
  // CRITICAL: We MUST have transaction history to calculate accurate share ownership
  // Using current total_shares for all historical dates is WRONG
  if (!transactions.results || transactions.results.length === 0) {
    console.warn(`[DIVIDEND] No transaction history for holding ${holdingId}`)
    return 0  // ✅ Return 0 instead of using current total_shares
  }
  
  // Calculate shares from transaction history
  let sharesHeld = 0
  for (const tx of transactions.results) {
    if (tx.transaction_date <= targetDate) {
      if (tx.transaction_type === 'BUY') {
        sharesHeld += tx.shares
      } else if (tx.transaction_type === 'SELL') {
        sharesHeld -= tx.shares
      }
    }
  }
  return sharesHeld
}
```

## How It Works Now

### Transaction-Based Calculation

For each dividend ex-date, the system:

1. **Queries all transactions** for the holding (BUY and SELL)
2. **Sorts by transaction_date** (ascending)
3. **Accumulates shares** up to the dividend ex-date:
   - BUY transactions: Add shares
   - SELL transactions: Subtract shares
4. **Returns accurate share count** for that specific date

### Example Calculation

**Holdings:**
- Jan 15, 2025: BUY 100 shares @ $150
- Mar 20, 2025: BUY 100 shares @ $155
- May 10, 2025: SELL 50 shares @ $160

**Dividends:**
- Feb 1, 2025 (ex-date): Shows **100 shares** (only had first purchase)
- Apr 15, 2025 (ex-date): Shows **200 shares** (had both purchases)
- Jun 1, 2025 (ex-date): Shows **150 shares** (200 - 50 sold)

## Edge Cases Handled

### 1. No Transaction History
**Old behavior:** Used current total_shares (WRONG)
**New behavior:** Returns 0 shares + warning log

**Action needed:** Run backfill script to create transaction history

### 2. Partial Transaction History
**Example:** Holding has BUY transactions but no SELL transactions
**Behavior:** Calculates correctly based on available BUY transactions

### 3. Holdings Sold Before Dividend
**Example:** Sold all shares on Feb 1, dividend ex-date is Feb 2
**Behavior:** Returns 0 shares (correct - not eligible)

## Backfill Script Support

The system includes a backfill script (`backfill_missing_transactions.sql`) that creates:
1. **BUY transactions** for holdings without any transactions
2. **SELL transactions** for closed holdings without close transactions

**After running backfill:**
- All holdings should have proper transaction history
- The fallback case (no transactions) should be rare
- Dividend calculations will be accurate

## Testing Recommendations

### 1. Test Holdings with Multiple Purchases
```sql
-- Create test holding with multiple purchases
INSERT INTO stock_transactions VALUES
  (userId, holdingId, 'BUY', 100, 150.00, '2025-01-15', 0, 'First purchase'),
  (userId, holdingId, 'BUY', 100, 155.00, '2025-03-20', 0, 'Second purchase');

-- Query missing dividends
GET /api/stocks/:id/missing-dividends

-- Verify:
-- - Jan dividends show 0 shares (before first purchase)
-- - Feb dividends show 100 shares (after first purchase)
-- - Apr dividends show 200 shares (after second purchase)
```

### 2. Test Holdings with Partial Sales
```sql
INSERT INTO stock_transactions VALUES
  (userId, holdingId, 'SELL', 50, 160.00, '2025-05-10', 0, 'Partial sale');

-- Verify:
-- - Jun dividends show 150 shares (200 - 50)
```

### 3. Test Holdings Without Transaction History
```sql
-- Create holding with no transactions
INSERT INTO stock_holdings VALUES
  (userId, accountId, ticker, 200, 155.00, '2025-01-01', ...);

-- Query missing dividends
GET /api/stocks/:id/missing-dividends

-- Verify:
-- - Returns empty array or shows 0 shares
-- - Console shows warning log
-- - User sees message: "No transaction history available"
```

## Deployment

- **Build**: ✅ Successful (412.59 kB)
- **Deployed**: ✅ https://05188a6c.generational-investing.pages.dev
- **Commit**: e450ac0
- **Date**: June 18, 2026

## Impact

### Immediate Benefits
- ✅ **Accurate dividend calculations** based on historical share ownership
- ✅ **Prevents over-payment** of dividend amounts
- ✅ **Historical accuracy** - each dividend reflects actual ownership
- ✅ **Prevents user errors** - can't add dividends for shares not owned

### Long-term Benefits
- ✅ **Data integrity** - forces proper transaction tracking
- ✅ **Audit trail** - clear history of share ownership over time
- ✅ **Compliance** - accurate records for tax reporting

## Related Files
- `src/index.tsx` - Lines 2872-2897 (getSharesHeldOnDate function)
- `backfill_missing_transactions.sql` - Creates transaction history for legacy holdings
- `CRITICAL_BUG_FIX_DUPLICATE_SELLS.md` - Related transaction history fix

## Follow-up Actions

1. **Monitor logs** for warnings about missing transaction history
2. **Run backfill script** if holdings without transactions are detected
3. **User communication** if they see 0 shares - advise to reopen and add proper transaction history
