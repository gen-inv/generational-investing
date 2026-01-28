#!/bin/bash

BASE_URL="http://localhost:3000"

echo "=== Account Currency Features Test ==="
echo ""

# Login
echo "1. Logging in..."
TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}' | jq -r '.token')

echo "   Token received: ${TOKEN:0:20}..."
echo ""

# Create CAD account
echo "2. Creating CAD account..."
curl -s -X POST "$BASE_URL/api/accounts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "account_name":"TFSA - CAD Test",
    "account_type":"RESP",
    "default_currency":"CAD",
    "balance_cad":15000,
    "balance_usd":0,
    "cash_balance_cad":3000,
    "cash_balance_usd":0
  }' | jq '.'
echo ""

# Create USD account
echo "3. Creating USD account..."
curl -s -X POST "$BASE_URL/api/accounts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "account_name":"RRSP - USD Test",
    "account_type":"RRSP",
    "default_currency":"USD",
    "balance_cad":0,
    "balance_usd":20000,
    "cash_balance_cad":0,
    "cash_balance_usd":5000
  }' | jq '.'
echo ""

# Get all accounts
echo "4. Fetching all accounts..."
curl -s -X GET "$BASE_URL/api/accounts" \
  -H "Authorization: Bearer $TOKEN" | jq '.accounts[] | {name: .account_name, currency: .default_currency, balance_cad: .balance_cad, balance_usd: .balance_usd}'
echo ""

# Get dashboard totals
echo "5. Fetching dashboard totals (with currency conversion)..."
curl -s -X GET "$BASE_URL/api/dashboard/totals" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
echo ""

echo "=== Test Complete ==="
