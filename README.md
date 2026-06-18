# Generational Investing - Portfolio Management

## Project Overview
- **Name**: Generational Investing Portfolio Management System
- **Goal**: Professional portfolio management platform for tracking investments, trades, and generating tax reports
- **Features**: User authentication, company research tracking, multi-account management, stock & option trading, P/L reporting

## URLs
- **Production**: https://app.generationalinvesting.ca
- **Production (Pages.dev)**: https://generational-investing.pages.dev
- **Latest Deploy**: https://6bc99a69.generational-investing.pages.dev
- **Development**: https://3000-imi5lx8i4w7yx1t3dzzid-583b4d74.sandbox.novita.ai
- **GitHub**: https://github.com/gen-inv/generational-investing

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
   - **Strategy Type Tracking** 🆕:
     - **Wheel Strategy**: Track stocks acquired through Wheel trading (sell put → get assigned → sell call)
     - **Stockpiling**: Track stocks for long-term hold strategy
     - Visual badges for Wheel positions with wagon wheel icon
     - Editable strategy types on existing positions
   - **Dividend Detection System** 🆕:
     - **Dividend Repository**: Central database of all dividend data from external APIs
     - **Missing Dividends Detection**: Automatic detection of unrecorded dividends
     - **DIV Badges**: Blue "DIV" badges appear on holdings with missing dividends
     - **Smart Share Calculation**: Uses stock_transactions when available, falls back to stock_holdings.total_shares
     - **Quick-Add Buttons**: One-click recording of missing dividends with withholding tax auto-adjustment
     - **Handles Edge Cases**: Works correctly even when transaction history is incomplete
   - Cost basis adjustments for:
     - Dividends received
     - Covered call premiums (recorded when calls close, not when opened)
     - Selling put premiums
   - Multi-account support

5. **Option Trading Management**
   - Multiple strategy support:
     - Selling Puts (Stockpiling)
     - **Selling Puts (Wheel)** 🆕 - For Wheel strategy entry
     - Buying Puts
     - Covered Calls
     - Credit Spreads
     - Debit Spreads
     - Iron Condors
   - **Stock Assignment Feature** 🆕:
     - Assign stock positions from Short Put options (Wheel and Stockpiling)
     - Automatic option closure with max loss calculation
     - Creates/updates stock holdings with correct strategy type
     - Maintains full transaction audit trail
     - Handles average price calculations for existing positions
   - Strike price tracking (up to 4 strikes for complex strategies)
   - Premium and quantity tracking
   - Expiration date management
   - P/L calculation for closed positions

6. **Daily Trades (0DTE SPX Trading)** ✨ NEW
   - Zero Days to Expiration (0DTE) option trading for SPX
   - Strategy types:
     - Iron Condor (most common)
     - Credit Spread
     - Debit Spread  
     - Butterfly
     - Other custom strategies
   - Real-time trade entry with SPX/VIX prices
   - Exit tracking with profit/loss calculation
   - Performance statistics:
     - Daily and rolling P/L
     - Win rate analysis
     - Day-of-week performance
     - Cumulative return charts
   - **Advanced Position Sizing** 🆕:
     - Master toggle for calculated position sizing
     - Two sizing methods:
       - **Profit-Based**: Calculates contracts based on rolling profit window
       - **Account-Based**: Calculates contracts based on % of account balance
     - Both methods respect max contract limit
     - Configurable parameters per method
   - Configuration management:
     - Risk parameters (max contracts, profit windows, max loss %)
     - Entry rules (premium range, delta, strike width)
     - Exit rules (profit target, ATM limit, time exit)
     - Default account selection

7. **P/L Reporting System**
   - Monthly and yearly profit/loss reports
   - Account-type segregation
   - Strategy-type breakdowns
   - CSV export for Excel
   - Tax-ready reports

8. **Reports Dashboard** ✨ NEW
   - **P/L Summary**: Detailed profit/loss breakdown by asset type, account type, and time periods (MTD, QTD, YTD, Last 12 Months, All Time)
     - **Includes Dividends**: All P/L calculations now integrate dividend income
   - **Performance Analysis**: Portfolio growth tracking with comprehensive performance metrics:
     - **Portfolio Growth Chart**: Cumulative P/L with peak tracking over time
     - **Drawdown Analysis**: Visual drawdown chart with max drawdown, longest drawdown duration, and recovery metrics
     - **Rolling Returns**: 30-day rolling return chart showing performance consistency
     - **Monthly Returns Table**: Detailed month-by-month breakdown with trade counts
     - **Key Metrics**: Total return, volatility (annualized), Sharpe ratio, max drawdown
     - Time periods: YTD, 1 Year, 3 Years, All Time
     - **Includes Dividends**: Dividend income affects all performance calculations
   - **Strategy Analysis**: Performance comparison across different trading strategies with:
     - Total return percentage and Sharpe ratio
     - Maximum drawdown tracking
     - Win rate analysis by strategy
     - Strategy-specific P/L charts
     - Monthly heatmap of profit/loss
     - Benchmark comparison (placeholder for SPY/QQQ)
   - **Position Analysis**: Portfolio composition and concentration metrics:
     - **Top Holdings Table**: Ranked list of top 10 positions with weight bars
     - **Sector Allocation**: Donut chart and detailed breakdown by sector
     - **Industry Breakdown**: Top 10 industries with position counts
     - **Account Allocation**: Distribution across account types
     - **Concentration Metrics**: Top 5/10 concentration, HHI score, diversification score
     - **Risk Indicators**: Largest position size, average position weight
   - **Dividends Report** 🆕:
     - **Group By Account**: View total dividends by investment account (TFSA, RRSP, Cash, LIRA)
     - **Group By Stock**: View total dividends by stock ticker
     - **Period Filtering**: MTD (Month-to-Date), YTD (Year-to-Date), All Time
     - **Summary Metrics**: Total dividends, payment count
     - **Detailed Table**: Sortable view with dividend counts and totals
     - **Gold-themed UI**: Brand-consistent design with coins icon
   - **Monthly Income Report** ✨ NEW:
     - **Comprehensive Income Tracking**: All income sources for a selected month organized by strategy
     - **Stock Investments Section**:
       - Dividend ETFs: Closed P/L, Covered Calls, Dividends (by ticker)
       - Stockpiling: Closed P/L, Covered Calls, Dividends (by ticker)
       - Wheel Strategy: Closed P/L, Covered Calls, Dividends (by ticker)
     - **Option Trades Section**:
       - Short Puts (Wheel): Closed P/L by ticker
       - Short Puts (Stockpiling): Closed P/L by ticker
       - Short Puts (Long Term): Closed P/L by ticker
       - 0DTE SPX Trades: Total P/L and trade count (no ticker breakdown)
     - **Month/Year Selector**: Choose any month from last 5 years
     - **Strategy Totals**: Subtotals for each strategy with ticker-level detail
     - **Grand Total**: Total monthly income across all sources
     - **Color-Coded Results**: Green for profits, red for losses
     - **Empty State Handling**: Shows "No activity" for strategies with no trades
   - Interactive ApexCharts visualizations
   - Real-time metrics and performance indicators

9. **Brand Styling**
   - RobPage brand colors:
     - Teal (#004F59) - Primary
     - Gold (#C9B25F) - Accent
     - Gray (#7A7A7A) - Secondary
     - Black (#000000) - Text
   - Avenir font family
   - Modern, professional UI
   - Responsive design

10. **Research Integration** 🆕
   - **Fetch Financials Button**: Intelligent button in Company Details modal
   - **Automatic CIK Lookup**: Pre-seeded database with 50+ popular US stock CIKs
   - **SEC EDGAR Integration**: Fetches 10-year financial data (Income Statement, Balance Sheet, Cash Flow)
   - **Full-Screen Research Modal**: Displays comprehensive financial data with tabbed interface
   - **Clean Error Handling**: Gracefully handles missing data without console errors
   - **Button States**: 
     - Amber "Fetch Financials" (not fetched yet)
     - Green "Fetched Successfully!" (after successful fetch)
     - Blue "View Financials" (already fetched, instant view)
   - **Status Icons**: Visual indicators for data availability
   - **Research Site**: https://research-e79.pages.dev

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
- `POST /api/options/:id/assign` - Assign stock position from Short Put option
  - Body: `{ assignment_date, notes }`
  - Closes option with $0 close price (max loss)
  - Creates/updates stock_holdings with strategy_type (WHEEL/STOCKPILING)
  - Creates stock_transaction record
  - Returns: `{ success, shares, price, strategy_type }`

#### Daily Trades (0DTE)
- `GET /api/daily-trades` - Get all daily trades
  - Query params: `date=YYYY-MM-DD`, `is_open=true/false`
- `GET /api/daily-trades/today` - Get today's trades
- `GET /api/daily-trades/stats?period=rolling` - Get trade statistics
  - Periods: `rolling`, `month`, `year`, `all`
  - Query param: `limit=50` (for rolling)
- `GET /api/daily-trades/day-stats` - Get day-of-week statistics
- `GET /api/daily-trades/chart-data?period=rolling&limit=50` - Get chart data
- `POST /api/daily-trades` - Create new daily trade
- `PUT /api/daily-trades/:id` - Update daily trade
- `PUT /api/daily-trades/:id/close` - Close daily trade
- `DELETE /api/daily-trades/:id` - Delete daily trade

#### Daily Trade Configuration
- `GET /api/daily-trade/config` - Get user's configuration
- `POST /api/daily-trade/config` - Save configuration
  - Body includes: `max_contract_limit`, `rolling_profit_window`, `enable_position_sizing`, `position_sizing_type`, `account_max_loss_percent`, `target_premium_min/max`, `strike_width`, etc.
- `POST /api/daily-trade/config/reset` - Reset to defaults

#### Reports
- `GET /api/reports/pl?year=2026&month=1` - Get P/L report
- `GET /api/reports/pl-summary?period=ytd` - Get P/L Summary with breakdowns (includes dividends)
- `GET /api/reports/performance?period=ytd` - Get Performance Analysis with portfolio growth and drawdown metrics (includes dividends)
- `GET /api/reports/strategy-analysis?period=ytd` - Get Strategy Analysis with performance metrics
- `GET /api/reports/positions` - Get Position Analysis with holdings, sector allocation, and concentration
- `GET /api/reports/dividends?groupBy=account&period=ytd` - Get Dividends Report
  - Group by: `account` or `stock`
  - Period: `mtd`, `ytd`, or `all`
  - Returns: Total dividends, payment counts, detailed breakdown
- `GET /api/reports/monthly-income?year=2026&month=1` - Get Monthly Income Report ✨ NEW
  - Query params: `year` (YYYY), `month` (1-12)
  - Returns: Comprehensive income breakdown by strategy:
    - Stock Investments: Dividend ETFs, Stockpiling, Wheel (each with closed P/L, covered calls, dividends by ticker)
    - Option Trades: Short Puts (3 strategies) by ticker, 0DTE SPX total
  - All amounts include ticker-level detail except 0DTE trades
- `GET /api/reports/export?type=stocks&year=2026` - Export CSV

### 🔄 Features Ready for Implementation (See COMPLETE_IMPLEMENTATION_SPEC.md)

**Complete specification document with exact code is available in `/home/user/webapp/COMPLETE_IMPLEMENTATION_SPEC.md`**

The following features are fully specified and ready to implement:

1. **Individual Account Management** (Phase 1)
   - Create named accounts linked to account types (e.g., "RRSP - Questrade")
   - CRUD operations for accounts
   - Account-specific balances (CAD/USD + Cash)
   - Link trades to specific accounts instead of account types

2. **Strategy-Specific Option Trades** (Phase 2)
   - Dynamic forms showing relevant fields per strategy
   - Proper strike terminology: short_strike, long_strike, spread_width
   - Field validation for each strategy type
   - Improved display of multi-leg strategies

3. **Covered Calls in Stock Details** (Phase 3)
   - Move covered calls from main options form to stock details page
   - Only allow when holding stock positions
   - Quantity validation (max contracts = shares / 100)
   - Automatic cost basis adjustment

4. **Earnings Date Auto-Fetch** (Phase 4)
   - Button to fetch earnings date from Alpha Vantage API
   - Free tier support (25 requests/day)
   - Automatic next_earnings_date updates
   - Rate limiting and error handling

5. **Enhanced P/L Reporting** (Phase 5)
   - P/L by strategy type with win rates
   - P/L by month with YTD summary
   - P/L by account comparison
   - CSV export functionality
   - Detailed performance metrics

6. **Portfolio History Graph** (Phase 6)
   - Interactive Chart.js visualization
   - 1-Year and All-Time toggle views
   - Branded teal/gold colors
   - Hover tooltips with formatted values

**Implementation Guide:**
- See `IMPLEMENTATION_SUMMARY.md` for session-by-session roadmap
- See `COMPLETE_IMPLEMENTATION_SPEC.md` for exact code to implement
- Estimated total: 13-18 hours across 5 sessions
- Each phase is independent and can be implemented separately

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

4. **stock_trades** (Legacy - deprecated for new trades)
   - id, user_id, company_id, ticker
   - trade_type (BUY/SELL)
   - quantity, price, account_type
   - trade_date, is_open (boolean)
   - cost_basis_adjustment, notes
   - created_at, updated_at
   
5. **stock_holdings** (Current - used for Position Analysis)
   - id, user_id, company_id, ticker, account_id
   - total_shares, average_price
   - **strategy_type** (WHEEL/STOCKPILING) 🆕
   - is_open (boolean), opened_date, closed_date
   - notes, created_at, updated_at
   - UNIQUE(user_id, ticker, account_id, is_open)

6. **stock_transactions** (Individual buy/sell transactions)
   - id, user_id, holding_id
   - transaction_type (BUY/SELL)
   - shares, price_per_share, transaction_date
   - commission, notes, created_at

7. **option_trades**
   - id, user_id, company_id, ticker
   - strategy_type
   - strike_price (1-4 for multi-leg strategies)
   - premium, quantity, expiration_date
   - account_type, trade_date
   - is_open, close_date, close_price, profit_loss
   - notes, created_at, updated_at

8. **cost_basis_adjustments**
   - id, user_id, holding_id (references stock_holdings)
   - adjustment_type (DIVIDEND, COVERED_CALL, SELLING_PUT)
   - amount, adjustment_date, notes
   - created_at

9. **accounts**
   - id, user_id, account_name, account_type
   - created_at, updated_at
   - Account types: Cash, TFSA, RRSP, LIRA

10. **daily_trades**
    - id, user_id, account_id, trade_date
    - profit_loss, notes
    - created_at

### Stock Position Management Architecture

**The application uses a two-table system for stock positions:**

**1. `stock_holdings` - Aggregate Position Table**
- Stores the current state of each stock position
- One row per ticker per account (e.g., AAPL in RRSP, AAPL in TFSA = 2 rows)
- Automatically calculates:
  - `total_shares`: Sum of all BUY minus all SELL transactions
  - `average_price`: Weighted average price of all BUY transactions
  - `is_open`: 1 if position is open, 0 if closed
- Updated automatically when transactions are added
- Used by: Dashboard, Position Analysis, Portfolio Overview

**2. `stock_transactions` - Transaction History Table**
- Stores every individual BUY/SELL transaction
- Multiple rows per holding (transaction history)
- Links to `stock_holdings` via `holding_id` foreign key
- Contains: shares, price_per_share, commission, transaction_date
- Used for: P/L calculation, transaction history, audit trail

**How It Works:**

```
User adds a BUY transaction:
1. Check if holding exists for this ticker+account
2. If YES: Update total_shares and average_price in stock_holdings
3. If NO: Create new row in stock_holdings
4. Always: Create transaction record in stock_transactions

User adds a SELL transaction:
1. Reduce total_shares in stock_holdings
2. If total_shares reaches 0: Set is_open = 0, closed_date = today
3. Create SELL transaction record in stock_transactions

P/L Calculation (for closed positions):
1. Get all BUY transactions: Sum(shares * price_per_share) + Sum(commissions)
2. Get all SELL transactions: Sum(shares * price_per_share) - Sum(commissions)
3. P/L = Total SELL proceeds - Total BUY cost - All commissions
```

**Legacy `stock_trades` Table:**
- Deprecated for new functionality
- Used only for backward compatibility
- Contains flat BUY/SELL records with no aggregation
- Being phased out in favor of holdings+transactions model

### Stock Position Management Modal 🆕

**Comprehensive position details with enhanced cost basis tracking:**

The Position Management Modal provides a complete view of each stock position with the following sections:

**1. Header with Strategy Badge**
- Displays ticker symbol
- Shows strategy type badge:
  - **Wheel Strategy**: Purple badge with wagon wheel icon (🎯)
  - **Stockpiling**: Gray badge with "Stockpiling" text
  - No badge for legacy positions without strategy type

**2. Position Summary**
- Current shares held
- Average price per share
- **Cost basis per share** (average price minus ALL adjustments)
  - **Dynamically calculated** from all cost basis adjustment sources:
    - Assignment premiums (from assigned short puts)
    - Dividend payments received
    - Covered call premiums collected
  - Formula: `Cost Basis = Avg Price - (Total Adjustments / Shares)`
- Total cost basis adjustments (sum of ALL adjustment types)
- Account name and opened date
- Target buy price (if set)
- Position notes

**3. Share Ownership History**
- Complete BUY/SELL transaction history
- Date, type, shares, price, total for each transaction
- Status (Open/Closed) for each transaction
- Useful for reviewing position building over time

**4. Covered Call History**
- All covered calls written against this position
- Strike price, expiration, premium collected
- Days until expiration warnings
- Closed P/L for expired/closed calls
- Actions: Edit, Close, View Details

**5. Dividend History**
- **Missing Dividends Detection**: Compares position to dividend repository
  - Shows dividends you likely received but haven't recorded
  - Quick-add buttons to record missing dividends
  - Automatic withholding tax adjustments for CASH/TFSA accounts
- **Recorded Dividends**: All dividend payments recorded for this position
  - Date, amount, per-share calculation
  - Notes for each dividend

**6. Assignment History** 🆕
- **Only shown if stock was acquired via option assignment**
- Shows premium credits from assigned short put options:
  - Assignment date
  - Premium credit amount
  - Details (original option info in notes)
- **Multiple assignments supported**: All assignment premiums listed
- **Total premium credits** displayed at bottom
- Amber-themed section for clear visual distinction
- Explains how premium collected reduces your cost basis
- Note: Dividends appear in Dividend History, Covered Calls in their own section

**Cost Basis Calculation Example:**
```
Scenario: Wheel Strategy Entry
1. Sell Put: Strike $50, Premium $2.00, 1 contract (Commission: $0.50)
2. Option assigned → Buy 100 shares @ $50

Cost Basis Calculation:
- Purchase Price: $50.00/share
- Gross Premium: $2.00 × 1 × 100 = $200.00
- Commission Paid: $0.50
- Net Proceeds: $200.00 - $0.50 = $199.50
- Premium per Share: $199.50 ÷ 100 = $1.995
- Adjusted Cost Basis: $50.00 - $1.995 = $48.01/share

Position Summary Shows:
- Avg Price: $50.00
- Cost Basis: $48.01 ← Your effective entry price!
- CB Adjustments: -$199.50

Assignment History Shows:
- Assignment Date: 2/16/24
- Premium Credit: $199.50 (net proceeds after commission)
- Details: Strike $50, Premium $2.00, 1 contract

Note: The modal dynamically calculates Cost Basis from ALL sources:
- Assignment premiums (SELLING_PUT adjustments)
- Dividend payments (DIVIDEND adjustments)
- Covered call premiums (COVERED_CALL adjustments)
This ensures the displayed cost basis always reflects your true effective entry price.
```

**Actions Available:**
- Add to Position (buy more shares)
- Edit Trade (change quantity, price, strategy type)
- Sell from Position (partial or full sale)
- Record Dividend
- Initiate Covered Call
- Close Position

**API Endpoints:**
- `GET /api/stocks/:id/dividends` - Recorded dividends
- `GET /api/stocks/:id/missing-dividends` - Missing dividend detection
- `GET /api/stocks/:id/covered-calls` - Covered call history
- `GET /api/stocks/:id/purchase-history` - Transaction history
- `GET /api/stocks/:id/cost-basis-adjustments` - All cost basis adjustments (filtered for assignments in UI) 🆕

### Options Trade Details Modal 🆕

**Comprehensive option trade details with consistent design:**

The Options Trade Details Modal provides complete information about each option trade, matching the design language of the Stock Position Management Modal.

**1. Header with Strategy Badge**
- Displays ticker symbol
- Shows strategy type badge with consistent visual design:
  - **Wheel (SELLING_PUT_WHEEL)**: Purple badge with dharma wheel icon 🎯
  - **Stockpiling (SELLING_PUT)**: Gray badge with "Stockpiling" text
  - **Covered Call**: Green badge with umbrella icon ☂️
  - **Spreads (Credit/Debit)**: Blue badge with arrows icon ↔️
  - **Iron Condor**: Indigo badge with layers icon 📚
  - **Long Call/Put**: Standard display (no special badge)
- Followed by "- Trade Details" label

**2. Position Summary**
- Ticker symbol and current status (OPEN/CLOSED)
- Account name and trade date
- Trade metrics grid:
  - **Trade Date**: Opening date
  - **Contracts**: Number of contracts (1 contract = 100 shares)
  - **Expiration**: Expiration date with DTE (Days to Expiration)
  - **Original DTE**: Days to expiration at trade entry
- Financial information:
  - **Account**: Account name and type
  - **Open Commission**: Commission paid to open
  - **Profit/Loss**: Realized P/L if closed
- Close information (if applicable):
  - Close date and close commission
- Trade notes (if any)

**3. Position Details**
Renders leg-specific information based on strategy complexity:

**Single Leg Strategies** (Selling Put, Covered Call, Long Call/Put):
- Strike Price
- Premium per Share
- Total Premium (contracts × premium × 100)
- Close Price (if closed)

**Two Leg Strategies** (Credit/Debit Spreads):
- **Short Leg**: Strike, premium collected, total
- **Long Leg**: Strike, premium paid, total
- **Net Credit/Debit**: Overall position cost
- **Spread Width**: Difference between strikes
- **Max Profit/Loss**: Risk metrics

**Four Leg Strategies** (Iron Condor):
- **Put Credit Spread**: Short/long strikes and premiums
- **Call Credit Spread**: Short/long strikes and premiums
- **Net Credit**: Total premium collected
- **Max Loss**: Risk if breached on either side

**Actions Available:**
- Edit Trade (change details)
- Add To Position (buy more contracts)
- Reduce From Position (sell some contracts)
- Assign Stock Position (for short puts - Wheel/Stockpiling only)
- Close Position (exit the trade)

**Design Consistency:**
- Header gradient: Purple (matches option theme)
- Strategy badges: Same style as Stock modal
- Layout: Same sidebar + main content structure
- Typography: Consistent font sizes and weights
- Information hierarchy: Same pattern of summary → details

**API Endpoints:**
- `GET /api/options` - All option trades
- `GET /api/options/:id` - Single option details
- `POST /api/options/:id/assign` - Assign stock from short put

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

## Implementation Plan

### Immediate Next Steps (v1.1 - Ready to Implement)

**All code ready in `COMPLETE_IMPLEMENTATION_SPEC.md` - Just copy & paste!**

1. **Session 1: Account Management** (2-3 hours)
   - Implement individual accounts (e.g., "RRSP - Questrade")
   - Account CRUD operations
   - Link trades to specific accounts
   - Update forms to use account dropdowns

2. **Session 2: Option Trades Refactor** (2-3 hours)
   - Strategy-specific form fields
   - Proper strike terminology (short/long strikes, spread width)
   - Field validation per strategy
   - Enhanced trade display

3. **Session 3: Covered Calls** (1-2 hours)
   - Move to stock details page
   - Quantity validation
   - Cost basis integration
   - Remove from main options form

4. **Session 4: Earnings & Reports** (2-3 hours)
   - Alpha Vantage API integration
   - Auto-fetch earnings dates
   - Enhanced P/L reports
   - CSV export

5. **Session 5: Chart & Deploy** (2 hours)
   - Portfolio history chart
   - Full system testing
   - Deploy to production

### Future Enhancements (Post v1.1)

**High Priority**
- Production deployment to Cloudflare Pages
- Security enhancements (bcrypt, rate limiting, CSRF)
- Data backup and export system
- Real historical balance tracking

**Medium Priority**
- Mobile optimization
- Advanced analytics (Sharpe ratio, max drawdown)
- Tax reporting features
- Email notifications

**Low Priority**
- Dark mode
- Keyboard shortcuts
- Portfolio rebalancing calculator
- Dividend tracking calendar

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
│   ├── auth.ts            # Authentication helpers (MySQL version)
│   ├── db.ts              # Database connection (MySQL version)
│   └── renderer.tsx       # JSX renderer
├── public/
│   └── static/
│       ├── app.js         # Frontend JavaScript
│       └── style.css      # Custom CSS
├── migrations/
│   ├── 0001_initial_schema.sql        # Initial tables
│   └── 0002_add_accounts_and_strikes.sql  # v1.1 updates (applied)
├── .wrangler/             # Local D1 database
├── dist/                  # Build output
├── ecosystem.config.cjs   # PM2 configuration
├── wrangler.jsonc        # Cloudflare configuration
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── vite.config.ts        # Vite build config
├── seed.sql              # Test data
├── .gitignore           # Git ignore rules
├── .env.example         # Environment variables template
├── README.md            # This file
├── COMPLETE_IMPLEMENTATION_SPEC.md  # ⭐ Full v1.1 specification
├── IMPLEMENTATION_SUMMARY.md        # Quick roadmap
├── DEPLOYMENT_OPTIONS.md           # Cloudflare vs FastComet guide
└── FASTCOMET_DEPLOYMENT_GUIDE.md  # MySQL migration guide
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
June 18, 2026

## Recent Updates
- **June 18, 2026**: Fixed closed stock trade editing - backfilled 30 SELL transactions so close details display properly
- **June 18, 2026**: Fixed dividend detection logic - DIV badges and missing dividends now work with empty stock_transactions table
- **June 18, 2026**: Covered call cost basis adjustments now recorded only when closed (not when opened)
- **June 18, 2026**: Backfilled 37 closed covered calls with cost basis adjustments ($41,541.24 total)
- **June 16, 2026**: Added Wheel trading strategy with stock assignment from Short Put options
- **June 15, 2026**: Fixed closed stock trade editing modal to show profit/loss and trade summary
- **April 2, 2026**: Dashboard YTD P/L calculation aligned with Reports P/L Summary

## Project Status
- ✅ v1.0 Complete - Core features implemented and tested
- ✅ v1.2 Complete - Reports Dashboard with P/L Summary and Strategy Analysis
- ✅ v1.4 Complete - Dividend Repository Edit Feature ✨ NEW
  - **Edit Modal**: Comprehensive dividend entry editing with validation
  - **Editable Fields**: Ex-date, pay date, record date, declared date, amount, frequency
  - **API Endpoints**: GET and PUT /api/dividend-repository/:id
  - **Use Cases**: Fix missing pay dates, correct amounts, adjust frequency
  - **See**: DIVIDEND_EDIT_FEATURE.md
- ✅ v1.3 Complete - Dividend Repository with Dual-API Integration
  - **Polygon.io (Massive)**: Primary API for US stocks (250 requests/day)
  - **EODHD**: Automatic fallback for Canadian stocks (.TO, .V)
  - **Coverage**: 100% portfolio (14 unique tickers: 13 US + 1 Canadian)
  - **Automation**: ✅ **Weekly via cron-job.org every Sunday 10:30 PM MST**
  - **Rate Limiting**: 12.5 second delay between tickers (optimized buffer)
  - **See**: DUAL_API_IMPLEMENTATION.md, CRON_PRODUCTION_CONFIG.md
- 📋 v1.1 Specification Ready - See COMPLETE_IMPLEMENTATION_SPEC.md
- 🚀 Ready for multi-session implementation

---

**Developed with ❤️ using Cloudflare Workers, Hono, and modern web technologies.**
