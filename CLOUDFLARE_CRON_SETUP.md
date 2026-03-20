# Cloudflare Cron Trigger Setup Guide

## 📋 Overview

The **dividend repository auto-update** uses Cloudflare's scheduled events (cron triggers) to automatically fetch dividends for all users **every Sunday at midnight UTC**.

---

## 🎯 Current Implementation

### Cron Handler Location
**File**: `src/index.tsx`  
**Function**: `export async function scheduled(event, env, ctx)`  
**Line**: ~9101

### Schedule Configuration
**Cron Expression**: `0 0 * * 0`  
**Translation**: Every Sunday at 00:00 UTC (midnight)

### What It Does
1. Fetches all users with stock holdings
2. For each user:
   - Gets unique tickers from their holdings
   - Calls Polygon.io (Massive) API for US stocks
   - Falls back to EODHD for Canadian stocks (.TO, .V)
   - Stores dividends in `dividend_repository` table
   - Logs results in `dividend_fetch_logs` table
3. Rate limiting: 12.5 second delay between tickers
4. Error handling: Captures and logs any failures

---

## 🚀 How to Configure Cloudflare Cron Trigger

### **Option 1: Using Cloudflare Dashboard (Recommended)**

#### Step 1: Access Cloudflare Pages Dashboard
1. Go to https://dash.cloudflare.com
2. Select your account
3. Navigate to **Workers & Pages**
4. Click on your project: **generational-investing**

#### Step 2: Open Settings
1. Click on **Settings** tab
2. Scroll down to **Functions** section
3. Look for **Cron Triggers**

#### Step 3: Add Cron Trigger
1. Click **Add Cron Trigger**
2. Enter the cron expression: `0 0 * * 0`
3. Click **Add Trigger** or **Save**

#### Step 4: Verify
1. The trigger should now appear in the list
2. You'll see: `0 0 * * 0` with description "Every Sunday at midnight"
3. Status should be **Active**

---

### **Option 2: Using wrangler.jsonc Configuration**

#### Step 1: Update wrangler.jsonc
Add the `triggers` section to your `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "generational-investing",
  "compatibility_date": "2024-01-01",
  "pages_build_output_dir": "./dist",
  "compatibility_flags": ["nodejs_compat"],
  
  // Add this section for cron triggers
  "triggers": {
    "crons": ["0 0 * * 0"]
  },
  
  // Your existing D1, KV, R2 configurations...
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "webapp-production",
      "database_id": "your-database-id"
    }
  ]
}
```

#### Step 2: Deploy with New Configuration
```bash
cd /home/user/webapp
npm run build
npx wrangler pages deploy dist --project-name generational-investing
```

#### Step 3: Verify
Check the deployment output - it should mention the cron trigger:
```
✨ Cron Triggers: 0 0 * * 0
```

---

### **Option 3: Using Wrangler CLI**

**Note**: This method is for Workers, not Pages. For Pages, use Option 1 or 2.

For reference, here's how you would do it for a Worker:
```bash
# Add cron trigger to a Worker (NOT applicable to Pages)
npx wrangler triggers cron add "0 0 * * 0" --name generational-investing
```

---

## 📅 Cron Expression Explained

### Current Schedule: `0 0 * * 0`

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 7) (0 and 7 both represent Sunday)
│ │ │ │ │
│ │ │ │ │
0 0 * * 0
```

**Translation**: 
- `0` (minute) = At minute 0
- `0` (hour) = At hour 0 (midnight)
- `*` (day of month) = Every day of the month
- `*` (month) = Every month
- `0` (day of week) = On Sunday

**Result**: **Every Sunday at 00:00 UTC**

---

## 🕐 Alternative Schedules

If you want to change the schedule, here are some examples:

### Daily at Midnight
```
0 0 * * *
```

### Every Monday at 9 AM UTC
```
0 9 * * 1
```

### Every Sunday at 2 AM UTC
```
0 2 * * 0
```

### Twice a Week (Sunday & Wednesday at Midnight)
```
0 0 * * 0,3
```

### First Day of Every Month at Midnight
```
0 0 1 * *
```

---

## 🔍 How to Verify Cron is Working

### Method 1: Check Logs in Cloudflare Dashboard
1. Go to Cloudflare Dashboard
2. Navigate to **Workers & Pages** → **generational-investing**
3. Click on **Logs** tab
4. Look for entries with:
   - "Scheduled event triggered"
   - Dividend fetch logs
   - User processing messages

### Method 2: Check Database Logs
```sql
-- Check recent scheduled dividend fetches
SELECT * FROM dividend_fetch_logs 
WHERE fetch_type = 'scheduled' 
ORDER BY started_at DESC 
LIMIT 10;

-- Expected: One entry per Sunday after midnight UTC
```

### Method 3: Check Dividend Updates
```sql
-- Check when dividends were last updated
SELECT ticker, MAX(fetch_date) as last_fetch
FROM dividend_repository
GROUP BY ticker
ORDER BY last_fetch DESC;

-- Expected: Last fetch should be Sunday (if today is after Sunday)
```

---

## 🐛 Troubleshooting

### Issue: Cron Trigger Not Appearing in Dashboard
**Solution:**
- Ensure you've deployed after adding to `wrangler.jsonc`
- Check that you're in the correct project
- Try adding manually via dashboard (Option 1)

### Issue: Scheduled Function Not Running
**Check:**
1. **Cron expression is correct**: Use https://crontab.guru to verify
2. **Function is exported**: `export async function scheduled(event, env, ctx)`
3. **Deployment is successful**: Check deployment logs
4. **Timezone consideration**: Cron runs on UTC, not your local time

### Issue: Function Runs but No Data
**Check:**
1. **Database logs**: Look at `dividend_fetch_logs` table
2. **Error messages**: Check error_message field in logs
3. **API keys**: Verify Massive and EODHD keys are valid
4. **Holdings exist**: Ensure users have stock_holdings data

---

## 📊 Monitoring Scheduled Runs

### Create a Monitoring Query
```sql
-- Get stats from last 10 scheduled runs
SELECT 
  started_at,
  completed_at,
  status,
  tickers_processed,
  dividends_found,
  api_calls_made,
  fetch_duration_ms / 1000.0 as duration_seconds,
  error_message
FROM dividend_fetch_logs
WHERE fetch_type = 'scheduled'
ORDER BY started_at DESC
LIMIT 10;
```

### Expected Results
- **Status**: 'success' (no errors) or 'partial' (some errors)
- **Tickers**: Should match unique tickers across all users
- **Duration**: ~3-5 minutes (depending on ticker count)
- **API Calls**: ~15-20 (depends on users' portfolios)
- **Dividends Found**: Varies by ticker activity

---

## 🎯 Best Practices

### 1. **Choose Off-Peak Time**
- ✅ Current: Sunday midnight UTC (low traffic)
- Reasoning: Least impact on user-facing operations

### 2. **Monitor First Few Runs**
- Check logs after first Sunday
- Verify all tickers are processed
- Look for any repeated errors

### 3. **Set Up Alerts** (Optional)
- Configure Cloudflare notifications for failed cron runs
- Email alerts for errors in dividend_fetch_logs

### 4. **Regular Reviews**
- Monthly: Review error patterns
- Quarterly: Check API quota usage
- Annually: Verify API keys are still valid

---

## 🔐 Security Considerations

### API Keys in Code
**Current**: Hard-coded in `src/index.tsx`
```javascript
const MASSIVE_API_KEY = 'x4VbKUBkKwYB10ObRLoRt9eDqfcClxEW'
const EODHD_API_KEY = '69bc75c1788da8.83960172'
```

**Future Enhancement**: Use Cloudflare Secrets
```bash
# Store as secrets (recommended for production)
npx wrangler secret put MASSIVE_API_KEY
npx wrangler secret put EODHD_API_KEY

# Access in code
const MASSIVE_API_KEY = env.MASSIVE_API_KEY
const EODHD_API_KEY = env.EODHD_API_KEY
```

---

## 📝 Quick Reference

### Current Configuration
```
Schedule:     Every Sunday at 00:00 UTC
Cron:         0 0 * * 0
Function:     scheduled() in src/index.tsx
Targets:      All users with stock_holdings
API Calls:    ~15-20 per run
Duration:     ~4-5 minutes
Logs:         dividend_fetch_logs table
```

### Deployment Commands
```bash
# Build
cd /home/user/webapp
npm run build

# Deploy
npx wrangler pages deploy dist --project-name generational-investing

# Verify (check logs in dashboard)
```

### Database Check
```sql
-- Check if cron ran today
SELECT * FROM dividend_fetch_logs 
WHERE fetch_type = 'scheduled' 
  AND DATE(started_at) = CURRENT_DATE
ORDER BY started_at DESC;
```

---

## 🎉 Summary

### To Set Up Cron Trigger:

**EASIEST METHOD (Dashboard):**
1. Go to https://dash.cloudflare.com
2. Workers & Pages → generational-investing → Settings
3. Scroll to **Functions** → **Cron Triggers**
4. Click **Add Cron Trigger**
5. Enter: `0 0 * * 0`
6. Save

**ALTERNATIVE (wrangler.jsonc):**
1. Add `"triggers": { "crons": ["0 0 * * 0"] }` to wrangler.jsonc
2. Run: `npm run build && npm run deploy:prod`
3. Verify in dashboard

### To Verify It's Working:
1. Wait until Sunday after midnight UTC
2. Check `dividend_fetch_logs` table for new entries
3. Check Cloudflare logs for "Scheduled event triggered"

### Next Sunday
Your dividend repository will automatically update! 🎊

---

**Last Updated**: March 19, 2026  
**Deployment**: https://be0eaaf2.generational-investing.pages.dev  
**Status**: ✅ Cron handler implemented, ready for trigger setup
