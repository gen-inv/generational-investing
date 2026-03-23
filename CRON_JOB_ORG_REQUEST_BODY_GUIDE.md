# How to Add Request Body in cron-job.org - Step-by-Step Guide

## Overview

Cron-job.org supports POST requests with custom request bodies. Here's how to configure it for the dividend fetch endpoint.

---

## Step-by-Step Instructions

### 1. Login to cron-job.org

Visit: https://cron-job.org/en/members/
- Login with your account credentials
- If you don't have an account, create one (it's free)

### 2. Create or Edit Cron Job

**Option A: Create New Cron Job**
- Click "Cronjobs" in the left sidebar
- Click "Create cronjob" button (usually at the top right)

**Option B: Edit Existing Cron Job**
- Find your existing "Dividend Fetch" job in the list
- Click the "Edit" icon (pencil icon)

### 3. Configure Basic Settings

In the cron job form, fill in:

**Title:**
```
Generational Investing - Weekly Dividend Fetch
```

**URL:**
```
https://app.generationalinvesting.ca/api/cron/dividend-repository/fetch
```

**Enabled:**
- ✅ Check the "Enabled" checkbox

### 4. Set Schedule

**Schedule Settings:**
- Click "Advanced" or "Expert" mode (depending on interface version)
- Enter cron expression: `30 5 * * 1`
- Or use the visual scheduler:
  - Minutes: `30`
  - Hours: `5`
  - Days of month: `*` (every day)
  - Months: `*` (every month)
  - Days of week: `1` (Monday in UTC = Sunday evening MST)

**Timezone:** UTC (this is important!)

### 5. Configure Request Method

Look for the "Request method" or "HTTP method" dropdown:
- Select: **POST**

### 6. Add Request Body

Once you select POST, a new field should appear labeled:
- "Request body" or
- "Body" or
- "POST data" or
- "Payload"

**In this field, enter:**
```json
{"secret": "dividend-fetch-cron-2026-secret-key", "user_id": 1}
```

**Important Notes:**
- ✅ Enter as a single line (no line breaks)
- ✅ Use double quotes (not single quotes)
- ✅ Make sure it's valid JSON
- ✅ Don't add extra spaces

### 7. Add Content-Type Header

Look for the "Headers" or "Custom headers" section:
- Click "Add header" or similar button
- Header name: `Content-Type`
- Header value: `application/json`

**This tells the server you're sending JSON data.**

### 8. Optional: Add User-Agent (Recommended)

Add another header:
- Header name: `User-Agent`
- Header value: `cron-job.org/dividend-fetch`

This helps identify the requests in server logs.

### 9. Configure Notifications (Optional)

Scroll down to find notification settings:
- Enable "Email on failure" to get notified if fetch fails
- Email: your-email@example.com

### 10. Save Configuration

- Click "Save" or "Create cronjob" button at the bottom
- Confirm any dialogs that appear

---

## Visual Example of What to Enter

```
┌─────────────────────────────────────────────────────────────┐
│ Title: Generational Investing - Weekly Dividend Fetch      │
│                                                             │
│ URL: https://app.generationalinvesting.ca/api/cron/...     │
│                                                             │
│ Enabled: [✓]                                                │
│                                                             │
│ Schedule: 30 5 * * 1         Timezone: UTC                 │
│                                                             │
│ Request method: [POST ▼]                                    │
│                                                             │
│ Request body:                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ {"secret": "dividend-fetch-cron-2026-secret-key", "... │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Custom headers:                                             │
│ ┌──────────────┬────────────────────────────────────────┐  │
│ │ Name         │ Value                                  │  │
│ ├──────────────┼────────────────────────────────────────┤  │
│ │ Content-Type │ application/json                       │  │
│ └──────────────┴────────────────────────────────────────┘  │
│                                                             │
│ [Save]                                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Alternative: Using Advanced Settings

If you don't see a "Request body" field immediately:

1. **Look for "Advanced settings" or "Show advanced options"**
   - Click to expand additional fields

2. **Or look for tabs/sections:**
   - "Request" tab
   - "Advanced" tab
   - "Body" section

3. **The request body field might be:**
   - A text area (large input box)
   - Labeled as "Body", "Payload", "POST data", or "Request body"

---

## Verification Steps

### After Saving:

1. **Check Job List**
   - Your job should appear in the cronjobs list
   - Status should show "Enabled" or a green checkmark
   - Next execution should show a date/time

2. **Test Immediately (Optional)**
   - Look for "Execute now" or "Test" button
   - Click to trigger immediate execution
   - Check execution history for results

3. **View Execution History**
   - Click on the job name or "History" button
   - Should show execution log with:
     - Date/time executed
     - HTTP status code (should be 200 OK)
     - Response body preview

### Expected Response:

When execution is successful, you should see:
```json
{
  "success": true,
  "message": "Automated fetch completed for 14 tickers",
  "dividends_found": 42,
  ...
}
```

Status code: **200 OK**

---

## Common Issues & Solutions

### Issue 1: No "Request body" field visible

**Solution:**
- Make sure "POST" is selected as the request method
- Look for "Advanced settings" or "Show advanced" toggle
- Check if there's a "Body" or "Payload" tab

### Issue 2: 400 Bad Request error

**Possible causes:**
- Request body is not valid JSON
- Missing or incorrect Content-Type header

**Solution:**
- Verify JSON syntax (use a JSON validator online)
- Ensure Content-Type is `application/json`
- Check for extra spaces or line breaks

### Issue 3: 401 Unauthorized error

**Possible causes:**
- Secret key doesn't match
- Typo in secret key

**Solution:**
- Copy and paste the exact secret from documentation:
  ```
  dividend-fetch-cron-2026-secret-key
  ```
- Ensure there are no extra spaces before/after

### Issue 4: 500 Internal Server Error

**Possible causes:**
- Server-side error
- user_id doesn't exist

**Solution:**
- Check server logs (if you have access)
- Verify user_id is 1
- Try manual test using curl first

---

## Testing Before Saving

Before you save and enable the cron job, test it manually:

```bash
curl -X POST https://app.generationalinvesting.ca/api/cron/dividend-repository/fetch \
  -H "Content-Type: application/json" \
  -d '{"secret": "dividend-fetch-cron-2026-secret-key", "user_id": 1}'
```

Expected output:
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

If this works, your cron-job.org configuration will work too!

---

## Alternative Interfaces (Older/Newer Versions)

Depending on when you access cron-job.org, the interface might look different:

### Classic Interface:
- Request body field appears directly after selecting POST method
- Usually a plain textarea

### Modern Interface:
- Request body might be in an "Advanced" section
- Might use a code editor with syntax highlighting
- Could have a "Raw" vs "Form" toggle

### Mobile Interface:
- Simplified layout
- Request body field should still be available
- Might need to scroll down to find it

**In all cases:** Once you select POST as the method, a field for the request body should become available.

---

## Screenshot Guide (Text-based)

```
Step 1: After selecting POST method
┌─────────────────────────────────────────┐
│ Request method: [POST ▼]                │
│                                         │
│ ↓ New field appears below ↓             │
│                                         │
│ Request body:                           │
│ ┌─────────────────────────────────────┐ │
│ │ Enter JSON here                     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘

Step 2: Enter your JSON
┌─────────────────────────────────────────┐
│ Request body:                           │
│ ┌─────────────────────────────────────┐ │
│ │ {"secret": "dividend-fetch-cron-... │ │
│ │  2026-secret-key", "user_id": 1}   │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## Quick Reference Card

**Copy this exact configuration:**

| Field | Value |
|-------|-------|
| **Title** | Generational Investing - Weekly Dividend Fetch |
| **URL** | https://app.generationalinvesting.ca/api/cron/dividend-repository/fetch |
| **Method** | POST |
| **Schedule** | 30 5 * * 1 |
| **Timezone** | UTC |
| **Request Body** | {"secret": "dividend-fetch-cron-2026-secret-key", "user_id": 1} |
| **Header 1** | Content-Type: application/json |
| **Enabled** | ✓ Yes |

---

## Summary

Adding a request body in cron-job.org is straightforward:
1. ✅ Select POST as the method
2. ✅ Find the "Request body" field (appears after selecting POST)
3. ✅ Enter your JSON payload
4. ✅ Add Content-Type header
5. ✅ Save and enable

If you have any issues finding the request body field, look for "Advanced settings" or contact cron-job.org support - they have excellent documentation and support.

The key is: **The request body field appears only after you select POST as the HTTP method.**
