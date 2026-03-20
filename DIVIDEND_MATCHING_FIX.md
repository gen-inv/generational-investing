# Dividend Matching Logic Fix - Smart Duplicate Detection with Withholding Tax

## Issue
The dividend matching logic was not correctly handling withholding tax when comparing per-share amounts. This could lead to false negatives (showing dividends as missing when they were already recorded) or false positives (not showing dividends that truly were missing).

## Problem Details

### Original Logic
```typescript
const perShareRecorded = rec.amount / sharesHeld
const perShareRepo = repoDiv.amount
const amountMatch = Math.abs(perShareRecorded - perShareRepo) < 0.0001
```

### The Bug
When a dividend is recorded for CASH or TFSA accounts:
1. **Withholding tax is applied** (20% reduction)
2. The **reduced amount** is stored in `cost_basis_adjustments`
3. When comparing, we divide the reduced total by shares → **reduced per-share amount**
4. We compare **reduced per-share** vs **original per-share** from repository → **MISMATCH**

### Example
- Repository dividend: $0.12 per share
- Shares held: 100
- Account type: CASH (20% withholding)

**Recording:**
- Total = $0.12 × 100 = $12.00
- After withholding = $12.00 × 0.8 = $9.60 (stored in database)

**Matching attempt (BEFORE FIX):**
- Per-share recorded = $9.60 / 100 = $0.096
- Per-share repo = $0.12
- Difference = |$0.096 - $0.12| = $0.024 → **NO MATCH** ❌

**Matching attempt (AFTER FIX):**
- Per-share recorded = ($9.60 / 100) / 0.8 = $0.12
- Per-share repo = $0.12
- Difference = |$0.12 - $0.12| = $0.00 → **MATCH** ✅

## Solution

### Updated Logic
```typescript
// Reverse withholding tax to get original per-share amount
let perShareRecorded = rec.amount / sharesHeld
if (holding.account_type === 'Cash' || holding.account_type === 'TFSA') {
  perShareRecorded = perShareRecorded / 0.8 // Reverse the 20% withholding
}
const perShareRepo = repoDiv.amount

// Now we're comparing apples to apples
const amountMatch = Math.abs(perShareRecorded - perShareRepo) < 0.0001
```

## Smart Matching Criteria

The matching logic now correctly checks **TWO conditions**:

### Condition 1: Exact Ex-Date Match
If the ex_date is stored in the notes field and matches exactly:
```
Ex-date: 2026-01-15
```
→ Considered a match, regardless of amounts or dates

### Condition 2: Per-Share Amount + Date Proximity
If per-share amounts match (within $0.0001) **AND** one of these is true:
- Pay date is within 3 days of adjustment_date
- Ex date is within 3 days of adjustment_date

**Note:** Per-share comparison now correctly reverses withholding tax for CASH/TFSA accounts.

## Account Type Handling

### RRSP / LIRA Accounts
- **No withholding tax** (0%)
- Recorded amount = Original amount
- Per-share comparison: Direct comparison

### CASH / TFSA Accounts
- **20% withholding tax** applied
- Recorded amount = Original amount × 0.8
- Per-share comparison: Divide by 0.8 first, then compare

## Impact

### Before Fix
- **False negatives**: Dividends shown as missing even when already recorded
- **User confusion**: "Why is this dividend showing up? I already added it!"
- **Potential duplicates**: Users might add the same dividend twice

### After Fix
- **Accurate matching**: Correctly identifies already-recorded dividends
- **No false positives**: Only truly missing dividends are shown
- **Better UX**: Users trust the system to not show duplicates

## Testing Scenarios

### Scenario 1: TFSA Account with Withholding
```
Repository: NVDY $0.2000 per share, Ex: 2026-02-15, Pay: 2026-02-28
Recorded: 50 shares × $0.20 × 0.8 = $8.00, Date: 2026-02-28
Expected: MATCH ✅
Reason: Per-share $8.00/50/0.8 = $0.20, pay dates match
```

### Scenario 2: RRSP Account (No Withholding)
```
Repository: JEPI $0.4500 per share, Ex: 2026-01-15, Pay: 2026-01-29
Recorded: 100 shares × $0.45 = $45.00, Date: 2026-01-29
Expected: MATCH ✅
Reason: Per-share $45.00/100 = $0.45, pay dates match
```

### Scenario 3: Close Pay Date (Within 3 Days)
```
Repository: JEPQ $0.4800 per share, Ex: 2026-01-10, Pay: 2026-01-24
Recorded: 75 shares × $0.48 × 0.8 = $28.80, Date: 2026-01-26 (2 days later)
Expected: MATCH ✅
Reason: Per-share matches, date within 3 days
```

### Scenario 4: Different Amount (Not a Match)
```
Repository: NVDY $0.2000 per share, Ex: 2026-02-15, Pay: 2026-02-28
Recorded: 50 shares × $0.19 × 0.8 = $7.60, Date: 2026-02-28
Expected: NO MATCH ❌
Reason: Per-share $7.60/50/0.8 = $0.19 ≠ $0.20
```

## Code Location
- **File**: `src/index.tsx`
- **Endpoint**: `GET /api/stocks/:id/missing-dividends`
- **Function**: `isDividendRecorded(repoDiv, sharesHeld)`
- **Lines**: ~2420-2462

## Related Documentation
- [MISSING_DIVIDENDS_FEATURE.md](./MISSING_DIVIDENDS_FEATURE.md) - Overall feature documentation
- [DIVIDEND_EDIT_FEATURE.md](./DIVIDEND_EDIT_FEATURE.md) - Edit functionality
- [DUAL_API_IMPLEMENTATION.md](./DUAL_API_IMPLEMENTATION.md) - API integration details

## Deployment
- **Commit**: e9df325
- **Build**: 380.08 kB
- **Tests**: 93/93 passed
- **Production URL**: https://dc12ae0b.generational-investing.pages.dev
- **Main URL**: https://app.generationalinvesting.ca
- **Status**: ✅ Deployed and verified
