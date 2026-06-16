# Stock Manage Modal - Testing Guide

## ⚠️ IMPORTANT NOTE - SIMPLIFIED DESIGN (Updated June 16, 2026)

**The modal has been simplified to avoid confusion:**
- **Removed**: Separate "Cost Basis Adjustments" section that showed ALL adjustments
- **Kept**: "Assignment History" section that shows ONLY assignment premiums (SELLING_PUT type)
- **Rationale**: Dividends show in Dividend History, Covered Calls show in their section - no need to duplicate

**Current Modal Sections:**
1. Position Summary (with strategy badge)
2. Share Ownership History
3. Covered Call History
4. Dividend History
5. **Assignment History** (filtered to SELLING_PUT only)

## Overview
This guide covers testing the enhanced stock manage modal that displays assignment history for Wheel and Stockpiling strategies.

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

## Feature 2: Assignment History Section

### Test Case 2.1: Display Assignment Premium
**Setup:**
1. Create short put option (SELLING_PUT or SELLING_PUT_WHEEL)
2. Assign the option to stock
3. Open stock position manage modal

**Expected Result:**
- "Assignment History" section visible (amber theme)
- Table shows:
  - Assignment Date
  - Premium Credit: Total premium collected (premium × quantity × 100)
  - Details: Notes with option info (strike, premium, contracts)
- Total premium credits displayed at bottom
- Section has amber gradient background
- Info text explains premium reduces cost basis

**SQL to verify:**
```sql
SELECT cba.*, sh.ticker, sh.strategy_type
FROM cost_basis_adjustments cba
JOIN stock_holdings sh ON cba.holding_id = sh.id
WHERE cba.adjustment_type = 'SELLING_PUT'
ORDER BY cba.adjustment_date DESC;
```

**Example:**
```
Short Put: Strike $50, Premium $2.00, 1 contract
Total Premium = $2.00 × 1 × 100 = $200.00
This $200 reduces cost basis per share
```

### Test Case 2.2: Multiple Assignments
**Setup:**
1. Create stock position
2. Assign multiple short puts over time
3. Open position manage modal

**Expected Result:**
- All assignment premiums listed chronologically (newest first)
- Each row shows: Assignment Date, Premium Credit, Details
- Total premium sum is accurate
- Amounts formatted with 2 decimal places in green

**Note:** Dividends and covered calls do NOT appear here - they have their own sections.

### Test Case 2.3: No Assignments
**Setup:**
1. Create new stock position (no assignments)
2. Open position manage modal

**Expected Result:**
- "Assignment History" section NOT visible
- Section only appears when assignments exist

## Feature 3: Integration with Existing Sections

### Test Case 3.1: All Sections Together
**Setup:**
1. Create Wheel strategy stock
2. Assign short put (creates assignment history entry)
3. Record dividend (shows in dividend section)
4. Add covered call (shows in covered call section)
5. Buy more shares (adds to purchase history)
6. Open position manage modal

**Expected Result:**
- Modal displays sections in order:
  1. Position Summary (with Wheel badge)
  2. Share Ownership History
  3. Covered Call History (shows covered call)
  4. Dividend History (shows dividend)
  5. **Assignment History** (shows ONLY assignment premium, not dividends/calls)
- All sections properly styled and scrollable
- No layout issues or overlapping
- Modal height stays within max-h-[90vh]
- Each section is distinct with no duplicated information

### Test Case 3.2: Modal Scrolling
**Setup:**
1. Create stock with extensive history (10+ transactions, 5+ dividends, 3+ assignments)
2. Open position manage modal

**Expected Result:**
- Modal content scrolls smoothly
- Header stays fixed at top
- Sidebar actions stay fixed on left
- All sections accessible via scroll
- No horizontal scrolling required

## Feature 4: Cost Basis Calculation Verification

### Test Case 4.1: Verify Cost Basis Math
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
- Assignment History section shows: $200.00 premium credit

### Test Case 4.2: Multiple Assignments Cost Basis
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
- Assignment History shows 2 rows totaling $350.00

## Feature 5: API Endpoint Testing

### Test Case 5.1: GET /api/stocks/:id/cost-basis-adjustments
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
- **Note**: Frontend filters to show only SELLING_PUT in Assignment History section

## Success Criteria

### Visual Requirements
- ✅ Strategy badge displays correctly in modal header
- ✅ Assignment History section has amber theme (from-amber-50 to-amber-100)
- ✅ Section styled consistently with existing modal design
- ✅ All amounts formatted with $ and proper decimals
- ✅ Table is responsive and properly aligned
- ✅ Only shows when assignments exist (no empty state needed)

### Functional Requirements
- ✅ API calls fetch data without errors
- ✅ Assignment history only shows for positions with SELLING_PUT adjustments
- ✅ Dividends and covered calls show in their own sections (not in assignment history)
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

### Edge Case 1: Stock with Dividends but No Assignments
**Scenario:** Stock has dividend adjustments but no assignment adjustments
**Expected:** Assignment History section NOT shown, dividends only in Dividend History
**Verification:** No visual artifacts or empty assignment section

### Edge Case 2: Multiple Assignments Same Day
**Scenario:** Two short puts assigned on same day to same stock
**Expected:** Both show in Assignment History as separate rows
**Verification:** Check that dates and amounts are correct for each

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
- [ ] Test Case 2.1: Single assignment premium
- [ ] Test Case 2.2: Multiple assignments
- [ ] Test Case 2.3: No assignments
- [ ] Test Case 3.1: All sections together
- [ ] Test Case 3.2: Modal scrolling
- [ ] Test Case 4.1: Cost basis math (single)
- [ ] Test Case 4.2: Cost basis math (multiple)
- [ ] Test Case 5.1: API endpoint - cost basis adjustments
- [ ] All regression tests pass
- [ ] Mobile responsive (if applicable)
- [ ] Cross-browser testing (Chrome, Firefox, Safari)

## Testing Complete

When all test cases pass and the checklist is complete, the stock manage modal enhancement feature is considered fully implemented and tested.
