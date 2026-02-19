#!/bin/bash
# Test setup script - ensures wrangler dev server is running with test environment

set -e

echo "🧪 Setting up test environment..."

# Copy test environment variables
cp .dev.vars.test .dev.vars.active
echo "✅ Test environment variables activated"

# Check if server is running on port 3000
if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "⚠️  Server not running on port 3000"
  echo "Please ensure the dev server is running:"
  echo "  npm run build"
  echo "  pm2 start ecosystem.config.cjs"
  exit 1
fi

echo "✅ Server is running"

# Restart PM2 to pick up test environment
echo "🔄 Restarting server with test environment..."
pm2 restart webapp 2>/dev/null || true
sleep 2

echo "✅ Test environment ready!"
echo ""
