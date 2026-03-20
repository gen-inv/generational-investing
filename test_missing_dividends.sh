#!/bin/bash
# Test script to check missing dividends endpoint
# You'll need to replace STOCK_ID with actual holding ID

echo "Testing missing dividends endpoint..."
echo "Note: This requires authentication token and valid stock holding ID"
echo ""
echo "To test manually:"
echo "1. Login to get token"
echo "2. Find a stock holding ID (NVDY)"
echo "3. Call: GET /api/stocks/{id}/missing-dividends"
