# Wheel Strategy Feature - Testing Guide

## 🎯 Quick Testing Checklist

This guide helps you manually test all the new Wheel strategy features.

## Testing URL
**Development Server**: https://3000-imi5lx8i4w7yx1t3dzzid-583b4d74.sandbox.novita.ai

---

## ✅ Test 1: Create New Stock with Wheel Strategy

**Steps:**
1. Navigate to **Stock Trades** tab
2. Click **"Add Trade"** button
3. Fill in the form:
   - Company: Select any company (e.g., AAPL)
   - Trade Type: BUY
   - Quantity: 100
   - Price: 150.00
   - Account: Select any account
   - Trade Date: Today's date
   - **Trading Strategy**: Select **"Wheel Strategy"** radio button
4. Click **Submit**

**Expected Results:**
- ✅ Form should have purple gradient "Trading Strategy" section
- ✅ Radio buttons for Stockpiling (default) and Wheel Strategy
- ✅ Stock should be created successfully
- ✅ Table should show new stock with **purple Wheel badge** next to ticker
- ✅ Badge should have wagon wheel icon (🎡) and text "Wheel"

---

## ✅ Test 2: Create Stock with Default Stockpiling Strategy

**Steps:**
1. Navigate to **Stock Trades** tab
2. Click **"Add Trade"** button
3. Fill in the form (don't change radio button):
   - Company: Select different company (e.g., MSFT)
   - Trade Type: BUY
   - Quantity: 50
   - Price: 350.00
   - Account: Select any account
   - Trade Date: Today's date
   - **Trading Strategy**: Leave as **"Stockpiling"** (default)
4. Click **Submit**

**Expected Results:**
- ✅ "Stockpiling" radio button should be pre-selected by default
- ✅ Stock should be created successfully
- ✅ Table should show stock **WITHOUT** Wheel badge (only ticker, no badge)

---

## ✅ Test 3: Edit Existing Stock - Change to Wheel Strategy

**Steps:**
1. Navigate to **Stock Trades** tab
2. Find the MSFT stock you just created (without Wheel badge)
3. Click **"Manage"** button
4. Click **"Edit Stock Trade"** button
5. In the form:
   - Notice **"Stockpiling"** is selected
   - Change selection to **"Wheel Strategy"**
6. Click **Submit**

**Expected Results:**
- ✅ Form should pre-select correct strategy type when editing
- ✅ Update should succeed
- ✅ After refresh/reload, MSFT should now show **purple Wheel badge**
- ✅ Strategy change should persist in database

---

## ✅ Test 4: Edit Existing Stock - Change from Wheel to Stockpiling

**Steps:**
1. Navigate to **Stock Trades** tab
2. Find the AAPL stock (with Wheel badge)
3. Click **"Manage"** button
4. Click **"Edit Stock Trade"** button
5. In the form:
   - Notice **"Wheel Strategy"** is selected
   - Change selection to **"Stockpiling"**
6. Click **Submit**

**Expected Results:**
- ✅ Form should pre-select "Wheel Strategy" when editing Wheel stocks
- ✅ Update should succeed
- ✅ After refresh/reload, AAPL should **NO LONGER** show Wheel badge
- ✅ Badge should disappear after strategy change

---

## ✅ Test 5: Option Strategy - Short Put (Wheel)

**Steps:**
1. Navigate to **Options** tab
2. Click **"Add Option"** button
3. Fill in the form:
   - Company: Select any company (e.g., AAPL)
   - **Strategy**: Select **"Short Put (Wheel)"** from dropdown
   - Strike Price: 145.00
   - Premium: 2.50
   - Quantity: 1
   - Expiration Date: Next month
   - Account: Select any account
   - Trade Date: Today's date
4. Click **Submit**

**Expected Results:**
- ✅ "Short Put (Wheel)" should appear in strategy dropdown
- ✅ Should function identically to "Short Put (Stockpiling)"
- ✅ Option should be created successfully
- ✅ Should appear in options table with correct strategy label

---

## ✅ Test 6: Visual Indicators Across Multiple Stocks

**Steps:**
1. Create 3 stocks:
   - Stock A: Wheel Strategy
   - Stock B: Stockpiling Strategy
   - Stock C: Wheel Strategy
2. View the Stock Trades table

**Expected Results:**
- ✅ Stock A: Shows purple Wheel badge
- ✅ Stock B: No badge
- ✅ Stock C: Shows purple Wheel badge
- ✅ Badges should be consistently styled
- ✅ Wagon wheel icon should be visible in badges

---

## ✅ Test 7: Badge Interaction with Other Indicators

**Steps:**
1. Create or find a Wheel strategy stock
2. Add a covered call to it (if possible)
3. View in table

**Expected Results:**
- ✅ Wheel badge should appear after ticker
- ✅ Should not conflict with CC indicator badge
- ✅ Should not conflict with DIV indicator badge
- ✅ Multiple indicators should display properly side by side

---

## 🔍 Database Verification (Optional)

If you want to verify data in the database:

**Check strategy_type values:**
```bash
cd /home/user/webapp
npx wrangler d1 execute webapp-production --local --command="SELECT id, ticker, strategy_type, total_shares FROM stock_holdings WHERE is_open = 1"
```

**Expected Results:**
- ✅ Should see 'WHEEL' or 'STOCKPILING' in strategy_type column
- ✅ NULL values indicate stocks created before this feature (defaults to STOCKPILING in UI)

---

## ❌ Known Limitations (As Designed)

These are **NOT implemented yet** per your request:

1. **No "Assign Stock Position" Button**
   - You cannot assign short put options to create stock positions yet
   - This feature is deferred until core features are validated

2. **No Automatic Strategy Inheritance**
   - Creating stock manually doesn't auto-set strategy based on options
   - Must manually select Wheel or Stockpiling when creating stock

---

## 🐛 What to Report as Bugs

Report these if you encounter them:

1. ❌ Radio buttons not appearing in stock form
2. ❌ Form not pre-selecting correct strategy when editing
3. ❌ Wheel badge not appearing for Wheel strategy stocks
4. ❌ Wheel badge appearing for non-Wheel stocks
5. ❌ Strategy changes not persisting after edit
6. ❌ "Short Put (Wheel)" missing from options dropdown
7. ❌ Form submission errors related to strategy_type
8. ❌ Badge styling issues (color, icon, spacing)

---

## 📊 Expected Visual Appearance

### Stock Form - Trading Strategy Section
```
┌─────────────────────────────────────────────────┐
│  🎯 Trading Strategy                            │
│                                                 │
│  ○ Stockpiling    ○ 🎡 Wheel Strategy          │
└─────────────────────────────────────────────────┘
(Purple gradient background, rounded corners)
```

### Stock Trades Table Row
```
┌──────────┬────────────────────┬────────────┐
│ Account  │ Ticker             │ Date       │
├──────────┼────────────────────┼────────────┤
│ TFSA     │ AAPL [🎡]         │ 2026-06-16 │
│ RRSP     │ MSFT               │ 2026-06-16 │
└──────────┴────────────────────┴────────────┘
```

Badge appearance:
- **Background**: Purple (#7C3AED)
- **Text**: None (icon only)
- **Icon**: Wagon wheel (fa-dharmachakra)
- **Size**: Small (xs)
- **Shape**: Rounded pill

---

## ✅ Success Criteria

All features working correctly if:

1. ✅ Can create stock with Wheel strategy
2. ✅ Can create stock with Stockpiling strategy (default)
3. ✅ Can edit existing stock to change strategy type
4. ✅ Wheel badge displays correctly for Wheel stocks
5. ✅ No badge displays for Stockpiling stocks
6. ✅ "Short Put (Wheel)" option appears in options dropdown
7. ✅ Form pre-populates correct strategy when editing
8. ✅ All 93 regression tests pass ✅
9. ✅ No console errors or warnings
10. ✅ Database persists strategy_type correctly

---

## 📝 Testing Notes

Use this space to document any issues found:

**Issue 1:**
- Description: 
- Steps to reproduce:
- Expected:
- Actual:

**Issue 2:**
- Description:
- Steps to reproduce:
- Expected:
- Actual:

---

## 🎉 Next Steps After Testing

Once all features are validated:

1. **Apply Migration to Production**:
   ```bash
   npx wrangler d1 migrations apply webapp-production
   ```

2. **Deploy to Production**:
   ```bash
   npm run deploy:prod
   ```

3. **Verify Production Deployment**:
   - Test all features on production URL
   - Confirm migration applied successfully
   - Check badge displays correctly in production

4. **Implement Assignment Feature** (if desired):
   - Add "Assign Stock Position" button
   - Create assignment modal
   - Implement close option + create stock logic

---

**Happy Testing! 🚀**
