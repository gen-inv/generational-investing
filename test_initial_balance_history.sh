#!/bin/bash

# Test: Verify Initial Balance History Tracking on Account Creation
# This script verifies that when a new account is created, the initial balance
# is automatically saved to the account_balance_history table.

BASE_URL="http://localhost:3000"

echo "==================================="
echo "Initial Balance History Test"
echo "==================================="

# Register a test user
echo -e "\n=== Step 1: Register Test User ==="
TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email":"initial_balance_test@test.com",
    "password":"test123",
    "name":"Initial Balance Test User"
  }' | jq -r '.token')

echo "User registered, token obtained"

# Create CAD account
echo -e "\n=== Step 2: Create CAD TFSA Account ==="
CAD_ACCOUNT=$(curl -s -X POST "$BASE_URL/api/accounts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "account_name": "My TFSA - CAD",
    "account_type": "TFSA",
    "default_currency": "CAD",
    "balance_cad": 50000,
    "balance_usd": 0,
    "cash_balance_cad": 10000,
    "cash_balance_usd": 0
  }')

CAD_ACCOUNT_ID=$(echo "$CAD_ACCOUNT" | jq -r '.id')
echo "Account created:"
echo "$CAD_ACCOUNT" | jq '.'

# Verify CAD account history was created
echo -e "\n=== Step 3: Verify CAD Account Initial History ==="
cd /home/user/webapp && npx wrangler d1 execute webapp-production --local \
  --command="SELECT account_id, balance, cash_balance, currency, month, year FROM account_balance_history WHERE account_id = $CAD_ACCOUNT_ID" 2>&1 | grep -A 15 "results"

# Create USD account
echo -e "\n=== Step 4: Create USD RRSP Account ==="
USD_ACCOUNT=$(curl -s -X POST "$BASE_URL/api/accounts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "account_name": "My RRSP - USD",
    "account_type": "RRSP",
    "default_currency": "USD",
    "balance_cad": 0,
    "balance_usd": 80000,
    "cash_balance_cad": 0,
    "cash_balance_usd": 15000
  }')

USD_ACCOUNT_ID=$(echo "$USD_ACCOUNT" | jq -r '.id')
echo "Account created:"
echo "$USD_ACCOUNT" | jq '.'

# Verify USD account history was created
echo -e "\n=== Step 5: Verify USD Account Initial History ==="
cd /home/user/webapp && npx wrangler d1 execute webapp-production --local \
  --command="SELECT account_id, balance, cash_balance, currency, month, year FROM account_balance_history WHERE account_id = $USD_ACCOUNT_ID" 2>&1 | grep -A 15 "results"

# Summary
echo -e "\n==================================="
echo "Test Summary"
echo "==================================="
echo "✅ CAD Account ID: $CAD_ACCOUNT_ID"
echo "✅ USD Account ID: $USD_ACCOUNT_ID"
echo ""
echo "Expected Results:"
echo "- Each account should have ONE history record"
echo "- CAD account history: balance=50000, cash_balance=10000, currency=CAD"
echo "- USD account history: balance=80000, cash_balance=15000, currency=USD"
echo "- Both should have month=1, year=2026"
echo "- Exchange rates should be included"
echo ""
echo "==================================="
