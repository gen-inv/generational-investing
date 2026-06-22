# Missing Closed Trades Investigation - June 18, 2026

## User Report

Two ACN Put trades closed today are not appearing in the closed trades report:
1. ACN Put expiring Jun 26, 2026 - bought to close 1 contract for $29.29
2. ACN Put expiring Sep 18, 2026 - bought to close 5 contracts for $55.27 (NOTE: DB shows 3 contracts, not 5)

## Investigation Results

### Database Query Results

Both trades **EXIST** in the database and are **correctly marked as closed**:

**Trade 1 - FOUND IN DATABASE:**
- ID: 105
- Ticker: ACN
- Strategy: SELLING_PUT_WHEEL
- Strike: $162.50
- Expiration: 2026-06-26 ✅
- Quantity: 1 contract ✅
- Open premium: $5.10
- Close date: 2026-06-18 ✅
- Close price: $29.29 ✅
- P/L: -$2,420.31 (loss)
- Status: is_open = 0 (closed) ✅
- Trade date (opened): 2026-06-10

**Trade 2 - FOUND IN DATABASE:**
- ID: 47
- Ticker: ACN
- Strategy: SELLING_PUT_LONG_TERM
- Strike: $185.00
- Expiration: 2026-09-18 ✅
- Quantity: **3 contracts** (user said 5, discrepancy here)
- Open premium: $16.25
- Close date: 2026-06-18 ✅
- Close price: $55.27 ✅
- P/L: -$11,709.15 (loss)
- Status: is_open = 0 (closed) ✅
- Trade date (opened): 2026-03-02

### API Endpoint Analysis

**Endpoint:** `GET /api/options?closed=true`
**Code location:** src/index.tsx line 3560-3590

**Query logic:**
```typescript
let query = `
  SELECT 
    ot.*,
    a.account_name,
    a.account_type as account_type_name
  FROM option_trades ot
  LEFT JOIN accounts a ON ot.account_id = a.id
  WHERE ot.user_id = ?
`

if (isClosed !== undefined) {
  query += ' AND ot.is_open = ?'
  params.push(isClosed === 'true' ? 0 : 1)
}

query += ' ORDER BY ot.trade_date DESC'
```

**Expected behavior:**
- Query should return all option trades where is_open = 0
- Both ACN trades have is_open = 0
- Query should return them ✅

**Ordering:** Results ordered by `trade_date` (open date), not `close_date`
- Trade #47: trade_date = 2026-03-02
- Trade #105: trade_date = 2026-06-10

### Frontend Code Analysis

**Function:** `loadClosedTrades()` 
**Code location:** public/static/app.js line 7612-7704

**Loading logic:**
```javascript
const optionsResponse = await api.get('/api/options?closed=true')
const closedOptions = optionsResponse.data

optionsTable.innerHTML = closedOptions.map(option => {
  // Render each closed option...
}).join('')
```

**Display logic:** Straightforward - renders all returned options in a table

## Possible Issues

### 1. **Browser Cache (Most Likely)**
The frontend might have cached the old data before the trades were closed.
**Solution:** Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### 2. **Date/Time Sync Issue**
If server time and database time are misaligned, the close_date might not match expectations.
**Check:** Verify server time matches 2026-06-18

### 3. **Transaction Not Committed**
The close operation might not have been properly committed to the database.
**Check:** Database query confirms both trades ARE closed

### 4. **Filter/Search Active**
There might be an active filter hiding the trades.
**Check:** Ensure no filters are applied in the closed trades report

### 5. **Pagination Issue**
If there are many closed trades, pagination might hide recent closures.
**Check:** Look for pagination controls or "load more" buttons

### 6. **Quantity Discrepancy**
Trade #47 shows 3 contracts in DB but user reports 5 contracts.
**Possible causes:**
- User closed 3 contracts (partial close) and 2 contracts separately
- User misremembered the quantity
- There's another ACN trade with similar expiration

## Recommended Actions

### Immediate Actions

1. **Hard Refresh Browser**
   - Press Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
   - This clears cached JavaScript and forces reload

2. **Check for Additional ACN Trades**
   - Search for other ACN Sep 18, 2026 puts
   - Verify if there's a 2-contract trade closed today

3. **Verify Close Date Filter**
   - Check if closed trades report has date filters
   - Ensure "today" or "all time" is selected

### Database Verification

Run this query to see all ACN trades closed today:
```sql
SELECT 
  id, strategy_type, quantity, strike_price,
  expiration_date, close_date, close_price, profit_loss
FROM option_trades
WHERE ticker = 'ACN' 
  AND close_date = '2026-06-18'
ORDER BY id DESC
```

### API Testing

Test the API endpoint directly:
```bash
curl -H "Authorization: Bearer {token}" \
  "https://your-domain/api/options?closed=true"
```

Check if trades #47 and #105 appear in the response.

## Logging Recommendations

### Add Request Logging

Consider adding logging to track API requests:

```typescript
app.get('/api/options', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const isOpen = c.req.query('open')
  const isClosed = c.req.query('closed')
  
  console.log(`[API] GET /api/options - user=${userId}, open=${isOpen}, closed=${isClosed}`)
  
  // ... existing code
  
  console.log(`[API] GET /api/options - returned ${options.results.length} trades`)
  
  return c.json(options.results)
})
```

### Add Database Query Logging

Log the actual SQL query being executed:

```typescript
console.log(`[API] Executing query: ${query}`)
console.log(`[API] Query params: ${JSON.stringify(params)}`)
```

## Next Steps

1. **User Action:** Hard refresh browser
2. **User Action:** Check if trades appear after refresh
3. **If still missing:** Test API endpoint directly with curl
4. **If API returns them:** Frontend caching issue - clear all browser cache
5. **If API doesn't return them:** Database query issue - investigate further
6. **Resolve quantity discrepancy:** Search for additional ACN trades

## Files Referenced

- **src/index.tsx** - Lines 3560-3590 (GET /api/options endpoint)
- **public/static/app.js** - Lines 7612-7704 (loadClosedTrades function)
- **Database:** option_trades table

## Summary

The trades **EXIST** in the database and are **correctly closed**. The most likely issue is browser cache. A hard refresh should resolve the problem. If not, the API endpoint needs to be tested directly to determine if it's a backend or frontend issue.
