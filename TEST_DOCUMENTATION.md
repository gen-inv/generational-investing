# Regression Test Suite Documentation

## Overview

Comprehensive regression test suite for the Generational Investing Portfolio Management System. Tests all critical functionality including authentication, stock trades, option trades, Wheel strategy, assignments, and cost basis calculations.

**IMPORTANT**: This test suite **DOES NOT** make external API calls to third-party services. All tests use local database operations only.

## External API Isolation

### Endpoints NOT Tested (External Dependencies)
The following endpoints are intentionally excluded from tests because they call external APIs:

1. **`/api/exchange-rate`**
   - Calls: Bank of Canada API, Exchange Rate API
   - Purpose: Fetches USD/CAD exchange rates
   - Why not tested: Avoids API rate limits and external service dependency

2. **`/api/dividend-repository/fetch`**
   - Calls: Polygon.io (Massive API), EODHD
   - Purpose: Fetches dividend data for stocks
   - Why not tested: Expensive API calls, rate limited, external dependency

3. **`/api/cron/dividend-repository/fetch/*`**
   - Calls: Same as above (cron variants)
   - Purpose: Scheduled dividend fetching
   - Why not tested: External dependency, rate limits

### Why We Don't Test External APIs

1. **Rate Limits**: Consuming API quotas during testing
2. **Cost**: Some APIs charge per request
3. **Reliability**: External services may be down or slow
4. **Speed**: Tests would be much slower
5. **Security**: Avoid exposing API keys in CI/CD
6. **Control**: We can't control third-party service behavior

### Testing Philosophy

We **trust** that third-party services function correctly and focus our tests on:
- ✅ Our business logic
- ✅ Our database operations
- ✅ Our data transformations
- ✅ Our API contracts
- ✅ Our error handling

If external APIs fail in production, that's a monitoring/alerting concern, not a test concern.

### Endpoints Tested (Local Operations Only)

All tested endpoints use only local database operations:

- ✅ `/api/auth/register` - User registration
- ✅ `/api/auth/login` - User authentication
- ✅ `/api/companies` - Company CRUD operations
- ✅ `/api/accounts` - Account management
- ✅ `/api/accounts/create` - Create new account
- ✅ `/api/stocks` - Stock holdings CRUD
- ✅ `/api/stocks/:id/purchase-history` - Transaction history
- ✅ `/api/stocks/:id/dividends` - Dividend operations
- ✅ `/api/stocks/:id/missing-dividends` - Dividend matching
- ✅ `/api/stocks/:id/covered-calls` - Covered call history
- ✅ `/api/stocks/:id/cost-basis-adjustments` - Cost basis tracking
- ✅ `/api/stocks/:id/close` - Position closing
- ✅ `/api/options` - Option trades CRUD
- ✅ `/api/options/:id/assign` - Option assignment to stock
- ✅ `/api/options/:id/close` - Close option position

**Zero external API calls in any tested endpoint.**

## Test Coverage

### 1. Authentication Tests
- ✅ User registration
- ✅ User login with valid credentials
- ✅ Rejection of invalid credentials

### 2. Company Management Tests
- ✅ Create company
- ✅ Get all companies
- ✅ Update company

### 3. Account Management Tests
- ✅ Create account
- ✅ Get all accounts

### 4. Stock Holdings & Transactions Tests
- ✅ Create stock holding with transaction
- ✅ Add to existing position
- ✅ Get stock holdings
- ✅ **Get purchase history** (validates stock_transactions table)
- ✅ **Verify stock_transactions populated** (dual-table architecture)
- ✅ Sell partial position
- ✅ **Verify SELL transaction in history**

### 5. Wheel Strategy Tests
- ✅ Create Selling Put (Wheel) option trade
- ✅ **Assign stock position from Wheel put**
- ✅ Verify option closed after assignment
- ✅ **Verify stock holding created with WHEEL strategy**
- ✅ **Verify stock transaction created for assignment**
- ✅ **Verify cost basis adjustment for assignment premium**
- ✅ **Verify cost basis reduced by premium**

### 6. Stockpiling Strategy Tests
- ✅ Create Selling Put (Stockpiling) option trade
- ✅ **Assign stock position from Stockpiling put**
- ✅ **Verify STOCKPILING strategy type**

### 7. Covered Call Tests
- ✅ Create covered call on existing holding
- ✅ **Verify NO cost basis adjustment when opening** (NEW FIX!)
- ✅ Close covered call with profit
- ✅ **Verify cost basis adjustment AFTER closing** (NEW FIX!)
- ✅ Get covered calls for a holding

### 8. Dividend Tests
- ✅ Record dividend payment
- ✅ Get dividend history
- ✅ Get missing dividends

### 9. Cost Basis Adjustment Tests
- ✅ Get all cost basis adjustments
- ✅ Verify cost basis reflects all adjustments

### 10. Cleanup Tests
- ✅ Close stock position
- ✅ Verify position is closed

## New Tests Added (June 18, 2026)

### Stock Transactions / Purchase History
These tests validate the fix for empty purchase history:

1. **Dual-Table Architecture Validation**
   - Tests that both `stock_holdings` and `stock_transactions` are populated
   - Verifies purchase history endpoint returns transaction data
   - Validates BUY and SELL transactions are recorded

2. **Transaction History Integrity**
   - Confirms transaction dates, quantities, and prices match
   - Verifies transaction history survives position updates
   - Tests SELL transactions appear in history

### Wheel Strategy & Assignments
These tests validate option assignment functionality:

1. **Wheel Entry via Put Assignment**
   - Creates Selling Put (Wheel) option
   - Assigns stock at expiration
   - Verifies WHEEL strategy type is set
   - Confirms shares = contracts * 100

2. **Assignment Premium Cost Basis**
   - Tests SELLING_PUT adjustment is created
   - Verifies premium amount: (premium * contracts * 100) - commission
   - Confirms cost basis is reduced by premium per share
   - Example: $45 strike - ($399 / 200 shares) = $43.005 cost basis

3. **Transaction Record for Assignment**
   - Verifies BUY transaction created on assignment
   - Tests quantity equals shares assigned
   - Confirms price equals strike price

4. **Stockpiling vs Wheel Strategy**
   - Tests both SELLING_PUT and SELLING_PUT_WHEEL
   - Verifies correct strategy type on assignment
   - Confirms different strategy types create different holdings

### Covered Call Cost Basis Timing
These tests validate the June 18, 2026 covered call fix:

1. **No Adjustment on Open**
   - Opens covered call
   - Queries cost_basis_adjustments table
   - Asserts NO COVERED_CALL adjustment exists

2. **Adjustment on Close**
   - Closes covered call with profit
   - Queries cost_basis_adjustments table
   - Asserts COVERED_CALL adjustment exists with correct amount
   - Validates notes contain "closed"

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run with Coverage
```bash
npm run test:coverage
```

### Run with UI
```bash
npm run test:ui
```

## Test Structure

### Setup Phase
1. Register test user
2. Create test company
3. Create test account
4. Store IDs for subsequent tests

### Test Execution
- Tests run sequentially (singleThread mode)
- Each test builds on previous state
- IDs are shared across test suites via module-level variables

### Cleanup Phase
- Closes test positions
- Verifies final state
- Database is reset for next run

## Test Configuration

### vitest.config.js
```javascript
{
  testTimeout: 30000,      // 30 seconds per test
  hookTimeout: 30000,      // 30 seconds for hooks
  singleThread: true,      // Sequential execution
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html']
  }
}
```

### Environment Requirements
- Node.js 20+
- Local D1 database (via wrangler)
- Server running on localhost:3000

## Pre-commit Hook Integration

Tests run automatically before each commit via git hooks:

```bash
# .git/hooks/pre-commit
npm run build
pm2 start ecosystem.config.cjs
npm test
pm2 delete all
```

If tests fail, commit is blocked.

## CI/CD Integration

Tests run on GitHub Actions for:
- Every push to main branch
- Every pull request

See `.github/workflows/regression-tests.yml` for configuration.

## Test Data

### Test User
- Email: `test-{timestamp}@example.com`
- Password: `test123456`
- Name: `Test User`

### Test Company
- Ticker: `TEST`
- Name: `Test Company Inc`
- Market Cap: $1B
- Exchange: NYSE
- Sector: Technology

### Test Account
- Name: `Test TFSA Account`
- Type: TFSA

### Test Stock Positions
1. Initial BUY: 100 shares @ $50.00
2. Add to position: 50 shares @ $55.00
3. Partial SELL: 50 shares @ $60.00
4. Wheel assignment: 200 shares @ $45.00
5. Stockpiling assignment: 100 shares @ $48.00

### Test Options
1. Selling Put (Wheel): 2 contracts @ $45 strike
2. Selling Put (Stockpiling): 1 contract @ $48 strike
3. Covered Call: 1 contract @ $65 strike

## Test Assertions

### Key Assertions
- Response status codes (200, 201, 401, 404)
- Required fields present in responses
- Data types and formats correct
- Relational integrity (IDs match across tables)
- Business logic correctness (cost basis calculations)
- State transitions (open → closed)

### Numeric Precision
- Uses `toBeCloseTo(value, decimals)` for floats
- Typically 2 decimal places for currency
- Handles floating point rounding errors

## Troubleshooting

### Tests Fail with "Server not running"
```bash
npm run build
pm2 start ecosystem.config.cjs
npm test
```

### Database Issues
```bash
npm run db:reset  # Reset local database
npm test
```

### Port 3000 in Use
```bash
npm run clean-port  # Kill processes on port 3000
npm test
```

### Tests Timeout
- Increase testTimeout in vitest.config.js
- Check server logs: `pm2 logs --nostream`
- Verify database migrations: `npm run db:migrate:local`

## Future Test Additions

### Planned Tests
1. **0DTE Trading**
   - Create daily trade
   - Close daily trade
   - Calculate P/L statistics

2. **Reports**
   - P/L summary by period
   - Performance analysis
   - Strategy analysis
   - Position analysis

3. **Dividend Repository**
   - Fetch dividends from API
   - Match dividends to holdings
   - Bulk add missing dividends

4. **Multi-Account Scenarios**
   - Multiple accounts per user
   - Same stock in different accounts
   - Account-specific tax treatment

5. **Edge Cases**
   - Selling more shares than owned
   - Option assignment with existing position
   - Multiple assignments to same ticker
   - Covered calls without sufficient shares

## Test Metrics

### Target Coverage
- **Statements**: >80%
- **Branches**: >70%
- **Functions**: >80%
- **Lines**: >80%

### Current Test Count
- **Total Tests**: 40+
- **Test Suites**: 10
- **Assertions**: 100+

### Test Execution Time
- **Average**: ~5-10 seconds
- **Maximum**: 30 seconds (with timeout)
- **CI/CD**: ~2-3 minutes (includes setup)

## Best Practices

1. **Sequential Execution**: Tests must run in order (singleThread mode)
2. **Shared State**: Use module-level variables for test data
3. **Cleanup**: Always clean up test data at the end
4. **Assertions**: Use descriptive expect messages
5. **Timeouts**: Set generous timeouts for API calls
6. **Error Handling**: Test both success and failure cases
7. **Documentation**: Comment complex test scenarios

## Contributing

When adding new features:
1. Write tests FIRST (TDD approach)
2. Test happy path AND error cases
3. Add test documentation to this file
4. Update test count metrics
5. Run full test suite before committing
6. Ensure coverage doesn't drop below targets

---

**Last Updated**: June 18, 2026  
**Test Suite Version**: 1.0  
**Total Tests**: 40+  
**Coverage**: TBD (run `npm run test:coverage`)
