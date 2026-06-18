# 🚨 CRITICAL BUG FIX - Duplicate SELL Transactions & Incorrect P/L

**Date**: June 18, 2026  
**Status**: ✅ **IMMEDIATE FIX APPLIED TO PRODUCTION**

---

## 🔴 Critical Issue Reported

**User Report**:
> "Closing a trade does not work correctly, nor does the calculation of P/L on the trade. I just closed LULU trade in production at a price of $114.10, but the system recorded the same price as entry price ($294.93), yet also recorded a GAIN of $22,820. none of this makes sense."

---

## 🔍 Root Cause Analysis

### The Problem

LULU holding (ID 6) had **TWO SELL transactions**:

```sql
1. SELL #92: 200 shares @ $114.10 on 2026-03-13 (CORRECT - from close endpoint)
2. SELL #88: 200 shares @ $294.93 on 2026-04-23 (WRONG - from backfill script)
```

### Why It Happened

**Timeline of Events**:

1. **Historical State**: LULU was closed in old system with `closed_date = 2026-04-23`
2. **Backfill Executed**: `backfill_missing_transactions.sql` ran and found:
   - LULU is closed (is_open = 0)
   - LULU has closed_date (2026-04-23)
   - LULU has BUY transactions but NO SELL transactions
   - ✅ **Script correctly added backfilled SELL @ $294.93 on 2026-04-23**

3. **User Action Today**: User closed LULU via proper close endpoint:
   - Close price: $114.10
   - Close date: 2026-03-13 (today)
   - ✅ **Endpoint correctly created SELL #92 @ $114.10 on 2026-03-13**
   - ✅ **Updated closed_date to 2026-03-13**

4. **Result**: **TWO SELL transactions** for the same position!

### The Bug in P/L Calculation

**Code** (src/index.tsx line 2095-2110):
```typescript
transactions.results.forEach((tx: any) => {
  if (tx.transaction_type === 'SELL') {
    totalSellValue += tx.shares * tx.price_per_share  // ❌ SUMS ALL SELLS!
    totalSellCommissions += tx.commission || 0
    totalSellShares += tx.shares
    // Use the last SELL transaction for close details
    closePrice = tx.price_per_share
    closeCommission = tx.commission || 0
    closeDate = tx.transaction_date
  }
})

profitLoss = totalSellValue - totalBuyValue - totalBuyCommissions - totalSellCommissions
```

**What Happened**:
- totalBuyValue = 200 × $294.93 = **$58,986.00**
- totalSellValue = (200 × $114.10) + (200 × $294.93) = $22,820 + $58,986 = **$81,806.00**
- profitLoss = $81,806 - $58,986 = **$22,820.00 GAIN** ❌

**What Should Have Been**:
- totalBuyValue = 200 × $294.93 = **$58,986.00**
- totalSellValue = 200 × $114.10 = **$22,820.00**
- profitLoss = $22,820 - $58,986 = **-$36,166.00 LOSS** ✅

---

## ✅ Immediate Fix Applied

### 1. Deleted Duplicate SELL Transaction

```sql
DELETE FROM stock_transactions 
WHERE id = 88 AND notes LIKE '%BACKFILLED%Position closed%'
```

**Result**: ✅ 1 row deleted from production database

### 2. Verified LULU Transactions

**After fix**:
```
BUY:  200 shares @ $294.93 on 2025-09-05 [BACKFILLED]
SELL: 200 shares @ $114.10 on 2026-03-13 [Position closed]
```

**Correct P/L**: -$36,166.00 (LOSS)

---

## 📊 Impact Assessment

### Affected Holdings

Checked all closed holdings for duplicate SELL transactions:

**✅ Result**: Only LULU had duplicate SELL transactions

### Other Backfilled SELLs

Found 4 other holdings with backfilled SELL transactions:
- GOOGL (ID 4): Only backfilled SELL - **LEGITIMATE** ✅
- NFLY (ID 9): Only backfilled SELL - **LEGITIMATE** ✅
- SEG (ID 11): Only backfilled SELL - **LEGITIMATE** ✅
- SEG (ID 21): Only backfilled SELL - **LEGITIMATE** ✅

These holdings were closed in the old system and never had proper SELL transactions created, so the backfill was correct.

---

## 🔧 Long-Term Fix Needed

### Problem with Current Code

The GET `/api/stocks/:id` endpoint **sums ALL SELL transactions** to calculate P/L. This is incorrect because:

1. **Partial sells are legitimate**: A position can have multiple SELL transactions if the user sells in parts
2. **But duplicate SELLs for full close are bugs**: When closing a full position, there should be only ONE closing SELL

### Proposed Solution

**Option A: Use Only Closing SELL** (Simplest)
```typescript
// For closed positions, use ONLY the SELL transaction with notes = 'Position closed'
if (holding.is_open === 0) {
  const closingSell = transactions.results.find((tx: any) => 
    tx.transaction_type === 'SELL' && tx.notes === 'Position closed'
  )
  
  if (closingSell) {
    totalSellValue = closingSell.shares * closingSell.price_per_share
    totalSellCommissions = closingSell.commission || 0
    closePrice = closingSell.price_per_share
    closeCommission = closingSell.commission || 0
    closeDate = closingSell.transaction_date
  }
}
```

**Option B: Track Remaining Shares** (More Complex)
```typescript
// Calculate P/L by tracking actual shares bought vs sold
let sharesBought = 0
let sharesStillHeld = 0
// ... complex tracking logic
```

**Recommendation**: Use **Option A** because:
- ✅ Simple and clear
- ✅ Matches the close endpoint's design (creates SELL with 'Position closed' note)
- ✅ Prevents duplicate SELL bugs
- ✅ Works for the current dual-table architecture

---

## 📝 Prevention Measures

### Backfill Script Improvements

The backfill script should be updated with additional checks:

```sql
-- Part 2: Add extra safety check
AND NOT EXISTS (
    SELECT 1 FROM stock_transactions st 
    WHERE st.holding_id = sh.id 
      AND st.transaction_type = 'SELL'
      AND st.notes = 'Position closed'  -- Check for proper close
)
```

This would prevent backfilling a SELL if the proper close endpoint already created one.

---

## ✅ Current Status

### Production Fix Status
- ✅ **LULU duplicate SELL deleted**
- ✅ **P/L calculation now accurate**
- ✅ **No other duplicate SELLs found**
- ⚠️ **Code still has the summation bug** (needs Option A fix)

### Next Steps

1. ✅ **Immediate fix applied** - LULU is working correctly
2. ⚠️ **Code fix needed** - Implement Option A to prevent future issues
3. ⚠️ **Backfill script update** - Add safety check to prevent duplicates

---

## 🎯 User Verification

**LULU Trade (ID 6) Should Now Show**:
- Entry: 200 shares @ $294.93 on 2025-09-05
- Exit: 200 shares @ $114.10 on 2026-03-13
- **P/L: -$36,166.00 (36.2% LOSS)**

---

**Fix Applied**: June 18, 2026 @ 19:15 UTC  
**Status**: 🟢 **LULU CORRECTED IN PRODUCTION**  
**Code Fix**: ⚠️ **PENDING** (Option A implementation needed)

---

*End of Critical Bug Fix Summary*
