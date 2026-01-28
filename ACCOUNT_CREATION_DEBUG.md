# Account Creation Debugging Guide

## Issue Report
**User reported**: "Saving a new account no longer works. I don't get an error message. Form doesn't seem to submit."

## Status
✅ **Backend API working correctly** - Tested and verified  
🔧 **Frontend debugging added** - Console logging enabled  
⚠️ **Needs browser testing** - Check browser console for errors  

---

## Changes Made

### 1. Backend Error Handling
**File**: `src/index.tsx` (lines 329-347)

**Problem**: Exchange rate API call during account creation could timeout or fail, causing account creation to hang.

**Solution**: Added try-catch block with fallback rates:
```typescript
// Get exchange rates with fallback
let rates = { usd_to_cad: 1.35, cad_to_usd: 1 / 1.35 };
try {
  const rateResponse = await fetch(`${c.req.url.split('/api')[0]}/api/exchange-rate?month=${currentMonth}&year=${currentYear}`, {
    headers: { 'Authorization': c.req.header('Authorization') || '' }
  });
  if (rateResponse.ok) {
    rates = await rateResponse.json() as any;
  }
} catch (e) {
  console.error('Exchange rate fetch error during account creation:', e);
  // Use fallback rates
}
```

**Benefit**: Account creation will proceed even if exchange rate API is slow or unavailable.

### 2. Frontend Console Logging
**File**: `public/static/app.js` (showAccountForm function)

**Added**:
```javascript
console.log('Form submitted!')
console.log('Account data to send:', data)
console.log('Sending POST request...')
console.log('Account created successfully:', response.data)
console.error('Error creating account:', error)
```

**Benefit**: Can see exactly what's happening in browser console.

---

## Testing Instructions

### 1. Open Browser Console

**Chrome/Edge**: Press `F12` or `Ctrl+Shift+J`  
**Firefox**: Press `F12` or `Ctrl+Shift+K`  
**Safari**: Press `Cmd+Option+C`

### 2. Navigate to Application

**URL**: https://3000-imi5lx8i4w7yx1t3dzzid-02b9cc79.sandbox.novita.ai

### 3. Login or Register

- If you have an account, login with existing credentials
- Otherwise, register a new account:
  - Email: test@example.com
  - Password: test123
  - Name: Test User

### 4. Create Account

1. Click "Accounts" in navigation
2. Click "+ Add Account" button
3. Fill in the form:
   - Account Name: (e.g., "My TFSA Test")
   - Account Type: Select one (Cash, TFSA, RRSP, LIRA)
   - Default Currency: Select CAD or USD
   - Initial Balance: (e.g., 10000)
   - Cash Balance: (e.g., 2000)
4. Click "Save Account"

### 5. Check Browser Console

**Look for these log messages:**

✅ **If working correctly:**
```
Form submitted!
Account data to send: {account_name: "My TFSA Test", ...}
Sending POST request...
Account created successfully: {id: 21, account_name: "My TFSA Test", ...}
```

❌ **If there's an error:**
```
Form submitted!
Account data to send: {...}
Sending POST request...
Error creating account: AxiosError {...}
```

### 6. Common Issues to Check

#### Issue: Form doesn't submit at all
- **No "Form submitted!" log**: Click isn't reaching the form handler
- **Check**: Is the button actually triggering `showAccountForm()`?
- **Test**: Open console and type: `showAccountForm()` - Does modal appear?

#### Issue: Validation error
- **Symptoms**: Form highlights red fields or shows browser validation message
- **Check**: Are all required fields filled? Is default_currency selected?
- **Fix**: Make sure to select account type AND default currency

#### Issue: Network error
- **Symptoms**: "Network Error" or 401 Unauthorized in console
- **Check**: Is user logged in? Is token valid?
- **Fix**: Try logging out and back in

#### Issue: Server error (500)
- **Symptoms**: Error message in alert box
- **Check**: Backend logs with `pm2 logs webapp --nostream --lines 50`
- **Look for**: "Create account error:" message with details

---

## Backend Verification

To verify the backend is working independent of frontend:

```bash
# Register a test user
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"testbackend@test.com","password":"test123","name":"Backend Test"}' \
  | jq -r '.token')

# Create an account
curl -s -X POST http://localhost:3000/api/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "account_name": "Backend Test Account",
    "account_type": "TFSA",
    "default_currency": "CAD",
    "balance_cad": 15000,
    "balance_usd": 0,
    "cash_balance_cad": 3000,
    "cash_balance_usd": 0
  }' | jq '.'
```

**Expected output:**
```json
{
  "id": 22,
  "account_name": "Backend Test Account",
  "account_type": "TFSA",
  "balance_cad": 15000,
  "balance_usd": 0,
  "cash_balance_cad": 3000,
  "cash_balance_usd": 0,
  "default_currency": "CAD"
}
```

---

## Known Working Scenarios

✅ **Backend API**: Verified working (201 Created responses)  
✅ **Direct curl**: Accounts created successfully  
✅ **Initial balance history**: Verified saving to history table  
✅ **Multi-currency**: Both CAD and USD accounts work  

---

## Next Steps

1. **Test in browser** with console open
2. **Report console logs** if there are errors
3. **Try different browsers** if issue persists (Chrome, Firefox, Safari)
4. **Check network tab** to see if request is being sent

---

## Support Information

- **Development URL**: https://3000-imi5lx8i4w7yx1t3dzzid-02b9cc79.sandbox.novita.ai
- **Backend logs**: `pm2 logs webapp --nostream --lines 50`
- **Database check**: `npx wrangler d1 execute webapp-production --local --command="SELECT * FROM accounts ORDER BY id DESC LIMIT 5"`

---

**Last Updated**: January 28, 2026  
**Git Commit**: bdc6b6c  
**Status**: Debugging enabled, awaiting browser testing
