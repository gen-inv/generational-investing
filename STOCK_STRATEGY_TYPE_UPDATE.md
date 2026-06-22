# Stock Holdings Strategy Type Update - June 18, 2026

## Issue Identified

Monthly income report is not capturing covered calls and dividends for Stockpiling and Wheel holdings because the `strategy_type` field is not set on existing stock holdings.

## Root Cause

The `strategy_type` field was added to the `stock_holdings` table after many holdings were already created. Existing holdings have:
- `NULL` values for strategy_type
- Or default values that don't match 'STOCKPILING' or 'WHEEL'

## Monthly Income Report Logic

The report queries use these filters:

**Stockpiling Section:**
```sql
-- Stock P/L
WHERE sh.strategy_type = 'STOCKPILING'

-- Covered Calls
WHERE sh.strategy_type = 'STOCKPILING' AND ot.strategy_type = 'COVERED_CALL'

-- Dividends
WHERE sh.strategy_type = 'STOCKPILING' AND cba.adjustment_type = 'DIVIDEND'
```

**Wheel Section:**
```sql
-- Stock P/L
WHERE sh.strategy_type = 'WHEEL'

-- Covered Calls
WHERE sh.strategy_type = 'WHEEL' AND ot.strategy_type = 'COVERED_CALL'

-- Dividends
WHERE sh.strategy_type = 'WHEEL' AND cba.adjustment_type = 'DIVIDEND'
```

If `sh.strategy_type` is NULL or doesn't match, the holdings won't appear in the report.

## Solution

Update the `strategy_type` field for all open stock holdings that should be classified as:
- **STOCKPILING**: Stocks accumulated for long-term holding with covered calls
- **WHEEL**: Stocks from assigned wheel puts with covered calls
- **DIVIDEND_ETFS**: Dividend-focused ETFs

## How to Update

### Option 1: Update via UI (Recommended)

1. Go to **Stocks** page
2. Click **Edit** on each open stock holding
3. Set the **Strategy Type** dropdown to the appropriate value:
   - Stockpiling
   - Wheel
   - Dividend ETFs
4. Click **Save**

This needs to be done for all open stock holdings that you want to appear in the monthly income report.

### Option 2: SQL Bulk Update (If Needed)

If you have many holdings to update, you can run SQL queries:

**Check current strategy types:**
```sql
SELECT 
  id, ticker, strategy_type, total_shares, is_open,
  opened_date, closed_date
FROM stock_holdings
WHERE user_id = 1 
  AND is_open = 1
ORDER BY ticker;
```

**Update specific holdings to STOCKPILING:**
```sql
UPDATE stock_holdings
SET strategy_type = 'STOCKPILING', updated_at = CURRENT_TIMESTAMP
WHERE id IN (1, 2, 3, ...); -- Replace with actual IDs
```

**Update specific holdings to WHEEL:**
```sql
UPDATE stock_holdings
SET strategy_type = 'WHEEL', updated_at = CURRENT_TIMESTAMP
WHERE id IN (4, 5, 6, ...); -- Replace with actual IDs
```

## Verification

After updating, verify the monthly income report includes:

**Stockpiling Section should show:**
- Closed stock trades (if any sold this month)
- Covered calls closed this month on Stockpiling holdings
- Dividends received this month on Stockpiling holdings

**Wheel Section should show:**
- Closed stock trades (if any sold this month)
- Covered calls closed this month on Wheel holdings
- Dividends received this month on Wheel holdings

## Why This Matters

The monthly income report groups income by strategy to help you understand:
- Which strategies are generating the most income
- How different approaches perform
- Portfolio income composition

Without proper strategy_type values, income from covered calls and dividends won't be attributed to the correct strategy category.

## Status

- ✅ Monthly income report logic is correct
- ✅ No code changes needed
- ⚠️ User action required: Update strategy_type on open holdings
- ⚠️ All open stock holdings need strategy_type set

## Files Involved

- **src/index.tsx** - Lines 6290-6550 (Monthly income report endpoint)
- **Database**: stock_holdings table, strategy_type column

## Next Steps

1. **User Action**: Go through each open stock holding
2. **User Action**: Set the strategy_type field appropriately
3. **Verify**: Check monthly income report shows covered calls and dividends
4. **Going Forward**: Always set strategy_type when creating new stock holdings

## Notes

The strategy_type field is essential for:
- Monthly income report categorization
- Portfolio strategy analysis
- Understanding which strategies generate income
- Tracking strategy performance over time

Without it, income (covered calls, dividends) won't be properly attributed to the stock holding strategy.
