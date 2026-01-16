# Generational Investing - Portfolio Management

## Project Overview
- **Name**: Generational Investing Portfolio Management System
- **Goal**: Professional portfolio management platform for tracking investments, trades, and generating tax reports
- **Features**: User authentication, company research tracking, multi-account management, stock & option trading, P/L reporting

## URLs
- **Development**: https://3000-imi5lx8i4w7yx1t3dzzid-18e660f9.sandbox.novita.ai
- **Production**: Will be available after Cloudflare Pages deployment
- **GitHub**: (Repository to be created)

## Demo Account
- **Email**: demo@generationalinvesting.ca
- **Password**: test123

## Key Features

### ✅ Completed Features
1. **User Authentication**
   - Secure registration and login system
   - JWT-based authentication
   - Password hashing with SHA-256
   - User-segregated data access

2. **Company Roster Management**
   - Add, edit, delete company information
   - Track ticker, market cap, exchange, sector, industry
   - Research scoring system (0-100)
   - Anti-fragile scoring system (0-100)
   - "Wonderful Company" designation
   - Next earnings date tracking

3. **Multi-Account Portfolio Tracking**
   - Support for 4 account types: Cash, RESP, RRSP, LIRA
   - Dual currency tracking (CAD/USD)
   - Monthly balance updates
   - Historical balance tracking
   - Aggregated portfolio totals

4. **Stock Trading Management**
   - Buy/Sell trade recording
   - Position tracking (open/closed)
   - Cost basis adjustments for:
     - Dividends received
     - Covered call premiums
     - Selling put premiums
   - Multi-account support

5. **Option Trading Management**
   - Multiple strategy support:
     - Selling Puts (Stockpiling)
     - Buying Puts
     - Covered Calls
     - Credit Spreads
     - Debit Spreads
     - Iron Condors
   - Strike price tracking (up to 4 strikes for complex strategies)
   - Premium and quantity tracking
   - Expiration date management
   - P/L calculation for closed positions

6. **P/L Reporting System**
   - Monthly and yearly profit/loss reports
   - Account-type segregation
   - Strategy-type breakdowns
   - CSV export for Excel
   - Tax-ready reports

7. **Brand Styling**
   - RobPage brand colors:
     - Teal (#004F59) - Primary
     - Gold (#C9B25F) - Accent
     - Gray (#7A7A7A) - Secondary
     - Black (#000000) - Text
   - Avenir font family
   - Modern, professional UI
   - Responsive design

### 📋 Functional Entry Points (API Endpoints)

#### Authentication
- `POST /api/auth/register` - Register new user
  - Body: `{ email, password, name }`
- `POST /api/auth/login` - Login user
  - Body: `{ email, password }`
  - Returns: `{ token, user }`

#### Companies
- `GET /api/companies` - Get all user's companies
- `GET /api/companies/:id` - Get specific company
- `POST /api/companies` - Add new company
- `PUT /api/companies/:id` - Update company
- `DELETE /api/companies/:id` - Delete company

#### Accounts
- `GET /api/accounts` - Get latest account balances
- `GET /api/accounts/history` - Get all historical balances
- `GET /api/accounts/total` - Get total portfolio value
- `POST /api/accounts` - Update account balance

#### Stock Trades
- `GET /api/stocks?open=true/false` - Get stock trades
- `POST /api/stocks` - Add stock trade
- `PUT /api/stocks/:id` - Update stock trade
- `DELETE /api/stocks/:id` - Delete stock trade

#### Option Trades
- `GET /api/options?open=true/false` - Get option trades
- `POST /api/options` - Add option trade
- `PUT /api/options/:id` - Update option trade
- `DELETE /api/options/:id` - Delete option trade

#### Reports
- `GET /api/reports/pl?year=2026&month=1` - Get P/L report
- `GET /api/reports/export?type=stocks&year=2026` - Export CSV

### ⏳ Features Not Yet Implemented
1. **Earnings Date Fetching**
   - Automatic fetching from financial APIs
   - Would require integration with services like:
     - Alpha Vantage API
     - Financial Modeling Prep API
     - Yahoo Finance API
   - Implementation requires API key configuration

## Data Architecture

### Database: Cloudflare D1 (SQLite)

#### Tables Structure

1. **users**
   - id, email, password_hash, name
   - created_at, updated_at

2. **companies**
   - id, user_id, ticker, company_name
   - market_cap, exchange, sector, industry
   - next_earnings_date
   - is_wonderful (boolean)
   - research_score, anti_fragile_score
   - created_at, updated_at

3. **account_balances**
   - id, user_id, account_type
   - balance_cad, balance_usd, cash_balance_usd
   - month, year
   - created_at, updated_at

4. **stock_trades**
   - id, user_id, company_id, ticker
   - trade_type (BUY/SELL)
   - quantity, price, account_type
   - trade_date, is_open (boolean)
   - cost_basis_adjustment, notes
   - created_at, updated_at

5. **option_trades**
   - id, user_id, company_id, ticker
   - strategy_type
   - strike_price (1-4 for multi-leg strategies)
   - premium, quantity, expiration_date
   - account_type, trade_date
   - is_open, close_date, close_price, profit_loss
   - notes, created_at, updated_at

6. **cost_basis_adjustments**
   - id, user_id, stock_trade_id
   - adjustment_type (DIVIDEND, COVERED_CALL, SELLING_PUT)
   - amount, adjustment_date, notes
   - created_at

### Data Flow
1. User authenticates → JWT token generated
2. All API requests include Bearer token
3. Data filtered by user_id automatically
4. Frontend makes AJAX calls to API
5. Backend queries D1 database
6. Results returned as JSON

## User Guide

### Getting Started
1. **Register Account**
   - Click "Register" on login screen
   - Enter name, email, and password
   - Automatic login after registration

2. **Add Companies**
   - Navigate to "Companies" tab
   - Click "Add Company" button
   - Fill in ticker, name, and optional details
   - Mark as "Wonderful" if it meets investment criteria

3. **Track Account Balances**
   - Navigate to "Accounts" tab
   - Click "Update Balances" button
   - Enter month/year and balances for each account type
   - System calculates total portfolio value

4. **Record Stock Trades**
   - Navigate to "Stock Trades" tab
   - Click "Add Trade" button
   - Enter ticker, type (BUY/SELL), quantity, price
   - Select account and trade date
   - Add cost basis adjustments as needed

5. **Manage Option Trades**
   - Navigate to "Options" tab
   - Click "Add Option" button
   - Select strategy type
   - Enter strike prices (1-4 depending on strategy)
   - Enter premium, quantity, and expiration date

6. **Generate Reports**
   - Navigate to "Reports" tab
   - Select year and/or month filters
   - Click "Generate Report" to view P/L
   - Use "Export" buttons to download CSV files

### Cost Basis Tracking
The system helps track cost basis adjustments:
- **Dividends**: Reduces cost basis of holdings
- **Covered Calls**: Premium collected reduces cost basis
- **Selling Puts**: Premium collected for stockpiling strategy

### Multi-Leg Option Strategies
- **Credit/Debit Spreads**: Use strike_price and strike_price_2
- **Iron Condors**: Use all 4 strike_price fields
- System automatically tracks all legs in single record

## Deployment

### Current Status
- ✅ Local Development: Active
- ✅ Database: D1 SQLite (local)
- ⏳ Production: Ready for Cloudflare Pages deployment

### Technology Stack
- **Backend**: Hono 4.11.4 (TypeScript)
- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: HTML5, TailwindCSS 3.x, Vanilla JavaScript
- **HTTP Client**: Axios 1.6.0
- **Icons**: Font Awesome 6.4.0
- **Deployment**: Cloudflare Pages

### Local Development Commands
```bash
# Install dependencies
npm install

# Build application
npm run build

# Start development server (sandbox)
npm run dev:d1

# Database migrations
npm run db:migrate:local
npm run db:seed
npm run db:reset

# Start with PM2
pm2 start ecosystem.config.cjs
pm2 logs webapp --nostream
pm2 restart webapp
pm2 delete webapp

# Git operations
git add .
git commit -m "message"
git push origin main
```

### Production Deployment Steps
1. **Setup Cloudflare API Key**
   ```bash
   # Will be configured via setup_cloudflare_api_key tool
   ```

2. **Create Production D1 Database**
   ```bash
   npx wrangler d1 create webapp-production
   # Update database_id in wrangler.jsonc
   ```

3. **Apply Migrations**
   ```bash
   npm run db:migrate:prod
   ```

4. **Create Cloudflare Pages Project**
   ```bash
   npx wrangler pages project create webapp --production-branch main
   ```

5. **Deploy**
   ```bash
   npm run deploy:prod
   ```

## Recommended Next Steps

### High Priority
1. **Production Deployment**
   - Deploy to Cloudflare Pages
   - Configure production D1 database
   - Set up custom domain

2. **Security Enhancements**
   - Implement proper bcrypt password hashing
   - Add rate limiting
   - Enable HTTPS-only in production
   - Implement CSRF protection

3. **Data Backup**
   - Regular database exports
   - Automated backup system
   - Version control for data

### Medium Priority
4. **Earnings Date API Integration**
   - Integrate with financial data API
   - Add automatic earnings date updates
   - Schedule regular data refreshes

5. **Enhanced Reporting**
   - Charts and visualizations
   - Year-over-year comparisons
   - Performance metrics
   - Tax loss harvesting reports

6. **Mobile Optimization**
   - Responsive design improvements
   - Mobile-first navigation
   - Touch-friendly interfaces

### Low Priority
7. **Advanced Features**
   - Portfolio rebalancing calculator
   - Dividend tracking calendar
   - Alerts for earnings dates
   - Email notifications
   - Data import/export (CSV, JSON)

8. **User Experience**
   - Dark mode
   - Keyboard shortcuts
   - Bulk operations
   - Undo functionality
   - Search and filtering

## Technical Notes

### Authentication
- Simple JWT implementation using Web Crypto API
- Production should use proper JWT library (jose, jsonwebtoken)
- Consider OAuth integration for enhanced security

### Database
- D1 local uses SQLite files in `.wrangler/state/v3/d1`
- Production uses Cloudflare's globally distributed D1
- Migrations ensure schema consistency

### API Design
- RESTful endpoints
- Consistent error responses
- Bearer token authentication
- JSON request/response bodies

### Frontend
- Single-page application (SPA)
- No build process for frontend JS
- CDN-based libraries
- LocalStorage for token persistence

## File Structure
```
webapp/
├── src/
│   ├── index.tsx          # Main Hono application
│   └── renderer.tsx       # JSX renderer
├── public/
│   └── static/
│       ├── app.js         # Frontend JavaScript
│       └── style.css      # Custom CSS
├── migrations/
│   └── 0001_initial_schema.sql
├── .wrangler/             # Local D1 database
├── dist/                  # Build output
├── ecosystem.config.cjs   # PM2 configuration
├── wrangler.jsonc        # Cloudflare configuration
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── vite.config.ts        # Vite build config
├── seed.sql              # Test data
├── .gitignore           # Git ignore rules
└── README.md            # This file
```

## Support & Maintenance

### Database Operations
```bash
# Check data
npm run db:console:local
# Then: SELECT * FROM users;

# Reset database
npm run db:reset

# Manual query
npx wrangler d1 execute webapp-production --local --command="SELECT * FROM companies"
```

### Troubleshooting
1. **Port 3000 in use**: Run `npm run clean-port`
2. **Build errors**: Delete `dist/` and `.wrangler/`, rebuild
3. **Database issues**: Run `npm run db:reset`
4. **PM2 not starting**: Check logs with `pm2 logs webapp`

## License
Proprietary - All rights reserved

## Last Updated
January 16, 2026

---

**Developed with ❤️ using Cloudflare Workers, Hono, and modern web technologies.**
