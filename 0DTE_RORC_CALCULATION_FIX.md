# 0DTE SPX RORC Calculation Fix

**Date:** 2026-06-22  
**Issue:** Close trade modal showing incorrect "Dollars at Work" for RORC calculation  
**Status:** ✅ FIXED

## Problem Description

When closing 0DTE SPX trades in the "Today's Trading" section, the close trade modal was not calculating "dollars at work" correctly, leading to inaccurate RORC (Return on Risk Capital) values.

### Root Cause

The `updateClosePLPreview()` function in `public/static/app.js` was using `trade.strike_width` from the individual trade record instead of getting the current `strike_width` from the configuration cache (`dailyTradeConfigCache`).

**Original code (line 9631):**
```javascript
const strikeWidth = trade.strike_width || 5
const dollarsAtWork = strikeWidth * trade.contracts * 100
```

### Issues with Original Code

1. **Outdated strike width**: If the user changed the strike width configuration after creating a trade, closing that trade would use the old strike_width value from when the trade was created, not the current configuration.

2. **Inconsistent with modal display**: The `openCloseTradeModal()` function (line 9556) was already correctly using `dailyTradeConfigCache?.strike_width` to display strike information, but the P/L preview calculation was using the outdated value.

3. **Incorrect RORC**: Since RORC = (Profit/Loss) / (Dollars at Work) × 100, using the wrong strike width would give incorrect RORC percentages.

## Solution

Changed the calculation to use the current configuration's strike_width:

**Fixed code (lines 9630-9637):**
```javascript
// Calculate Dollars At Work: For both single spreads and iron condors,
// only ONE side can be at risk at a time, so use: strike_width × contracts × 100
// Get strike width from config (not from trade record, which may be outdated)
const strikeWidth = dailyTradeConfigCache?.strike_width || 5
const dollarsAtWork = strikeWidth * trade.contracts * 100

// Calculate RORC (Return on Risk Capital)
const rorc = dollarsAtWork > 0 ? (profitLoss / dollarsAtWork) * 100 : 0
```

## Key Points

### Dollars at Work Formula
- **Single Credit Spread**: `strike_width × contracts × 100`
- **Iron Condor**: `strike_width × contracts × 100` (same as single spread)

### Why Iron Condor Uses Same Formula

An iron condor consists of:
- Call credit spread: sell short strike, buy long strike (width = strike_width)
- Put credit spread: sell short strike, buy long strike (width = strike_width)

**At expiration, only ONE side can be at risk:**
- If SPX closes above the call short strike → call spread is at risk (max loss = strike_width × 100)
- If SPX closes below the put short strike → put spread is at risk (max loss = strike_width × 100)
- If SPX closes between the two short strikes → neither side at risk (profit = premium collected)

Therefore, the maximum dollars at work is the strike_width for ONE side, not both sides combined.

## Impact

### Before Fix
- Closing a trade with old configuration could show wrong RORC
- Example: Created trade with 10-wide spreads, later changed config to 5-wide
  - Closing old trade would calculate: 10 × contracts × 100 = wrong dollars at work
  - RORC would appear artificially low

### After Fix
- Always uses current configuration's strike_width
- Consistent with strike display in modal title
- Accurate RORC calculation for performance tracking

## Testing Notes

To verify the fix works correctly:

1. **Create a trade** with current strike_width (e.g., 5)
2. **Change configuration** to different strike_width (e.g., 10)
3. **Close the old trade** → should use NEW strike_width (10) for calculation
4. Verify "Dollars at Work" shows: 10 × contracts × 100

## Files Modified

- **public/static/app.js** (lines 9630-9637)
  - Function: `updateClosePLPreview()`
  - Changed from `trade.strike_width` to `dailyTradeConfigCache?.strike_width`

## Related Code

### Config Cache Population
The `dailyTradeConfigCache` is populated when the daily trading page loads:

```javascript
// Line 1045
dailyTradeConfigCache = config
```

### Config Structure
```javascript
{
  strike_width: 5,  // Current strike width setting
  rolling_profit_window: 50,
  max_contract_limit: 25,
  enable_position_sizing: true,
  // ... other config fields
}
```

### Other RORC Calculations
Note: This fix only affects **0DTE SPX daily trades**. Options trading has its own RORC calculation (lines 5822-5834) which uses:
```javascript
rorc = (maxProfit / totalRisk) * 100
```

## Deployment

- **Deployed:** 2026-06-22
- **URL:** https://7e626e01.generational-investing.pages.dev
- **Git commit:** f87ca66
- **Branch:** main

## Conclusion

This fix ensures that the RORC calculation for 0DTE SPX trades always uses the current configuration's strike_width value, providing accurate performance metrics regardless of when the trade was originally created. The calculation correctly handles both single credit spreads and iron condors, recognizing that only ONE side of an iron condor can be at risk at expiration.
