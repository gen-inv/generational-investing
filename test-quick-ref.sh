#!/bin/bash

# Quick Reference Guide for Regression Testing

cat << 'EOF'

╔════════════════════════════════════════════════════════════════╗
║         Regression Testing - Quick Reference                   ║
╔════════════════════════════════════════════════════════════════╝

📋 RUNNING TESTS
═══════════════════════════════════════════════════════════════

  Quick Run (recommended):
    ./run-tests.sh

  NPM Scripts:
    npm test                 # Run once
    npm run test:watch       # Watch mode
    npm run test:ui          # Visual interface
    npm run test:coverage    # With coverage report

  Prerequisites:
    ✓ Server must be running: pm2 start ecosystem.config.cjs


📊 TEST COVERAGE (19 Tests)
═══════════════════════════════════════════════════════════════

  ✅ Authentication (4 tests)
     • User registration
     • User login
     • Duplicate email prevention
     • Invalid credentials rejection

  ✅ Exchange Rate Caching (2 tests)
     • Cache on registration
     • Cache on login

  ✅ Account Management (7 tests)
     • Create CAD account
     • Create USD account
     • Invalid account type rejection
     • Invalid currency rejection
     • List all accounts
     • Get single account
     • Update account

  ✅ Initial Balance History (1 test)
     • History saved on account creation

  ✅ Dashboard (2 tests)
     • Dashboard performance (< 1 second)
     • Multi-currency totals calculation

  ✅ Monthly Balance Updates (1 test)
     • Can-update check

  ✅ Performance Regression (2 tests)
     • Account creation performance (< 5 seconds)
     • Concurrent requests handling


🔄 AUTOMATIC TESTING
═══════════════════════════════════════════════════════════════

  Pre-commit Hook:
    • Automatically runs before each commit
    • Prevents broken code from being committed
    • Can bypass with: git commit --no-verify

  GitHub Actions:
    • Runs on push to main branch
    • Runs on pull requests
    • Includes coverage reports
    • See: .github/workflows/regression-tests.yml


⚡ PERFORMANCE BENCHMARKS
═══════════════════════════════════════════════════════════════

  Operation              Expected    Threshold
  ─────────────────────  ──────────  ──────────
  Dashboard Load         < 100ms     < 1000ms
  Account Creation       < 200ms     < 5000ms
  User Login             < 50ms      < 500ms
  User Registration      < 300ms     < 1000ms


📝 ADDING NEW TESTS
═══════════════════════════════════════════════════════════════

  1. Edit: tests/regression.test.ts
  2. Add describe() block for feature
  3. Add it() blocks for test cases
  4. Run: npm test
  5. Commit (tests run automatically)


🐛 TROUBLESHOOTING
═══════════════════════════════════════════════════════════════

  Tests fail with "Connection Refused":
    → Start server: pm2 start ecosystem.config.cjs

  Tests timeout:
    → Increase timeout in vitest.config.ts

  Flaky tests:
    → Use unique test data (timestamps, random strings)
    → Add proper wait times for async operations


📚 DOCUMENTATION
═══════════════════════════════════════════════════════════════

  Full Documentation:  REGRESSION_TESTING.md
  Test Suite:          tests/regression.test.ts
  Configuration:       vitest.config.ts
  Runner Script:       run-tests.sh


🎯 BEST PRACTICES
═══════════════════════════════════════════════════════════════

  ✓ Run tests before committing
  ✓ Add tests for new features
  ✓ Add tests for bug fixes
  ✓ Keep tests independent
  ✓ Use descriptive test names
  ✓ Test both success and failure cases
  ✓ Review test output carefully


🚀 QUICK START
═══════════════════════════════════════════════════════════════

  1. Start server:
     pm2 start ecosystem.config.cjs

  2. Run tests:
     ./run-tests.sh

  3. View results:
     All tests should pass (19/19)

  4. Commit changes:
     Tests run automatically on commit


📞 GETTING HELP
═══════════════════════════════════════════════════════════════

  • Check test output for error messages
  • Review REGRESSION_TESTING.md
  • Check server logs: pm2 logs webapp
  • Verify database state if tests fail


═══════════════════════════════════════════════════════════════

Status: ✅ 19/19 Tests Passing
Last Updated: January 28, 2026
Version: 1.0.0

═══════════════════════════════════════════════════════════════

EOF
