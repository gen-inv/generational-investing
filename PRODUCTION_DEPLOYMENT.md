# Production Deployment Guide - Generational Investing

## Overview
This guide will help you deploy the Generational Investing Portfolio Management System to Cloudflare Pages.

## Pre-Deployment Checklist

### ✅ Current Status
- [x] All features implemented and tested
- [x] Git repository initialized with 10+ commits
- [x] Database migrations created (0001-0004)
- [x] Frontend and backend code complete
- [x] Monthly balance restriction working
- [x] Account currency support implemented
- [x] Documentation complete

### 📋 What Will Be Deployed
**Version**: v1.1
**Features**:
- JWT authentication
- Company roster management
- Multi-currency account tracking (CAD/USD)
- Individual named accounts (Cash, TFSA, RRSP, LIRA)
- Stock trades tracking
- Option trades tracking (6 strategies)
- Monthly balance updates with history
- Dashboard with currency conversion
- P/L reporting

## Deployment Steps

### Step 1: Configure Cloudflare API Key

**⚠️ REQUIRED FIRST STEP**

1. Go to the **Deploy** tab in the sidebar
2. Click "Set up Cloudflare deployment"
3. Follow the instructions to create a Cloudflare API token:
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token"
   - Use the "Edit Cloudflare Workers" template
   - Or create custom token with these permissions:
     - Account > Cloudflare Pages > Edit
     - Account > Account Settings > Read
4. Copy the API token
5. Paste it in the Deploy tab and save

### Step 2: Verify Build Configuration

The project is already configured for Cloudflare Pages deployment:

**Files in place:**
```
✓ package.json - with build scripts
✓ wrangler.jsonc - Cloudflare configuration
✓ vite.config.ts - Build configuration
✓ src/index.tsx - Backend application
✓ public/static/ - Frontend assets
✓ migrations/ - Database migrations (4 files)
```

**Build Command**: `npm run build`
**Output Directory**: `dist/`
**Project Name**: `generational-investing`

### Step 3: Create Cloudflare D1 Database

Run these commands in the terminal:

```bash
# Navigate to project
cd /home/user/webapp

# Create production D1 database
npx wrangler d1 create generational-investing-production

# Copy the database_id from the output and update wrangler.jsonc
```

**Example output:**
```
Created database generational-investing-production
database_id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Update wrangler.jsonc:**
```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "generational-investing-production",
      "database_id": "YOUR-DATABASE-ID-HERE"  // <- Replace this
    }
  ]
}
```

### Step 4: Run Database Migrations

Apply all migrations to production database:

```bash
# Apply all migrations (0001-0004)
npx wrangler d1 migrations apply generational-investing-production

# Verify migrations
npx wrangler d1 execute generational-investing-production \
  --command="SELECT name FROM sqlite_master WHERE type='table'"
```

**Expected tables:**
- users
- companies
- accounts
- account_balance_history
- exchange_rates
- stock_trades
- option_trades
- cost_basis_adjustments

### Step 5: Build the Project

```bash
cd /home/user/webapp
npm run build
```

**Verify build output:**
```
✓ dist/_worker.js created (~69 KB)
✓ dist/_routes.json created
✓ Static files copied to dist/
```

### Step 6: Create Cloudflare Pages Project

```bash
# Create the Pages project
npx wrangler pages project create generational-investing \
  --production-branch main \
  --compatibility-date 2026-01-15

# Deploy to production
npx wrangler pages deploy dist --project-name generational-investing
```

**Note**: The first deployment may take 2-3 minutes.

### Step 7: Verify Deployment

After deployment completes, you'll see:

```
✨ Success! Uploaded 3 files

✨ Deployment complete!
   https://generational-investing.pages.dev
   https://main.generational-investing.pages.dev
```

**Test the deployment:**
```bash
# Test the homepage
curl https://generational-investing.pages.dev

# Test the API
curl https://generational-investing.pages.dev/api/health
```

### Step 8: Create Admin User

**Option 1: Via API**
```bash
curl -X POST https://generational-investing.pages.dev/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-secure-password",
    "name": "Your Name"
  }'
```

**Option 2: Via Web Interface**
1. Visit https://generational-investing.pages.dev
2. Click "Register"
3. Fill in your details
4. Create your account

## Post-Deployment Configuration

### Set Up Custom Domain (Optional)

1. Go to Cloudflare Dashboard
2. Navigate to Pages > generational-investing
3. Go to Custom Domains
4. Add your domain (e.g., investing.yourdomain.com)
5. Follow DNS setup instructions

### Configure Environment Variables (If Needed)

If you add third-party API integrations later:

```bash
# Example: Add Alpha Vantage API key
npx wrangler pages secret put ALPHA_VANTAGE_API_KEY \
  --project-name generational-investing
```

## Troubleshooting

### Issue: Database not found
**Solution**: Make sure you created the D1 database and updated `wrangler.jsonc` with the correct `database_id`.

### Issue: Migrations fail
**Solution**: 
```bash
# Check migration status
npx wrangler d1 migrations list generational-investing-production

# Apply specific migration
npx wrangler d1 migrations apply generational-investing-production --local=false
```

### Issue: Build fails
**Solution**:
```bash
# Clean and rebuild
cd /home/user/webapp
rm -rf node_modules dist .wrangler
npm install
npm run build
```

### Issue: 500 errors after deployment
**Solution**: Check logs
```bash
npx wrangler pages deployment tail --project-name generational-investing
```

## Updating Production

### For Future Updates

```bash
# 1. Make changes and commit
git add .
git commit -m "Your update message"

# 2. Build
npm run build

# 3. Deploy
npx wrangler pages deploy dist --project-name generational-investing

# 4. If database changes, run migrations
npx wrangler d1 migrations apply generational-investing-production
```

## Production URLs

After successful deployment:

- **Main URL**: https://generational-investing.pages.dev
- **Branch URL**: https://main.generational-investing.pages.dev
- **Custom Domain**: (Configure in Cloudflare Dashboard)

## Security Notes

### ⚠️ Important for Production

1. **Change JWT Secret**
   - Current secret is "secret" (demo only)
   - For production, use environment variable
   - Add to Cloudflare Pages settings

2. **Use bcrypt for Passwords**
   - Current implementation uses SHA-256 (demo)
   - For production, implement bcrypt
   - Update `hashPassword()` and `verifyPassword()`

3. **Enable HTTPS Only**
   - Cloudflare Pages automatically uses HTTPS
   - No additional configuration needed

4. **Rate Limiting**
   - Consider adding rate limiting for API endpoints
   - Cloudflare offers this in their dashboard

## Database Backups

### Export Database

```bash
# Export entire database
npx wrangler d1 export generational-investing-production \
  --output backup-$(date +%Y%m%d).sql

# Export specific table
npx wrangler d1 execute generational-investing-production \
  --command="SELECT * FROM accounts" \
  --json > accounts-backup.json
```

### Schedule Regular Backups

Consider setting up a cron job or GitHub Action to backup your database regularly.

## Monitoring

### View Logs
```bash
# Real-time logs
npx wrangler pages deployment tail --project-name generational-investing

# Recent logs
npx wrangler pages deployment tail --project-name generational-investing --status=success
```

### Analytics

Cloudflare provides built-in analytics:
1. Go to Cloudflare Dashboard
2. Navigate to Pages > generational-investing
3. Click "Analytics" tab

## Support

### Useful Commands

```bash
# Check deployment status
npx wrangler pages deployment list --project-name generational-investing

# Rollback to previous deployment
npx wrangler pages deployment rollback generational-investing

# View project details
npx wrangler pages project get generational-investing

# Delete deployment (if needed)
npx wrangler pages deployment delete <deployment-id> --project-name generational-investing
```

### Documentation Links

- Cloudflare Pages: https://developers.cloudflare.com/pages
- Cloudflare D1: https://developers.cloudflare.com/d1
- Wrangler CLI: https://developers.cloudflare.com/workers/wrangler

## Summary

**Deployment Checklist:**
- [ ] Configure Cloudflare API key in Deploy tab
- [ ] Create D1 production database
- [ ] Update wrangler.jsonc with database_id
- [ ] Run database migrations
- [ ] Build the project (`npm run build`)
- [ ] Create Pages project
- [ ] Deploy to production
- [ ] Test deployment
- [ ] Create admin user
- [ ] (Optional) Configure custom domain

**Time Estimate**: 15-20 minutes

**Result**: Fully functional production application accessible at:
`https://generational-investing.pages.dev`

Ready to deploy! 🚀
