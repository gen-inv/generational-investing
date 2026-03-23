# Automated Dividend Fetch - Cron Endpoint Setup Guide

## Problem Identified

The original dividend fetch endpoint (`/api/dividend-repository/fetch`) required JWT authentication, which external cron services like cron-job.org cannot maintain. This prevented automated weekly fetches from running.

**Symptoms:**
- ❌ No entries in dividend_fetch_logs with `fetch_type = 'automated'`
- ❌ Dividends only updated via manual clicks in UI
- ❌ Cron-job.org configuration existed but wasn't functional

## Solution

Created a new cron-specific endpoint that uses secret key authentication instead of JWT tokens.

---

## New Endpoint

### URL
```
POST https://app.generationalinvesting.ca/api/cron/dividend-repository/fetch
```

### Authentication Methods

**Option 1: Request Body (Recommended for cron-job.org)**
```json
{
  "secret": "dividend-fetch-cron-2026-secret-key",
  "user_id": 1
}
```

**Option 2: HTTP Header**
```
X-Cron-Secret: dividend-fetch-cron-2026-secret-key
```

### Request Format
```http
POST /api/cron/dividend-repository/fetch HTTP/1.1
Host: app.generationalinvesting.ca
Content-Type: application/json

{
  "secret": "dividend-fetch-cron-2026-secret-key",
  "user_id": 1
}
```

### Response Format

**Success:**
```json
{
  "success": true,
  "message": "Automated fetch completed for 14 tickers",
  "dividends_found": 42,
  "dividends_eligible": 38,
  "api_calls_made": 15,
  "duration_ms": 245678,
  "tickers": ["JEPI", "JEPQ", "NVDY", "FTN.TO", ...],
  "errors": null
}
```

**Unauthorized:**
```json
{
  "error": "Unauthorized"
}
```

**No Holdings:**
```json
{
  "message": "No holdings found",
  "dividends_found": 0,
  "dividends_eligible": 0
}
```

---

## Cron-job.org Configuration

### Step-by-Step Setup

1. **Login to cron-job.org**
   - URL: https://cron-job.org/en/
   - Create account if needed

2. **Create New Cron Job**
   - Click "Create cronjob"
   - Title: `Generational Investing - Weekly Dividend Fetch`

3. **Configure URL**
   - URL: `https://app.generationalinvesting.ca/api/cron/dividend-repository/fetch`
   - Method: `POST`

4. **Set Schedule**
   - Schedule: `30 4 * * 1`
   - Time zone: `UTC`
   - This equals Sunday 10:30 PM MST (Monday 04:30 AM UTC)

5. **Configure Request**
   - Content-Type: `application/json`
   - Request Body:
   ```json
   {
     "secret": "dividend-fetch-cron-2026-secret-key",
     "user_id": 1
   }
   ```

6. **Enable & Save**
   - Switch toggle to "Enabled"
   - Click "Save"

### Cron Expression Breakdown

```
30 4 * * 1
│  │ │ │ │
│  │ │ │ └─── Day of week (1 = Monday in UTC, which is Sunday evening in MST)
│  │ │ └───── Month (1-12, * = every month)
│  │ └─────── Day of month (1-31, * = every day)
│  └───────── Hour (0-23, 4 = 04:00 UTC)
└─────────── Minute (0-59, 30 = :30)
```

**Time Zone Math:**
- Sunday 10:30 PM MST
- MST = UTC-7 (Mountain Standard Time, no daylight saving)
- 10:30 PM + 7 hours = 05:30 AM next day (Monday) UTC
- Wait, that should be `30 5 * * 1` not `30 4 * * 1`

**Correction:**
```
Cron: 30 5 * * 1
```

---

## Security Configuration

### Secret Key Options

**1. Default Secret (Current)**
```typescript
const CRON_SECRET = 'dividend-fetch-cron-2026-secret-key'
```

**2. Environment Variable (Recommended for Production)**

Set via Cloudflare Pages dashboard:
1. Go to Settings → Environment Variables
2. Add new variable:
   - Name: `CRON_SECRET`
   - Value: `your-secure-random-secret-key-here`
   - Environment: Production

Then the endpoint uses:
```typescript
const CRON_SECRET = c.env.CRON_SECRET || 'dividend-fetch-cron-2026-secret-key'
```

**3. Generate Secure Secret**
```bash
# Generate a strong random secret
openssl rand -base64 32
# Example output: J7K8L9M0N1O2P3Q4R5S6T7U8V9W0X1Y2Z3A4B5C6D7E8F9=
```

---

## What Happens During Fetch

### Process Flow

1. **Authentication**
   - Validates secret key
   - Returns 401 if invalid

2. **User Holdings Retrieval**
   - Queries all stock holdings for specified user_id
   - Gets unique tickers

3. **API Calls**
   - US Stocks → Polygon.io (Massive)
   - Canadian Stocks (.TO, .V) → EODHD
   - 12.5 second delay between tickers (rate limiting)

4. **Dividend Storage**
   - Stores/updates dividends in `dividend_repository` table
   - Filters to only dividends from 2026-01-01 onwards

5. **Logging**
   - Creates entry in `dividend_fetch_logs`
   - `fetch_type = 'automated'` (distinguishes from manual)
   - Records tickers processed, API calls, duration, errors

### Expected Duration
- **14 unique tickers** × **12.5 seconds** = **~175 seconds base**
- **API response time** = **~30-60 seconds total**
- **Database operations** = **~10-20 seconds**
- **Total**: **~4-5 minutes**

### API Quota Usage

**Per Week (1 fetch):**
- Polygon.io: ~13 calls
- EODHD: ~1 call
- Total: ~14-15 calls

**Per Month (4 fetches):**
- Polygon.io: ~52 calls
- EODHD: ~4 calls
- Total: ~56-60 calls

**Well within limits:**
- Polygon.io: 250 calls/day (free tier)
- EODHD: Sufficient quota

---

## Verification & Monitoring

### 1. Check Fetch Logs (Database)

**Via UI:**
1. Login to https://app.generationalinvesting.ca
2. Navigate to Utilities → Dividend Repository
3. Scroll to "Dividend Fetch History" section
4. Look for entries with:
   - Fetch Type: "automated"
   - Status: "success" or "partial"
   - Timestamp: Monday ~04:30-05:00 UTC

**Via SQL (Cloudflare D1):**
```sql
-- Check last automated fetch
SELECT 
  started_at,
  completed_at,
  status,
  tickers_processed,
  dividends_found,
  api_calls_made,
  duration_ms,
  error_message
FROM dividend_fetch_logs 
WHERE fetch_type = 'automated'
ORDER BY started_at DESC 
LIMIT 1;

-- Expected output:
-- started_at: Monday 04:30-05:00 UTC (Sunday 10:30 PM MST)
-- status: 'success' or 'partial'
-- tickers_processed: 'JEPI, JEPQ, NVDY, ...' (14 tickers)
-- dividends_found: Varies (typically 30-50 total)
-- api_calls_made: ~15
-- duration_ms: ~240000-300000 (4-5 minutes)
```

### 2. Check Dividend Updates

```sql
-- Check when dividends were last fetched
SELECT 
  ticker,
  COUNT(*) as dividend_count,
  MAX(fetch_date) as last_fetch,
  MAX(updated_at) as last_update
FROM dividend_repository
GROUP BY ticker
ORDER BY last_fetch DESC;

-- All tickers should have recent fetch_date
```

### 3. Check cron-job.org Dashboard

1. Login to cron-job.org
2. View "History" tab
3. Check recent executions:
   - **Status**: Should show ✓ Success (HTTP 200)
   - **Response time**: ~4-5 minutes
   - **Last execution**: Monday ~04:30-05:00 UTC

### 4. Manual Test

Test the endpoint directly:

```bash
curl -X POST https://app.generationalinvesting.ca/api/cron/dividend-repository/fetch \
  -H "Content-Type: application/json" \
  -d '{"secret": "dividend-fetch-cron-2026-secret-key", "user_id": 1}'
```

Expected response:
```json
{
  "success": true,
  "message": "Automated fetch completed for 14 tickers",
  "dividends_found": 42,
  ...
}
```

---

## Troubleshooting

### Issue: No Fetch Logs Appearing

**Check:**
1. Is cron-job.org job enabled?
2. Is the schedule correct? (`30 5 * * 1` for Sunday 10:30 PM MST)
3. Check cron-job.org execution history for errors
4. Test endpoint manually (see above)

**Solution:**
- Verify cron-job.org account is active
- Check that URL is correct
- Ensure request body is valid JSON

### Issue: 401 Unauthorized

**Check:**
1. Secret key matches in cron-job.org and code
2. Request body is valid JSON
3. Content-Type header is `application/json`

**Solution:**
```json
// Ensure this matches exactly:
{
  "secret": "dividend-fetch-cron-2026-secret-key",
  "user_id": 1
}
```

### Issue: Partial Success

**Check:**
1. error_message field in dividend_fetch_logs
2. Which tickers failed
3. API rate limits

**Common Causes:**
- HTTP 429 (rate limited) → Wait and retry
- API key expired → Update keys in code
- Network timeout → Increase timeout in cron-job.org

**Solution:**
- Most partial successes will resolve on next weekly fetch
- Failed tickers will be retried automatically

### Issue: No Dividends Found

**Check:**
1. Are there actually new dividends this week?
2. Check user_id is correct (should be 1 for main account)
3. Verify holdings exist in database

**Solution:**
- This is normal if no new dividends were declared this week
- Fetch will still run and log success with 0 new dividends

---

## Fetch Type Distinction

The system now distinguishes between manual and automated fetches:

| Fetch Type | Triggered By | fetch_type Value | Use Case |
|------------|--------------|------------------|----------|
| **Manual** | UI button click | `'manual'` | User-initiated test or on-demand fetch |
| **Automated** | Cron job | `'automated'` | Weekly scheduled fetch |

**Benefits:**
- Easy to identify automated vs manual fetches in logs
- Can track automation reliability separately
- Helps debug cron issues vs manual fetch issues

---

## Schedule Summary

**Current Configuration:**
- **Day**: Every Sunday
- **Time**: 10:30 PM MST (Mountain Standard Time, UTC-7)
- **UTC Equivalent**: Monday 05:30 AM UTC
- **Cron Expression**: `30 5 * * 1`
- **Service**: cron-job.org
- **Endpoint**: POST /api/cron/dividend-repository/fetch
- **Authentication**: Secret key in request body

**Next Scheduled Fetch:**
- Sunday, March 23, 2026 at 10:30 PM MST
- (Monday, March 24, 2026 at 05:30 AM UTC)

---

## Deployment Checklist

- ✅ New endpoint deployed to production
- ✅ Secret key authentication implemented
- ✅ Fetch logic mirrors manual endpoint
- ✅ Logging with 'automated' fetch type
- ⬜ Configure cron-job.org with new endpoint
- ⬜ Set correct schedule (30 5 * * 1)
- ⬜ Add request body with secret and user_id
- ⬜ Enable cron job
- ⬜ Wait for first automated fetch (Sunday 10:30 PM MST)
- ⬜ Verify logs on Monday morning

---

## Production URLs

- **Endpoint**: https://app.generationalinvesting.ca/api/cron/dividend-repository/fetch
- **Deployment**: https://9fed47de.generational-investing.pages.dev
- **Main Site**: https://app.generationalinvesting.ca
- **Status**: ✅ Deployed (commit 56880a1)

---

## Summary

The dividend repository now supports fully automated weekly fetches via an external cron service. The new endpoint uses simple secret key authentication, eliminating JWT token expiration issues. Configure cron-job.org with the endpoint URL, schedule, and secret key, then dividends will automatically update every Sunday night without manual intervention.

**Key Points:**
- ✅ No JWT token management needed
- ✅ Simple secret key authentication
- ✅ Same reliability as manual fetches
- ✅ Proper audit trail (fetch_type = 'automated')
- ✅ Ready for production use

**Next Step:**
Configure cron-job.org with the provided settings and test on Sunday, March 23, 2026 at 10:30 PM MST.
