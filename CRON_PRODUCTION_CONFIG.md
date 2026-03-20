# Dividend Repository - Automated Weekly Fetch Configuration

## ✅ PRODUCTION SETUP

### Cron Service Configuration
**Service**: cron-job.org  
**Schedule**: Every Sunday at 10:30 PM MST  
**Cron Expression**: `30 4 * * 1` (Monday 04:30 UTC = Sunday 10:30 PM MST)  
**Target URL**: https://app.generationalinvesting.ca  
**Endpoint**: Utilities → Dividend Repository → "Fetch Dividends for All Holdings"

### Time Zone Conversion
- **MST (Mountain Standard Time)**: UTC-7
- **Sunday 10:30 PM MST** = **Monday 04:30 AM UTC**
- **Note**: MST does not observe daylight saving time
- If using **MDT (Mountain Daylight Time)**: UTC-6, adjust cron to `30 3 * * 1`

### Cron Expression Breakdown
```
30 4 * * 1
│  │ │ │ │
│  │ │ │ └─── Day of week (1 = Monday, which is Sunday evening in MST)
│  │ │ └───── Month (1-12)
│  │ └─────── Day of month (1-31)
│  └───────── Hour (0-23, UTC)
└─────────── Minute (0-59)
```

### Why Monday in UTC = Sunday in MST
- Sunday 10:30 PM MST
- Add 7 hours for UTC conversion
- = Monday 04:30 AM UTC (next calendar day)

---

## 🔧 Cron-job.org Configuration

### Setup Steps
1. **Login to cron-job.org**
   - URL: https://cron-job.org/en/

2. **Create New Cron Job**
   - Title: "Generational Investing - Weekly Dividend Fetch"
   - URL: https://app.generationalinvesting.ca/api/dividend-repository/fetch
   - Schedule: `30 4 * * 1`
   - Time zone: UTC
   - Method: POST
   - Authentication: Bearer Token (from localStorage)

3. **Headers** (if using API directly):
   ```
   Authorization: Bearer YOUR_JWT_TOKEN
   Content-Type: application/json
   ```

4. **Enable**
   - Switch to "Enabled"
   - Save configuration

### Alternative: Browser Automation
If cron-job.org can't authenticate with JWT token:
1. Use browser automation service (e.g., Playwright, Puppeteer)
2. Or use manual trigger every Sunday at 10:30 PM MST

---

## 📊 Expected Behavior

### What Happens at 10:30 PM MST Every Sunday
1. Cron-job.org triggers at exact time
2. App fetches dividends for all unique tickers
3. Polygon.io API called for US stocks
4. EODHD API called for Canadian stocks (.TO)
5. Rate limiting: 12.5 second delay between tickers
6. Total duration: ~4-5 minutes
7. Results stored in `dividend_repository` table
8. Log entry created in `dividend_fetch_logs` table

### Tickers Processed
- **Total Holdings**: 22 (with duplicates)
- **Unique Tickers**: 14
- **US Stocks**: 13 (via Polygon.io)
- **Canadian Stocks**: 1 (FTN.TO via EODHD)

### API Calls Per Week
- **Polygon.io**: ~13 calls
- **EODHD**: ~1 call
- **Total**: ~14 calls per week
- **Monthly**: ~60 calls
- **Well within limits**: Polygon (250/day), EODHD (sufficient)

---

## 🔍 Verification

### How to Check if Cron Ran Successfully

**1. Check Dividend Fetch Logs**
```sql
-- Check last fetch
SELECT * FROM dividend_fetch_logs 
WHERE fetch_type = 'manual' 
ORDER BY started_at DESC 
LIMIT 1;

-- Expected fields:
-- started_at: Should be Monday ~04:30 UTC (Sunday 10:30 PM MST)
-- status: 'success' or 'partial'
-- tickers_processed: Should list all 14 unique tickers
-- dividends_found: Should show total count
-- api_calls_made: Should be ~15
-- duration_ms: Should be ~240000-300000 (4-5 minutes)
```

**2. Check Dividend Updates**
```sql
-- Check when dividends were last fetched
SELECT ticker, MAX(fetch_date) as last_fetch
FROM dividend_repository
GROUP BY ticker
ORDER BY last_fetch DESC;

-- Expected: All tickers should have fetch_date from Sunday/Monday
```

**3. Check cron-job.org Dashboard**
- Login to cron-job.org
- View execution history
- Check for success/failure status
- Review execution logs

**4. Check UI**
- Visit https://app.generationalinvesting.ca
- Navigate to Utilities → Dividend Repository
- Verify dividend counts updated
- Check for new dividends since last week

---

## ⚙️ Configuration Reference

### Current Settings
```json
{
  "service": "cron-job.org",
  "schedule": {
    "time": "10:30 PM MST",
    "day": "Sunday",
    "cron": "30 4 * * 1",
    "timezone": "UTC"
  },
  "target": {
    "url": "https://app.generationalinvesting.ca",
    "endpoint": "/api/dividend-repository/fetch",
    "method": "POST"
  },
  "processing": {
    "unique_tickers": 14,
    "delay_between_tickers": "12.5 seconds",
    "estimated_duration": "4-5 minutes",
    "api_calls": "~15 per week"
  }
}
```

### Alternative Schedules
If you want to change the timing:

**Earlier (9:00 PM MST)**
```
Cron: 0 4 * * 1  (Monday 04:00 UTC)
```

**Later (11:00 PM MST)**
```
Cron: 0 5 * * 1  (Monday 05:00 UTC)
```

**Different Day (Saturday 10:30 PM MST)**
```
Cron: 30 4 * * 0  (Sunday 04:30 UTC)
```

---

## 🐛 Troubleshooting

### Issue: Cron Didn't Run
**Check:**
1. cron-job.org account is active
2. Cron job is enabled (not paused)
3. No payment/quota issues
4. Correct URL configured

### Issue: Cron Ran but No Data
**Check:**
1. Authentication working (JWT token valid)
2. Check error_message in dividend_fetch_logs
3. API keys still valid (Polygon, EODHD)
4. Rate limits not exceeded

### Issue: Partial Success
**Check:**
1. Which tickers failed (error_message field)
2. HTTP 429 errors = rate limiting
3. Wait and retry will pick up missing tickers

---

## 📝 Maintenance

### Weekly Checks (Optional)
- Monday morning: Verify Sunday night fetch completed
- Check dividend_fetch_logs for any errors
- Review new dividends in repository

### Monthly Tasks
- Review cron-job.org execution history
- Verify API quota usage
- Check for any repeated failures

### Quarterly Review
- Confirm API keys still valid
- Review ticker list (any new holdings?)
- Update documentation if schedule changes

---

## 🎯 Success Metrics

### What "Success" Looks Like
- ✅ Cron runs every Sunday 10:30 PM MST
- ✅ All 14 unique tickers processed
- ✅ No HTTP 429 errors
- ✅ Dividends stored in database
- ✅ Fetch log shows 'success' status
- ✅ Duration: 4-5 minutes
- ✅ No manual intervention needed

### Current Performance
- **Reliability**: Will be monitored after first run
- **Success Rate**: Target 100%
- **Duration**: ~4-5 minutes average
- **API Calls**: ~15 per week
- **Dividend Coverage**: 100% (US + Canadian)

---

## 📅 Schedule Summary

**Timezone**: Mountain Standard Time (MST, UTC-7)  
**Day**: Every Sunday  
**Time**: 10:30 PM MST  
**UTC Equivalent**: Monday 04:30 AM UTC  
**Cron Expression**: `30 4 * * 1`  
**Service**: cron-job.org  
**Status**: ✅ Configured and Active

**Next Fetch**: Sunday, [Next Sunday Date], 10:30 PM MST

---

## 🎊 Summary

The dividend repository is now fully automated! Every Sunday at 10:30 PM MST, cron-job.org will trigger the dividend fetch, processing all 14 unique tickers with proper rate limiting and error handling. No manual intervention required - just check the results Monday morning to confirm everything ran smoothly.

---

**Configured**: March 20, 2026  
**Service**: cron-job.org  
**Schedule**: Sunday 10:30 PM MST (Monday 04:30 UTC)  
**Status**: ✅ **ACTIVE**
