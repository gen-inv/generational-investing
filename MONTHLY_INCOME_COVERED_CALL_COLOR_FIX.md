# Monthly Income Report - Covered Call Color Logic Fix

**Date:** 2026-07-09  
**Issue:** Covered call losses showing in GREEN text instead of RED  
**Status:** ✅ FIXED

## Problem Description

In the Monthly Income report, covered call premium amounts and subtotals were displaying in green text even when they were negative (losses). This was misleading because:
- Losses should be displayed in RED
- Gains should be displayed in GREEN
- The visual cue is critical for quick assessment of performance

### Example
User reported that for July 2026 under the Interactive Brokers account:
- Two covered call losses were showing in green text
- These were negative values (losses from rolled or closed positions)
- Should have been displayed in red text

## Root Cause

In the `renderStrategySubsection()` function in `public/static/app.js`, the covered calls rendering code was hardcoded to always use `text-green-600` class:

**Lines 13638 and 13647 (before fix):**
```javascript
// Individual covered call amounts - ALWAYS GREEN (WRONG)
html += `
    <td class="px-3 py-2 text-right font-semibold text-green-600">
        ${formatCurrency(amount)}
    </td>
`

// Covered call subtotal - ALWAYS GREEN (WRONG)
html += `
    <td class="px-3 py-2 text-right text-green-600">
        ${formatCurrency(callsTotal)}
    </td>
`
```

This was inconsistent with other sections like:
- **Closed Positions**: Uses conditional coloring (`pl >= 0 ? 'text-green-600' : 'text-red-600'`)
- **Dividends**: Always green (correct - dividends are always positive)

## Solution

Changed the covered calls section to use conditional coloring based on the amount value:

**Lines 13638 and 13647 (after fix):**
```javascript
// Individual covered call amounts - CONDITIONAL COLOR (CORRECT)
html += `
    <td class="px-3 py-2 text-right font-semibold ${amount >= 0 ? 'text-green-600' : 'text-red-600'}">
        ${formatCurrency(amount)}
    </td>
`

// Covered call subtotal - CONDITIONAL COLOR (CORRECT)
html += `
    <td class="px-3 py-2 text-right ${callsTotal >= 0 ? 'text-green-600' : 'text-red-600'}">
        ${formatCurrency(callsTotal)}
    </td>
`
```

## When Covered Calls Can Be Negative

Covered calls can show negative values in several scenarios:

1. **Rolling for a debit**: When rolling a covered call up and out, you may pay a net debit
2. **Buying back at a loss**: When buying back a covered call that went ITM, paying more than the original premium
3. **Assignment and stock sale at loss**: When the stock is called away below your cost basis
4. **Cost basis adjustments**: When tracking the net impact of a covered call series on overall position

## Impact

### Before Fix
- ❌ Covered call losses displayed in green (misleading)
- ❌ Quick visual assessment would incorrectly show gains
- ❌ User had to read the negative sign to identify losses

### After Fix
- ✅ Covered call losses display in red (correct)
- ✅ Covered call gains display in green (correct)
- ✅ Quick visual assessment accurately shows performance
- ✅ Consistent with other report sections

## Testing Notes

To verify the fix:

1. Navigate to **Reports** → **Monthly Income**
2. Select a month with covered call transactions
3. Look for any covered calls with negative amounts
4. Verify they show in **RED** text
5. Verify positive amounts show in **GREEN** text

## Files Modified

- **public/static/app.js** (lines 13638, 13647)
  - Function: `renderStrategySubsection()`
  - Changed: Covered call amount color from hardcoded green to conditional
  - Changed: Covered call subtotal color from hardcoded green to conditional

## Related Sections

The following sections in the Monthly Income report already had correct conditional coloring:

1. **Closed Positions** (line 13598):
   ```javascript
   ${pl >= 0 ? 'text-green-600' : 'text-red-600'}
   ```

2. **Closed Position Subtotal** (line 13607):
   ```javascript
   ${closedTotal >= 0 ? 'text-green-600' : 'text-red-600'}
   ```

3. **Strategy Total** (line 13571):
   ```javascript
   ${strategyTotal >= 0 ? 'text-green-600' : 'text-red-600'}
   ```

4. **Stock Investments Total** (line 13532):
   ```javascript
   ${stockTotal >= 0 ? 'text-green-600' : 'text-red-600'}
   ```

**Note:** Dividends intentionally remain hardcoded to green (line 13678) because dividend amounts are always positive.

## Deployment

- **Deployed:** 2026-07-09
- **URL:** https://bbc13c56.generational-investing.pages.dev
- **Git commit:** 485c57d
- **Branch:** main

## Conclusion

This fix ensures that the Monthly Income report provides accurate visual feedback for covered call performance. Negative values (losses) now correctly display in red text, making it easier to quickly assess the performance of covered call strategies within the monthly income breakdown.
