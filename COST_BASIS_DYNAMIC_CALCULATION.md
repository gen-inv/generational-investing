# Dynamic Cost Basis Calculation Implementation

## Overview
This document describes the implementation of dynamic cost basis calculation in the stock details modal, ensuring that the displayed Cost Basis/Share incorporates ALL sources of cost basis adjustments.

## Problem Statement
**Original Issue:** The stock details modal was displaying stale cost basis data from the database (`stock.cost_basis` and `stock.total_adjustments`) instead of calculating it dynamically from all adjustment sources.

**Impact:** 
- Displayed cost basis might not reflect recent dividends, covered calls, or assignment premiums
- Users couldn't see their true effective entry price
- Manual recalculation required to verify cost basis accuracy

## Solution Implemented

### Code Changes (Commit: f85bf9f)

**File:** `public/static/app.js`  
**Lines:** 3160-3164

**Before:**
```javascript
const avgPrice = stock.avg_price || stock.price
const costBasis = stock.cost_basis || stock.price  // ❌ Uses cached DB value
const adjustments = stock.total_adjustments || 0   // ❌ Uses cached DB value
```

**After:**
```javascript
// Calculate cost basis dynamically from ALL cost basis adjustments
const avgPrice = stock.avg_price || stock.price
const totalAdjustments = costBasisAdjustmentsData.reduce((sum, adj) => sum + adj.amount, 0)
const costBasis = avgPrice - (totalAdjustments / stock.quantity)
const adjustments = totalAdjustments
```

### Technical Details

**Data Source:**
- The modal already fetches all cost basis adjustments via API: `GET /api/stocks/:id/cost-basis-adjustments`
- Data stored in `costBasisAdjustmentsData` array (line 3149)

**Adjustment Types Included:**
1. **SELLING_PUT** - Premium credits from assigned short put options (net proceeds after commission)
2. **DIVIDEND** - Dividend payments received
3. **COVERED_CALL** - Premiums collected from covered calls written against the position

**Calculation Formula:**
```
Total Adjustments = Sum of all adjustment amounts
Cost Basis per Share = Average Price - (Total Adjustments / Shares)
```

**Example:**
```
Position: 100 shares @ $50.00 avg price

Adjustments:
- Assignment premium: $199.50 (put premium minus commission)
- Dividend payment: $50.00 (quarterly dividend)
- Covered call premium: $75.00 (call sold)

Total Adjustments: $199.50 + $50.00 + $75.00 = $324.50
Cost Basis: $50.00 - ($324.50 / 100) = $50.00 - $3.245 = $46.76/share
```

### Display Location

The calculated cost basis is displayed in the **Position Summary** section of the stock details modal:

```
Position Summary
├── Avg Price: $50.00
├── Cost Basis/Share: $46.76 ← Dynamically calculated
└── CB Adjustments: -$324.50 ← Sum of all adjustments
```

## Testing

### Automated Tests
- **Test Suite:** 94/94 tests passing
- **Demo Account Login:** Verified (catches JS errors automatically)
- **Build:** SUCCESS (1.07s)
- **Server:** Online on port 3000

### Manual Testing Checklist
1. ✅ Open stock details modal for position with assignment history
2. ✅ Verify Cost Basis/Share reflects assignment premium
3. ✅ Record a dividend → verify Cost Basis/Share updates
4. ✅ Write a covered call → verify Cost Basis/Share updates
5. ✅ Check Position Summary displays correct calculations
6. ✅ Verify Assignment History section shows only SELLING_PUT adjustments
7. ✅ Verify Dividend History section shows dividends
8. ✅ Verify Covered Call History section shows covered calls

## Benefits

### For Users
- **Accurate cost basis** displayed in real-time
- **True effective entry price** visible at a glance
- **No manual calculation** required to verify cost basis
- **Transparency** - see all adjustment sources affecting cost basis

### For Developers
- **Single source of truth** - adjustments table is authoritative
- **No data synchronization** issues between cached values and adjustments
- **Easier maintenance** - add new adjustment types without updating display logic
- **Better data integrity** - display always matches underlying data

## Related Features

### Cost Basis Adjustments Table
```sql
CREATE TABLE cost_basis_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  holding_id INTEGER NOT NULL,
  adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('SELLING_PUT', 'DIVIDEND', 'COVERED_CALL')),
  amount REAL NOT NULL,
  adjustment_date DATE NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (holding_id) REFERENCES stock_holdings(id) ON DELETE CASCADE
);
```

### Assignment Endpoint
**POST** `/api/options/:id/assign`

Creates SELLING_PUT adjustment with **net proceeds** (premium minus commission):
```typescript
const grossPremium = option.premium * option.quantity * 100
const commission = parseFloat(option.commission || 0)
const netProceeds = grossPremium - commission

await DB.prepare(`
  INSERT INTO cost_basis_adjustments (
    user_id, holding_id, adjustment_type, amount, adjustment_date, notes
  ) VALUES (?, ?, 'SELLING_PUT', ?, ?, ?)
`).bind(userId, holdingId, netProceeds, assignment_date, notes).run()
```

### Commission Handling
- **Commission is subtracted** from gross premium before recording adjustment
- **Net proceeds** used for cost basis calculation
- **Formula:** `Net Proceeds = Gross Premium - Commission`
- **Example:** $200 premium - $5 commission = $195 net proceeds

## Commit History

```
3f96d1e Docs: Update README to document dynamic cost basis calculation
f85bf9f Fix: Calculate Cost Basis/Share from all adjustment sources in modal
902134f Feature: Include commission in cost basis calculations
6f3352a Test: Add demo account login verification to regression tests
670c3df Fix: JavaScript syntax error in assignment history template
ff15d4c Docs: Update documentation to reflect simplified modal design
c157a7b Refactor: Simplify modal by showing only assignment history
```

## Documentation Updates

### README.md (Commit: 3f96d1e)
- Updated Position Summary section to document dynamic calculation
- Added calculation formula: `Cost Basis = Avg Price - (Total Adjustments / Shares)`
- Listed all adjustment sources: SELLING_PUT, DIVIDEND, COVERED_CALL
- Updated example to include commission calculation and net proceeds
- Added note explaining dynamic calculation approach

## Implementation Date
- **Date:** June 16, 2026
- **Developer:** AI Assistant
- **Status:** ✅ Complete and tested

## Future Enhancements

### Potential Improvements
1. **Performance Optimization:** Cache calculated cost basis in frontend state to avoid recalculation on every render
2. **Breakdown Display:** Add tooltip showing individual adjustment contributions to total cost basis
3. **Historical View:** Show cost basis evolution over time as adjustments are added
4. **Export Feature:** Include calculated cost basis in CSV exports

### Backend Considerations
The `stock.cost_basis` and `stock.total_adjustments` columns in the database are now **redundant** since we calculate dynamically. Options:
1. **Keep as cache:** Update these fields via triggers/jobs for reporting purposes
2. **Remove columns:** Simplify schema by removing redundant cached values
3. **Hybrid approach:** Use cached values for lists, dynamic calculation for detail views

**Recommendation:** Keep cached values for performance in stock list views, use dynamic calculation in detail modal for accuracy.

## Related Documentation
- **WHEEL_IMPLEMENTATION_COMPLETE.md** - Complete Wheel strategy implementation
- **STOCK_MODAL_TESTING_GUIDE.md** - Modal testing procedures (10 test cases)
- **ASSIGNMENT_TESTING_GUIDE.md** - Assignment feature testing (14 test cases)
- **README.md** - Stock Position Management Modal section

## Conclusion
The dynamic cost basis calculation ensures that the stock details modal always displays the user's true effective entry price by incorporating ALL sources of cost basis adjustments. This implementation improves data accuracy, reduces maintenance burden, and provides users with transparent, real-time cost basis information.
