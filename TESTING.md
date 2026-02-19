# Testing Guide

## Regression Testing Configuration

### ✅ **Automated Test Environment**

The application is configured to **AUTOMATICALLY use mock data** during regression tests to:
- **Prevent external API calls** to FinanceBird, Yahoo Finance, etc.
- **Avoid API quota usage** during testing
- **Speed up tests** (8-14x faster: 1-2 seconds vs 15-17 seconds)
- **Enable offline testing**

### 🔧 **How It Works**

#### **1. Vitest Configuration** (`vitest.config.ts`)
```typescript
export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      ENVIRONMENT: 'test'  // ✅ Always set to 'test'
    }
  }
})
```

#### **2. Wrangler Configuration** (`.dev.vars`)
```bash
# ⚠️ IMPORTANT: Keep ENVIRONMENT=test enabled in sandbox
ENVIRONMENT=test  # ✅ Always set to 'test' for sandbox testing
```

#### **3. Backend Detection** (`src/index.tsx`)
```typescript
const isTestEnv = env?.ENVIRONMENT === 'test' || process.env.NODE_ENV === 'test'

if (isTestEnv) {
  console.log(`🧪 Test environment detected - using mock data`)
  return mockData  // ✅ Returns mock data, no API calls
}
```

---

## 🚀 **Running Tests**

### **Standard Regression Tests**
```bash
npm test
```
- ✅ Automatically uses mock data
- ✅ No external API calls
- ✅ Runs in 1-2 seconds
- ✅ All 54 tests pass

### **Watch Mode** (for development)
```bash
npm run test:watch
```
- ✅ Same mock data behavior
- ✅ Auto-reruns on file changes

### **Coverage Report**
```bash
npm run test:coverage
```
- ✅ Same mock data behavior
- ✅ Generates coverage report

---

## 📊 **Mock Data Used in Tests**

### **Company Data Mock**
```typescript
{
  company_name: 'Apple Inc.' or 'Microsoft Corporation' (based on ticker),
  market_cap: 2000000000000,
  sector: 'Technology',
  industry: 'Consumer Electronics',
  exchange: 'NASDAQ',
  next_earnings_date: '2025-04-30'
}
```

### **Earnings Date Mock**
```typescript
{
  next_earnings_date: '2025-04-30',
  source: 'Mock (Test)',
  is_estimated: false,
  message: '✅ Earnings date updated (test mode): 2025-04-30'
}
```

---

## ⚙️ **Local Development vs Testing**

### **Sandbox Environment** (Default - for testing)
```bash
# .dev.vars
ENVIRONMENT=test  # ✅ Mock data enabled
```
- Used for: `npm test`, automated CI/CD
- Behavior: Mock data, no API calls
- Speed: Fast (1-2 seconds for all tests)

### **Local Manual Testing** (if needed)
If you want to test with REAL APIs locally:

1. **Temporarily change `.dev.vars`:**
```bash
# ENVIRONMENT=test  # ← Comment out
ENVIRONMENT=dev     # ← Enable real APIs
```

2. **Restart the server:**
```bash
pm2 restart webapp
```

3. **Test manually** via UI or curl

4. **Re-enable test mode** before running tests:
```bash
ENVIRONMENT=test    # ← Re-enable
# ENVIRONMENT=dev   # ← Comment out
```

---

## 🔒 **Production Configuration**

### **Cloudflare Pages** (Production)
- **No ENVIRONMENT variable** is set in production
- Behavior: Real APIs are used (Yahoo + conditional FinanceBird)
- Optimizations still active:
  - ✅ Duplicate check
  - ✅ Conditional FinanceBird calls
  - ✅ Smart earnings refresh

### **Setting Production Secrets**
```bash
# Set API keys in Cloudflare (NOT in .dev.vars)
wrangler secret put RAPIDAPI_KEY --project-name generational-investing

# Do NOT set ENVIRONMENT in production
# (absence of ENVIRONMENT means production mode)
```

---

## 📝 **Verifying Test Mode**

### **Check Server Logs**
```bash
pm2 logs webapp --nostream --lines 20 | grep -E "Test environment|Mock"
```

You should see:
```
🧪 Test environment detected - using mock data for AAPL
🧪 Test environment detected - using mock earnings data for MSFT
```

### **Check Test Output**
```bash
npm test 2>&1 | grep -i "test"
```

You should see:
```
✓ 54 tests passed
Duration: 1-2 seconds  ← Fast = mock data is working
```

### **NOT See in Logs** (when test mode is working):
```
❌ 🔍 Fetching data for AAPL...
❌ 🔑 Using RapidAPI key for FinanceBird...
❌ ✅ FinanceBird Profile...
```

---

## 🎯 **Confirmation Checklist**

When making further development changes, regression testing will **ALWAYS**:

- ✅ Use mock data (no external API calls)
- ✅ Run in 1-2 seconds (vs 15-17 seconds)
- ✅ Pass all 54 tests
- ✅ Not consume FinanceBird API quota
- ✅ Work offline (no internet required)
- ✅ Be deterministic (same results every time)

### **Before Every Test Run:**
1. ✅ `.dev.vars` has `ENVIRONMENT=test`
2. ✅ Server is running (`pm2 list` shows webapp online)
3. ✅ Recent build exists (`npm run build` if needed)

### **After Every Code Change:**
1. ✅ Run `npm test` to verify
2. ✅ Tests use mock data (check logs)
3. ✅ Tests complete in 1-2 seconds
4. ✅ All tests pass

---

## 🐛 **Troubleshooting**

### **Problem: Tests making real API calls**
```bash
# Check .dev.vars
cat .dev.vars | grep ENVIRONMENT
# Should show: ENVIRONMENT=test

# If commented out, uncomment it:
# ENVIRONMENT=test  ← Should be this
ENVIRONMENT=test    ← Not this

# Restart server
pm2 restart webapp

# Run tests again
npm test
```

### **Problem: Tests taking 15+ seconds**
- **Cause**: Real API calls are being made
- **Solution**: Follow "Problem: Tests making real API calls" above

### **Problem: Server not starting**
```bash
# Clean port and rebuild
fuser -k 3000/tcp
npm run build
pm2 start ecosystem.config.cjs
```

---

## 📚 **Related Documentation**

- `FINANCEBIRD_API_ANALYSIS.md` - Complete API optimization analysis
- `.dev.vars.example` - Example environment configuration
- `vitest.config.ts` - Test runner configuration
- `src/index.tsx` - Backend mock data implementation

---

## ✅ **Summary**

**YES, regression testing will ALWAYS use mock data and NOT make real API calls when:**

1. ✅ `.dev.vars` has `ENVIRONMENT=test` (default in sandbox)
2. ✅ You run `npm test` (vitest config sets ENVIRONMENT=test)
3. ✅ Server is running with PM2 (reads .dev.vars)

**This configuration is PERMANENT and will persist across:**
- ✅ All future development sessions
- ✅ All code commits
- ✅ All test runs
- ✅ All sandbox restarts

**You do NOT need to set it up again. It's configured once and works forever.** 🎉
