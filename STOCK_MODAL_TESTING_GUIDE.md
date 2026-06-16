# Stock Manage Modal - Testing Guide

## Overview
This guide covers testing the enhanced stock manage modal that displays cost basis adjustments and assignment history for Wheel and Stockpiling strategies.

## Test Prerequisites

### Required Test Data
1. **Stock position with Wheel strategy** - For testing strategy badge and assignment flow
2. **Assigned short put option** - Creates cost basis adjustment
3. **Stock position with dividends** - Optional, for testing other sections
4. **Stock position with covered calls** - Optional, for testing other sections

## Feature 1: Strategy Type Badge in Modal Header

### Test Case 1.1: Wheel Strategy Badge
**Setup:**
1. Create stock position with Wheel strategy type
2. Open position manage modal

**Expected Result:**
- Modal header shows: `TICKER [Purple badge with wagon wheel icon] - Position Management`
- Badge has purple background (`bg-purple-600`)
- Badge shows only wagon wheel icon (no text)
- Badge has tooltip "Wheel Strategy"

**SQL to verify:**
```sql
SELECT id, ticker, strategy_type 
FROM stock_holdings 
WHERE strategy_type = 'WHEEL' AND is_open = 1;
```

### Test Case 1.2: Stockpiling Strategy Badge
**Setup:**
1. Create stock position with Stockpiling strategy type
2. Open position manage modal

**Expected Result:**
- Modal header shows: `TICKER [Gray badge with "Stockpiling" text] - Position Management`
- Badge has gray background (`bg-gray-600`)
- Badge shows text "Stockpiling"
- Badge has tooltip "Stockpiling Strategy"

### Test Case 1.3: No Strategy Type (Legacy Data)
**Setup:**
1. Create stock position with NULL strategy_type
2. Open position manage modal

**Expected Result:**
- Modal header shows: `TICKER - Position Management`
- No strategy badge displayed
- No visual artifacts or empty spaces

## Feature 2: Cost Basis Adjustments Section

### Test Case 2.1: Display Assignment Premium Adjustment
**Setup:**
1. Create short put option (SELLING_PUT or SELLING_PUT_WHEEL)
2. Assign the option to stock
3. Open stock position manage modal

**Expected Result:**
- "Cost Basis Adjustments" section visible (emerald theme)
- Table shows:
  - Date: Assignment date
  - Type: "Short Put Premium" (purple badge)
  - Amount: Total premium collected (premium × quantity × 100)
  - Notes: Assignment details
- Total adjustments displayed at bottom
- Section has emerald gradient background

**SQL to verify:**
```sql
SELECT cba.*, sh.ticker, sh.strategy_type
FROM cost_basis_adjustments cba
JOIN stock_holdings sh ON cba.holding_id = sh.id
WHERE cba.adjustment_type = 'SELLING_PUT'
ORDER BY cba.adjustment_date DESC;
```

**Example calculation:**
```
Short Put: Strike $50, Premium $2.00, 1 contract
Total Premium = $2.00 × 1 × 100 = $200.00
This $200 reduces cost basis per share
```

### Test Case 2.2: Multiple Adjustments
**Setup:**
1. Create stock position
2. Assign multiple short puts over time
3. Record some dividends
4. Open position manage modal

**Expected Result:**
- All adjustments listed chronologically (newest first)
- Each adjustment has appropriate type badge:
  - SELLING_PUT → Purple "Short Put Premium"
  - DIVIDEND → Yellow "Dividend"
  - COVERED_CALL → Blue "Covered Call Premium"
- Total adjustments sum is accurate
- Amounts formatted with 2 decimal places in green

### Test Case 2.3: No Adjustments
**Setup:**
1. Create new stock position (no assignments, dividends, or covered calls)
2. Open position manage modal

**Expected Result:**
- "Cost Basis Adjustments" section visible
- Empty state shown:
  - Gray background
  - Inbox icon
  - Message: "No cost basis adjustments yet"

## Feature 3: Assignment History Section

### Test Case 3.1: Display Assignment Details
**Setup:**
1. Create short put option with SELLING_PUT_WHEEL strategy
   - Trade date: 2024-01-15
   - Strike: $50.00
   - Premium: $2.50/share
   - Quantity: 2 contracts
   - Expiration: 2024-02-16
2. Assign the option on 2024-02-16
3. Open stock position manage modal

**Expected Result:**
- "Assignment History" section visible (amber theme)
- Table shows ONE row with:
  - Trade Date: 2024-01-15
  - Strike: $50.00
  - Expiration: 2024-02-16
  - Premium/Share: $2.500
  - Contracts: 2
  - Total Premium: $500.00 (2.50 × 2 × 100)
  - Assignment Date: 2024-02-16
- Section has amber gradient background
- Info text at bottom explains premium reduced cost basis

**SQL to verify:**
```sql
SELECT ot.*, cba.adjustment_date
FROM option_trades ot
LEFT JOIN cost_basis_adjustments cba ON ot.id = cba.holding_id
WHERE ot.is_open = 0 
  AND ot.close_price = 0
  AND (ot.strategy_type = 'SELLING_PUT' OR ot.strategy_type = 'SELLING_PUT_WHEEL')
  AND (ot.notes LIKE '%ASSIGNED%' OR ot.notes LIKE '%assigned%')
ORDER BY ot.close_date DESC;
```

### Test Case 3.2: Multiple Assignments
**Setup:**
1. Create Wheel strategy stock position
2. Assign 3 different short puts over time
3. Open position manage modal

**Expected Result:**
- "Assignment History" section shows 3 rows
- Each row has complete details
- Rows sorted by assignment date (newest first)
- Total premiums calculated correctly for each

**Example multi-assignment:**
```
Assignment 1: 2024-01-15, Strike $48, 1 contract, $1.50 premium = $150 total
Assignment 2: 2024-03-20, Strike $49, 2 contracts, $2.00 premium = $400 total
Assignment 3: 2024-05-17, Strike $47, 1 contract, $1.75 premium = $175 total
```

### Test Case 3.3: No Assignments (Stockpiling)
**Setup:**
1. Create Stockpiling stock position (bought directly, no assignments)
2. Open position manage modal

**Expected Result:**
- "Assignment History" section NOT visible
- No empty state shown
- Modal flows directly from Cost Basis Adjustments to close
- No visual artifacts or spacing issues

### Test Case 3.4: No Assignments (Wheel - Not Yet Assigned)
**Setup:**
1. Create Wheel strategy stock position via direct purchase (not assignment)
2. Open position manage modal

**Expected Result:**
- "Assignment History" section NOT visible
- This is correct: Wheel strategy doesn't guarantee assignments
- If later assigned, section will appear

## Feature 4: Integration with Existing Sections

### Test Case 4.1: All Sections Together
**Setup:**
1. Create Wheel strategy stock
2. Assign short put (creates cost basis adjustment + assignment history)
3. Record dividend (creates cost basis adjustment)
4. Add covered call (no cost basis adjustment yet)
5. Buy more shares (adds to purchase history)
6. Open position manage modal

**Expected Result:**
- Modal displays sections in order:
  1. Position Summary (with Wheel badge)
  2. Share Ownership History
  3. Covered Call History
  4. Dividend History (with missing dividends check)
  5. **Cost Basis Adjustments** (shows assignment premium + dividend)
  6. **Assignment History** (shows original short put)
- All sections properly styled and scrollable
- No layout issues or overlapping
- Modal height stays within max-h-[90vh]

### Test Case 4.2: Modal Scrolling
**Setup:**
1. Create stock with extensive history (10+ transactions, 5+ dividends, 3+ assignments)
2. Open position manage modal

**Expected Result:**
- Modal content scrolls smoothly
- Header stays fixed at top
- Sidebar actions stay fixed on left
- All sections accessible via scroll
- No horizontal scrolling required

## Feature 5: Cost Basis Calculation Verification

### Test Case 5.1: Verify Cost Basis Math
**Setup:**
1. Create short put: Strike $50, Premium $2.00, 1 contract
2. Assign to stock
3. Verify cost basis in position summary

**Expected Calculation:**
```
Strike Price: $50.00
Total Premium: $2.00 × 1 × 100 = $200.00
Shares Acquired: 100
Premium per Share: $200.00 ÷ 100 = $2.00/share

Average Price (stock_holdings.avg_price): $50.00
Total Adjustments (stock_holdings.total_adjustments): $200.00
Cost Basis per Share: $50.00 - ($200.00 ÷ 100) = $48.00/share
```

**Verify in modal:**
- Position Summary shows:
  - Avg Price: $50.00
  - Cost Basis/Share: $48.00
  - CB Adjustments: $200.00
- Cost Basis Adjustments section shows: $200.00
- Assignment History section shows: $200.00 total premium

### Test Case 5.2: Multiple Assignments Cost Basis
**Setup:**
1. Assign first put: Strike $50, Premium $2.00, 1 contract (100 shares)
2. Assign second put: Strike $49, Premium $1.50, 1 contract (100 shares)
3. Verify cost basis

**Expected Calculation:**
```
First Assignment:
- Shares: 100 @ $50 = $5,000
- Premium: $200
- Avg Price: $50.00
- Total Adjustments: $200
- Cost Basis: $48.00/share

Second Assignment (added to position):
- New shares: 100 @ $49 = $4,900
- New premium: $150
- Total shares: 200
- Total cost: $9,900
- Total adjustments: $350
- New Avg Price: ($5,000 + $4,900) ÷ 200 = $49.50
- New Cost Basis: $49.50 - ($350 ÷ 200) = $47.75/share
```

**Verify in modal:**
- Position Summary shows Cost Basis: $47.75
- Cost Basis Adjustments shows 2 rows totaling $350.00
- Assignment History shows 2 assignments

## Feature 6: API Endpoint Testing

### Test Case 6.1: GET /api/stocks/:id/cost-basis-adjustments
**Request:**
```bash
curl -X GET http://localhost:3000/api/stocks/123/cost-basis-adjustments \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "holding_id": 123,
    "adjustment_type": "SELLING_PUT",
    "amount": 200.00,
    "adjustment_date": "2024-02-16",
    "notes": "Assigned from Short Put: Strike $50, Premium $2.00, 1 contracts",
    "created_at": "2024-02-16T10:30:00Z"
  }
]
```

**Verify:**
- Returns array of adjustments
- Ordered by adjustment_date DESC
- Only returns adjustments for specified holding
- Only returns adjustments for authenticated user

### Test Case 6.2: GET /api/stocks/:id/assignment-history
**Request:**
```bash
curl -X GET http://localhost:3000/api/stocks/123/assignment-history \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
[
  {
    "id": 456,
    "user_id": 1,
    "company_id": 789,
    "ticker": "AAPL",
    "strategy_type": "SELLING_PUT_WHEEL",
    "trade_date": "2024-01-15",
    "expiration_date": "2024-02-16",
    "strike_price": 50.00,
    "premium": 2.50,
    "quantity": 1,
    "is_open": 0,
    "close_date": "2024-02-16",
    "close_price": 0,
    "notes": "ASSIGNED to stock position on 2024-02-16",
    "premium_adjustment": 250.00,
    "adjustment_date": "2024-02-16"
  }
]
```

**Verify:**
- Returns only assigned short puts (close_price = 0)
- Only returns SELLING_PUT or SELLING_PUT_WHEEL strategies
- Only returns options matching holding's company_id
- Includes premium_adjustment and adjustment_date from cost_basis_adjustments

## Success Criteria

### Visual Requirements
- ✅ Strategy badge displays correctly in modal header
- ✅ Cost Basis Adjustments section has emerald theme (from-emerald-50 to-emerald-100)
- ✅ Assignment History section has amber theme (from-amber-50 to-amber-100)
- ✅ Both sections styled consistently with existing modal design
- ✅ Type badges have appropriate colors (purple/yellow/blue/gray)
- ✅ All amounts formatted with $ and proper decimals
- ✅ Tables are responsive and properly aligned

### Functional Requirements
- ✅ API calls fetch data without errors
- ✅ Empty states display when no data exists
- ✅ Assignment history only shows for positions with assignments
- ✅ Cost basis adjustments section always shows
- ✅ Totals calculate correctly
- ✅ Modal scrolls properly with long data
- ✅ Modal closes correctly

### Data Integrity
- ✅ Cost basis math is accurate
- ✅ Premium calculations match (premium × quantity × 100)
- ✅ Assignment dates match close dates
- ✅ Only user's own data is displayed
- ✅ All adjustments link to correct holding

## Known Issues / Edge Cases

### Edge Case 1: Assignment Without Cost Basis Record
**Scenario:** Option assigned but cost_basis_adjustments record not created
**Expected:** Assignment History shows row, but no matching Cost Basis Adjustment
**Resolution:** This indicates data inconsistency - should not happen with current code

### Edge Case 2: Multiple Assignments Same Day
**Scenario:** Two short puts assigned on same day to same stock
**Expected:** Both show in Assignment History, both create separate cost basis adjustments
**Verification:** Check that adjustment_date and amounts are correct for each

### Edge Case 3: Very Large Premium
**Scenario:** Premium > $10/share (e.g., deep ITM put)
**Expected:** All formatting still works, no layout breaks
**Test:** Assign put with strike $100, premium $15.00

### Edge Case 4: Zero Premium Assignment
**Scenario:** Assignment with $0 premium (shouldn't happen, but test anyway)
**Expected:** Shows $0.00 in all displays, no division errors

## Regression Testing

After completing these tests, verify that existing features still work:

1. **Add to Position** - Adding shares updates average price correctly
2. **Sell from Position** - Selling shares maintains cost basis
3. **Record Dividend** - Creates both dividend record AND cost basis adjustment
4. **Covered Call** - Opens correctly, doesn't interfere with assignment history
5. **Close Position** - Closes holding properly, maintains history
6. **Edit Trade** - Can update strategy type, changes reflect in badge

## Automated Testing

Run regression test suite:
```bash
cd /home/user/webapp && npm test
```

Expected: All 93 tests pass, including any new tests for assignment and cost basis features.

## Manual Testing Checklist

- [ ] Test Case 1.1: Wheel strategy badge
- [ ] Test Case 1.2: Stockpiling strategy badge
- [ ] Test Case 1.3: No strategy badge
- [ ] Test Case 2.1: Single cost basis adjustment
- [ ] Test Case 2.2: Multiple adjustments
- [ ] Test Case 2.3: No adjustments
- [ ] Test Case 3.1: Single assignment
- [ ] Test Case 3.2: Multiple assignments
- [ ] Test Case 3.3: No assignments (Stockpiling)
- [ ] Test Case 3.4: No assignments (Wheel)
- [ ] Test Case 4.1: All sections together
- [ ] Test Case 4.2: Modal scrolling
- [ ] Test Case 5.1: Cost basis math (single)
- [ ] Test Case 5.2: Cost basis math (multiple)
- [ ] Test Case 6.1: API endpoint - cost basis
- [ ] Test Case 6.2: API endpoint - assignment history
- [ ] All regression tests pass
- [ ] Mobile responsive (if applicable)
- [ ] Cross-browser testing (Chrome, Firefox, Safari)

## Testing Complete

When all test cases pass and the checklist is complete, the stock manage modal enhancement feature is considered fully implemented and tested.
