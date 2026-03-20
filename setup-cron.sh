#!/bin/bash

# Cloudflare Cron Trigger Setup Script for Pages
# This script uses the Cloudflare API to set up a cron trigger for Cloudflare Pages

ACCOUNT_ID="a7bf84b34b11b80916c8e08a2fb71de7"
PROJECT_NAME="generational-investing"
CRON_EXPRESSION="0 0 * * 0"  # Every Sunday at midnight UTC

# Get API token from environment
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "ERROR: CLOUDFLARE_API_TOKEN environment variable not set"
    echo "Please run: export CLOUDFLARE_API_TOKEN=your_token"
    exit 1
fi

echo "Setting up cron trigger for Cloudflare Pages project: $PROJECT_NAME"
echo "Cron expression: $CRON_EXPRESSION (Every Sunday at midnight UTC)"
echo ""

# Cloudflare API endpoint for Pages project settings
API_URL="https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}"

echo "Fetching current project configuration..."
curl -X GET "$API_URL" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -s | python3 -m json.tool > /tmp/pages_config.json

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to fetch project configuration"
    exit 1
fi

echo "Current configuration saved to /tmp/pages_config.json"
echo ""
echo "Note: Cloudflare Pages does not support cron triggers via API."
echo "Cron triggers for Pages Functions must be configured through:"
echo ""
echo "1. Cloudflare Dashboard:"
echo "   - Go to: https://dash.cloudflare.com/${ACCOUNT_ID}/pages"
echo "   - Click on project: $PROJECT_NAME"
echo "   - Go to Settings → Functions"
echo "   - Look for Cron Triggers section"
echo "   - Add trigger: $CRON_EXPRESSION"
echo ""
echo "2. Alternatively, convert your Pages project to use Workers deployment:"
echo "   - This requires restructuring the project"
echo "   - Workers support cron triggers via wrangler.toml"
echo ""
echo "For now, the scheduled() function is already implemented in src/index.tsx"
echo "You just need to enable the trigger via the Dashboard."
