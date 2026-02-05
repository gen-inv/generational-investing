# 🚀 Cloudflare Pages Deployment Guide

## ✅ YOUR APP IS BUILT FOR CLOUDFLARE!

Your application uses **Cloudflare Pages architecture** and can be deployed immediately:
- ✅ Hono framework (Cloudflare Workers compatible)
- ✅ Cloudflare D1 database (SQLite)
- ✅ Edge runtime optimized
- ✅ Built with `npm run build` → `dist/` directory
- ✅ No server needed (serverless)

**Deployment is fast and FREE on Cloudflare's free tier!**

---

## Prerequisites

Before deploying, you need:
1. **Cloudflare Account** (free) - https://dash.cloudflare.com/sign-up
2. **Cloudflare API Token** - Get from Deploy tab in this chat
3. **GitHub Repository** (optional but recommended)

---

## Deployment Option 1: Direct Deployment (Fastest)

### Step 1: Setup Cloudflare Authentication

**In this chat**, call the setup tool:
```bash
# This configures CLOUDFLARE_API_TOKEN automatically
setup_cloudflare_api_key
```

If it fails, go to the **Deploy** tab in this chat and add your Cloudflare API token.

### Step 2: Verify Authentication

```bash
cd /home/user/webapp
npx wrangler whoami
```

You should see your Cloudflare account email.

### Step 3: Create Production D1 Database

```bash
cd /home/user/webapp
npx wrangler d1 create webapp-production
```

**IMPORTANT**: Copy the `database_id` from the output!

Example output:
```
✅ Successfully created DB 'webapp-production'
binding = "DB"
database_name = "webapp-production"
database_id = "abc123def456..."  ← COPY THIS!
```

### Step 4: Update wrangler.jsonc

Edit `wrangler.jsonc` and add your database_id:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "webapp",
  "compatibility_date": "2024-01-01",
  "pages_build_output_dir": "./dist",
  "compatibility_flags": ["nodejs_compat"],
  
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "webapp-production",
      "database_id": "abc123def456..."  ← PASTE YOUR ID HERE
    }
  ]
}
```

### Step 5: Apply Migrations to Production

```bash
cd /home/user/webapp
npx wrangler d1 migrations apply webapp-production
```

This creates all your tables in the production database.

### Step 6: Build Your Application

```bash
cd /home/user/webapp
npm run build
```

This creates the `dist/` directory with:
- `_worker.js` - Your compiled Hono app
- `_routes.json` - Routing configuration
- Static assets from `public/`

### Step 7: Create Cloudflare Pages Project

```bash
cd /home/user/webapp
npx wrangler pages project create webapp --production-branch main
```

**Note**: If `webapp` is already taken, try `generational-investing` or add your username.

### Step 8: Deploy to Production

```bash
cd /home/user/webapp
npx wrangler pages deploy dist --project-name webapp
```

**Deployment takes ~30 seconds!**

### Step 9: Get Your Production URL

After deployment, you'll see:
```
✨ Deployment complete! Take a peek over at
https://abc123.webapp.pages.dev
```

Your app is now LIVE! 🎉

---

## Deployment Option 2: GitHub Integration (Recommended for Teams)

### Benefits
- ✅ Automatic deployments on git push
- ✅ Preview deployments for branches
- ✅ Deployment history
- ✅ Easy rollbacks

### Step 1: Push to GitHub

First, setup GitHub authentication in this chat:
```bash
setup_github_environment
```

Then create/push to GitHub:
```bash
cd /home/user/webapp
git remote add origin https://github.com/YOUR_USERNAME/generational-investing.git
git push -u origin main
```

### Step 2: Connect Cloudflare to GitHub

1. Go to https://dash.cloudflare.com
2. Click **"Pages"** in left sidebar
3. Click **"Connect to Git"**
4. Authorize Cloudflare to access your GitHub
5. Select your repository: `generational-investing`

### Step 3: Configure Build Settings

In Cloudflare Pages setup:
- **Framework preset**: None
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Root directory**: `/`

### Step 4: Add D1 Database Binding

In your Cloudflare Pages project settings:
1. Go to **Settings** → **Functions**
2. Scroll to **"D1 database bindings"**
3. Click **"Add binding"**
   - Variable name: `DB`
   - D1 database: Select `webapp-production`

### Step 5: Deploy

Click **"Save and Deploy"**

Your app will deploy automatically on every git push to `main`!

---

## Database Management

### View Database in Cloudflare Dashboard

1. Go to https://dash.cloudflare.com
2. Click **"Workers & Pages"** → **"D1"**
3. Click your database: `webapp-production`
4. Use the **Console** tab to run SQL queries

### Run Migrations

**For production database**:
```bash
cd /home/user/webapp
npx wrangler d1 migrations apply webapp-production
```

**For local testing** (uses SQLite in `.wrangler/`):
```bash
cd /home/user/webapp
npx wrangler d1 migrations apply webapp-production --local
```

### Seed Production Data (Optional)

If you have a `seed.sql` file:
```bash
cd /home/user/webapp
npx wrangler d1 execute webapp-production --file=./seed.sql
```

### Query Production Database

```bash
cd /home/user/webapp
npx wrangler d1 execute webapp-production --command="SELECT * FROM users LIMIT 5"
```

### Backup Production Database

```bash
cd /home/user/webapp
npx wrangler d1 export webapp-production --output=backup-$(date +%Y%m%d).sql
```

---

## Environment Variables & Secrets

### Add Secrets (for API keys, etc.)

```bash
cd /home/user/webapp
npx wrangler pages secret put API_KEY --project-name webapp
# Enter secret value when prompted
```

### List Secrets

```bash
npx wrangler pages secret list --project-name webapp
```

### Delete Secrets

```bash
npx wrangler pages secret delete API_KEY --project-name webapp
```

---

## Custom Domain Setup

### Step 1: Add Custom Domain

1. In Cloudflare Pages project dashboard
2. Go to **"Custom domains"**
3. Click **"Set up a custom domain"**
4. Enter your domain: `generationalinvesting.com`

### Step 2: Update DNS

If your domain is on Cloudflare:
- Cloudflare automatically adds CNAME record
- Wait 5-10 minutes for DNS propagation

If your domain is elsewhere:
- Add CNAME record pointing to `webapp.pages.dev`
- Wait 24-48 hours for DNS propagation

### Step 3: SSL Certificate

Cloudflare automatically provisions SSL certificate (FREE!)
- Usually takes 5-10 minutes
- Your site will be available at `https://yourdomain.com`

---

## Monitoring & Logs

### View Deployment Logs

1. Go to Cloudflare Pages dashboard
2. Click your project: `webapp`
3. Go to **"Deployments"** tab
4. Click any deployment to see build logs

### View Runtime Logs

1. Go to **"Workers & Pages"** → **"your project"**
2. Click **"Logs"** tab
3. Enable **"Begin log stream"**
4. See real-time logs as users access your app

### Analytics

1. In your Pages project dashboard
2. Go to **"Analytics"** tab
3. See:
   - Requests per minute
   - Data transfer
   - Errors
   - Geographic distribution

---

## Troubleshooting

### Build Fails

**Check build logs** in Cloudflare Pages dashboard

Common issues:
```bash
# Missing dependencies
npm install

# TypeScript errors
npm run build

# Wrong Node version (use 18+)
# Set in Cloudflare Pages settings: NODE_VERSION=18
```

### Database Not Found

```bash
# Verify database exists
npx wrangler d1 list

# Check wrangler.jsonc has correct database_id
# Ensure D1 binding is added in Pages settings
```

### Routes Not Working

Check `dist/_routes.json` after build:
```json
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/static/*"]
}
```

### Static Files 404

- Ensure files are in `public/static/` directory
- Check `serveStatic` middleware uses `root: './public'`
- Verify files exist in `dist/static/` after build

---

## Performance & Limits

### Cloudflare Pages Free Tier

- ✅ **Unlimited requests**
- ✅ **Unlimited bandwidth**
- ✅ 500 builds per month
- ✅ 100 custom domains
- ✅ 5 GB storage for D1 (free tier)
- ✅ 5 million D1 reads/day
- ✅ 100,000 D1 writes/day

### Upgrade to Pro ($20/month)

- Increased D1 limits
- Longer build times
- Advanced analytics
- Priority support

---

## Updating Your Deployment

### Method 1: Direct Deploy (No Git)

```bash
cd /home/user/webapp
npm run build
npx wrangler pages deploy dist --project-name webapp
```

### Method 2: Git Push (If using GitHub integration)

```bash
cd /home/user/webapp
git add .
git commit -m "Update features"
git push origin main
# Cloudflare auto-deploys!
```

### Preview Deployments (GitHub only)

Push to any branch:
```bash
git checkout -b feature-new-ui
git push origin feature-new-ui
```

Cloudflare creates preview URL:
```
https://feature-new-ui.webapp.pages.dev
```

---

## Migration from Local Development

Your local dev uses:
- `npx wrangler pages dev dist --local` → local SQLite in `.wrangler/`
- `http://localhost:3000` → local server

Production uses:
- Cloudflare's global D1 database
- `https://webapp.pages.dev` → edge network (instant worldwide!)

**To sync local to production**:
```bash
# 1. Export local data
npx wrangler d1 export webapp-production --local --output=local-data.sql

# 2. Import to production
npx wrangler d1 execute webapp-production --file=local-data.sql
```

---

## Cost Estimate

For a small business app:
- **Month 1-6**: FREE (under limits)
- **Growing**: Still FREE (generous limits)
- **High traffic**: $5-20/month (Pro tier)

**Compare to FastComet**:
- FastComet: $3-10/month + SSL + setup time
- Cloudflare: $0/month + FREE SSL + instant deploys + global CDN

---

## Support

**Cloudflare Community**:
- https://community.cloudflare.com

**Cloudflare Docs**:
- Pages: https://developers.cloudflare.com/pages
- D1: https://developers.cloudflare.com/d1
- Wrangler: https://developers.cloudflare.com/workers/wrangler

**Discord**:
- Cloudflare Developers: https://discord.gg/cloudflaredev

---

## Quick Reference Commands

```bash
# Authentication
npx wrangler whoami

# Database
npx wrangler d1 list
npx wrangler d1 create webapp-production
npx wrangler d1 migrations apply webapp-production
npx wrangler d1 execute webapp-production --command="SELECT * FROM users"

# Deployment
npm run build
npx wrangler pages deploy dist --project-name webapp

# Secrets
npx wrangler pages secret put SECRET_NAME --project-name webapp
npx wrangler pages secret list --project-name webapp

# Logs
npx wrangler tail
```

---

## Next Steps

1. ✅ Setup Cloudflare authentication
2. ✅ Create D1 production database
3. ✅ Update wrangler.jsonc with database_id
4. ✅ Run migrations
5. ✅ Build and deploy
6. ✅ Test your production app!
7. 🎉 Add custom domain (optional)

**Your app is production-ready and will run on Cloudflare's global edge network!**
