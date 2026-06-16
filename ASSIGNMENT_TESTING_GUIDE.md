# Stock Assignment Feature - Testing Guide

## 🎯 Overview

The Stock Assignment feature allows you to close a Short Put option and automatically create a corresponding stock position when the option is assigned. This is essential for both Wheel and Stockpiling strategies.

## 📋 Testing URL

**Development Server**: https://3000-imi5lx8i4w7yx1t3dzzid-583b4d74.sandbox.novita.ai

**Demo Account:**
- Email: demo@generationalinvesting.ca
- Password: test123

---

## ✅ Test 1: Assign Short Put (Stockpiling) - New Stock Position

**Prerequisites:**
- Have at least one open "Short Put (Stockpiling)" option

**Steps:**
1. Navigate to **Options** tab
2. Find an open Short Put (Stockpiling) option
3. Click **"Manage"** button
4. In the manage modal sidebar, click **"Assign Stock Position"** button

**Expected Results:**
- ✅ "Assign Stock Position" button appears in sidebar (amber color)
- ✅ Button only visible for Short Put strategies (both Stockpiling and Wheel)
- ✅ Button NOT visible for other strategies (Long Puts, Calls, Spreads, etc.)

5. **Assignment Modal Opens:**
   - ✅ Title: "Assign Stock Position"
   - ✅ Amber gradient header with exchange icon
   - ✅ Assignment Summary section shows:
     - Ticker
     - Strategy: "Stockpiling"
     - Shares: (contracts × 100)
     - Strike Price
     - Account
     - Contracts
   - ✅ Assignment Date field (defaults to today)
   - ✅ Notes field (optional)
   - ✅ "What Will Happen" section explains the process

6. **Fill in the form:**
   - Assignment Date: Select date (e.g., expiration date)
   - Notes: "Assigned at expiration" (optional)

7. Click **"Confirm Assignment"**

**Expected Results:**
- ✅ Modal closes
- ✅ Success message: "Assignment completed successfully! Option closed and X shares of TICKER added to your portfolio."
- ✅ Option is now CLOSED with $0 close price
- ✅ New stock position appears in Stock Trades table
- ✅ Stock position shows NO Wheel badge (Stockpiling strategy)
- ✅ Stock quantity = contracts × 100
- ✅ Stock price = strike price
- ✅ Stock appears in same account as option

---

## ✅ Test 2: Assign Short Put (Wheel) - New Stock Position

**Prerequisites:**
- Have at least one open "Short Put (Wheel)" option

**Steps:**
1. Navigate to **Options** tab
2. Find an open Short Put (Wheel) option
3. Click **"Manage"** button
4. Click **"Assign Stock Position"** button

**Expected Results:**
5. **Assignment Modal Shows:**
   - ✅ Strategy: "🎡 Wheel" (with wagon wheel icon)
   - ✅ All other fields same as Test 1

6. **Fill in and submit the form**

**Expected Results:**
- ✅ Modal closes with success message
- ✅ Option is CLOSED
- ✅ New stock position appears in Stock Trades table
- ✅ Stock position shows **purple Wheel badge** (🎡)
- ✅ Stock strategy_type = WHEEL
- ✅ Stock quantity = contracts × 100
- ✅ Stock price = strike price

---

## ✅ Test 3: Assign to Existing Stock Position (Average Price Update)

**Prerequisites:**
- Have existing open stock position (e.g., 100 shares of AAPL @ $150)
- Have open Short Put option for same ticker in same account (e.g., 1 contract @ $145 strike)

**Steps:**
1. Navigate to **Options** tab
2. Find the Short Put option for the stock you already own
3. Click **"Manage"** → **"Assign Stock Position"**
4. Confirm assignment

**Expected Results:**
- ✅ Option is CLOSED
- ✅ Stock position is UPDATED (not created new)
- ✅ Total shares increased by (contracts × 100)
- ✅ Average price recalculated:
  - Example: (100 shares @ $150) + (100 shares @ $145) = 200 shares @ $147.50
- ✅ Strategy type updated if different (Wheel takes precedence)
- ✅ Only ONE stock position exists for this ticker+account

---

## ✅ Test 4: Assignment Modal Validation

**Steps:**
1. Open assignment modal for any Short Put option
2. Try to submit without filling required fields

**Expected Results:**
- ✅ Assignment Date is required (browser validation)
- ✅ Notes field is optional (can be empty)

---

## ✅ Test 5: Assignment Calculations

**Setup Example:**
- Option: Short Put (Wheel)
- Ticker: AAPL
- Strike: $150
- Premium: $2.50
- Contracts: 2
- Open Commission: $2.60

**Expected Assignment Results:**
- ✅ **Stock Created:**
  - Shares: 200 (2 contracts × 100)
  - Price: $150.00 (strike price)
  - Strategy: WHEEL
  
- ✅ **Option Closed:**
  - Close Price: $0.00 (assignment)
  - Close Date: Assignment date
  - Close Commission: $0.00
  - Profit/Loss: -$29,502.60
    - Calculation: -(($150 × 2 × 100) - ($2.50 × 2 × 100) + $2.60)
    - Calculation: -($30,000 - $500 + $2.60) = -$29,502.60
  
- ✅ **Stock Transaction Record:**
  - Type: BUY
  - Shares: 200
  - Price per share: $150.00
  - Commission: $0.00
  - Notes: "Assigned from option: 200 shares @ $150"

---

## ✅ Test 6: Assignment with Notes

**Steps:**
1. Open assignment modal
2. Enter notes: "ITM at expiration - assigned"
3. Confirm assignment

**Expected Results:**
- ✅ Notes saved to stock position
- ✅ Option notes updated with assignment info
- ✅ Stock transaction includes assignment note

---

## ✅ Test 7: Strategy Inheritance

**Test Cases:**

| Option Strategy       | Stock Strategy Type | Badge Display |
|-----------------------|---------------------|---------------|
| SELLING_PUT           | STOCKPILING         | No badge      |
| SELLING_PUT_WHEEL     | WHEEL               | 🎡 badge     |

**Verify:**
- ✅ Short Put (Stockpiling) → Creates STOCKPILING stock
- ✅ Short Put (Wheel) → Creates WHEEL stock
- ✅ Strategy type persists correctly in database

---

## ✅ Test 8: Button Visibility Logic

**Create/Find options with these strategies and verify button visibility:**

| Strategy              | Assign Button Visible? |
|-----------------------|------------------------|
| Short Put (Stockpiling) | ✅ YES               |
| Short Put (Wheel)       | ✅ YES               |
| Short Put (Long Term)   | ❌ NO                |
| Long Put                | ❌ NO                |
| Long Call               | ❌ NO                |
| Covered Call            | ❌ NO                |
| Credit Spread           | ❌ NO                |
| Debit Spread            | ❌ NO                |
| Iron Condor             | ❌ NO                |

**Expected:**
- ✅ Button ONLY appears for SELLING_PUT and SELLING_PUT_WHEEL
- ✅ Button NOT visible for closed positions

---

## ✅ Test 9: Closed Position - No Assignment Button

**Steps:**
1. Find a CLOSED Short Put option
2. Click **"Manage"** button

**Expected Results:**
- ✅ "Assign Stock Position" button does NOT appear
- ✅ Only "Edit Trade" button visible (no action buttons for closed positions)

---

## ✅ Test 10: Data Refresh After Assignment

**Steps:**
1. Assign a Short Put option
2. Check all relevant sections

**Expected Results:**
- ✅ Options tab: Option marked as CLOSED
- ✅ Stock Trades tab: New/updated stock position appears
- ✅ Dashboard: P/L updated to reflect closed option
- ✅ Reports: Assignment reflected in P/L calculations

---

## ✅ Test 11: Multiple Assignments Same Ticker

**Setup:**
- Create 2 Short Put options for AAPL in same account
- Assign first option → Creates 100 shares
- Assign second option → Updates to 200 shares

**Expected Results:**
- ✅ First assignment: Creates new stock holding
- ✅ Second assignment: Updates existing holding
- ✅ Average price correctly calculated
- ✅ Only ONE stock position exists (not duplicates)

---

## 🐛 Error Cases to Test

### Test 12: Already Closed Option
**Steps:**
1. Try to assign an already-closed option (shouldn't be possible via UI)

**Expected:**
- ✅ Button not visible for closed options
- ✅ If API called directly: Error "Option is already closed"

### Test 13: Wrong Strategy Type
**Steps:**
1. Try to assign a non-Short Put strategy (shouldn't be possible via UI)

**Expected:**
- ✅ Button not visible for other strategies
- ✅ If API called directly: Error "Assignment is only available for Short Put strategies"

### Test 14: Missing Assignment Date
**Steps:**
1. Open assignment modal
2. Clear date field
3. Try to submit

**Expected:**
- ✅ Browser validation prevents submission
- ✅ "Please fill out this field" message

---

## 📊 Database Verification (Optional)

After assignment, verify database records:

```bash
cd /home/user/webapp

# Check option was closed
npx wrangler d1 execute webapp-production --local --command="
SELECT id, ticker, strategy_type, is_open, close_date, close_price, profit_loss 
FROM option_trades 
WHERE id = <option_id>
"

# Check stock holding was created/updated
npx wrangler d1 execute webapp-production --local --command="
SELECT id, ticker, total_shares, average_price, strategy_type, is_open 
FROM stock_holdings 
WHERE ticker = '<ticker>' AND is_open = 1
"

# Check stock transaction was created
npx wrangler d1 execute webapp-production --local --command="
SELECT * FROM stock_transactions 
WHERE holding_id = <holding_id> 
ORDER BY transaction_date DESC LIMIT 1
"
```

---

## ✅ Success Criteria

All features working correctly if:

1. ✅ "Assign Stock Position" button appears only for Short Put (Stockpiling/Wheel)
2. ✅ Button only visible for OPEN positions
3. ✅ Assignment modal displays correct information
4. ✅ Assignment creates/updates stock position correctly
5. ✅ Option is closed with $0 close price
6. ✅ Strategy type inherited correctly (WHEEL or STOCKPILING)
7. ✅ Wheel badge appears for WHEEL stocks only
8. ✅ Average price calculated correctly for existing holdings
9. ✅ Stock transaction audit trail created
10. ✅ All data refreshes properly after assignment
11. ✅ No duplicate stock positions created

---

## 🎉 Testing Complete!

Once all tests pass, the Stock Assignment feature is ready for production deployment! 🚀

**Next Steps:**
1. Complete manual testing using this guide
2. Report any issues found
3. Apply migration to production database
4. Deploy to Cloudflare Pages
