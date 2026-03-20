# Missing Dividend Indicators on Stock Trades View

## Overview
The Stock Trades view now displays visual indicators for stocks with missing dividends to record, similar to the existing covered call expiration indicators. Both indicators can appear together on the same stock holding.

## Visual Design

### Badge System
We've implemented a clean badge system instead of icons:

| Indicator | Appearance | Meaning | Tooltip |
|-----------|-----------|---------|---------|
| **CC** (Red) | Red badge with white text | Covered call expires ≤14 days | "Covered call expires in X days" |
| **CC** (Orange) | Orange badge with white text | Covered call expires >14 days | "Covered call expires in X days" |
| **DIV** (Blue) | Blue badge with white text | Missing dividends to record | "X missing dividend(s) to record" |

### Row Highlighting
Background colors follow a priority hierarchy:

1. **Red background** (`bg-red-50`) - Urgent covered call (expires ≤14 days) - HIGHEST PRIORITY
2. **Orange background** (`bg-orange-50`) - Active covered call (expires >14 days) - MEDIUM PRIORITY
3. **Blue background** (`bg-blue-50`) - Missing dividends only - INFORMATIONAL

**Note:** If both a covered call AND missing dividends exist, the covered call color takes precedence (red or orange), but BOTH badges are displayed.

### Example Scenarios

#### Scenario 1: Only Missing Dividends
```
Stock: NVDY
Background: Light blue (bg-blue-50)
Badges: [DIV]
Result: Blue row with DIV badge
```

#### Scenario 2: Only Urgent Covered Call
```
Stock: JEPQ
Background: Light red (bg-red-50)
Badges: [CC]
Result: Red row with red CC badge
```

#### Scenario 3: Both Missing Dividends AND Urgent Covered Call
```
Stock: JEPI
Background: Light red (bg-red-50)
Badges: [CC] [DIV]
Result: Red row with both red CC and blue DIV badges
```

#### Scenario 4: Both Missing Dividends AND Active Covered Call
```
Stock: SVOL
Background: Light orange (bg-orange-50)
Badges: [CC] [DIV]
Result: Orange row with both orange CC and blue DIV badges
```

## Backend Implementation

### API Enhancement
The `GET /api/stocks?open=true` endpoint now includes two additional fields:

```typescript
{
  has_missing_dividends: boolean,      // true if missing dividends exist
  missing_dividend_count: number       // count of missing dividends
}
```

### Detection Logic
For each open stock holding, the backend:

1. **Gets date range**: From `opened_date` to today
2. **Fetches repository dividends**: All dividends for the ticker in date range
3. **Gets recorded dividends**: From `cost_basis_adjustments` with type='DIVIDEND'
4. **Calculates shares held**: On each ex_date using transaction history
5. **Applies smart matching**: Reuses the same logic as `/api/stocks/:id/missing-dividends`
   - Exact ex_date match in notes
   - Per-share amount match (reversed for withholding) + pay date within 3 days
6. **Counts missing**: Any dividends with shares held but not recorded

### Code Reuse
The backend reuses the exact same matching logic as the missing-dividends endpoint:
- Same `datesWithinDays()` function for date proximity checking
- Same `isDivRecorded()` logic with withholding tax reversal
- Same `getSharesOnDate()` calculation using transaction history
- Same smart matching with ex_date notes and per-share comparison

This ensures consistency across the application - dividends shown as missing on the Stock Trades view will also appear in the Position Management modal.

### Performance Considerations
The dividend check runs for **open positions only** (`is_open = 1`) to optimize performance. Closed positions do not need dividend checks since no future dividends can be recorded.

## Frontend Implementation

### Badge Rendering
```javascript
let indicators = ''

// Covered Call badge (red or orange)
if (stock.cc_status === 'urgent') {
    indicators += `<span class="...bg-red-600...">CC</span>`
} else if (stock.cc_status === 'active') {
    indicators += `<span class="...bg-orange-600...">CC</span>`
}

// Missing Dividends badge (blue)
if (stock.has_missing_dividends) {
    indicators += `<span class="...bg-blue-600...">DIV</span>`
}
```

### Row Color Logic
```javascript
let rowClass = 'border-b border-gray-200 hover:bg-gray-50'

// CC status takes precedence for background
if (stock.cc_status === 'urgent') {
    rowClass = 'border-b border-gray-200 bg-red-50 hover:bg-red-100'
} else if (stock.cc_status === 'active') {
    rowClass = 'border-b border-gray-200 bg-orange-50 hover:bg-orange-100'
} else if (stock.has_missing_dividends) {
    // Only apply blue if no CC status
    rowClass = 'border-b border-gray-200 bg-blue-50 hover:bg-blue-100'
}
```

## User Experience Flow

### Discovery
1. User navigates to **Stock Trades** section
2. Sees blue **DIV** badge on holdings with missing dividends
3. Sees red/orange **CC** badge on holdings with covered calls
4. Can hover over badges to see tooltips with details

### Action
1. User clicks **Manage** button on stock with DIV badge
2. Position Management modal opens
3. **"Missing Dividends from Repository"** section appears (amber/yellow)
4. User can **ADD** or **EDIT** missing dividends
5. After adding, the DIV badge disappears on next page load

### Priority System
The visual hierarchy guides users to take action in order of urgency:
1. **Red rows with CC badge** - Most urgent (handle covered call expiration first)
2. **Orange rows with CC badge** - Medium urgency (covered call needs attention soon)
3. **Blue rows with DIV badge** - Informational (record dividends when convenient)

## Technical Details

### Files Modified
- **Backend**: `src/index.tsx` - GET /api/stocks endpoint (~80 lines added)
- **Frontend**: `public/static/app.js` - loadStocks() function (~30 lines modified)

### Database Queries
For each open stock, the backend runs:
1. `SELECT` from `dividend_repository` (dividends in date range)
2. `SELECT` from `cost_basis_adjustments` (recorded dividends)
3. `SELECT` from `stock_transactions` (calculate shares held)

These queries are efficient with proper indexing and only run for open positions.

### Caching Opportunities (Future Enhancement)
To improve performance with many holdings:
- Cache dividend repository data (changes weekly)
- Cache transaction history until new transactions added
- Add `last_dividend_check` timestamp to avoid rechecking frequently

## Testing Scenarios

### Test Case 1: NVDY with Missing Dividends
```
Setup:
- NVDY position opened 2026-01-15
- Dividend repository has 3 dividends: 2026-01-23, 2026-02-06, 2026-02-20
- User has recorded: 2026-01-23 only

Expected Result:
- DIV badge appears on NVDY row
- Tooltip: "2 missing dividend(s) to record"
- Blue background on row
- Clicking Manage shows 2 missing dividends (2026-02-06, 2026-02-20)
```

### Test Case 2: JEPI with Both CC and Missing Dividends
```
Setup:
- JEPI position with covered call expiring in 10 days
- 1 missing dividend in repository

Expected Result:
- Both CC (red) and DIV (blue) badges appear
- Red background (CC takes precedence)
- Tooltip on CC: "Covered call expires in 10 days"
- Tooltip on DIV: "1 missing dividend(s) to record"
```

### Test Case 3: All Dividends Recorded
```
Setup:
- JEPQ position with 5 dividends in repository
- All 5 dividends already recorded

Expected Result:
- No DIV badge appears
- Normal white/gray background (unless CC active)
- Position Management modal shows empty "Missing Dividends" section
```

### Test Case 4: No Shares Held on Ex-Date
```
Setup:
- Position opened 2026-02-01
- Dividend ex-date was 2026-01-15 (before position opened)

Expected Result:
- Dividend correctly excluded (no shares held on ex-date)
- No DIV badge
- Dividend does not appear in missing list
```

## Integration with Existing Features

### Works With Covered Call Indicators
- Both indicators can coexist on same row
- Visual priority system (red > orange > blue)
- Independent functionality (CC and DIV logic separate)

### Works With Position Management Modal
- DIV badge indicates what will appear in modal
- Clicking Manage shows the same missing dividends
- After adding dividend, page refresh removes badge
- Consistent matching logic between view and modal

### Works With Dividend Repository
- Uses data from dividend_repository table
- Respects repository status (only 'active' dividends)
- Matches against user's recorded dividends
- Applies same withholding tax logic

## Related Documentation
- [MISSING_DIVIDENDS_FEATURE.md](./MISSING_DIVIDENDS_FEATURE.md) - Position Management modal feature
- [DIVIDEND_MATCHING_FIX.md](./DIVIDEND_MATCHING_FIX.md) - Smart matching logic
- [DUAL_API_IMPLEMENTATION.md](./DUAL_API_IMPLEMENTATION.md) - Dividend data source

## Deployment
- **Commit**: c33719d
- **Build Size**: 381.58 kB (+1.5 kB from dividend indicators)
- **Production URL**: https://e593b991.generational-investing.pages.dev
- **Main URL**: https://app.generationalinvesting.ca
- **Status**: ✅ Deployed and live
