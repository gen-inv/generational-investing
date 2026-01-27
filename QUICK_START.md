# Quick Start Guide - Generational Investing v1.1

## 🎯 Your Mission
Implement 6 phases of new features using the complete specification document.

---

## 📚 Documentation Structure

### Start Here: IMPLEMENTATION_SUMMARY.md
- **Purpose**: Quick roadmap and overview
- **Read time**: 5 minutes
- **Contains**: Phase summaries, session plan, testing checklist

### Main Reference: COMPLETE_IMPLEMENTATION_SPEC.md  
- **Purpose**: Line-by-line implementation instructions
- **Read time**: 30 minutes (reference as you code)
- **Contains**: Exact code for all 6 phases, database schemas, API endpoints

### Supporting Docs:
- **README.md**: Project overview and current status
- **DEPLOYMENT_OPTIONS.md**: Cloudflare vs FastComet comparison
- **FASTCOMET_DEPLOYMENT_GUIDE.md**: MySQL migration instructions

---

## 🚀 Implementation Workflow

### Before You Start
1. ✅ Read `IMPLEMENTATION_SUMMARY.md` (5 min)
2. ✅ Verify database migration applied:
   ```bash
   cd /home/user/webapp
   npx wrangler d1 execute webapp-production --local --command="PRAGMA table_info(accounts)"
   ```
   Should show: id, user_id, account_name, account_type, balance_cad, balance_usd, cash_balance_usd, etc.

### Session Pattern (Repeat for each phase)

**Step 1: Open Spec** (2 min)
```bash
# Open COMPLETE_IMPLEMENTATION_SPEC.md
# Navigate to your current phase section
```

**Step 2: Backend Changes** (30-60 min)
```bash
# Open src/index.tsx in your editor
# Copy exact code from spec into appropriate location
# Follow location hints in spec (e.g., "around line 300")
```

**Step 3: Frontend Changes** (30-60 min)
```bash
# Open public/static/app.js in your editor
# Copy exact code from spec into appropriate location
# Follow location hints in spec (e.g., "around line 400")
```

**Step 4: Test** (15-30 min)
```bash
# Rebuild
cd /home/user/webapp
npm run build

# Restart
pm2 restart webapp

# Test
curl http://localhost:3000
# Then test in browser using GetServiceUrl

# Run phase-specific tests from COMPLETE_IMPLEMENTATION_SPEC.md
```

**Step 5: Commit** (2 min)
```bash
cd /home/user/webapp
git add .
git commit -m "Implement Phase X: [Description]"
git log --oneline  # Verify commit
```

---

## 📋 5-Session Plan

### Session 1: Foundation (2-3 hours)
**Goal**: Individual accounts instead of account types

**Spec Section**: Phase 1 (starts line ~30)

**Backend** (`src/index.tsx`):
- Add 5 account endpoints (GET, POST, PUT, DELETE)
- Update dashboard endpoint to use accounts table

**Frontend** (`public/static/app.js`):
- Add Accounts navigation button
- Add showAccounts() function
- Add account CRUD forms
- Update trade forms to use account dropdown
- Add loadAccountsList() helper

**Test**:
- [ ] Create account of each type
- [ ] Edit balances
- [ ] Delete account (fails if has trades)
- [ ] Trade forms show account dropdown

**Commit**: `"Implement Phase 1: Individual account management"`

---

### Session 2: Option Trades (2-3 hours)
**Goal**: Strategy-specific fields with proper terminology

**Spec Section**: Phase 2 (starts line ~900)

**Backend** (`src/index.tsx`):
- Update POST /api/option-trades with validation
- Add validateOptionStrategy() helper function
- Update GET /api/option-trades to include new fields

**Frontend** (`public/static/app.js`):
- Update showAddOptionTradeForm() with dynamic fields
- Add updateStrategyFields() to show/hide fields
- Update saveOptionTrade() to capture new fields
- Update showOptionTrades() to display strikes correctly

**Test**:
- [ ] Each strategy shows correct fields
- [ ] Field validation works
- [ ] Strikes display correctly in list

**Commit**: `"Implement Phase 2: Strategy-specific option trades fields"`

---

### Session 3: Covered Calls (1-2 hours)
**Goal**: Move covered calls to stock details page

**Spec Section**: Phase 3 (starts line ~1500)

**Backend** (`src/index.tsx`):
- Add GET /api/stock-trades/:id/position endpoint
- Add POST /api/stock-trades/:id/covered-call endpoint

**Frontend** (`public/static/app.js`):
- Add showStockDetails() function
- Add showAddCoveredCallForm() function
- Add saveCoveredCall() function
- Add "Details" button to stock trades list
- Remove 'covered_call' from main options dropdown

**Test**:
- [ ] Stock details page loads
- [ ] Can sell covered call (quantity validated)
- [ ] Premium collected shown
- [ ] Cost basis updated

**Commit**: `"Implement Phase 3: Move covered calls to stock details"`

---

### Session 4: Data Features (2-3 hours)
**Goal**: Auto-fetch earnings + enhanced reports

**Spec Section**: Phase 4 & 5 (starts line ~2100)

**Phase 4 - Earnings Fetch:**

**Backend** (`src/index.tsx`):
- Add POST /api/companies/:id/fetch-earnings endpoint
- Add environment variable support to wrangler.jsonc

**Frontend** (`public/static/app.js`):
- Add fetch button to companies table
- Add fetchEarningsDate() function
- Add showInfo() toast helper

**Setup**:
```bash
# Get free API key from https://www.alphavantage.co/support/#api-key
# Add to .dev.vars:
echo "ALPHA_VANTAGE_API_KEY=your_key_here" > .dev.vars
```

**Test**:
- [ ] Fetch button appears
- [ ] Successfully fetches for AAPL
- [ ] Shows error for invalid ticker
- [ ] Rate limit enforced

**Phase 5 - Enhanced Reports:**

**Backend** (`src/index.tsx`):
- Add GET /api/reports/pl-summary endpoint
- Add GET /api/reports/pl-export endpoint

**Frontend** (`public/static/app.js`):
- Replace showReports() entirely with new version
- Add changeReportYear() function
- Add exportPLReport() function
- Add formatStrategyName() helper

**Test**:
- [ ] YTD summary shows correct totals
- [ ] P/L by strategy works
- [ ] Year selector changes data
- [ ] CSV export downloads

**Commit**: `"Implement Phase 4 & 5: Earnings auto-fetch and enhanced P/L reports"`

---

### Session 5: Polish & Deploy (2 hours)
**Goal**: Add chart and deploy to production

**Spec Section**: Phase 6 (starts line ~3200)

**Backend** (`src/index.tsx`):
- Add Chart.js CDN to HTML head section

**Frontend** (`public/static/app.js`):
- Add chart section to showDashboard()
- Add loadPortfolioChart() function
- Add renderPortfolioChart() function
- Add chartPeriod and portfolioChart properties

**Test**:
- [ ] Chart renders on dashboard
- [ ] 1Y / All Time buttons work
- [ ] Tooltips show correct values

**Production Deployment**:
```bash
# 1. Setup Cloudflare (if not done)
# Call setup_cloudflare_api_key tool first

# 2. Verify meta_info has project name
# Read cloudflare_project_name from meta_info

# 3. Build and deploy
cd /home/user/webapp
npm run build
npx wrangler pages deploy dist --project-name <cloudflare_project_name>

# 4. Set Alpha Vantage key (if using earnings fetch)
npx wrangler pages secret put ALPHA_VANTAGE_API_KEY --project-name <cloudflare_project_name>
```

**Commit**: `"Implement Phase 6: Portfolio history chart and deploy v1.1"`

---

## 🧪 Full System Test (After All Phases)

### Workflow Test
1. **Register** new user → Login
2. **Create accounts**: "RRSP - Questrade", "TFSA - TD", "Cash - IB"
3. **Add companies**: AAPL, MSFT, GOOGL
4. **Fetch earnings** for each company
5. **Buy stock**: AAPL 100 shares in RRSP account
6. **View stock details** → Sell covered call
7. **Add option trades**:
   - Selling Put (shows short_strike)
   - Credit Spread (shows short_strike + spread_width)
   - Iron Condor (shows all fields)
8. **Close some trades** → View Reports
9. **Check reports**:
   - YTD summary populated
   - P/L by strategy shows data
   - P/L by month shows data
   - Export CSV works
10. **View dashboard** → Chart displays

---

## 🐛 Troubleshooting

### Build Errors
```bash
cd /home/user/webapp
rm -rf dist/ .wrangler/
npm run build
```

### Port Issues
```bash
npm run clean-port
pm2 delete webapp
pm2 start ecosystem.config.cjs
```

### Database Issues
```bash
npm run db:reset  # Resets local database
```

### PM2 Issues
```bash
pm2 logs webapp --nostream  # Check errors
pm2 restart webapp          # After fixing
```

### Frontend Errors
- Open browser console (F12)
- Check Network tab for failed API calls
- Verify token in LocalStorage

---

## 📊 Progress Tracking

### Completed Phases
- [x] Database migration applied
- [ ] Phase 1: Account Management
- [ ] Phase 2: Option Trades Refactor
- [ ] Phase 3: Covered Calls
- [ ] Phase 4: Earnings Auto-Fetch
- [ ] Phase 5: Enhanced P/L Reports
- [ ] Phase 6: Portfolio Chart
- [ ] Production Deployment

### Time Estimate
- ✅ Spec Creation: 2 hours (DONE)
- ⏳ Implementation: 13-18 hours (5 sessions)
- ⏳ Testing: 2 hours
- ⏳ Deployment: 1 hour

**Total: 18-23 hours**

---

## 💡 Pro Tips

### Copy-Paste Workflow
1. Open spec in one window
2. Open code file in another window
3. Find the section in spec
4. Copy exact code block
5. Paste at indicated location
6. No modifications needed - code is production-ready

### Location Hints
Spec uses hints like "around line 300" to help you find insertion points. Use:
```bash
# Count lines in file
wc -l src/index.tsx
wc -l public/static/app.js
```

### Testing Strategy
- Test each endpoint with curl before frontend
- Test frontend in browser after backend works
- Commit after each working phase
- Don't skip testing - prevents debugging later

### Git Best Practices
```bash
# Check status before committing
git status

# Review changes
git diff

# Commit with descriptive message
git commit -m "Implement Phase X: [What it does]"

# View commit history
git log --oneline -5
```

---

## 🎓 Learning Resources

### If You Get Stuck
1. **Browser console** - Check for JavaScript errors
2. **PM2 logs** - Check for backend errors: `pm2 logs webapp --nostream`
3. **Curl test** - Test API directly: `curl -X GET http://localhost:3000/api/accounts -H "Authorization: Bearer TOKEN"`
4. **Database check** - Verify data: `npx wrangler d1 execute webapp-production --local --command="SELECT * FROM accounts"`

### API Testing Example
```bash
# Get token (copy from browser localStorage or login response)
TOKEN="your_jwt_token_here"

# Test accounts endpoint
curl -X GET http://localhost:3000/api/accounts \
  -H "Authorization: Bearer $TOKEN" \
  | json_pp

# Test create account
curl -X POST http://localhost:3000/api/accounts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_name":"RRSP - Test","account_type":"RRSP"}' \
  | json_pp
```

---

## 🏁 Success Criteria

### You're Done When:
- ✅ All 6 phases implemented
- ✅ All test checklists passed
- ✅ No console errors
- ✅ All features work in browser
- ✅ Git commits for each phase
- ✅ Deployed to Cloudflare Pages
- ✅ Production site accessible

---

## 🎉 After Completion

### Next Steps:
1. **Celebrate!** You built a professional portfolio management system
2. **Share** the production URL
3. **Backup** project: Use ProjectBackup tool
4. **Document** any customizations you made
5. **Plan** future enhancements from README

### Optional Enhancements:
- Add more companies to your roster
- Customize color scheme
- Add more option strategies
- Integrate other APIs (FMP, Yahoo Finance)
- Add email notifications
- Build mobile app

---

**Ready? Start with Session 1!**

Open `COMPLETE_IMPLEMENTATION_SPEC.md` → Navigate to "Phase 1: Account Management System" → Follow the instructions!

Good luck! 🚀
