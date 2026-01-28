# Regression Testing Suite

## Overview

Comprehensive regression test suite to prevent functionality breaks during future development. Tests cover all critical features including authentication, account management, exchange rate caching, dashboard performance, and data integrity.

## Test Framework

**Vitest** - Fast, modern testing framework with excellent TypeScript support and built-in coverage reporting.

## Installation

Tests are already installed as part of the project. Dependencies:
- `vitest` - Testing framework
- `@vitest/ui` - Visual test interface

## Running Tests

### Quick Test Run
```bash
cd /home/user/webapp
./run-tests.sh
```

### NPM Scripts
```bash
# Run tests once
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

### Prerequisites
**Server must be running** before tests:
```bash
cd /home/user/webapp
pm2 start ecosystem.config.cjs
```

## Test Coverage

### 1. Authentication Tests (4 tests)
✅ **User Registration**
- Creates new user with unique email
- Returns valid JWT token
- Saves user to database

✅ **User Login**
- Authenticates with valid credentials
- Returns JWT token
- Rejects invalid credentials

✅ **Duplicate Email Prevention**
- Rejects registration with existing email
- Returns 400 error

✅ **Invalid Credentials**
- Rejects login with wrong password
- Returns 401 error

### 2. Exchange Rate Caching Tests (2 tests)
✅ **Cache on Registration**
- Fetches and caches exchange rate on user registration
- Saves to `exchange_rates` table
- Returns cached rate on subsequent requests

✅ **Cache on Login**
- Uses cached rate if available
- Fast performance (< 500ms)
- No redundant API calls

### 3. Account Management Tests (7 tests)
✅ **Create CAD Account**
- Creates TFSA account with CAD currency
- Saves balances correctly
- Returns 201 status

✅ **Create USD Account**
- Creates RRSP account with USD currency
- Handles USD balances
- Returns 201 status

✅ **Invalid Account Type**
- Rejects invalid account types
- Returns 400 error

✅ **Invalid Currency**
- Rejects currencies other than CAD/USD
- Returns 400 error

✅ **List All Accounts**
- Returns array of user's accounts
- Includes all account details

✅ **Get Single Account**
- Fetches specific account by ID
- Returns complete account details

✅ **Update Account**
- Updates account name and details
- Returns success response

### 4. Initial Balance History Tests (1 test)
✅ **History on Account Creation**
- Automatically saves initial balance to `account_balance_history`
- Includes exchange rates
- Records month and year

### 5. Dashboard Tests (2 tests)
✅ **Dashboard Performance**
- Loads dashboard totals in < 1 second
- Returns all required data
- Uses cached exchange rates

✅ **Multi-Currency Totals**
- Calculates totals for CAD accounts
- Calculates totals for USD accounts
- Converts between currencies accurately

### 6. Monthly Balance Update Tests (1 test)
✅ **Can Update Check**
- Verifies if balance can be updated this month
- Returns current month and year
- Indicates update availability

### 7. Performance Regression Tests (2 tests)
✅ **Account Creation Performance**
- Completes in < 5 seconds
- No timeouts
- Consistent response times

✅ **Concurrent Requests**
- Handles 5 simultaneous registrations
- All requests succeed
- No race conditions

## Test Results Summary

```
Test Files  1 passed (1)
Tests       19 passed (19)
Duration    ~1.7 seconds
```

### Coverage Areas
- ✅ Authentication (registration, login, validation)
- ✅ Exchange rate caching
- ✅ Account management (CRUD operations)
- ✅ Initial balance history tracking
- ✅ Dashboard performance
- ✅ Monthly balance updates
- ✅ Multi-currency support
- ✅ Performance benchmarks

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Regression Tests

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm install
      
      - name: Start server
        run: |
          npm run build
          pm2 start ecosystem.config.cjs
          sleep 5
      
      - name: Run regression tests
        run: npm test
      
      - name: Stop server
        run: pm2 delete all
```

## Adding New Tests

### Test Structure
```typescript
describe('Feature Name Tests', () => {
  it('should do something specific', async () => {
    // Arrange: Set up test data
    const email = generateEmail()
    
    // Act: Perform the action
    const response = await fetch(`${BASE_URL}/api/endpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, /* ... */ })
    })
    
    // Assert: Verify the result
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.someField).toBe('expectedValue')
  })
})
```

### Best Practices
1. **Use unique data**: Generate unique emails/names to avoid conflicts
2. **Test both success and failure**: Include negative test cases
3. **Clean up**: Tests should not leave persistent state
4. **Be specific**: Test one thing per test case
5. **Use descriptive names**: Test names should explain what they test

## Performance Benchmarks

### Current Benchmarks (as of Jan 28, 2026)
| Operation | Expected Time | Threshold |
|-----------|--------------|-----------|
| Dashboard Load | < 100ms | < 1000ms |
| Account Creation | < 200ms | < 5000ms |
| User Login | < 50ms | < 500ms |
| User Registration | < 300ms | < 1000ms |

## Troubleshooting

### Tests Fail with "Connection Refused"
**Problem**: Server is not running  
**Solution**: Start server with `pm2 start ecosystem.config.cjs`

### Tests Timeout
**Problem**: Server is slow or test timeout too short  
**Solution**: Increase timeout in `vitest.config.ts`:
```typescript
test: {
  testTimeout: 60000, // 60 seconds
}
```

### Tests Pass Locally but Fail in CI
**Problem**: Database not initialized or environment differences  
**Solution**: 
1. Run migrations in CI: `npm run db:migrate:local`
2. Ensure server is running before tests
3. Check environment variables

### Flaky Tests
**Problem**: Tests pass sometimes, fail other times  
**Solution**:
1. Use unique test data (timestamps, random strings)
2. Add proper wait times for async operations
3. Check for race conditions

## Maintenance

### Regular Tasks
- **Before major changes**: Run full test suite
- **After bug fixes**: Add regression test for the bug
- **Weekly**: Review test coverage
- **Monthly**: Update performance benchmarks

### When to Update Tests
- ✅ When adding new features
- ✅ When fixing bugs
- ✅ When changing API contracts
- ✅ When modifying database schema
- ❌ When only changing internal implementation (if tests still pass)

## Future Enhancements

### Planned Additions
1. **Database Integrity Tests**
   - Foreign key constraints
   - Data consistency checks
   - Cascade delete verification

2. **Security Tests**
   - SQL injection attempts
   - XSS prevention
   - CSRF protection
   - Rate limiting

3. **Edge Case Tests**
   - Large numbers
   - Special characters
   - Boundary values
   - Null/undefined handling

4. **Load Tests**
   - 100+ concurrent users
   - Sustained traffic
   - Memory leak detection

5. **Integration Tests**
   - Full user workflows
   - Multi-step processes
   - Error recovery

## Files

### Test Files
- `tests/regression.test.ts` - Main test suite
- `vitest.config.ts` - Vitest configuration
- `run-tests.sh` - Test runner script

### Configuration
- `package.json` - Test scripts
- `.gitignore` - Exclude test artifacts

## Support

### Getting Help
- Check test output for specific error messages
- Review test logs in console
- Verify server is running and accessible
- Check database state if tests fail

### Reporting Issues
When reporting test failures, include:
1. Test name and description
2. Error message and stack trace
3. Server logs (`pm2 logs webapp`)
4. Environment details (Node version, OS)

---

**Created**: January 28, 2026  
**Version**: 1.0.0  
**Status**: ✅ All Tests Passing  
**Last Run**: 19/19 tests passed in 1.7s
