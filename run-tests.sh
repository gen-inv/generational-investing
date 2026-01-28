#!/bin/bash

# Regression Test Runner
# This script runs all regression tests against the running server

echo "════════════════════════════════════════════════════════════════"
echo "    Generational Investing - Regression Test Suite"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check if server is running
echo "Checking if server is running..."
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "❌ Error: Server is not running on http://localhost:3000"
    echo ""
    echo "Please start the server first:"
    echo "  cd /home/user/webapp && pm2 start ecosystem.config.cjs"
    echo ""
    exit 1
fi

echo "✅ Server is running"
echo ""

# Run tests
echo "Running regression tests..."
echo "════════════════════════════════════════════════════════════════"
echo ""

npm test

TEST_EXIT_CODE=$?

echo ""
echo "════════════════════════════════════════════════════════════════"

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ All regression tests passed!"
    echo ""
    echo "Test Coverage:"
    echo "  • Authentication (registration, login, validation)"
    echo "  • Exchange rate caching"
    echo "  • Account management (CRUD operations)"
    echo "  • Initial balance history tracking"
    echo "  • Dashboard performance"
    echo "  • Monthly balance updates"
    echo "  • Multi-currency support"
    echo "  • Performance benchmarks"
    echo ""
else
    echo "❌ Some tests failed. Please review the output above."
    echo ""
fi

echo "════════════════════════════════════════════════════════════════"

exit $TEST_EXIT_CODE
