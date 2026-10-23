import { Hono } from 'hono'
import { fetchCompanyData } from '../lib/company-data'
import { authMiddleware } from '../lib/auth'
import type { Bindings } from '../types'

export const routes = new Hono<{ Bindings: Bindings }>()

// ============================================================================
// FRONTEND ROUTES
// ============================================================================

routes.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Generational Investing - Portfolio Management</title>
        <link rel="icon" type="image/png" href="/static/logo.png">
        <link rel="shortcut icon" type="image/png" href="/static/logo.png">
        <link rel="apple-touch-icon" href="/static/logo.png">
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/apexcharts@3.45.1/dist/apexcharts.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.min.js"></script>
        <style>
            :root {
                --teal: #004F59;
                --gold: #C9B25F;
                --gray: #7A7A7A;
                --black: #000000;
            }
            body {
                font-family: 'Avenir', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            .bg-brand-teal { background-color: var(--teal); }
            .bg-brand-gold { background-color: var(--gold); }
            .text-brand-teal { color: var(--teal); }
            .text-brand-gold { color: var(--gold); }
            .border-brand-teal { border-color: var(--teal); }
            .border-brand-gold { border-color: var(--gold); }
            .btn-primary {
                background-color: var(--teal);
                color: white;
                padding: 0.75rem 1.5rem;
                border-radius: 0.5rem;
                font-weight: 600;
                transition: all 0.2s;
            }
            .btn-primary:hover {
                background-color: #003940;
            }
            .btn-secondary {
                background-color: var(--gold);
                color: white;
                padding: 0.75rem 1.5rem;
                border-radius: 0.5rem;
                font-weight: 600;
                transition: all 0.2s;
            }
            .btn-secondary:hover {
                background-color: #b39d50;
            }
            .card {
                background: white;
                border-radius: 0.75rem;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                padding: 1.5rem;
            }
            .nav-link {
                color: white;
                padding: 0.5rem 1rem;
                border-radius: 0.5rem;
                transition: all 0.2s;
            }
            .nav-link:hover, .nav-link.active {
                background-color: rgba(255, 255, 255, 0.1);
            }
            .utility-tab.active {
                color: var(--teal);
                border-bottom-color: var(--teal);
            }
            .portfolio-timeframe-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .hidden { display: none; }
            
            /* Research Notes Tab Styles */
            .note-chevron {
                transition: transform 0.3s ease;
            }
            .rotate-180 {
                transform: rotate(180deg);
            }
            .line-clamp-2 {
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }
            
            /* Prose styling for markdown content */
            .prose {
                color: #374151;
                max-width: 65ch;
            }
            .prose h1 {
                font-size: 1.875rem;
                font-weight: 700;
                margin-top: 0;
                margin-bottom: 1rem;
                color: #111827;
            }
            .prose h2 {
                font-size: 1.5rem;
                font-weight: 600;
                margin-top: 2rem;
                margin-bottom: 1rem;
                color: #111827;
            }
            .prose h3 {
                font-size: 1.25rem;
                font-weight: 600;
                margin-top: 1.5rem;
                margin-bottom: 0.75rem;
                color: #111827;
            }
            .prose p {
                margin-top: 0.75rem;
                margin-bottom: 0.75rem;
                line-height: 1.75;
            }
            .prose ul, .prose ol {
                margin-top: 0.75rem;
                margin-bottom: 0.75rem;
                padding-left: 1.5rem;
            }
            .prose li {
                margin-top: 0.5rem;
                margin-bottom: 0.5rem;
            }
            .prose code {
                background-color: #f3f4f6;
                padding: 0.125rem 0.25rem;
                border-radius: 0.25rem;
                font-size: 0.875em;
            }
            .prose pre {
                background-color: #1f2937;
                color: #f3f4f6;
                padding: 1rem;
                border-radius: 0.5rem;
                overflow-x: auto;
                margin-top: 1rem;
                margin-bottom: 1rem;
            }
            .prose pre code {
                background-color: transparent;
                padding: 0;
                color: inherit;
            }
            .prose table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 1rem;
                margin-bottom: 1rem;
            }
            .prose th {
                background-color: #f3f4f6;
                padding: 0.5rem;
                text-align: left;
                font-weight: 600;
                border: 1px solid #d1d5db;
            }
            .prose td {
                padding: 0.5rem;
                border: 1px solid #d1d5db;
            }
            .prose blockquote {
                border-left: 4px solid #004F59;
                padding-left: 1rem;
                margin-left: 0;
                margin-right: 0;
                font-style: italic;
                color: #6b7280;
            }
            .prose a {
                color: #004F59;
                text-decoration: underline;
            }
            .prose a:hover {
                color: #003940;
            }
            .prose strong {
                font-weight: 600;
                color: #111827;
            }
            .prose em {
                font-style: italic;
            }
            .prose hr {
                margin-top: 2rem;
                margin-bottom: 2rem;
                border: 0;
                border-top: 1px solid #d1d5db;
            }
        </style>
    </head>
    <body class="bg-gray-50">
        <div id="app">
            <!-- Login/Register Screen -->
            <div id="auth-screen" class="min-h-screen bg-brand-teal flex items-center justify-center p-4">
                <div class="card max-w-md w-full">
                    <div class="text-center mb-8">
                        <h1 class="text-4xl font-bold text-brand-teal mb-2">Generational Investing</h1>
                        <p class="text-brand-gold text-lg">Portfolio Management</p>
                    </div>
                    
                    <div id="login-form">
                        <h2 class="text-2xl font-bold text-brand-teal mb-6">Login</h2>
                        <form id="loginForm">
                            <div class="mb-4">
                                <label class="block text-gray-700 mb-2">Email</label>
                                <input type="email" name="email" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-brand-teal" required>
                            </div>
                            <div class="mb-6">
                                <label class="block text-gray-700 mb-2">Password</label>
                                <input type="password" name="password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-brand-teal" required>
                            </div>
                            <button type="submit" class="btn-primary w-full">Login</button>
                        </form>
                        <p class="text-center mt-4 text-gray-600">
                            Don't have an account? <a href="#" onclick="showRegister()" class="text-brand-teal font-semibold">Register</a>
                        </p>
                        <p class="text-center mt-2 text-sm text-gray-500">
                            Demo: demo@generationalinvesting.ca / test123
                        </p>
                    </div>
                    
                    <div id="register-form" class="hidden">
                        <h2 class="text-2xl font-bold text-brand-teal mb-6">Register</h2>
                        <form id="registerForm">
                            <div class="mb-4">
                                <label class="block text-gray-700 mb-2">Name</label>
                                <input type="text" name="name" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-brand-teal" required>
                            </div>
                            <div class="mb-4">
                                <label class="block text-gray-700 mb-2">Email</label>
                                <input type="email" name="email" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-brand-teal" required>
                            </div>
                            <div class="mb-6">
                                <label class="block text-gray-700 mb-2">Password</label>
                                <input type="password" name="password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-brand-teal" required>
                            </div>
                            <button type="submit" class="btn-primary w-full">Register</button>
                        </form>
                        <p class="text-center mt-4 text-gray-600">
                            Already have an account? <a href="#" onclick="showLogin()" class="text-brand-teal font-semibold">Login</a>
                        </p>
                    </div>
                </div>
            </div>
            
            <!-- Main Application -->
            <div id="main-app" class="hidden">
                <!-- Navigation -->
                <nav class="bg-brand-teal text-white p-4 shadow-lg">
                    <div class="container mx-auto flex justify-between items-center">
                        <div>
                            <h1 class="text-2xl font-bold">Generational Investing</h1>
                            <p class="text-brand-gold text-sm">Portfolio Management</p>
                        </div>
                        <div class="flex gap-4 items-center">
                            <a href="#" onclick="showSection('dashboard')" class="nav-link active" data-section="dashboard">
                                <i class="fas fa-chart-line mr-2"></i>Dashboard
                            </a>
                            <a href="#" onclick="showSection('companies')" class="nav-link" data-section="companies">
                                <i class="fas fa-building mr-2"></i>Companies
                            </a>
                            <a href="#" onclick="showSection('accounts')" class="nav-link" data-section="accounts">
                                <i class="fas fa-wallet mr-2"></i>Accounts
                            </a>
                            <a href="#" onclick="showSection('stocks')" class="nav-link" data-section="stocks">
                                <i class="fas fa-chart-bar mr-2"></i>Stock Trades
                            </a>
                            <a href="#" onclick="showSection('options')" class="nav-link" data-section="options">
                                <i class="fas fa-layer-group mr-2"></i>Options Trades
                            </a>
                            <a href="#" onclick="showSection('daily-trade')" class="nav-link" data-section="daily-trade">
                                <i class="fas fa-chart-line mr-2 text-orange-400"></i>0DTE SPX
                            </a>
                            <a href="#" onclick="showSection('utilities')" class="nav-link" data-section="utilities">
                                <i class="fas fa-tools mr-2"></i>Utilities
                            </a>
                            <a href="#" onclick="showSection('reports')" class="nav-link" data-section="reports">
                                <i class="fas fa-file-alt mr-2"></i>Reports
                            </a>
                            
                            <!-- User Profile Dropdown -->
                            <div class="relative" id="user-menu-container">
                                <button onclick="toggleUserMenu()" class="flex items-center gap-2 text-white hover:text-brand-gold transition-colors">
                                    <i class="fas fa-user-circle text-2xl"></i>
                                    <span id="user-name-display" class="text-sm"></span>
                                    <i class="fas fa-chevron-down text-xs"></i>
                                </button>
                                
                                <!-- Dropdown Menu -->
                                <div id="user-dropdown" class="hidden absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
                                    <div class="px-4 py-2 border-b border-gray-200">
                                        <p class="text-sm font-semibold text-gray-900" id="user-email-display"></p>
                                        <p class="text-xs text-gray-500">Account Settings</p>
                                    </div>
                                    <a href="#" onclick="showProfileModal(); return false;" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        <i class="fas fa-user-edit mr-2"></i>Edit Profile
                                    </a>
                                    <a href="#" onclick="showPasswordModal(); return false;" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        <i class="fas fa-key mr-2"></i>Change Password
                                    </a>
                                    <div class="border-t border-gray-200 my-1"></div>
                                    <a href="#" onclick="logout(); return false;" class="block px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                                        <i class="fas fa-sign-out-alt mr-2"></i>Logout
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </nav>
                
                <!-- Content Area -->
                <div class="container mx-auto p-6">
                    <!-- Dashboard Section -->
                    <div id="dashboard-section" class="section">
                        <h2 class="text-3xl font-bold text-brand-teal mb-6">Dashboard</h2>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                            <div class="card">
                                <h3 class="text-lg font-semibold text-gray-700 mb-2">Total Portfolio (CAD)</h3>
                                <p class="text-3xl font-bold text-brand-teal" id="total-cad">$0.00</p>
                                <p class="text-xs text-gray-500 italic mt-1" id="exchange-rate-display"></p>
                            </div>
                            <div class="card">
                                <h3 class="text-lg font-semibold text-gray-700 mb-2">Total Portfolio (USD)</h3>
                                <p class="text-3xl font-bold text-brand-gold" id="total-usd">$0.00</p>
                            </div>
                            <div class="card">
                                <h3 class="text-lg font-semibold text-gray-700 mb-2">Total Cash (CAD)</h3>
                                <p class="text-3xl font-bold text-gray-700" id="total-cash-cad">$0.00</p>
                            </div>
                            <div class="card">
                                <h3 class="text-lg font-semibold text-gray-700 mb-2">Total Cash (USD)</h3>
                                <p class="text-3xl font-bold text-gray-700" id="total-cash-usd">$0.00</p>
                            </div>
                        </div>
                        
                        <div class="card">
                            <h3 class="text-xl font-bold text-brand-teal mb-4">YTD Account Performance</h3>
                            <div class="overflow-x-auto">
                                <table class="w-full">
                                    <thead>
                                        <tr class="bg-gray-100">
                                            <th class="px-4 py-3 text-left">Account Name</th>
                                            <th class="px-4 py-3 text-left">Type</th>
                                            <th class="px-4 py-3 text-right">Current Value</th>
                                            <th class="px-4 py-3 text-right">YTD P/L</th>
                                            <th class="px-4 py-3 text-right">YTD RORC</th>
                                            <th class="px-4 py-3 text-right">ARORC</th>
                                        </tr>
                                    </thead>
                                    <tbody id="ytd-performance-table">
                                        <!-- Dynamic content -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Companies Section -->
                    <div id="companies-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-3xl font-bold text-brand-teal">Company Roster</h2>
                            <div class="flex items-center gap-3">
                                <span id="companies-filter-count" class="text-sm text-gray-500"></span>
                                <select id="companies-filter" onchange="setCompaniesFilter(this.value)" class="border border-gray-300 rounded px-3 py-2 text-sm bg-white" title="Filter the roster">
                                    <option value="all">All companies</option>
                                    <option value="scored">Scored</option>
                                    <option value="wonderful">Wonderful</option>
                                </select>
                                <button onclick="showCompanyForm()" class="btn-primary">
                                    <i class="fas fa-plus mr-2"></i>Add Company
                                </button>
                            </div>
                        </div>
                        
                        <div class="card">
                            <div class="overflow-x-auto">
                                <table class="w-full">
                                    <thead>
                                        <tr class="bg-gray-100">
                                            <th class="px-4 py-3 text-left cursor-pointer hover:bg-gray-200 select-none" onclick="sortCompanies('ticker')">
                                                <div class="flex items-center gap-2">
                                                    Ticker
                                                    <span id="sort-ticker" class="text-xs">
                                                        <i class="fas fa-sort-up text-brand-teal"></i>
                                                    </span>
                                                </div>
                                            </th>
                                            <th class="px-4 py-3 text-left cursor-pointer hover:bg-gray-200 select-none" onclick="sortCompanies('company_name')">
                                                <div class="flex items-center gap-2">
                                                    Company
                                                    <span id="sort-company_name" class="text-xs text-gray-400">
                                                        <i class="fas fa-sort"></i>
                                                    </span>
                                                </div>
                                            </th>
                                            <th class="px-4 py-3 text-left">Exchange</th>
                                            <th class="px-4 py-3 text-left">Industry</th>
                                            <th class="px-4 py-3 text-center">Wonderful</th>
                                            <th class="px-4 py-3 text-center cursor-pointer hover:bg-gray-200 select-none" onclick="sortCompanies('research_score')">
                                                <div class="flex items-center justify-center gap-2">
                                                    Research Score
                                                    <span id="sort-research_score" class="text-xs text-gray-400">
                                                        <i class="fas fa-sort"></i>
                                                    </span>
                                                </div>
                                            </th>
                                            <th class="px-4 py-3 text-center cursor-pointer hover:bg-gray-200 select-none" onclick="sortCompanies('anti_fragile_score')">
                                                <div class="flex items-center justify-center gap-2">
                                                    Anti-Fragile
                                                    <span id="sort-anti_fragile_score" class="text-xs text-gray-400">
                                                        <i class="fas fa-sort"></i>
                                                    </span>
                                                </div>
                                            </th>
                                            <th class="px-4 py-3 text-right cursor-pointer hover:bg-gray-200 select-none" onclick="sortCompanies('buy_price')">
                                                <div class="flex items-center justify-end gap-2">
                                                    Buy Price
                                                    <span id="sort-buy_price" class="text-xs text-gray-400">
                                                        <i class="fas fa-sort"></i>
                                                    </span>
                                                </div>
                                            </th>
                                            <th class="px-4 py-3 text-right cursor-pointer hover:bg-gray-200 select-none" onclick="sortCompanies('sticker_price')">
                                                <div class="flex items-center justify-end gap-2">
                                                    Sticker Price
                                                    <span id="sort-sticker_price" class="text-xs text-gray-400">
                                                        <i class="fas fa-sort"></i>
                                                    </span>
                                                </div>
                                            </th>
                                            <th class="px-4 py-3 text-center cursor-pointer hover:bg-gray-200 select-none" onclick="sortCompanies('last_researched')">
                                                <div class="flex items-center justify-center gap-2">
                                                    Last Updated
                                                    <span id="sort-last_researched" class="text-xs text-gray-400">
                                                        <i class="fas fa-sort"></i>
                                                    </span>
                                                </div>
                                            </th>
                                            <th class="px-4 py-3 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="companies-table">
                                        <!-- Dynamic content -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Accounts Section -->
                    <div id="accounts-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-3xl font-bold text-brand-teal">Account Balances</h2>
                            <button onclick="showAccountForm()" class="btn-primary">
                                <i class="fas fa-plus mr-2"></i>Add Account
                            </button>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6" id="accounts-grid">
                            <!-- Dynamic content -->
                        </div>
                    </div>
                    
                    <!-- Stock Trades Section -->
                    <div id="stocks-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-3xl font-bold text-brand-teal">Stock Trades</h2>
                            <button onclick="showStockForm()" class="btn-primary">
                                <i class="fas fa-plus mr-2"></i>Add Stock Trade
                            </button>
                        </div>
                        
                        <!-- Account Tabs -->
                        <div class="mb-6">
                            <div class="flex flex-wrap gap-2" id="stock-account-tabs">
                                <!-- Tabs will be dynamically generated -->
                            </div>
                        </div>
                        
                        <div class="card">
                            <div class="overflow-x-auto">
                                <table class="w-full">
                                    <thead>
                                        <tr class="bg-gray-100">
                                            <th class="px-4 py-3 text-left">Account</th>
                                            <th class="px-4 py-3 text-left">Ticker</th>
                                            <th class="px-4 py-3 text-left">Open Date</th>
                                            <th class="px-4 py-3 text-right">Shares</th>
                                            <th class="px-4 py-3 text-right">Avg Price</th>
                                            <th class="px-4 py-3 text-right">Cost Basis</th>
                                            <th class="px-4 py-3 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="stocks-table">
                                        <!-- Dynamic content -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Options Section -->
                    <div id="options-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-3xl font-bold text-brand-teal">Option Trades</h2>
                            <div class="flex items-center gap-4">
                                <!-- Include Closed Trades Toggle -->
                                <label class="flex items-center cursor-pointer group">
                                    <span class="mr-3 text-gray-700 font-medium">Include Closed</span>
                                    <div class="relative">
                                        <input type="checkbox" id="include-closed-options" class="sr-only peer" onchange="toggleClosedOptions()">
                                        <div class="w-11 h-6 bg-gray-300 rounded-full peer peer-focus:ring-2 peer-focus:ring-teal-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-teal"></div>
                                    </div>
                                </label>
                                <button onclick="showOptionForm()" class="btn-primary">
                                    <i class="fas fa-plus mr-2"></i>Add Option Trade
                                </button>
                            </div>
                        </div>
                        
                        <!-- Strategy Tabs -->
                        <div class="mb-6">
                            <div class="flex flex-wrap gap-2" id="strategy-tabs">
                                <!-- Tabs will be dynamically generated -->
                            </div>
                        </div>
                        
                        <div class="card">
                            <div class="overflow-x-auto">
                                <table class="w-full">
                                    <thead>
                                        <tr class="bg-gray-100">
                                            <th class="px-4 py-3 text-left">Date</th>
                                            <th class="px-4 py-3 text-left">Ticker</th>
                                            <th class="px-4 py-3 text-left">Strategy</th>
                                            <th class="px-4 py-3 text-right">Strike</th>
                                            <th class="px-4 py-3 text-right">Premium</th>
                                            <th class="px-4 py-3 text-center">Contracts</th>
                                            <th class="px-4 py-3 text-left">Expiration</th>
                                            <th class="px-4 py-3 text-center">Status</th>
                                            <th class="px-4 py-3 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="options-table">
                                        <!-- Dynamic content -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Daily Trade Section (0DTE Trading) -->
                    <div id="daily-trade-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <div class="flex items-center gap-3">
                                <h2 class="text-3xl font-bold text-orange-600">0DTE SPX Trading</h2>
                                <button onclick="openDailyTradeConfig()" class="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Configuration">
                                    <i class="fas fa-cog text-2xl"></i>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Sub-tabs -->
                        <div class="mb-6 border-b border-gray-200">
                            <nav class="flex gap-4">
                                <button onclick="showDailyTradeTab('performance')" class="daily-trade-tab active px-6 py-3 font-semibold text-orange-600 border-b-2 border-orange-600" data-tab="performance">
                                    <i class="fas fa-chart-bar mr-2"></i>Performance
                                </button>
                                <button onclick="showDailyTradeTab('today')" class="daily-trade-tab px-6 py-3 font-semibold text-gray-600 hover:text-orange-600" data-tab="today">
                                    <i class="fas fa-bullseye mr-2"></i>Today's Trading
                                </button>
                            </nav>
                        </div>
                        
                        <!-- Configuration Modal (hidden by default) -->
                        <div id="dt-config-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
                            <div class="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
                                <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                                    <h3 class="text-2xl font-bold text-orange-600">
                                        <i class="fas fa-cog mr-2"></i>0DTE Trading Configuration
                                    </h3>
                                    <button onclick="closeDailyTradeConfig()" class="text-gray-500 hover:text-gray-700">
                                        <i class="fas fa-times text-2xl"></i>
                                    </button>
                                </div>
                                
                                <div class="p-6">
                                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <!-- Trading Rules & Risk Management -->
                                <div class="card">
                                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                                        <i class="fas fa-shield-alt text-orange-600 mr-2"></i>Risk Management & Position Sizing
                                    </h3>
                                    <div class="space-y-4">
                                        <!-- Rolling Profit Window (always visible - used for stats and sizing) -->
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Rolling Profit Window (Last X Trades)</label>
                                            <input type="number" id="dt-rolling-profit-window" value="50" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="50">
                                            <small class="text-gray-500">Number of recent trades for performance stats and position sizing</small>
                                        </div>
                                        
                                        <!-- Master Toggle for Position Sizing -->
                                        <div>
                                            <label class="flex items-center justify-between p-3 bg-blue-50 border border-blue-300 rounded-lg cursor-pointer hover:bg-blue-100">
                                                <div>
                                                    <div class="font-semibold text-gray-700">Enable Calculated Position Sizing</div>
                                                    <div class="text-sm text-gray-500">Use automated contract sizing based on strategy</div>
                                                </div>
                                                <div class="relative inline-block w-12 h-6">
                                                    <input type="checkbox" id="dt-enable-position-sizing" class="sr-only peer" onchange="togglePositionSizing()">
                                                    <div class="w-full h-full bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                                </div>
                                            </label>
                                        </div>
                                        
                                        <!-- Position Sizing Config (hidden by default) -->
                                        <div id="dt-sizing-config" class="hidden space-y-4 pl-4 border-l-4 border-orange-300">
                                            <!-- Type Toggle -->
                                            <div>
                                                <label class="block text-gray-700 font-semibold mb-3">Sizing Method</label>
                                                <div class="grid grid-cols-2 gap-3">
                                                    <label class="relative flex items-center justify-center p-3 border-2 border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 has-[:checked]:border-orange-600 has-[:checked]:bg-orange-50">
                                                        <input type="radio" name="dt-position-sizing-type" value="profit" class="sr-only" onchange="toggleSizingType()" checked>
                                                        <div class="text-center">
                                                            <i class="fas fa-chart-line text-lg mb-1"></i>
                                                            <div class="font-semibold">Profit-Based</div>
                                                            <div class="text-xs text-gray-500">Recent trades</div>
                                                        </div>
                                                    </label>
                                                    <label class="relative flex items-center justify-center p-3 border-2 border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 has-[:checked]:border-orange-600 has-[:checked]:bg-orange-50">
                                                        <input type="radio" name="dt-position-sizing-type" value="account" class="sr-only" onchange="toggleSizingType()">
                                                        <div class="text-center">
                                                            <i class="fas fa-wallet text-lg mb-1"></i>
                                                            <div class="font-semibold">Account-Based</div>
                                                            <div class="text-xs text-gray-500">% of balance</div>
                                                        </div>
                                                    </label>
                                                </div>
                                            </div>
                                            
                                            <!-- Profit-Based Config -->
                                            <div id="dt-profit-sizing-config" class="space-y-3">
                                                <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                                    <div class="flex items-start">
                                                        <i class="fas fa-info-circle text-blue-600 mr-2 mt-1"></i>
                                                        <div class="text-sm text-gray-700">
                                                            <strong>Formula:</strong> <code>Contracts = floor(Total Profit / (Strike Width × 100))</code><br>
                                                            Uses Rolling Profit Window above. Capped at Max Contract Limit below.
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <!-- Account-Based Config -->
                                            <div id="dt-account-sizing-config" class="hidden space-y-3">
                                                <div>
                                                    <label class="block text-gray-700 font-semibold mb-2">Max Loss % of Account Balance</label>
                                                    <div class="flex items-center gap-2">
                                                        <input type="number" step="0.01" id="dt-account-max-loss-percent" value="4.00" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="4.00">
                                                        <span class="text-gray-600 font-semibold">%</span>
                                                    </div>
                                                    <small class="text-gray-500">Position sized to limit max loss to this % of account</small>
                                                </div>
                                                <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                                    <div class="flex items-start">
                                                        <i class="fas fa-info-circle text-blue-600 mr-2 mt-1"></i>
                                                        <div class="text-sm text-gray-700">
                                                            <strong>Formula:</strong> <code>Contracts = floor((Balance × Max Loss %) / (Strike Width × 100))</code><br>
                                                            Capped at Max Contract Limit below.
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <!-- Max Contract Limit (always visible) -->
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Max Contract Limit (Upper Bound)</label>
                                            <input type="number" id="dt-max-contract-limit" value="25" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="25">
                                            <small class="text-gray-500">Absolute maximum contracts regardless of calculation</small>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Default Entry Parameters -->
                                <div class="card">
                                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                                        <i class="fas fa-sliders-h text-orange-600 mr-2"></i>Default Entry Parameters
                                    </h3>
                                    <div class="space-y-4">
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Target Premium Credit Range ($)</label>
                                            <div class="grid grid-cols-2 gap-2">
                                                <input type="number" step="0.01" id="dt-target-premium-min" value="10.00" class="px-4 py-2 border border-gray-300 rounded-lg" placeholder="Min">
                                                <input type="number" step="0.01" id="dt-target-premium-max" value="15.00" class="px-4 py-2 border border-gray-300 rounded-lg" placeholder="Max">
                                            </div>
                                        </div>
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Guideline Delta</label>
                                            <input type="number" step="0.01" id="dt-guideline-delta" value="-0.10" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="-0.10">
                                            <small class="text-gray-500">Target delta for short option selection (negative value, e.g., -0.10)</small>
                                        </div>
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Strike Width (Points)</label>
                                            <input type="number" id="dt-strike-width" value="5" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="5">
                                        </div>
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Default Contracts</label>
                                            <input type="number" id="dt-default-contracts" value="1" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="1">
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Exit Rules -->
                                <div class="card">
                                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                                        <i class="fas fa-sign-out-alt text-orange-600 mr-2"></i>Exit Rules
                                    </h3>
                                    <div class="space-y-4">
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Profit Target (% of max profit)</label>
                                            <input type="number" id="dt-profit-target-percent" value="50" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="50">
                                        </div>
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">ATM Proximity Limit (Points from SPX)</label>
                                            <input type="number" step="1" id="dt-atm-proximity-limit" value="30" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="30">
                                            <small class="text-gray-500">Exit if SPX moves within this distance from your short strikes</small>
                                        </div>
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Time-based Exit (HH:MM MT)</label>
                                            <input type="time" id="dt-time-exit" value="14:00" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                            <small class="text-gray-500">MT - Exit if no Profit Target/Proximity Limit hit</small>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Account Settings -->
                                <div class="card">
                                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                                        <i class="fas fa-wallet text-orange-600 mr-2"></i>Account Settings
                                    </h3>
                                    <div class="space-y-4">
                                        <div>
                                            <label class="block text-gray-700 font-semibold mb-2">Default Account</label>
                                            <select id="dt-default-account" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                                <option value="">Select account...</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="mt-6 flex gap-4">
                                <button onclick="saveDailyTradeConfig()" class="btn-primary bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800">
                                    <i class="fas fa-save mr-2"></i>Save Configuration
                                </button>
                                <button onclick="resetDailyTradeConfig()" class="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50">
                                    <i class="fas fa-undo mr-2"></i>Reset to Defaults
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                        
                        <!-- Performance Tab -->
                        <div id="dt-performance-tab" class="daily-trade-tab-content">
                            <!-- Monthly Expiration Warning Alert (shown only on Thursday before 3rd Friday) -->
                            <div id="dt-monthly-expiration-alert-perf" class="hidden mb-6 bg-red-50 border-2 border-red-500 rounded-lg p-6 shadow-lg">
                                <div class="flex items-start gap-4">
                                    <div class="flex-shrink-0">
                                        <i class="fas fa-exclamation-triangle text-red-600 text-4xl"></i>
                                    </div>
                                    <div class="flex-1">
                                        <h3 class="text-2xl font-bold text-red-800 mb-3">
                                            ⚠️ MONTHLY EXPIRATION WARNING - DO NOT TRADE TODAY
                                        </h3>
                                        <div class="space-y-3 text-red-900">
                                            <p class="text-lg font-semibold">
                                                Today is <span class="font-bold bg-red-200 px-2 py-1 rounded">Thursday before the 3rd Friday of the month</span>
                                            </p>
                                            <p class="text-base">
                                                <strong>Critical Risk:</strong> SPX options that appear to be 0DTE today are actually <strong>MONTHLY options</strong> 
                                                that expire <strong>TOMORROW MORNING AT MARKET OPEN</strong> (not 4:15 PM today).
                                            </p>
                                            <div class="bg-red-100 border border-red-400 rounded-lg p-4 mt-3">
                                                <p class="font-semibold mb-2">Why This is Dangerous:</p>
                                                <ul class="list-disc list-inside space-y-1 text-sm">
                                                    <li><strong>Overnight Risk:</strong> Your position would carry <strong><em>significant</em></strong> overnight exposure</li>
                                                    <li><strong>Gap Risk:</strong> Market can gap <strong><em>significantly</em></strong> overnight and you have no ability to manage</li>
                                                    <li><strong>Max Loss Potential:</strong> Could realize <strong><em>full max loss</em></strong> before market opens</li>
                                                    <li><strong>No Ability To Manage:</strong> Positions <strong>CLOSE</strong> at tomorrow's open, and there is no ability to adjust/manage overnight.</li>
                                                </ul>
                                            </div>
                                            <p class="text-base font-bold mt-4 text-red-800">
                                                🛑 <strong>ACTION REQUIRED:</strong> Avoid all SPX 0DTE trades today. Resume normal trading tomorrow (Friday) with true 0DTE options.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Filter Buttons -->
                            <div class="mb-6 flex gap-2">
                                <button onclick="loadPerformanceStats('rolling')" id="dt-filter-rolling" class="px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold">Last 50 Trades</button>
                                <button onclick="loadPerformanceStats('year')" id="dt-filter-year" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">YTD</button>
                                <button onclick="loadPerformanceStats('all')" id="dt-filter-all" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">All Time</button>
                            </div>
                            
                            <!-- Key Metrics -->
                            <div class="card mb-6">
                                <h3 class="text-xl font-bold text-gray-800 mb-4">Key Metrics</h3>
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div class="text-center p-4 bg-gray-50 rounded-lg">
                                        <div id="dt-perf-total-trades" class="text-2xl font-bold text-gray-900">-</div>
                                        <div class="text-sm text-gray-600">Total Trades</div>
                                    </div>
                                    <div class="text-center p-4 bg-green-50 rounded-lg">
                                        <div id="dt-perf-win-rate" class="text-2xl font-bold text-green-600">-</div>
                                        <div class="text-sm text-gray-600">Win Rate</div>
                                    </div>
                                    <div class="text-center p-4 bg-blue-50 rounded-lg">
                                        <div id="dt-perf-avg-win" class="text-2xl font-bold text-blue-600">-</div>
                                        <div class="text-sm text-gray-600">Avg Win</div>
                                    </div>
                                    <div class="text-center p-4 bg-red-50 rounded-lg">
                                        <div id="dt-perf-avg-loss" class="text-2xl font-bold text-red-600">-</div>
                                        <div class="text-sm text-gray-600">Avg Loss</div>
                                    </div>
                                </div>
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                    <div class="text-center p-4 bg-green-50 rounded-lg">
                                        <div id="dt-perf-net-pl" class="text-2xl font-bold text-green-600">-</div>
                                        <div class="text-sm text-gray-600">Net P/L</div>
                                    </div>
                                    <div class="text-center p-4 bg-gray-50 rounded-lg">
                                        <div id="dt-perf-avg-pl" class="text-2xl font-bold text-gray-900">-</div>
                                        <div class="text-sm text-gray-600">Avg P/L</div>
                                    </div>
                                    <div class="text-center p-4 bg-blue-50 rounded-lg">
                                        <div id="dt-perf-best-trade" class="text-2xl font-bold text-blue-600">-</div>
                                        <div class="text-sm text-gray-600">Best Trade</div>
                                        <div id="dt-perf-best-trade-date" class="text-xs text-gray-500 mt-1">-</div>
                                    </div>
                                    <div class="text-center p-4 bg-red-50 rounded-lg">
                                        <div id="dt-perf-worst-trade" class="text-2xl font-bold text-red-600">-</div>
                                        <div class="text-sm text-gray-600">Worst Trade</div>
                                        <div id="dt-perf-worst-trade-date" class="text-xs text-gray-500 mt-1">-</div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- P/L Trend Chart -->
                            <div class="card mb-6">
                                <h3 class="text-xl font-bold text-gray-800 mb-4" id="dt-chart-title">
                                    <i class="fas fa-chart-line mr-2 text-orange-600"></i>P/L Trend (Last 50 Trades)
                                </h3>
                                <div class="bg-white rounded-lg p-4" style="height: 400px;">
                                    <canvas id="dt-pl-trend-chart"></canvas>
                                </div>
                            </div>
                            
                            <!-- Recent Trade History (Last 7 Days) -->
                            <div class="card mb-6">
                                <div class="flex justify-between items-center mb-4">
                                    <h3 class="text-xl font-bold text-gray-800">Recent Trade History (Last 7 Days)</h3>
                                    <button onclick="openFullHistoryModal()" class="px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700">
                                        <i class="fas fa-history mr-2"></i>View Full History
                                    </button>
                                </div>
                                
                                <!-- Weekly Gain/Loss Summary -->
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <div class="bg-gradient-to-br from-blue-50 to-white rounded-lg p-4 border-2 border-blue-200">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">This Week (Mon-Fri)</p>
                                                <p class="text-2xl font-bold text-blue-600" id="dt-weekly-pl">$0.00</p>
                                                <p class="text-xs text-gray-500 mt-1" id="dt-weekly-trades">0 trades</p>
                                            </div>
                                            <div class="text-3xl text-blue-600 opacity-20">
                                                <i class="fas fa-calendar-week"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="bg-gradient-to-br from-green-50 to-white rounded-lg p-4 border-2 border-green-200">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Week Start</p>
                                                <p class="text-lg font-bold text-gray-800" id="dt-week-start-date">-</p>
                                                <p class="text-xs text-gray-500 mt-1">Monday</p>
                                            </div>
                                            <div class="text-3xl text-green-600 opacity-20">
                                                <i class="fas fa-calendar-day"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="bg-gradient-to-br from-purple-50 to-white rounded-lg p-4 border-2 border-purple-200">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Week End</p>
                                                <p class="text-lg font-bold text-gray-800" id="dt-week-end-date">-</p>
                                                <p class="text-xs text-gray-500 mt-1">Friday</p>
                                            </div>
                                            <div class="text-3xl text-purple-600 opacity-20">
                                                <i class="fas fa-calendar-check"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm">
                                        <thead>
                                            <tr class="bg-gray-100">
                                                <th class="px-4 py-3 text-left">Date</th>
                                                <th class="px-4 py-3 text-left">Strategy</th>
                                                <th class="px-4 py-3 text-left">Entry</th>
                                                <th class="px-4 py-3 text-left">Exit</th>
                                                <th class="px-4 py-3 text-right">Credit</th>
                                                <th class="px-4 py-3 text-center">Contracts</th>
                                                <th class="px-4 py-3 text-right">P/L</th>
                                                <th class="px-4 py-3 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody id="dt-recent-trades-tbody">
                                            <tr>
                                                <td colspan="8" class="px-4 py-8 text-center text-gray-500 italic">
                                                    <i class="fas fa-spinner fa-spin mr-2"></i>Loading trades...
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            
                            <!-- Day of Week Statistics -->
                            <div class="card">
                                <h3 class="text-xl font-bold text-gray-800 mb-4">Statistics by Day of Week</h3>
                                <div id="dt-day-stats-container" class="space-y-3">
                                    <div class="text-center py-8 text-gray-500 italic">
                                        <i class="fas fa-spinner fa-spin mr-2"></i>Loading day of week statistics...
                                    </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Today's Trading Tab -->
                        <div id="dt-today-tab" class="daily-trade-tab-content hidden">
                            <!-- Monthly Expiration Warning Alert (shown only on Thursday before 3rd Friday) -->
                            <div id="dt-monthly-expiration-alert" class="hidden mb-6 bg-red-50 border-2 border-red-500 rounded-lg p-6 shadow-lg">
                                <div class="flex items-start gap-4">
                                    <div class="flex-shrink-0">
                                        <i class="fas fa-exclamation-triangle text-red-600 text-4xl"></i>
                                    </div>
                                    <div class="flex-1">
                                        <h3 class="text-2xl font-bold text-red-800 mb-3">
                                            ⚠️ MONTHLY EXPIRATION WARNING - DO NOT TRADE TODAY
                                        </h3>
                                        <div class="space-y-3 text-red-900">
                                            <p class="text-lg font-semibold">
                                                Today is <span class="font-bold bg-red-200 px-2 py-1 rounded">Thursday before the 3rd Friday of the month</span>
                                            </p>
                                            <p class="text-base">
                                                <strong>Critical Risk:</strong> SPX options that appear to be 0DTE today are actually <strong>MONTHLY options</strong> 
                                                that expire <strong>TOMORROW MORNING AT MARKET OPEN</strong> (not 4:15 PM today).
                                            </p>
                                            <div class="bg-red-100 border border-red-400 rounded-lg p-4 mt-3">
                                                <p class="font-semibold mb-2">Why This is Dangerous:</p>
                                                <ul class="list-disc list-inside space-y-1 text-sm">
                                                    <li><strong>Overnight Risk:</strong> Your position would carry <strong><em>significant</em></strong> overnight exposure</li>
                                                    <li><strong>Gap Risk:</strong> Market can gap <strong><em>significantly</em></strong> overnight and you have no ability to manage</li>
                                                    <li><strong>Max Loss Potential:</strong> Could realize <strong><em>full max loss</em></strong> before market opens</li>
                                                    <li><strong>No Ability To Manage:</strong> Positions <strong>CLOSE</strong> at tomorrow's open, and there is no ability to adjust/manage overnight.</li>
                                                </ul>
                                            </div>
                                            <p class="text-base font-bold mt-4 text-red-800">
                                                🛑 <strong>ACTION REQUIRED:</strong> Avoid all SPX 0DTE trades today. Resume normal trading tomorrow (Friday) with true 0DTE options.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Position Summary Card -->
                            <div class="card mb-6 bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200">
                                <!-- Open Position Display (shown when there's an active trade) -->
                                <div id="dt-open-position-display" class="hidden">
                                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <!-- SPX Price -->
                                        <div class="text-center">
                                            <h3 class="text-sm font-semibold text-gray-600 mb-2">SPX Price</h3>
                                            <div class="text-3xl font-bold text-gray-900" id="dt-spx-current">--</div>
                                            <div class="text-sm mt-1" id="dt-spx-change">--</div>
                                            <div class="text-xs text-gray-500 mt-1" id="dt-spx-time">--</div>
                                        </div>
                                        
                                        <!-- Open Trade Details -->
                                        <div class="md:col-span-2 border-l-2 border-orange-200 pl-6">
                                            <h3 class="text-sm font-semibold text-gray-600 mb-3">Open Position</h3>
                                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4" id="dt-position-details">
                                                <!-- Dynamic position details will be inserted here -->
                                            </div>
                                            <div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg" id="dt-position-info">
                                                <!-- Dynamic position info will be inserted here -->
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Active Positions Section (shown when there are active trades) -->
                                <div id="dt-active-trades-section" class="hidden">
                                    <div class="flex justify-between items-center mb-4">
                                        <h3 class="text-xl font-bold text-gray-800">
                                            <i class="fas fa-list text-orange-600 mr-2"></i>Active Positions
                                        </h3>
                                        <span id="dt-active-trade-count" class="px-3 py-1 bg-orange-100 text-orange-600 rounded-full font-semibold text-sm">0 open</span>
                                    </div>
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-sm">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Entry</th>
                                                    <th class="px-4 py-3 text-left">Strategy</th>
                                                    <th class="px-4 py-3 text-center">Contracts</th>
                                                    <th class="px-4 py-3 text-left">Call Spread</th>
                                                    <th class="px-4 py-3 text-left">Put Spread</th>
                                                    <th class="px-4 py-3 text-right">Credit</th>
                                                    <th class="px-4 py-3 text-right">Commission</th>
                                                    <th class="px-4 py-3 text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody id="dt-active-trades-tbody">
                                                <tr>
                                                    <td colspan="8" class="px-4 py-8 text-center text-gray-500 italic">
                                                        <i class="fas fa-spinner fa-spin mr-2"></i>Loading active trades...
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                <!-- No Open Position State (shown when no active trades) -->
                                <div id="dt-no-open-position" class="hidden text-center py-8">
                                    <div class="mb-4">
                                        <i class="fas fa-chart-line text-gray-300 text-5xl mb-3"></i>
                                        <h3 class="text-lg font-semibold text-gray-700 mb-2">Ready to Start Trading</h3>
                                        <p class="text-gray-500 text-sm">No active positions yet. Use the Quick Entry Form below to enter your first trade.</p>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Quick Entry Form -->
                            <div class="card mb-6">
                                <div class="flex justify-between items-center mb-4">
                                    <h3 class="text-xl font-bold text-gray-800">
                                        <i class="fas fa-plus-circle text-orange-600 mr-2"></i>Quick Entry Form
                                    </h3>
                                    <div class="flex items-center gap-2">
                                        <span class="text-sm text-gray-600">Auto-Position Sizing</span>
                                        <label class="relative inline-block w-12 h-6">
                                            <input type="checkbox" id="dt-profit-sizing-toggle" class="sr-only peer" onchange="toggleAutoPositionSizing()">
                                            <div class="w-full h-full bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                        </label>
                                    </div>
                                </div>
                                
                                <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                                    <div>
                                        <label class="block text-gray-700 font-semibold mb-1 text-sm">Entry Date</label>
                                        <input type="date" id="dt-entry-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    </div>
                                    <div>
                                        <label class="block text-gray-700 font-semibold mb-1 text-sm">Entry Time</label>
                                        <input type="time" id="dt-entry-time" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    </div>
                                    <div>
                                        <label class="block text-gray-700 font-semibold mb-1 text-sm">SPX Price</label>
                                        <input type="number" step="0.01" id="dt-spx-price" placeholder="4856.20" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    </div>
                                    <div>
                                        <label class="block text-gray-700 font-semibold mb-1 text-sm">VIX Price</label>
                                        <input type="number" step="0.01" id="dt-vix-price" placeholder="18.50" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    </div>
                                    <div>
                                        <label class="block text-gray-700 font-semibold mb-1 text-sm">Contracts</label>
                                        <input type="number" id="dt-contracts" value="1" min="1" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-sm">
                                        <small class="text-xs text-gray-500 mt-1 block" id="dt-contracts-hint">Manual Entry</small>
                                    </div>
                                </div>
                                
                                <!-- Strategy Type Toggle -->
                                <div class="mb-4">
                                    <label class="block text-gray-700 font-semibold mb-2">Strategy Type</label>
                                    <div class="flex gap-2">
                                        <button class="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold">Iron Condor (Both Sides)</button>
                                        <button class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">Credit Spread (One Side)</button>
                                    </div>
                                </div>
                                
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <!-- Call Spread -->
                                    <div class="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                                        <div class="flex items-center justify-between mb-3">
                                            <h4 class="font-bold text-gray-800"><span class="text-red-600">BEARISH:</span> Call Spread <span class="text-sm font-normal text-gray-600" id="call-spread-width-display">($5 wide)</span></h4>
                                            <label class="flex items-center">
                                                <input type="checkbox" checked class="mr-2" id="enable-call-spread">
                                                <span class="text-sm">Enable</span>
                                            </label>
                                        </div>
                                        <div class="space-y-3">
                                            <div class="grid grid-cols-3 gap-2">
                                                <div>
                                                    <label class="block text-xs text-gray-600 mb-1">Short Call Strike</label>
                                                    <input type="number" step="0.01" value="4870" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" id="call-short-strike">
                                                </div>
                                                <div>
                                                    <label class="block text-xs text-gray-600 mb-1">Premium Collected ($)</label>
                                                    <input type="number" step="0.01" value="0.70" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" id="call-total-credit">
                                                </div>
                                                <div>
                                                    <label class="block text-xs text-gray-600 mb-1">Commission ($)</label>
                                                    <input type="number" step="0.01" value="1.30" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" id="call-commission">
                                                </div>
                                            </div>
                                            <div class="bg-white rounded p-2 text-sm">
                                                <div class="flex justify-between mb-1">
                                                    <span class="text-gray-600">Total Dollars At Work:</span>
                                                    <span class="font-semibold text-orange-600" id="call-dollars-at-work">$500.00</span>
                                                </div>
                                                <div class="flex justify-between mb-1">
                                                    <span class="text-gray-600">Total Credit:</span>
                                                    <span class="font-semibold text-green-600" id="call-total-credit-display">$70.00</span>
                                                </div>
                                                <div class="flex justify-between">
                                                    <span class="text-gray-600">Distance from SPX:</span>
                                                    <span class="font-semibold text-blue-600" id="call-distance">+13.80 pts (0.28%)</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Put Spread -->
                                    <div class="border-2 border-green-200 rounded-lg p-4 bg-green-50">
                                        <div class="flex items-center justify-between mb-3">
                                            <h4 class="font-bold text-gray-800"><span class="text-green-600">BULLISH:</span> Put Spread <span class="text-sm font-normal text-gray-600" id="put-spread-width-display">($5 wide)</span></h4>
                                            <label class="flex items-center">
                                                <input type="checkbox" checked class="mr-2" id="enable-put-spread">
                                                <span class="text-sm">Enable</span>
                                            </label>
                                        </div>
                                        <div class="space-y-3">
                                            <div class="grid grid-cols-3 gap-2">
                                                <div>
                                                    <label class="block text-xs text-gray-600 mb-1">Short Put Strike</label>
                                                    <input type="number" step="0.01" value="4840" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" id="put-short-strike">
                                                </div>
                                                <div>
                                                    <label class="block text-xs text-gray-600 mb-1">Premium Collected ($)</label>
                                                    <input type="number" step="0.01" value="0.80" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" id="put-total-credit">
                                                </div>
                                                <div>
                                                    <label class="block text-xs text-gray-600 mb-1">Commission ($)</label>
                                                    <input type="number" step="0.01" value="1.30" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" id="put-commission">
                                                </div>
                                            </div>
                                            <div class="bg-white rounded p-2 text-sm">
                                                <div class="flex justify-between mb-1">
                                                    <span class="text-gray-600">Total Dollars At Work:</span>
                                                    <span class="font-semibold text-orange-600" id="put-dollars-at-work">$500.00</span>
                                                </div>
                                                <div class="flex justify-between mb-1">
                                                    <span class="text-gray-600">Total Credit:</span>
                                                    <span class="font-semibold text-green-600" id="put-total-credit-display">$80.00</span>
                                                </div>
                                                <div class="flex justify-between">
                                                    <span class="text-gray-600">Distance from SPX:</span>
                                                    <span class="font-semibold text-blue-600" id="put-distance">-16.20 pts (0.33%)</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Trade Summary -->
                                <div class="mt-4 p-4 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200">
                                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                                        <div>
                                            <div class="text-sm text-gray-600">Total Premium Credit</div>
                                            <div class="text-xl font-bold text-green-600" id="dt-total-credit">$1.50</div>
                                            <div class="text-xs text-gray-500">per contract</div>
                                        </div>
                                        <div>
                                            <div class="text-sm text-gray-600">Max Risk</div>
                                            <div class="text-xl font-bold text-red-600" id="dt-max-risk">$350.00</div>
                                        </div>
                                        <div>
                                            <div class="text-sm text-gray-600">Commission</div>
                                            <div class="text-xl font-bold text-gray-700" id="dt-total-commission">$2.60</div>
                                        </div>
                                        <div>
                                            <div class="text-sm text-gray-600">Net Credit</div>
                                            <div class="text-xl font-bold text-green-600" id="dt-net-credit">$147.40</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Notes -->
                                <div class="mt-4">
                                    <label class="block text-gray-700 font-semibold mb-2">Trade Notes (Optional)</label>
                                    <textarea id="dt-notes" class="w-full px-4 py-2 border border-gray-300 rounded-lg" rows="2" placeholder="Add notes about market conditions, reasoning, etc."></textarea>
                                </div>
                                
                                <!-- Action Buttons -->
                                <div class="mt-4 flex gap-4">
                                    <button onclick="submitDailyTrade()" class="flex-1 bg-gradient-to-r from-orange-600 to-orange-700 text-white px-6 py-3 rounded-lg font-bold hover:from-orange-700 hover:to-orange-800">
                                        <i class="fas fa-rocket mr-2"></i>Enter Trade
                                    </button>
                                    <button onclick="resetDailyTradeForm()" class="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50">
                                        <i class="fas fa-redo mr-2"></i>Reset Form
                                    </button>
                                    <button onclick="openDailyTradeConfig()" class="px-6 py-3 border-2 border-orange-300 text-orange-700 rounded-lg font-semibold hover:bg-orange-50">
                                        <i class="fas fa-cog mr-2"></i>Load Config
                                    </button>
                                </div>
                            </div>
                            
                            <!-- Closed Positions Today -->
                            <div class="card mb-6">
                                <h3 class="text-xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-check-circle text-green-600 mr-2"></i>Closed Positions Today
                                </h3>
                                <div id="dt-closed-positions-container" class="overflow-x-auto">
                                    <div class="text-center py-8 text-gray-500 italic">
                                        <i class="fas fa-spinner fa-spin mr-2"></i>Loading closed positions...
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Trade Journal -->
                            <div class="card">
                                <h3 class="text-xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-book text-orange-600 mr-2"></i>Trade Journal
                                </h3>
                                <div id="dt-journal-entries" class="space-y-2 mb-4">
                                    <div class="text-center py-8 text-gray-500 italic">
                                        <i class="fas fa-spinner fa-spin mr-2"></i>Loading journal entries...
                                    </div>
                                </div>
                                <div class="flex gap-2">
                                    <input type="text" id="dt-journal-input" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg" placeholder="Add journal entry...">
                                    <button onclick="addJournalEntry()" class="px-6 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700">
                                        <i class="fas fa-plus mr-2"></i>Add
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    
                    <!-- Utilities Section -->
                    <div id="utilities-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-3xl font-bold text-brand-teal">
                                <i class="fas fa-tools mr-2"></i>Utilities
                            </h2>
                        </div>
                        
                        <!-- Utilities Tabs -->
                        <div class="mb-6">
                            <div class="border-b border-gray-200">
                                <nav class="flex gap-4">
                                    <button onclick="showUtilityTab('option-tax')" data-utility-tab="option-tax" class="utility-tab px-4 py-3 font-semibold text-gray-600 border-b-2 border-transparent hover:text-brand-teal hover:border-brand-teal transition-colors active">
                                        <i class="fas fa-file-invoice-dollar mr-2"></i>Option Tax Transform
                                    </button>
                                    <button onclick="showUtilityTab('historical-balances')" data-utility-tab="historical-balances" class="utility-tab px-4 py-3 font-semibold text-gray-600 border-b-2 border-transparent hover:text-brand-teal hover:border-brand-teal transition-colors">
                                        <i class="fas fa-history mr-2"></i>Historical Balances
                                    </button>
                                    <button onclick="showUtilityTab('dividend-repository')" data-utility-tab="dividend-repository" class="utility-tab px-4 py-3 font-semibold text-gray-600 border-b-2 border-transparent hover:text-brand-teal hover:border-brand-teal transition-colors">
                                        <i class="fas fa-coins mr-2"></i>Dividend Repository
                                    </button>
                                    <button onclick="showUtilityTab('queue-management'); loadResearchQueue()" data-utility-tab="queue-management" class="utility-tab px-4 py-3 font-semibold text-gray-600 border-b-2 border-transparent hover:text-brand-teal hover:border-brand-teal transition-colors">
                                        <i class="fas fa-list-check mr-2"></i>Research Queue
                                    </button>
                                    <button onclick="showUtilityTab('discovery'); loadDiscovery()" data-utility-tab="discovery" class="utility-tab px-4 py-3 font-semibold text-gray-600 border-b-2 border-transparent hover:text-brand-teal hover:border-brand-teal transition-colors">
                                        <i class="fas fa-binoculars mr-2"></i>Discovery
                                    </button>
                                </nav>
                            </div>
                        </div>
                        
                        <!-- Option Tax Transform Tool -->
                        <div id="option-tax-utility" class="utility-content">
                        <div class="card mb-6">
                            <div class="flex items-start gap-4 mb-4">
                                <div class="bg-brand-teal text-white p-3 rounded-lg">
                                    <i class="fas fa-file-invoice-dollar text-2xl"></i>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-xl font-bold text-gray-800 mb-2">Option Tax Transform</h3>
                                    <p class="text-gray-600 mb-4">Transform option transaction CSV files for tax reporting. Groups transactions by underlying symbol and merges buy/sell lines.</p>
                                    
                                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                        <h4 class="font-semibold text-blue-900 mb-2">
                                            <i class="fas fa-info-circle mr-2"></i>How to Use:
                                        </h4>
                                        <ol class="list-decimal list-inside text-sm text-blue-800 space-y-1">
                                            <li>Export your option transactions from your broker as CSV</li>
                                            <li>Upload the CSV file using the button below</li>
                                            <li>The tool will transform and download the processed file</li>
                                        </ol>
                                    </div>
                                    
                                    <!-- Expected Format Example -->
                                    <details class="bg-gray-50 border border-gray-300 rounded-lg p-4 mb-4">
                                        <summary class="font-semibold text-gray-800 cursor-pointer hover:text-brand-teal">
                                            <i class="fas fa-file-alt mr-2"></i>Expected Input Format (Click to expand)
                                        </summary>
                                        <div class="mt-3">
                                            <p class="text-sm text-gray-600 mb-2">Your CSV should have this structure:</p>
                                            <div class="bg-white p-3 rounded border border-gray-200 overflow-x-auto">
                                                <pre class="text-xs font-mono text-gray-700">Transaction History[TAB]Header[TAB]Date[TAB]Account[TAB]Description[TAB]Transaction Type[TAB]Symbol[TAB]Quantity[TAB]Price[TAB]Price Currency[TAB]Gross Amount[TAB]Commission[TAB]Net Amount
Transaction History[TAB]Data[TAB]2025-01-31[TAB]U***13773[TAB]MSFT 18JUL25 390 P[TAB]Sell[TAB]MSFT  250718P00390000[TAB]-2[TAB]12.4[TAB]USD[TAB]2480[TAB]-1.49[TAB]2478.51
Transaction History[TAB]Data[TAB]2025-01-24[TAB]U***13773[TAB]NVDA 07FEB25 138 P[TAB]Sell[TAB]NVDA  250207P00138000[TAB]-1[TAB]1.69[TAB]USD[TAB]169[TAB]-1.06[TAB]167.94</pre>
                                            </div>
                                            <p class="text-xs text-gray-500 mt-2">
                                                <i class="fas fa-info-circle mr-1"></i>Note: [TAB] represents a tab character. Most broker exports use tabs to separate columns.
                                            </p>
                                        </div>
                                    </details>
                                    
                                    <!-- File Upload Area -->
                                    <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-brand-teal transition-colors">
                                        <input type="file" id="option-tax-file" accept=".csv" class="hidden" onchange="handleOptionTaxFileUpload(event)">
                                        <label for="option-tax-file" class="cursor-pointer">
                                            <i class="fas fa-cloud-upload-alt text-4xl text-gray-400 mb-3"></i>
                                            <p class="text-gray-600 font-semibold mb-2">Click to upload CSV file</p>
                                            <p class="text-sm text-gray-500">or drag and drop your file here</p>
                                        </label>
                                    </div>
                                    
                                    <!-- Progress/Status Area -->
                                    <div id="option-tax-status" class="hidden mt-4">
                                        <div class="flex items-center justify-center gap-3 text-gray-600">
                                            <i class="fas fa-spinner fa-spin text-brand-teal"></i>
                                            <span id="option-tax-status-text">Processing...</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        </div>
                        
                        <!-- Historical Account Balances Tool -->
                        <div id="historical-balances-utility" class="utility-content hidden">
                        <div class="card mb-6">
                            <div class="flex items-start gap-4 mb-4">
                                <div class="bg-brand-teal text-white p-3 rounded-lg">
                                    <i class="fas fa-history text-2xl"></i>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-xl font-bold text-gray-800 mb-2">Historical Account Balances</h3>
                                    <p class="text-gray-600 mb-4">Track account balances over time for portfolio performance analysis and growth charts.</p>
                                    
                                    <!-- Add Balance Form -->
                                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                        <h4 class="font-semibold text-blue-900 mb-3">
                                            <i class="fas fa-plus-circle mr-2"></i>Add Historical Balance
                                        </h4>
                                        
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label class="block text-sm font-semibold text-gray-700 mb-2">Account</label>
                                                <select id="hist-balance-account" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal">
                                                    <option value="">Select Account...</option>
                                                </select>
                                            </div>
                                            
                                            <div>
                                                <label class="block text-sm font-semibold text-gray-700 mb-2">Month/Year</label>
                                                <input type="month" id="hist-balance-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal">
                                            </div>
                                            
                                            <div>
                                                <label class="block text-sm font-semibold text-gray-700 mb-2">Currency</label>
                                                <select id="hist-balance-currency" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" onchange="calculateHistoricalBalance()">
                                                    <option value="USD">USD</option>
                                                    <option value="CAD">CAD</option>
                                                </select>
                                            </div>
                                            
                                            <div>
                                                <label class="block text-sm font-semibold text-gray-700 mb-2">Balance Amount</label>
                                                <input type="number" id="hist-balance-amount" step="0.01" placeholder="0.00" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" oninput="calculateHistoricalBalance()">
                                            </div>
                                            
                                            <div>
                                                <label class="block text-sm font-semibold text-gray-700 mb-2">Exchange Rate</label>
                                                <input type="number" id="hist-balance-rate" step="0.000001" placeholder="1.35" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" oninput="calculateHistoricalBalance()">
                                                <p class="text-xs text-gray-500 mt-1">CAD per 1 USD</p>
                                            </div>
                                            
                                            <div>
                                                <label class="block text-sm font-semibold text-gray-700 mb-2">Calculated Balance</label>
                                                <input type="text" id="hist-balance-calculated" readonly class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700">
                                                <p class="text-xs text-gray-500 mt-1" id="hist-balance-calculated-label">USD Balance</p>
                                            </div>
                                        </div>
                                        
                                        <div class="mt-4 flex gap-3">
                                            <button onclick="saveHistoricalBalance()" class="px-6 py-2 bg-brand-teal text-white rounded-lg font-semibold hover:bg-teal-700">
                                                <i class="fas fa-save mr-2"></i>Save Balance
                                            </button>
                                            <button onclick="clearHistoricalBalanceForm()" class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400">
                                                <i class="fas fa-times mr-2"></i>Clear
                                            </button>
                                        </div>
                                        
                                        <input type="hidden" id="hist-balance-edit-id">
                                    </div>
                                    
                                    <!-- Historical Balances Table -->
                                    <div class="bg-gray-50 border border-gray-300 rounded-lg p-4">
                                        <div class="flex justify-between items-center mb-3">
                                            <h4 class="font-semibold text-gray-800">
                                                <i class="fas fa-list mr-2"></i>Recent Historical Balances (Last 24 Entries)
                                            </h4>
                                            <div class="flex items-center gap-2">
                                                <label class="text-sm font-semibold text-gray-700">Filter by Account:</label>
                                                <select id="hist-balance-filter" onchange="filterHistoricalBalances()" class="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm">
                                                    <option value="">All Accounts</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="overflow-x-auto">
                                            <table class="min-w-full bg-white border border-gray-200 rounded-lg">
                                                <thead class="bg-gray-100">
                                                    <tr>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Date</th>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Account</th>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Currency</th>
                                                        <th class="px-4 py-2 text-right text-sm font-semibold text-gray-700">Amount</th>
                                                        <th class="px-4 py-2 text-right text-sm font-semibold text-gray-700">Rate</th>
                                                        <th class="px-4 py-2 text-right text-sm font-semibold text-gray-700">USD</th>
                                                        <th class="px-4 py-2 text-right text-sm font-semibold text-gray-700">CAD</th>
                                                        <th class="px-4 py-2 text-center text-sm font-semibold text-gray-700">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody id="historical-balances-table">
                                                    <tr>
                                                        <td colspan="8" class="px-4 py-8 text-center text-gray-500">
                                                            <i class="fas fa-inbox text-3xl mb-2"></i>
                                                            <p>No historical balances yet</p>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>
                    
                    <!-- Edit Historical Balance Modal -->
                    <div id="edit-hist-balance-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
                        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                            <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                                <h3 class="text-2xl font-bold text-brand-teal">
                                    <i class="fas fa-edit mr-2"></i>Edit Historical Balance
                                </h3>
                                <button onclick="closeEditHistBalanceModal()" class="text-gray-500 hover:text-gray-700">
                                    <i class="fas fa-times text-2xl"></i>
                                </button>
                            </div>
                            
                            <div class="p-6">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">Account</label>
                                        <select id="edit-hist-balance-account" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal">
                                            <option value="">Select Account...</option>
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">Month/Year</label>
                                        <input type="month" id="edit-hist-balance-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal">
                                    </div>
                                    
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">Currency</label>
                                        <select id="edit-hist-balance-currency" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" onchange="calculateEditHistoricalBalance()">
                                            <option value="USD">USD</option>
                                            <option value="CAD">CAD</option>
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">Balance Amount</label>
                                        <input type="number" id="edit-hist-balance-amount" step="0.01" placeholder="0.00" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" oninput="calculateEditHistoricalBalance()">
                                    </div>
                                    
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">Exchange Rate</label>
                                        <input type="number" id="edit-hist-balance-rate" step="0.000001" placeholder="1.35" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" oninput="calculateEditHistoricalBalance()">
                                        <p class="text-xs text-gray-500 mt-1">CAD per 1 USD</p>
                                    </div>
                                    
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">Calculated Balance</label>
                                        <input type="text" id="edit-hist-balance-calculated" readonly class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700">
                                        <p class="text-xs text-gray-500 mt-1" id="edit-hist-balance-calculated-label">USD Balance</p>
                                    </div>
                                </div>
                                
                                <div class="mt-6 flex gap-3 justify-end">
                                    <button onclick="closeEditHistBalanceModal()" class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400">
                                        <i class="fas fa-times mr-2"></i>Cancel
                                    </button>
                                    <button onclick="saveEditHistoricalBalance()" class="px-6 py-2 bg-brand-teal text-white rounded-lg font-semibold hover:bg-teal-700">
                                        <i class="fas fa-save mr-2"></i>Save Changes
                                    </button>
                                </div>
                                
                                <input type="hidden" id="edit-hist-balance-id">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Dividend Repository Utility -->
                    <div id="dividend-repository-utility" class="utility-content hidden">
                        <div class="card mb-6">
                            <div class="flex items-start gap-4 mb-4">
                                <div class="bg-brand-gold text-white p-3 rounded-lg">
                                    <i class="fas fa-coins text-2xl"></i>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-xl font-bold text-gray-800 mb-2">Dividend Repository</h3>
                                    <p class="text-gray-600 mb-4">
                                        Automatically fetch and track dividends for all your stock holdings from 2025 onwards. 
                                        Uses a dual-API approach: <strong>Polygon.io (Massive)</strong> for US stocks and <strong>EODHD</strong> as automatic fallback for Canadian stocks (.TO, .V).
                                    </p>
                                    
                                    <!-- API Information Panel (Collapsible) -->
                                    <details class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                        <summary class="font-semibold text-gray-900 cursor-pointer hover:text-blue-700 flex items-center">
                                            <i class="fas fa-info-circle mr-2 text-blue-600"></i>
                                            <span>API Coverage & Limitations</span>
                                            <i class="fas fa-chevron-down ml-2 text-xs text-blue-600"></i>
                                        </summary>
                                        <div class="mt-3">
                                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <p class="font-semibold text-gray-900 mb-1">
                                                        <i class="fas fa-flag-usa mr-1 text-blue-600"></i>Polygon.io (Massive) - Primary
                                                    </p>
                                                    <ul class="text-gray-700 space-y-1 ml-4">
                                                        <li><i class="fas fa-check text-green-600 mr-1"></i>US stocks (NYSE, NASDAQ, AMEX)</li>
                                                        <li><i class="fas fa-check text-green-600 mr-1"></i>250 requests/day free tier</li>
                                                        <li><i class="fas fa-check text-green-600 mr-1"></i>Weekly, monthly, quarterly dividends</li>
                                                        <li><i class="fas fa-times text-red-600 mr-1"></i>No Canadian stock support</li>
                                                    </ul>
                                                </div>
                                                <div>
                                                    <p class="font-semibold text-gray-900 mb-1">
                                                        <i class="fas fa-leaf mr-1 text-green-600"></i>EODHD - Automatic Fallback
                                                    </p>
                                                    <ul class="text-gray-700 space-y-1 ml-4">
                                                        <li><i class="fas fa-check text-green-600 mr-1"></i>Canadian stocks (TSX, TSXV)</li>
                                                        <li><i class="fas fa-check text-green-600 mr-1"></i>Tickers ending in .TO or .V</li>
                                                        <li><i class="fas fa-check text-green-600 mr-1"></i>1 year dividend history</li>
                                                        <li><i class="fas fa-info text-blue-600 mr-1"></i>Activated when Massive returns 0</li>
                                                    </ul>
                                                </div>
                                            </div>
                                            <p class="text-xs text-gray-600 mt-3">
                                                <i class="fas fa-clock mr-1"></i><strong>Processing Time:</strong> ~4-5 minutes for full portfolio (12.5 second delay between tickers to respect rate limits)
                                            </p>
                                            <p class="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                                <i class="fas fa-exclamation-triangle mr-1"></i><strong>Important:</strong> Do not trigger multiple fetches in quick succession. If you receive rate limit errors (HTTP 429), wait at least 1 minute before retrying.
                                            </p>
                                        </div>
                                    </details>
                                    
                                    <!-- Fetch Dividends Section (Collapsible) -->
                                    <details class="bg-gradient-to-br from-gold-50 to-white border border-brand-gold rounded-lg p-4 mb-4">
                                        <summary class="font-semibold text-gray-900 cursor-pointer hover:text-brand-gold flex items-center">
                                            <i class="fas fa-download mr-2 text-brand-gold"></i>
                                            <span>Fetch Dividends</span>
                                            <i class="fas fa-chevron-down ml-2 text-xs text-brand-gold"></i>
                                        </summary>
                                        <div class="mt-3">
                                            <p class="text-sm text-gray-700 mb-3">
                                                This will check all your stock holdings for dividend payments since January 1, 2025. The system will:
                                            </p>
                                            <ul class="text-sm text-gray-700 space-y-1 mb-4 ml-4">
                                                <li><i class="fas fa-check text-green-600 mr-2"></i>Try Polygon.io (Massive) first for all tickers</li>
                                                <li><i class="fas fa-check text-green-600 mr-2"></i>Automatically fallback to EODHD for Canadian stocks</li>
                                                <li><i class="fas fa-check text-green-600 mr-2"></i>Only include dividends from 2025 onwards</li>
                                                <li><i class="fas fa-check text-green-600 mr-2"></i>Store results in global dividend repository</li>
                                                <li><i class="fas fa-check text-green-600 mr-2"></i>Deduplicate tickers to minimize API calls</li>
                                            </ul>
                                            <button onclick="fetchDividends()" id="fetch-dividends-btn" class="btn-primary w-full">
                                                <i class="fas fa-sync mr-2"></i>Fetch Dividends for All Holdings
                                            </button>
                                            <div id="fetch-status" class="mt-3 text-sm"></div>
                                        </div>
                                    </details>
                                    
                                    <!-- Filter Section -->
                                    <div class="flex gap-4 mb-4">
                                        <div class="flex-1">
                                            <label class="block text-sm font-semibold text-gray-700 mb-2">Filter by Ticker</label>
                                            <input type="text" id="dividend-ticker-filter" placeholder="e.g., AAPL" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" onkeyup="loadDividendRepository()">
                                        </div>
                                        <div class="flex items-end">
                                            <button onclick="loadDividendRepository()" class="btn-secondary h-[42px]">
                                                <i class="fas fa-search mr-2"></i>Search
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <!-- Dividend Repository Table -->
                                    <div class="border border-gray-200 rounded-lg overflow-hidden">
                                        <div class="overflow-x-auto">
                                            <table class="w-full">
                                                <thead class="bg-gray-100">
                                                    <tr>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Ticker</th>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Ex-Date</th>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Pay Date</th>
                                                        <th class="px-4 py-2 text-right text-sm font-semibold text-gray-700">Amount/Share</th>
                                                        <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Frequency</th>
                                                        <th class="px-4 py-2 text-center text-sm font-semibold text-gray-700">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody id="dividend-repository-table">
                                                    <tr>
                                                        <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                                                            <i class="fas fa-coins text-3xl mb-2"></i>
                                                            <p>No dividends found yet. Click "Fetch Dividends" to start.</p>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    
                                    <!-- Fetch Logs -->
                                    <details class="mt-4 bg-gray-50 border border-gray-300 rounded-lg p-4">
                                        <summary class="font-semibold text-gray-800 cursor-pointer hover:text-brand-teal">
                                            <i class="fas fa-history mr-2"></i>Fetch History Logs
                                        </summary>
                                        <div class="mt-3 space-y-2" id="dividend-fetch-logs">
                                            <p class="text-sm text-gray-500">No fetch history yet</p>
                                        </div>
                                    </details>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Edit Dividend Modal -->
                    <div id="edit-dividend-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
                        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                            <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                                <h3 class="text-2xl font-bold text-brand-teal">
                                    <i class="fas fa-edit mr-2"></i>Edit Dividend Entry
                                </h3>
                                <button onclick="closeEditDividendModal()" class="text-gray-500 hover:text-gray-700">
                                    <i class="fas fa-times text-2xl"></i>
                                </button>
                            </div>
                            
                            <div class="p-6 space-y-4">
                                <!-- Ticker (read-only) -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">Ticker</label>
                                    <input type="text" id="edit-dividend-ticker" readonly class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50" />
                                </div>
                                
                                <!-- Ex-Dividend Date -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">
                                        Ex-Dividend Date <span class="text-red-500">*</span>
                                    </label>
                                    <input type="date" id="edit-dividend-ex-date" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                                    <p class="text-xs text-gray-500 mt-1">Date when stock trades without dividend</p>
                                </div>
                                
                                <!-- Pay Date -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">Pay Date</label>
                                    <input type="date" id="edit-dividend-pay-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                                    <p class="text-xs text-gray-500 mt-1">Date when dividend is paid (optional)</p>
                                </div>
                                
                                <!-- Record Date -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">Record Date</label>
                                    <input type="date" id="edit-dividend-record-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                                    <p class="text-xs text-gray-500 mt-1">Date of record for dividend eligibility (optional)</p>
                                </div>
                                
                                <!-- Declaration Date -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">Declaration Date</label>
                                    <input type="date" id="edit-dividend-declared-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                                    <p class="text-xs text-gray-500 mt-1">Date when dividend was declared (optional)</p>
                                </div>
                                
                                <!-- Amount per Share -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">
                                        Amount per Share <span class="text-red-500">*</span>
                                    </label>
                                    <input type="number" id="edit-dividend-amount" step="0.0001" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal" />
                                    <p class="text-xs text-gray-500 mt-1">Dividend amount in dollars (e.g., 0.1234)</p>
                                </div>
                                
                                <!-- Frequency -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">Frequency</label>
                                    <select id="edit-dividend-frequency" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal">
                                        <option value="52">Weekly (52)</option>
                                        <option value="12">Monthly (12)</option>
                                        <option value="4">Quarterly (4)</option>
                                        <option value="2">Semi-Annual (2)</option>
                                        <option value="1">Annual (1)</option>
                                    </select>
                                    <p class="text-xs text-gray-500 mt-1">Expected number of dividend payments per year</p>
                                </div>
                                
                                <!-- Buttons -->
                                <div class="flex gap-3 justify-end pt-4 border-t">
                                    <button onclick="closeEditDividendModal()" class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400">
                                        <i class="fas fa-times mr-2"></i>Cancel
                                    </button>
                                    <button onclick="saveEditDividend()" class="px-6 py-2 bg-brand-teal text-white rounded-lg font-semibold hover:bg-teal-700">
                                        <i class="fas fa-save mr-2"></i>Save Changes
                                    </button>
                                </div>
                                
                                <input type="hidden" id="edit-dividend-id">
                            </div>
                        </div>
                    </div>
                    <!-- Discovery Utility -->
                    <div id="discovery-utility" class="utility-content hidden">
                        <div class="card mb-6">
                            <div class="flex items-start gap-4 mb-4">
                                <div class="bg-brand-teal text-white p-3 rounded-lg"><i class="fas fa-binoculars text-2xl"></i></div>
                                <div class="flex-1">
                                    <div class="flex justify-between items-center mb-2">
                                        <h3 class="text-xl font-bold text-gray-800">Discovery</h3>
                                        <button onclick="loadDiscovery()" class="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"><i class="fas fa-sync mr-1"></i>Refresh</button>
                                    </div>
                                    <p class="text-gray-600 text-sm">New companies the automatic scans have put on your radar. Click a row to see why.</p>
                                </div>
                            </div>
                            <div class="flex gap-2 mb-4" id="discovery-tabs">
                                <button data-discovery-tab="guru" onclick="setDiscoveryTab('guru')" class="px-4 py-2 rounded font-semibold text-sm">Guru purchases</button>
                                <button data-discovery-tab="maturing" onclick="setDiscoveryTab('maturing')" class="px-4 py-2 rounded font-semibold text-sm">Gov't contracts</button>
                                <button data-discovery-tab="setup" onclick="setDiscoveryTab('setup')" class="px-4 py-2 rounded font-semibold text-sm">Trade setups</button>
                            </div>
                            <div id="discovery-status" class="text-sm text-gray-700 mb-4"></div>
                            <div id="discovery-list"></div>
                        </div>
                    </div>
                    <!-- Queue Management Utility -->
                    <div id="queue-management-utility" class="utility-content hidden">
                        <div class="card mb-6">
                            <div class="flex items-start gap-4 mb-4">
                                <div class="bg-brand-teal text-white p-3 rounded-lg">
                                    <i class="fas fa-list-check text-2xl"></i>
                                </div>
                                <div class="flex-1">
                                    <div class="flex justify-between items-center mb-4">
                                        <h3 class="text-xl font-bold text-gray-800">Research Queue</h3>
                                        <button onclick="loadResearchQueue()" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">
                                            <i class="fas fa-sync mr-2"></i>Refresh
                                        </button>
                                    </div>
                                    <div class="overflow-x-auto">
                                        <table class="min-w-full bg-white border border-gray-200 rounded-lg">
                                            <thead class="bg-gray-100">
                                                <tr>
                                                    <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Ticker</th>
                                                    <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Type</th>
                                                    <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Status</th>
                                                    <th class="px-4 py-2 text-center text-sm font-semibold text-gray-700">Attempts</th>
                                                    <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Requested</th>
                                                    <th class="px-4 py-2 text-left text-sm font-semibold text-gray-700">Claimed</th>
                                                    <th class="px-4 py-2 text-center text-sm font-semibold text-gray-700">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody id="research-queue-table">
                                                <tr>
                                                    <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                                                        <i class="fas fa-spinner fa-spin mr-2"></i>Loading...
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>
                    <!-- End Utilities Section -->
                    


                    <!-- Reports Section -->
                    <!-- NEW REPORTS SECTION WITH TABS -->
                    <div id="reports-section" class="section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-3xl font-bold text-brand-teal">
                                <i class="fas fa-chart-bar mr-2"></i>Reports Dashboard
                            </h2>
                            <div class="text-sm text-gray-600">
                                <i class="fas fa-info-circle mr-1"></i>
                                Comprehensive portfolio analysis and insights
                            </div>
                        </div>
                        
                        <!-- Tab Navigation -->
                        <div class="mb-6 border-b border-gray-200">
                            <nav class="flex flex-wrap gap-2">
                                <button onclick="showReportTab('overview')" class="report-tab active px-6 py-3 font-semibold text-brand-teal border-b-2 border-brand-teal" data-tab="overview">
                                    <i class="fas fa-chart-pie mr-2"></i>Portfolio Overview
                                </button>
                                <button onclick="showReportTab('pl-summary')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="pl-summary">
                                    <i class="fas fa-dollar-sign mr-2"></i>P/L Summary
                                </button>
                                <button onclick="showReportTab('performance')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="performance">
                                    <i class="fas fa-chart-line mr-2"></i>Performance
                                </button>
                                <button onclick="showReportTab('strategy')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="strategy">
                                    <i class="fas fa-chess mr-2"></i>Strategy Analysis
                                </button>
                                <button onclick="showReportTab('positions')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="positions">
                                    <i class="fas fa-sitemap mr-2"></i>Position Analysis
                                </button>
                                <button onclick="showReportTab('dividends')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="dividends">
                                    <i class="fas fa-coins mr-2"></i>Dividends
                                </button>
                                <button onclick="showReportTab('monthly-income')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="monthly-income">
                                    <i class="fas fa-money-bill-wave mr-2"></i>Monthly Income
                                </button>
                                <button onclick="showReportTab('closed-trades')" class="report-tab px-6 py-3 font-semibold text-gray-600 hover:text-brand-teal" data-tab="closed-trades">
                                    <i class="fas fa-history mr-2"></i>Closed Trades
                                </button>
                            </nav>
                        </div>
                        
                        <!-- Portfolio Overview Tab -->
                        <div id="report-tab-overview" class="report-tab-content">
                            <div class="mb-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">Portfolio Overview</h3>
                                
                                <!-- Key Metrics Cards -->
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    <div class="card bg-gradient-to-br from-teal-50 to-white cursor-pointer hover:shadow-lg transition-shadow" onclick="toggleTotalValueCurrency()">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Total Value <span id="overview-currency-label">(CAD)</span></p>
                                                <p class="text-2xl font-bold text-brand-teal" id="overview-total-value">$0.00</p>
                                                <p class="text-xs text-gray-500 italic mt-1" id="overview-total-value-subtitle">USD: $0.00</p>
                                            </div>
                                            <div class="text-3xl text-brand-teal opacity-20">
                                                <i class="fas fa-wallet"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-green-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">YTD P/L</p>
                                                <p class="text-2xl font-bold text-green-600" id="overview-ytd-pl">+$0.00</p>
                                                <p class="text-xs text-gray-500 mt-1" id="overview-ytd-pl-change">↑ 0%</p>
                                            </div>
                                            <div class="text-3xl text-green-600 opacity-20">
                                                <i class="fas fa-chart-line"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-blue-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Win Rate</p>
                                                <p class="text-2xl font-bold text-blue-600" id="overview-win-rate">0%</p>
                                                <p class="text-xs text-gray-500 mt-1" id="overview-trades-count">0 trades</p>
                                            </div>
                                            <div class="text-3xl text-blue-600 opacity-20">
                                                <i class="fas fa-trophy"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-purple-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Avg Trade P/L</p>
                                                <p class="text-2xl font-bold text-purple-600" id="overview-avg-pl">$0.00</p>
                                                <p class="text-xs text-gray-500 mt-1" id="overview-best-trade">Best: $0</p>
                                            </div>
                                            <div class="text-3xl text-purple-600 opacity-20">
                                                <i class="fas fa-hand-holding-usd"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Portfolio Value Chart -->
                                <div class="card mb-6">
                                    <div class="flex justify-between items-center mb-4">
                                        <h4 class="text-lg font-bold text-gray-800">
                                            <i class="fas fa-chart-area text-brand-teal mr-2"></i>
                                            Portfolio Value Trend
                                        </h4>
                                        <div class="flex gap-2">
                                            <button onclick="changePortfolioTimeframe('ytd')" data-timeframe="ytd" class="portfolio-timeframe-btn px-3 py-1 text-sm font-semibold border border-gray-300 rounded hover:bg-brand-teal hover:text-white hover:border-brand-teal transition-colors">
                                                YTD
                                            </button>
                                            <button onclick="changePortfolioTimeframe('12months')" data-timeframe="12months" class="portfolio-timeframe-btn px-3 py-1 text-sm font-semibold border border-gray-300 rounded bg-brand-teal text-white border-brand-teal">
                                                Last 12 Months
                                            </button>
                                            <button onclick="changePortfolioTimeframe('all')" data-timeframe="all" class="portfolio-timeframe-btn px-3 py-1 text-sm font-semibold border border-gray-300 rounded hover:bg-brand-teal hover:text-white hover:border-brand-teal transition-colors">
                                                All Time
                                            </button>
                                        </div>
                                    </div>
                                    <div style="position: relative;">
                                        <div id="overview-portfolio-chart" style="height: 350px;"></div>
                                        <div id="portfolio-chart-loading" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.9); z-index: 10; justify-content: center; align-items: center;">
                                            <div style="text-align: center;">
                                                <i class="fas fa-spinner fa-spin text-brand-teal" style="font-size: 2rem;"></i>
                                                <p class="mt-2 text-gray-600 font-semibold">Loading chart data...</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Account Breakdown and Monthly P/L -->
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    <div class="card">
                                        <h4 class="text-lg font-bold text-gray-800 mb-4">
                                            <i class="fas fa-building text-blue-600 mr-2"></i>
                                            Account Distribution
                                        </h4>
                                        <div id="overview-account-chart" style="height: 300px;"></div>
                                    </div>
                                    
                                    <div class="card">
                                        <h4 class="text-lg font-bold text-gray-800 mb-4">
                                            <i class="fas fa-calendar-alt text-green-600 mr-2"></i>
                                            Monthly P/L Breakdown
                                        </h4>
                                        <div id="overview-monthly-pl-chart" style="height: 300px;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- P/L Summary Tab -->
                        <div id="report-tab-pl-summary" class="report-tab-content hidden">
                            <div class="mb-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-dollar-sign text-green-600 mr-2"></i>
                                    Profit & Loss Summary
                                </h3>
                                
                                <!-- Time Period Selector -->
                                <div class="card mb-6">
                                    <div class="flex items-center gap-2 mb-4">
                                        <i class="fas fa-calendar-alt text-brand-teal"></i>
                                        <span class="font-semibold text-gray-700">Time Period:</span>
                                    </div>
                                    <div class="flex flex-wrap gap-2">
                                        <button onclick="loadPLSummary('mtd')" class="pl-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="mtd">
                                            MTD
                                        </button>
                                        <button onclick="loadPLSummary('qtd')" class="pl-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="qtd">
                                            QTD
                                        </button>
                                        <button onclick="loadPLSummary('ytd')" class="pl-period-btn active px-4 py-2 bg-brand-teal text-white rounded-lg" data-period="ytd">
                                            YTD
                                        </button>
                                        <button onclick="loadPLSummary('12months')" class="pl-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="12months">
                                            Last 12 Months
                                        </button>
                                        <button onclick="loadPLSummary('all')" class="pl-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="all">
                                            All Time
                                        </button>
                                    </div>
                                </div>
                                
                                <!-- Summary Metrics Cards -->
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    <div class="card bg-gradient-to-br from-green-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Total P/L</p>
                                                <p class="text-2xl font-bold text-green-600" id="pl-total">$0.00</p>
                                                <p class="text-xs text-gray-500 mt-1" id="pl-total-subtitle">0 trades</p>
                                            </div>
                                            <div class="text-3xl text-green-600 opacity-20">
                                                <i class="fas fa-dollar-sign"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-blue-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Win Rate</p>
                                                <p class="text-2xl font-bold text-blue-600" id="pl-win-rate">0%</p>
                                                <p class="text-xs text-gray-500 mt-1" id="pl-win-loss">0W / 0L</p>
                                            </div>
                                            <div class="text-3xl text-blue-600 opacity-20">
                                                <i class="fas fa-trophy"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-purple-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Average Trade</p>
                                                <p class="text-2xl font-bold text-purple-600" id="pl-avg-trade">$0.00</p>
                                                <p class="text-xs text-gray-500 mt-1" id="pl-avg-subtitle">Per trade</p>
                                            </div>
                                            <div class="text-3xl text-purple-600 opacity-20">
                                                <i class="fas fa-chart-bar"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-orange-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Best Trade</p>
                                                <p class="text-2xl font-bold text-orange-600" id="pl-best-trade">$0.00</p>
                                                <p class="text-xs text-gray-500 mt-1" id="pl-worst-trade">Worst: $0</p>
                                            </div>
                                            <div class="text-3xl text-orange-600 opacity-20">
                                                <i class="fas fa-star"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Charts Row -->
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    <!-- P/L by Asset Type Chart -->
                                    <div class="card">
                                        <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                            <i class="fas fa-layer-group mr-2 text-brand-teal"></i>
                                            P/L by Asset Type
                                        </h4>
                                        <div id="pl-asset-chart" style="height: 300px;"></div>
                                    </div>
                                    
                                    <!-- P/L by Account Type Chart -->
                                    <div class="card">
                                        <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                            <i class="fas fa-wallet mr-2 text-brand-teal"></i>
                                            P/L by Account Type
                                        </h4>
                                        <div id="pl-account-chart" style="height: 300px;"></div>
                                    </div>
                                </div>
                                
                                <!-- Detailed Breakdown Tables -->
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    <!-- By Asset Type Table -->
                                    <div class="card">
                                        <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                            <i class="fas fa-list mr-2 text-brand-teal"></i>
                                            Breakdown by Asset Type
                                        </h4>
                                        <div class="overflow-x-auto">
                                            <table class="w-full">
                                                <thead>
                                                    <tr class="bg-gray-100">
                                                        <th class="px-4 py-3 text-left">Asset Type</th>
                                                        <th class="px-4 py-3 text-right">Trades</th>
                                                        <th class="px-4 py-3 text-right">P/L</th>
                                                        <th class="px-4 py-3 text-right">Win Rate</th>
                                                    </tr>
                                                </thead>
                                                <tbody id="pl-asset-table">
                                                    <!-- Dynamic content -->
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    
                                    <!-- By Account Type Table -->
                                    <div class="card">
                                        <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                            <i class="fas fa-list mr-2 text-brand-teal"></i>
                                            Breakdown by Account Type
                                        </h4>
                                        <div class="overflow-x-auto">
                                            <table class="w-full">
                                                <thead>
                                                    <tr class="bg-gray-100">
                                                        <th class="px-4 py-3 text-left">Account Type</th>
                                                        <th class="px-4 py-3 text-right">Trades</th>
                                                        <th class="px-4 py-3 text-right">P/L</th>
                                                        <th class="px-4 py-3 text-right">Win Rate</th>
                                                    </tr>
                                                </thead>
                                                <tbody id="pl-account-table">
                                                    <!-- Dynamic content -->
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Monthly P/L Trend -->
                                <div class="card">
                                    <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                        <i class="fas fa-chart-line mr-2 text-brand-teal"></i>
                                        Monthly P/L Trend
                                    </h4>
                                    <div id="pl-monthly-chart" style="height: 350px;"></div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Performance Tab -->
                        <!-- Performance Charts Tab -->
                        <div id="report-tab-performance" class="report-tab-content hidden">
                            <div class="mb-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-chart-line text-blue-600 mr-2"></i>
                                    Performance Analysis
                                </h3>
                                
                                <!-- Time Period Selector -->
                                <div class="card mb-6">
                                    <div class="flex items-center gap-2 mb-4">
                                        <i class="fas fa-calendar-alt text-brand-teal"></i>
                                        <span class="font-semibold text-gray-700">Time Period:</span>
                                    </div>
                                    <div class="flex flex-wrap gap-2">
                                        <button onclick="loadPerformanceAnalysis('ytd')" class="performance-period-btn active px-4 py-2 bg-brand-teal text-white rounded-lg" data-period="ytd">
                                            YTD
                                        </button>
                                        <button onclick="loadPerformanceAnalysis('1year')" class="performance-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="1year">
                                            1 Year
                                        </button>
                                        <button onclick="loadPerformanceAnalysis('3years')" class="performance-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="3years">
                                            3 Years
                                        </button>
                                        <button onclick="loadPerformanceAnalysis('all')" class="performance-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="all">
                                            All Time
                                        </button>
                                    </div>
                                </div>
                                
                                <!-- Summary Metrics Cards -->
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    <div class="card bg-gradient-to-br from-green-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Total Return</p>
                                                <p class="text-2xl font-bold text-green-600" id="perf-total-return">0%</p>
                                                <p class="text-xs text-gray-500 mt-1" id="perf-total-pl">$0.00</p>
                                            </div>
                                            <div class="text-3xl text-green-600 opacity-20">
                                                <i class="fas fa-arrow-trend-up"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-red-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Max Drawdown</p>
                                                <p class="text-2xl font-bold text-red-600" id="perf-max-dd">0%</p>
                                                <p class="text-xs text-gray-500 mt-1" id="perf-dd-date">No data</p>
                                            </div>
                                            <div class="text-3xl text-red-600 opacity-20">
                                                <i class="fas fa-arrow-trend-down"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-blue-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Volatility</p>
                                                <p class="text-2xl font-bold text-blue-600" id="perf-volatility">0%</p>
                                                <p class="text-xs text-gray-500 mt-1">Annualized</p>
                                            </div>
                                            <div class="text-3xl text-blue-600 opacity-20">
                                                <i class="fas fa-wave-square"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-purple-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Sharpe Ratio</p>
                                                <p class="text-2xl font-bold text-purple-600" id="perf-sharpe">0.00</p>
                                                <p class="text-xs text-gray-500 mt-1">Risk-adjusted</p>
                                            </div>
                                            <div class="text-3xl text-purple-600 opacity-20">
                                                <i class="fas fa-balance-scale"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Portfolio Growth Chart -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-chart-area text-green-600 mr-2"></i>
                                        Portfolio Growth (Cumulative P/L)
                                    </h4>
                                    <div id="portfolio-growth-chart" style="height: 400px;"></div>
                                </div>
                                
                                <!-- Drawdown Analysis -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-arrow-down text-red-600 mr-2"></i>
                                        Drawdown Analysis
                                    </h4>
                                    <div id="drawdown-chart" style="height: 300px;"></div>
                                    
                                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                        <div class="p-4 bg-red-50 rounded-lg border border-red-200">
                                            <p class="text-sm text-gray-600 font-semibold mb-1">Maximum Drawdown</p>
                                            <p class="text-xl font-bold text-red-600" id="perf-max-dd-detail">0%</p>
                                            <p class="text-xs text-gray-500 mt-1" id="perf-max-dd-date">No data</p>
                                        </div>
                                        <div class="p-4 bg-orange-50 rounded-lg border border-orange-200">
                                            <p class="text-sm text-gray-600 font-semibold mb-1">Longest Drawdown</p>
                                            <p class="text-xl font-bold text-orange-600" id="perf-longest-dd">0 days</p>
                                            <p class="text-xs text-gray-500 mt-1">Duration in drawdown</p>
                                        </div>
                                        <div class="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                                            <p class="text-sm text-gray-600 font-semibold mb-1">Recovery Time</p>
                                            <p class="text-xl font-bold text-yellow-600" id="perf-recovery-time">-</p>
                                            <p class="text-xs text-gray-500 mt-1">Time to recover peak</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Rolling Returns -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-calendar-check text-blue-600 mr-2"></i>
                                        Rolling Returns (30-Day)
                                    </h4>
                                    <div id="rolling-returns-chart" style="height: 300px;"></div>
                                </div>
                                
                                <!-- Monthly Returns Table -->
                                <div class="card">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-table text-purple-600 mr-2"></i>
                                        Monthly Returns Summary
                                    </h4>
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Month</th>
                                                    <th class="px-4 py-3 text-right">Return %</th>
                                                    <th class="px-4 py-3 text-right">P/L</th>
                                                    <th class="px-4 py-3 text-center">Trades</th>
                                                    <th class="px-4 py-3 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody id="monthly-returns-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Strategy Analysis Tab -->
                        <div id="report-tab-strategy" class="report-tab-content hidden">
                            <div class="mb-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-chess text-purple-600 mr-2"></i>
                                    Strategy Analysis & Performance Comparison
                                </h3>
                                
                                <!-- Time Period Selector -->
                                <div class="card mb-6">
                                    <div class="flex items-center gap-2 mb-4">
                                        <i class="fas fa-calendar-alt text-brand-teal"></i>
                                        <span class="font-semibold text-gray-700">Time Period:</span>
                                    </div>
                                    <div class="flex flex-wrap gap-2">
                                        <button onclick="loadStrategyAnalysis('ytd')" class="strategy-period-btn active px-4 py-2 bg-brand-teal text-white rounded-lg" data-period="ytd">
                                            YTD
                                        </button>
                                        <button onclick="loadStrategyAnalysis('12months')" class="strategy-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="12months">
                                            Last 12 Months
                                        </button>
                                        <button onclick="loadStrategyAnalysis('all')" class="strategy-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-brand-teal hover:text-white transition" data-period="all">
                                            All Time
                                        </button>
                                    </div>
                                </div>
                                
                                <!-- Overall Performance Metrics -->
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    <div class="card bg-gradient-to-br from-green-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Total Return</p>
                                                <p class="text-2xl font-bold text-green-600" id="strategy-total-return">0%</p>
                                                <p class="text-xs text-gray-500 mt-1" id="strategy-total-pl">$0.00</p>
                                            </div>
                                            <div class="text-3xl text-green-600 opacity-20">
                                                <i class="fas fa-chart-line"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-blue-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Sharpe Ratio</p>
                                                <p class="text-2xl font-bold text-blue-600" id="strategy-sharpe">0.00</p>
                                                <p class="text-xs text-gray-500 mt-1">Risk-adjusted return</p>
                                            </div>
                                            <div class="text-3xl text-blue-600 opacity-20">
                                                <i class="fas fa-balance-scale"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-purple-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Max Drawdown</p>
                                                <p class="text-2xl font-bold text-purple-600" id="strategy-max-dd">0%</p>
                                                <p class="text-xs text-gray-500 mt-1">Peak to trough</p>
                                            </div>
                                            <div class="text-3xl text-purple-600 opacity-20">
                                                <i class="fas fa-arrow-down"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-orange-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Win Rate</p>
                                                <p class="text-2xl font-bold text-orange-600" id="strategy-win-rate">0%</p>
                                                <p class="text-xs text-gray-500 mt-1" id="strategy-win-loss">0W / 0L</p>
                                            </div>
                                            <div class="text-3xl text-orange-600 opacity-20">
                                                <i class="fas fa-trophy"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Strategy Comparison Charts -->
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    <!-- Strategy Performance Comparison -->
                                    <div class="card">
                                        <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                            <i class="fas fa-chart-bar mr-2 text-brand-teal"></i>
                                            Performance by Strategy
                                        </h4>
                                        <div id="strategy-performance-chart" style="height: 350px;"></div>
                                    </div>
                                    
                                    <!-- Win Rate by Strategy -->
                                    <div class="card">
                                        <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                            <i class="fas fa-percent mr-2 text-brand-teal"></i>
                                            Win Rate by Strategy
                                        </h4>
                                        <div id="strategy-winrate-chart" style="height: 350px;"></div>
                                    </div>
                                </div>
                                
                                <!-- Detailed Strategy Table -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                        <i class="fas fa-table mr-2 text-brand-teal"></i>
                                        Detailed Strategy Breakdown
                                    </h4>
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Strategy</th>
                                                    <th class="px-4 py-3 text-right">Trades</th>
                                                    <th class="px-4 py-3 text-right">Total P/L</th>
                                                    <th class="px-4 py-3 text-right">Avg P/L</th>
                                                    <th class="px-4 py-3 text-right">Win Rate</th>
                                                    <th class="px-4 py-3 text-right">Best Trade</th>
                                                    <th class="px-4 py-3 text-right">Worst Trade</th>
                                                    <th class="px-4 py-3 text-right">Sharpe</th>
                                                </tr>
                                            </thead>
                                            <tbody id="strategy-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                <!-- Benchmark Comparison -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                        <i class="fas fa-chart-line mr-2 text-brand-teal"></i>
                                        Benchmark Comparison
                                    </h4>
                                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                        <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                            <div class="flex items-center justify-between mb-2">
                                                <span class="text-sm font-semibold text-gray-700">SPY (S&P 500)</span>
                                                <span class="text-xs text-gray-500">YTD</span>
                                            </div>
                                            <p class="text-xl font-bold text-blue-600" id="benchmark-spy">+0.0%</p>
                                            <p class="text-xs text-gray-500 mt-1">Broad market index</p>
                                        </div>
                                        
                                        <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                            <div class="flex items-center justify-between mb-2">
                                                <span class="text-sm font-semibold text-gray-700">QQQ (Nasdaq-100)</span>
                                                <span class="text-xs text-gray-500">YTD</span>
                                            </div>
                                            <p class="text-xl font-bold text-purple-600" id="benchmark-qqq">+0.0%</p>
                                            <p class="text-xs text-gray-500 mt-1">Tech-heavy index</p>
                                        </div>
                                        
                                        <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                            <div class="flex items-center justify-between mb-2">
                                                <span class="text-sm font-semibold text-gray-700">Your Portfolio</span>
                                                <span class="text-xs text-gray-500">YTD</span>
                                            </div>
                                            <p class="text-xl font-bold text-green-600" id="benchmark-portfolio">+0.0%</p>
                                            <p class="text-xs text-gray-500 mt-1">Total return</p>
                                        </div>
                                    </div>
                                    
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Metric</th>
                                                    <th class="px-4 py-3 text-right">Your Portfolio</th>
                                                    <th class="px-4 py-3 text-right">SPY</th>
                                                    <th class="px-4 py-3 text-right">QQQ</th>
                                                    <th class="px-4 py-3 text-right">Hedge Funds*</th>
                                                </tr>
                                            </thead>
                                            <tbody id="benchmark-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                    <p class="text-xs text-gray-500 mt-4">
                                        * Hedge fund benchmarks: YTD ~8-12%, Sharpe ~1.5-2.0, Max DD ~10-15%
                                    </p>
                                </div>
                                
                                <!-- Monthly Performance Heat Map -->
                                <div class="card">
                                    <h4 class="text-lg font-semibold text-gray-800 mb-4">
                                        <i class="fas fa-calendar-check mr-2 text-brand-teal"></i>
                                        Monthly Performance Heat Map
                                    </h4>
                                    <div id="strategy-heatmap-chart" style="height: 400px;"></div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Position Analysis Tab -->
                        <!-- Position Analysis Tab -->
                        <div id="report-tab-positions" class="report-tab-content hidden">
                            <div class="mb-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-sitemap text-orange-600 mr-2"></i>
                                    Position Analysis & Portfolio Allocation
                                </h3>
                                
                                <!-- Summary Metrics Cards -->
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    <div class="card bg-gradient-to-br from-blue-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Total Positions</p>
                                                <p class="text-2xl font-bold text-blue-600" id="pos-total-positions">0</p>
                                                <p class="text-xs text-gray-500 mt-1">Open stock positions</p>
                                            </div>
                                            <div class="text-3xl text-blue-600 opacity-20">
                                                <i class="fas fa-chart-pie"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-orange-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Top 5 Concentration</p>
                                                <p class="text-2xl font-bold text-orange-600" id="pos-top5-concentration">0%</p>
                                                <p class="text-xs text-gray-500 mt-1">Of total portfolio</p>
                                            </div>
                                            <div class="text-3xl text-orange-600 opacity-20">
                                                <i class="fas fa-compress-alt"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-green-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Diversification Score</p>
                                                <p class="text-2xl font-bold text-green-600" id="pos-diversification">0</p>
                                                <p class="text-xs text-gray-500 mt-1">Out of 100</p>
                                            </div>
                                            <div class="text-3xl text-green-600 opacity-20">
                                                <i class="fas fa-network-wired"></i>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="card bg-gradient-to-br from-purple-50 to-white">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm text-gray-600 font-semibold">Largest Position</p>
                                                <p class="text-2xl font-bold text-purple-600" id="pos-largest">0%</p>
                                                <p class="text-xs text-gray-500 mt-1">Single position weight</p>
                                            </div>
                                            <div class="text-3xl text-purple-600 opacity-20">
                                                <i class="fas fa-crown"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Top Holdings Table -->
                                <div class="card mb-6">
                                    <div class="flex items-center justify-between mb-4">
                                        <h4 class="text-lg font-bold text-gray-800">
                                            <i class="fas fa-trophy text-yellow-600 mr-2"></i>
                                            Top Holdings
                                        </h4>
                                        <div class="flex gap-2">
                                            <button 
                                                id="holdings-by-account-btn" 
                                                class="px-4 py-2 bg-brand-teal text-white rounded font-semibold hover:bg-brand-teal-dark transition"
                                                onclick="switchHoldingsView('account')"
                                            >
                                                <i class="fas fa-wallet mr-1"></i>
                                                By Account
                                            </button>
                                            <button 
                                                id="holdings-by-portfolio-btn" 
                                                class="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300 transition"
                                                onclick="switchHoldingsView('portfolio')"
                                            >
                                                <i class="fas fa-chart-pie mr-1"></i>
                                                By Portfolio
                                            </button>
                                        </div>
                                    </div>
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Rank</th>
                                                    <th class="px-4 py-3 text-left">Ticker</th>
                                                    <th class="px-4 py-3 text-left">Company</th>
                                                    <th class="px-4 py-3 text-right">Shares</th>
                                                    <th class="px-4 py-3 text-right">Avg Price</th>
                                                    <th class="px-4 py-3 text-right">Cost/Share</th>
                                                    <th class="px-4 py-3 text-right">Value</th>
                                                    <th class="px-4 py-3 text-right">Weight %</th>
                                                    <th class="px-4 py-3 text-left">Account</th>
                                                </tr>
                                            </thead>
                                            <tbody id="top-holdings-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    <!-- Sector Allocation Chart -->
                                    <div class="card">
                                        <h4 class="text-lg font-bold text-gray-800 mb-4">
                                            <i class="fas fa-building text-blue-600 mr-2"></i>
                                            Sector Allocation
                                        </h4>
                                        <div id="sector-allocation-chart" style="height: 350px;"></div>
                                    </div>
                                    
                                    <!-- Account Allocation Chart -->
                                    <div class="card">
                                        <h4 class="text-lg font-bold text-gray-800 mb-4">
                                            <i class="fas fa-wallet text-purple-600 mr-2"></i>
                                            Account Allocation
                                        </h4>
                                        <div id="account-allocation-chart" style="height: 350px;"></div>
                                    </div>
                                </div>
                                
                                <!-- Sector Breakdown Table -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-layer-group text-blue-600 mr-2"></i>
                                        Sector Breakdown
                                    </h4>
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Sector</th>
                                                    <th class="px-4 py-3 text-right">Value</th>
                                                    <th class="px-4 py-3 text-right">Weight %</th>
                                                    <th class="px-4 py-3 text-center">Positions</th>
                                                    <th class="px-4 py-3 text-center">Allocation</th>
                                                </tr>
                                            </thead>
                                            <tbody id="sector-breakdown-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                <!-- Industry Breakdown -->
                                <div class="card mb-6">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-industry text-green-600 mr-2"></i>
                                        Top Industries
                                    </h4>
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Industry</th>
                                                    <th class="px-4 py-3 text-right">Value</th>
                                                    <th class="px-4 py-3 text-right">Weight %</th>
                                                    <th class="px-4 py-3 text-center">Positions</th>
                                                </tr>
                                            </thead>
                                            <tbody id="industry-breakdown-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                <!-- Concentration Analysis -->
                                <div class="card">
                                    <h4 class="text-lg font-bold text-gray-800 mb-4">
                                        <i class="fas fa-chart-bar text-orange-600 mr-2"></i>
                                        Concentration Analysis
                                    </h4>
                                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                            <p class="text-sm text-gray-600 font-semibold mb-1">Top 5 Holdings</p>
                                            <p class="text-xl font-bold text-blue-600" id="concentration-top5">0%</p>
                                            <p class="text-xs text-gray-500 mt-1">Of portfolio value</p>
                                        </div>
                                        <div class="p-4 bg-purple-50 rounded-lg border border-purple-200">
                                            <p class="text-sm text-gray-600 font-semibold mb-1">Top 10 Holdings</p>
                                            <p class="text-xl font-bold text-purple-600" id="concentration-top10">0%</p>
                                            <p class="text-xs text-gray-500 mt-1">Of portfolio value</p>
                                        </div>
                                        <div class="p-4 bg-green-50 rounded-lg border border-green-200">
                                            <p class="text-sm text-gray-600 font-semibold mb-1">HHI Score</p>
                                            <p class="text-xl font-bold text-green-600" id="concentration-hhi">0</p>
                                            <p class="text-xs text-gray-500 mt-1" id="concentration-hhi-label">Low concentration</p>
                                        </div>
                                    </div>
                                    <div class="mt-4 p-4 bg-gray-50 rounded-lg">
                                        <p class="text-sm text-gray-700">
                                            <strong>Concentration Guide:</strong> 
                                            Top 5 &lt;40% (Well diversified) | 
                                            40-60% (Moderate) | 
                                            &gt;60% (Concentrated) | 
                                            HHI &lt;1500 (Low) | 
                                            1500-2500 (Moderate) | 
                                            &gt;2500 (High)
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Dividends Report Tab -->
                        <div id="report-tab-dividends" class="report-tab-content hidden">
                            <div class="mb-6">
                                <h3 class="text-2xl font-bold text-gray-800 mb-4">
                                    <i class="fas fa-coins mr-2 text-brand-gold"></i>Dividend Report
                                </h3>
                                
                                <!-- Control Panel -->
                                <div class="card mb-6">
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <!-- Group By Selector -->
                                        <div>
                                            <label class="block text-sm font-semibold text-gray-700 mb-2">
                                                <i class="fas fa-layer-group mr-2 text-brand-teal"></i>Group By
                                            </label>
                                            <div class="flex gap-2">
                                                <button onclick="loadDividendsReport('account', getCurrentDividendPeriod())" id="dividends-group-account" class="dividends-group-btn active px-4 py-2 bg-brand-teal text-white rounded-lg font-semibold">
                                                    <i class="fas fa-building mr-2"></i>Account
                                                </button>
                                                <button onclick="loadDividendsReport('stock', getCurrentDividendPeriod())" id="dividends-group-stock" class="dividends-group-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">
                                                    <i class="fas fa-chart-line mr-2"></i>Stock
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <!-- Period Selector -->
                                        <div>
                                            <label class="block text-sm font-semibold text-gray-700 mb-2">
                                                <i class="fas fa-calendar-alt mr-2 text-brand-teal"></i>Time Period
                                            </label>
                                            <div class="flex gap-2">
                                                <button onclick="loadDividendsReport(getCurrentDividendGroupBy(), 'mtd')" id="dividends-period-mtd" class="dividends-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">
                                                    MTD
                                                </button>
                                                <button onclick="loadDividendsReport(getCurrentDividendGroupBy(), 'ytd')" id="dividends-period-ytd" class="dividends-period-btn active px-4 py-2 bg-brand-teal text-white rounded-lg font-semibold">
                                                    YTD
                                                </button>
                                                <button onclick="loadDividendsReport(getCurrentDividendGroupBy(), 'all')" id="dividends-period-all" class="dividends-period-btn px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">
                                                    All Time
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Summary Card -->
                                <div class="card bg-gradient-to-br from-gold-50 to-white mb-6">
                                    <div class="flex items-center justify-between">
                                        <div>
                                            <p class="text-sm text-gray-600 font-semibold mb-1">
                                                <i class="fas fa-coins mr-2 text-brand-gold"></i>Total Dividends
                                            </p>
                                            <p class="text-3xl font-bold text-brand-gold" id="dividends-total">$0.00</p>
                                            <p class="text-xs text-gray-500 mt-1" id="dividends-count">0 payments</p>
                                        </div>
                                        <div class="text-5xl text-brand-gold opacity-20">
                                            <i class="fas fa-coins"></i>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Dividends Table -->
                                <div class="card">
                                    <div class="overflow-x-auto">
                                        <table class="w-full">
                                            <thead>
                                                <tr class="border-b border-gray-200">
                                                    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase" id="dividends-header-col1">Account</th>
                                                    <th class="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Count</th>
                                                    <th class="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total Dividends</th>
                                                </tr>
                                            </thead>
                                            <tbody id="dividends-table-body">
                                                <tr>
                                                    <td colspan="3" class="px-4 py-8 text-center text-gray-400">
                                                        <i class="fas fa-coins text-4xl mb-2"></i>
                                                        <p>Loading dividends data...</p>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Monthly Income Tab -->
                        <div id="report-tab-monthly-income" class="report-tab-content hidden">
                            <div class="flex justify-between items-center mb-6">
                                <h3 class="text-2xl font-bold text-brand-teal">
                                    <i class="fas fa-money-bill-wave mr-2"></i>Monthly Income Report
                                </h3>
                                <div class="flex gap-4">
                                    <select id="monthly-income-month" class="px-4 py-2 border border-gray-300 rounded-lg" onchange="loadMonthlyIncome()">
                                        <!-- Populated dynamically -->
                                    </select>
                                    <select id="monthly-income-year" class="px-4 py-2 border border-gray-300 rounded-lg" onchange="loadMonthlyIncome()">
                                        <!-- Populated dynamically -->
                                    </select>
                                </div>
                            </div>
                            
                            <!-- Account Filter Tabs -->
                            <div id="monthly-income-account-tabs" class="flex gap-2 mb-6 border-b border-gray-200 overflow-x-auto">
                                <!-- Populated dynamically with ALL + user accounts -->
                            </div>
                            
                            <div id="monthly-income-content">
                                <p class="text-center text-gray-500 py-8">Select a month to view income details</p>
                            </div>
                        </div>
                        
                        <!-- Closed Trades Tab -->
                        <div id="report-tab-closed-trades" class="report-tab-content hidden">
                            <div class="flex justify-between items-center mb-6">
                                <h3 class="text-2xl font-bold text-brand-teal">
                                    <i class="fas fa-history mr-2"></i>Closed Trades
                                </h3>
                                <div class="flex gap-4">
                                    <select id="closed-trade-type" class="px-4 py-2 border border-gray-300 rounded-lg" onchange="loadClosedTrades()">
                                        <option value="all">All Trade Types</option>
                                        <option value="stocks">Stock Trades</option>
                                        <option value="options">Option Trades</option>
                                    </select>
                                    <button onclick="loadClosedTrades()" class="btn-primary">
                                        <i class="fas fa-sync mr-2"></i>Refresh
                                    </button>
                                </div>
                            </div>
                            
                            <!-- Closed Stock Trades -->
                            <div id="closed-stocks-container" class="mb-8">
                                <div class="card">
                                    <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center">
                                        <i class="fas fa-chart-line text-brand-teal mr-2"></i>
                                        Closed Stock Trades
                                    </h3>
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-sm">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Opened Date</th>
                                                    <th class="px-4 py-3 text-left">Ticker</th>
                                                    <th class="px-4 py-3 text-left">Closed Date</th>
                                                    <th class="px-4 py-3 text-right">Shares Sold</th>
                                                    <th class="px-4 py-3 text-right">Avg Cost</th>
                                                    <th class="px-4 py-3 text-right">Sell Price</th>
                                                    <th class="px-4 py-3 text-left">Account</th>
                                                    <th class="px-4 py-3 text-right">P/L</th>
                                                    <th class="px-4 py-3 text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody id="closed-stocks-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Closed Option Trades -->
                            <div id="closed-options-container" class="mb-8">
                                <div class="card">
                                    <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center">
                                        <i class="fas fa-file-contract text-purple-600 mr-2"></i>
                                        Closed Option Trades
                                    </h3>
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-sm">
                                            <thead>
                                                <tr class="bg-gray-100">
                                                    <th class="px-4 py-3 text-left">Close Date</th>
                                                    <th class="px-4 py-3 text-left">Ticker</th>
                                                    <th class="px-4 py-3 text-left">Strategy</th>
                                                    <th class="px-4 py-3 text-right">Strike</th>
                                                    <th class="px-4 py-3 text-right">Premium</th>
                                                    <th class="px-4 py-3 text-left">Expiration</th>
                                                    <th class="px-4 py-3 text-left">Account</th>
                                                    <th class="px-4 py-3 text-right">P/L</th>
                                                    <th class="px-4 py-3 text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody id="closed-options-table">
                                                <!-- Dynamic content -->
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                </div>
            </div>
        </div>
        
        <!-- Full Trade History Modal -->
        <div id="full-history-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
            <div class="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                    <h3 class="text-2xl font-bold text-orange-600">
                        <i class="fas fa-history mr-2"></i>Full Trade History
                    </h3>
                    <button onclick="closeFullHistoryModal()" class="text-gray-500 hover:text-gray-700">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                
                <div class="flex-1 overflow-y-auto p-6">
                    <div class="mb-4 flex gap-4 items-center">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Filter by Status</label>
                            <select id="history-status-filter" onchange="filterFullHistory()" class="px-4 py-2 border border-gray-300 rounded-lg">
                                <option value="all">All Trades</option>
                                <option value="closed">Closed Only</option>
                                <option value="open">Open Only</option>
                            </select>
                        </div>
                        <div class="flex-1">
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Search</label>
                            <input type="text" id="history-search" oninput="filterFullHistory()" placeholder="Search by date, strategy, notes..." class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                        </div>
                    </div>
                    
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="bg-gray-100">
                                    <th class="px-4 py-3 text-left">Date</th>
                                    <th class="px-4 py-3 text-left">Entry</th>
                                    <th class="px-4 py-3 text-left">Exit</th>
                                    <th class="px-4 py-3 text-left">Strategy</th>
                                    <th class="px-4 py-3 text-right">Credit</th>
                                    <th class="px-4 py-3 text-center">Contracts</th>
                                    <th class="px-4 py-3 text-right">P/L</th>
                                    <th class="px-4 py-3 text-center">Status</th>
                                    <th class="px-4 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="full-history-tbody">
                                <tr>
                                    <td colspan="9" class="px-4 py-8 text-center text-gray-500 italic">
                                        <i class="fas fa-spinner fa-spin mr-2"></i>Loading all trades...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Edit Trade Modal -->
        <div id="edit-trade-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
            <div class="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[95vh] overflow-y-auto">
                <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center z-10">
                    <h3 class="text-2xl font-bold text-orange-600">
                        <i class="fas fa-edit mr-2"></i>Edit Trade
                    </h3>
                    <button onclick="closeEditTradeModal()" class="text-gray-500 hover:text-gray-700">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                
                <div class="p-6">
                    <form id="edit-trade-form" onsubmit="updateTrade(event)">
                        <input type="hidden" id="edit-trade-id">
                        
                        <!-- ENTRY DATA SECTION -->
                        <div class="mb-4 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                            <h4 class="font-bold text-lg text-blue-700 mb-3">
                                <i class="fas fa-arrow-right mr-2"></i>ENTRY DATA
                            </h4>
                            
                            <!-- Compressed Entry Row: Date, Time, SPX, VIX, Contracts, Strike Width, Entry Commission -->
                            <div class="grid grid-cols-7 gap-3">
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Entry Date</label>
                                    <input type="date" id="edit-trade-date" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Entry Time</label>
                                    <input type="time" id="edit-entry-time" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">SPX Price</label>
                                    <input type="number" step="0.01" id="edit-spx-entry" placeholder="5856.20" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">VIX Price</label>
                                    <input type="number" step="0.01" id="edit-vix-entry" placeholder="15.50" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Contracts</label>
                                    <input type="number" id="edit-contracts" required min="1" value="1" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Strike Width</label>
                                    <input type="number" id="edit-strike-width" required min="1" value="5" onchange="updateEditStrikeWidthDisplays()" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Entry Commission ($)</label>
                                    <input type="number" step="0.01" id="edit-entry-commission" value="1.30" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Strategy Type Selection -->
                        <div class="mb-4">
                            <label class="block text-gray-700 font-semibold mb-2">Strategy Type</label>
                            <select id="edit-strategy-type" onchange="updateEditStrategyDisplay()" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                <option value="IRON_CONDOR">Iron Condor (Call + Put Spreads)</option>
                                <option value="CREDIT_SPREAD_CALL">Credit Spread - Call Only</option>
                                <option value="CREDIT_SPREAD_PUT">Credit Spread - Put Only</option>
                            </select>
                        </div>
                        
                        <!-- Call Spread Section -->
                        <div id="edit-call-spread-section" class="mb-4 p-4 border-2 border-red-200 rounded-lg bg-red-50">
                            <div class="flex justify-between items-center mb-3">
                                <h4 id="edit-call-spread-title" class="font-bold text-lg">
                                    <span class="text-red-600">BEARISH:</span> Call Spread <span class="text-sm font-normal text-gray-600">($5 wide)</span>
                                </h4>
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="edit-enable-call-spread" onchange="updateEditStrategyDisplay()" class="w-5 h-5">
                                    <span class="font-semibold">Enable</span>
                                </label>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2">Short Call Strike</label>
                                    <input type="number" step="0.01" id="edit-call-short-strike" placeholder="5875" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2">Total Credit ($)</label>
                                    <input type="number" step="0.01" id="edit-call-credit" placeholder="3.50" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Put Spread Section -->
                        <div id="edit-put-spread-section" class="mb-4 p-4 border-2 border-green-200 rounded-lg bg-green-50">
                            <div class="flex justify-between items-center mb-3">
                                <h4 id="edit-put-spread-title" class="font-bold text-lg">
                                    <span class="text-green-600">BULLISH:</span> Put Spread <span class="text-sm font-normal text-gray-600">($5 wide)</span>
                                </h4>
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="edit-enable-put-spread" onchange="updateEditStrategyDisplay()" class="w-5 h-5">
                                    <span class="font-semibold">Enable</span>
                                </label>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2">Short Put Strike</label>
                                    <input type="number" step="0.01" id="edit-put-short-strike" placeholder="5835" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2">Total Credit ($)</label>
                                    <input type="number" step="0.01" id="edit-put-credit" placeholder="3.00" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                </div>
                            </div>
                        </div>
                        
                        <!-- EXIT DATA SECTION (for closed trades) -->
                        <div id="edit-exit-section" class="mb-4 p-4 bg-orange-50 border-2 border-orange-300 rounded-lg hidden">
                            <h4 class="font-bold text-lg text-orange-700 mb-3">
                                <i class="fas fa-arrow-left mr-2"></i>EXIT DATA (Trade Closed)
                            </h4>
                            
                            <!-- Exit Row: Exit Time, Exit Cost, Exit Commission, Exit Reason -->
                            <div class="grid grid-cols-4 gap-3">
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Time</label>
                                    <input type="time" id="edit-exit-time" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Cost ($)</label>
                                    <input type="number" step="0.01" id="edit-exit-cost" placeholder="0.00" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    <small class="text-gray-500 text-xs">Debit paid to close</small>
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Commission ($)</label>
                                    <input type="number" step="0.01" id="edit-exit-commission" placeholder="1.30" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Reason</label>
                                    <select id="edit-exit-reason" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                        <option value="PROFIT_TARGET">Profit Target</option>
                                        <option value="TIME_EXIT">Time Exit</option>
                                        <option value="STOP_LOSS">Stop Loss</option>
                                        <option value="ATM_PROXIMITY">ATM Proximity</option>
                                        <option value="MANUAL">Manual</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Notes -->
                        <div class="mb-4">
                            <label class="block text-gray-700 font-semibold mb-2">Notes (Optional)</label>
                            <textarea id="edit-trade-notes" rows="3" placeholder="Add any notes about this trade..." class="w-full px-4 py-2 border border-gray-300 rounded-lg"></textarea>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="flex gap-3">
                            <button type="submit" class="px-6 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700">
                                <i class="fas fa-save mr-2"></i>Save Changes
                            </button>
                            <button type="button" onclick="closeEditTradeModal()" class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        
        <!-- Close Trade Modal -->
        <div id="close-trade-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
            <div class="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[95vh] overflow-y-auto">
                <div class="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center rounded-t-lg sticky top-0 z-10">
                    <h3 class="text-2xl font-bold text-orange-600">
                        <i class="fas fa-check-circle mr-2"></i>Close Trade
                    </h3>
                    <button onclick="closeCloseTradeModal()" class="text-gray-500 hover:text-gray-700">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                
                <div class="p-6">
                    <form id="close-trade-form" onsubmit="submitCloseTrade(event)">
                        <input type="hidden" id="close-trade-id">
                        
                        <div id="close-trade-summary" class="mb-6 p-4 bg-gray-50 rounded-lg">
                            <!-- Trade summary will be populated here -->
                        </div>
                        
                        <!-- Compressed Exit Data Entry - All on One Line -->
                        <div class="grid grid-cols-4 gap-3 mb-4">
                            <div>
                                <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Time</label>
                                <input type="time" id="close-exit-time" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Cost ($)</label>
                                <input type="number" step="0.01" id="close-exit-cost" placeholder="0.00" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Commission ($)</label>
                                <input type="number" step="0.01" id="close-commission" value="1.30" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-2 text-sm">Exit Reason</label>
                                <select id="close-exit-reason" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    <option value="PROFIT_TARGET">Profit Target</option>
                                    <option value="TIME_EXIT">Time Exit</option>
                                    <option value="STOP_LOSS">Stop Loss</option>
                                    <option value="ATM_PROXIMITY">ATM Proximity</option>
                                    <option value="EXPIRED_WORTHLESS">Expired Worthless</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="mb-4 text-xs text-gray-500 -mt-2">
                            <i class="fas fa-info-circle mr-1"></i>Enter 0.00 for Exit Cost and Commission if trade expired worthless
                        </div>
                        
                        <div class="mb-6">
                            <label class="block text-gray-700 font-semibold mb-2">Close Notes (Optional)</label>
                            <textarea id="close-trade-notes" rows="3" placeholder="Add any closing notes about this trade..." class="w-full px-4 py-2 border border-gray-300 rounded-lg"></textarea>
                        </div>
                        
                        <!-- Real-time P/L Preview -->
                        <div id="close-pl-preview" class="mb-6 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg hidden">
                            <h4 class="text-sm font-semibold text-gray-700 mb-3 text-center">
                                <i class="fas fa-chart-line mr-2"></i>Real-Time P/L Preview
                            </h4>
                            <div class="grid grid-cols-3 gap-4">
                                <div class="text-center p-4 bg-white rounded-lg shadow-sm">
                                    <div class="text-xs text-gray-600 mb-1">Profit/Loss</div>
                                    <div id="close-pl-amount" class="text-2xl font-bold"></div>
                                </div>
                                <div class="text-center p-4 bg-white rounded-lg shadow-sm">
                                    <div class="text-xs text-gray-600 mb-1">RORC</div>
                                    <div id="close-rorc-amount" class="text-2xl font-bold"></div>
                                </div>
                                <div class="text-center p-4 bg-white rounded-lg shadow-sm">
                                    <div class="text-xs text-gray-600 mb-1">Dollars At Work</div>
                                    <div id="close-dollars-at-work" class="text-lg font-semibold text-gray-700"></div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex gap-3">
                            <button type="submit" class="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">
                                <i class="fas fa-check mr-2"></i>Close Trade
                            </button>
                            <button type="button" onclick="closeCloseTradeModal()" class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        
        <!-- Research Modal -->
        <div id="research-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 hidden">
            <div class="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[95vh] overflow-y-auto">
                <div class="bg-gradient-to-r from-teal-700 to-teal-900 text-white px-6 py-4 flex justify-between items-center rounded-t-lg sticky top-0 z-10">
                    <h3 id="research-modal-title" class="text-2xl font-bold">
                        <i class="fas fa-chart-bar mr-2"></i>Company Research
                    </h3>
                    <button onclick="closeResearchModal()" class="text-white hover:text-gray-200">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                
                <!-- Tabs -->
                <div class="flex border-b border-gray-200 bg-gray-50 sticky top-[68px] z-10">
                    <button class="research-tab px-6 py-3 font-semibold text-gray-600 hover:text-teal-600 hover:bg-white border-b-2 border-transparent active" onclick="switchResearchTab('overview')">
                        <i class="fas fa-info-circle mr-2"></i>Overview
                    </button>
                    <button class="research-tab px-6 py-3 font-semibold text-gray-600 hover:text-teal-600 hover:bg-white border-b-2 border-transparent" onclick="switchResearchTab('analysis')">
                        <i class="fas fa-chart-line mr-2"></i>Analysis
                    </button>
                    <button class="research-tab px-6 py-3 font-semibold text-gray-600 hover:text-teal-600 hover:bg-white border-b-2 border-transparent" onclick="switchResearchTab('notes')">
                        <i class="fas fa-file-alt mr-2"></i>Research Notes
                    </button>
                </div>
                
                <!-- Tab Content -->
                <div class="p-6">
                    <div id="research-loading" class="text-center py-12">
                        <i class="fas fa-spinner fa-spin text-4xl text-teal-600 mb-4"></i>
                        <p class="text-gray-600">Loading research data...</p>
                    </div>
                    
                    <div id="research-error" class="hidden text-center py-12">
                        <i class="fas fa-exclamation-circle text-4xl text-red-600 mb-4"></i>
                        <p class="text-gray-600" id="research-error-message">Error loading data</p>
                    </div>
                    
                    <div id="research-overview-tab" class="research-tab-content hidden"></div>
                    <div id="research-analysis-tab" class="research-tab-content hidden"></div>
                    <div id="research-notes-tab" class="research-tab-content hidden"></div>
                </div>
            </div>
        </div>
        
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/calc.js"></script>
        <script src="/static/modal-kit.js"></script>
        <script src="/static/modal-covered-call.js"></script>
        <script src="/static/modal-close.js"></script>
        <script src="/static/modal-stock-close.js"></script>
        <script src="/static/modal-assign.js"></script>
        <script src="/static/modal-option.js"></script>
        <script src="/static/modal-stock.js"></script>
        <script src="/static/modal-cc-manage.js"></script>
        <script src="/static/modal-position.js"></script>
        <script src="/static/modal-sell-edit.js"></script>
        <script src="/static/research-merge.js"></script>
        <script src="/static/discovery.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

// Utility endpoint: Transform option transactions for tax reporting
routes.post('/api/utilities/transform-option-tax', authMiddleware, async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return c.json({ error: 'No file provided' }, 400)
    }
    
    // Read file content
    const content = await file.text()
    const lines = content.split('\n').map(line => line.trim()).filter(line => line)
    
    if (lines.length < 2) {
      return c.json({ 
        error: 'File must have at least 2 lines',
        debug: {
          totalLines: lines.length,
          firstLine: lines[0]?.substring(0, 200)
        }
      }, 400)
    }
    
    // Detect delimiter (tab or comma)
    const firstLine = lines[0]
    const delimiter = firstLine.includes('\t') ? '\t' : ','
    
    // Find the header row (starts with "Transaction History\tHeader" or similar)
    let headerLine = ''
    let headerIndex = -1
    
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(delimiter)
      if (parts[0] === 'Transaction History' && parts[1] === 'Header') {
        headerLine = lines[i]
        headerIndex = i
        break
      }
    }
    
    if (headerIndex === -1) {
      return c.json({ 
        error: 'Could not find header row. Expected format: "Transaction History[tab]Header[tab]Date[tab]..."',
        debug: {
          delimiter: delimiter === '\t' ? 'TAB' : 'COMMA',
          firstLine: lines[0].substring(0, 200),
          secondLine: lines[1]?.substring(0, 200)
        }
      }, 400)
    }
    
    // Parse headers (skip first 2 columns: "Transaction History" and "Header")
    const allHeaders = headerLine.split(delimiter).map(h => h.trim().replace(/"/g, ''))
    const headers = allHeaders.slice(2) // Skip "Transaction History" and "Header"
    
    // Parse data rows (only lines that start with "Transaction History\tData")
    const dataLines = lines.slice(headerIndex + 1).filter(line => {
      const parts = line.split(delimiter)
      return parts[0] === 'Transaction History' && parts[1] === 'Data'
    })
    
    if (dataLines.length === 0) {
      return c.json({ 
        error: 'No data rows found. Expected format: "Transaction History[tab]Data[tab]..."',
        debug: {
          headers,
          totalLinesAfterHeader: lines.length - headerIndex - 1
        }
      }, 400)
    }
    
    // Parse data rows
    const rows = dataLines.map((line, lineIndex) => {
      const allValues = line.split(delimiter).map(v => v.trim().replace(/"/g, ''))
      const values = allValues.slice(2) // Skip "Transaction History" and "Data"
      
      // Create object from headers and values
      const obj: any = {}
      headers.forEach((header, idx) => {
        obj[header] = values[idx] || ''
      })
      
      obj._lineNumber = lineIndex + 1
      return obj
    })
    
    // Check if we have the required columns
    const requiredColumns = ['Date', 'Description', 'Symbol', 'Quantity', 'Price', 'Gross Amount', 'Commission', 'Net Amount']
    const missingColumns = requiredColumns.filter(col => !headers.includes(col))
    
    if (missingColumns.length > 0) {
      return c.json({ 
        error: 'Missing required columns',
        debug: {
          missingColumns,
          foundHeaders: headers,
          sampleRow: rows[0],
          hint: 'Column names must match exactly. Check for extra spaces or different spelling.'
        }
      }, 400)
    }
    
    // Group and transform transactions
    const transactions: any[] = []
    
    rows.forEach(row => {
      const netAmount = parseFloat(row['Net Amount'] || '0')
      const quantity = parseFloat(row['Quantity'] || '0')
      const grossAmount = parseFloat(row['Gross Amount'] || '0')
      const commission = parseFloat(row['Commission'] || '0')
      const price = parseFloat(row['Price'] || '0')
      
      // Extract underlying symbol (first part before space)
      const symbol = row['Symbol'] || ''
      const underlying = symbol.split(' ')[0] || symbol
      
      transactions.push({
        date: row['Date'],
        underlying,
        description: row['Description'],
        transactionType: row['Transaction Type'],
        buy: netAmount < 0 ? Math.abs(quantity) : 0,
        sell: netAmount > 0 ? Math.abs(quantity) : 0,
        cost: netAmount < 0 ? Math.abs(grossAmount) + Math.abs(commission) : 0,
        proceeds: netAmount > 0 ? Math.abs(grossAmount) - Math.abs(commission) : 0,
        price,
        commission: Math.abs(commission),
        quantitySign: netAmount < 0 ? -1 : 1,
        currency: row['Price Currency'] || 'USD'
      })
    })
    
    // Group by underlying, description, date, and quantity sign
    const grouped: any = {}
    
    transactions.forEach(t => {
      const key = `${t.underlying}|${t.description}|${t.date}|${t.quantitySign}`
      if (!grouped[key]) {
        grouped[key] = {
          date: t.date,
          underlying: t.underlying,
          description: t.description,
          buy: 0,
          sell: 0,
          cost: 0,
          proceeds: 0,
          commission: 0,
          priceSum: 0,
          priceCount: 0,
          currency: t.currency
        }
      }
      grouped[key].buy += t.buy
      grouped[key].sell += t.sell
      grouped[key].cost += t.cost
      grouped[key].proceeds += t.proceeds
      grouped[key].commission += t.commission
      grouped[key].priceSum += t.price
      grouped[key].priceCount += 1
    })
    
    // Convert to array and calculate average price
    const groupedArray = Object.values(grouped).map((g: any) => ({
      ...g,
      price: g.priceCount > 0 ? g.priceSum / g.priceCount : 0
    }))
    
    // Sort by underlying, then date
    groupedArray.sort((a: any, b: any) => {
      if (a.underlying !== b.underlying) {
        return a.underlying.localeCompare(b.underlying)
      }
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    })
    
    // Get unique underlying symbols for company lookup
    const uniqueSymbols = [...new Set(groupedArray.map((g: any) => g.underlying))]
    
    // Fetch company names from Yahoo Finance API
    const companyNames: Record<string, string> = {}
    
    for (const symbol of uniqueSymbols) {
      try {
        const companyData = await fetchCompanyData(symbol, c.env)
        if (companyData && companyData.company_name && companyData.company_name !== symbol) {
          companyNames[symbol] = companyData.company_name
        }
      } catch (err) {
        // If company not found, just use the ticker
        console.log(`Company name not found for ticker ${symbol}`)
      }
    }
    
    // Generate output CSV
    const outputLines = ['Date,Description,Buy,Sell,Price,Commission,Cost,Proceeds,XCH RATE,CAD Cost,CAD Proceeds,CAD Gain/Loss,Currency']
    
    let currentUnderlying = ''
    let sectionTotalCost = 0
    let sectionTotalProceeds = 0
    
    groupedArray.forEach((row: any, index: number) => {
      if (currentUnderlying !== row.underlying) {
        // Add totals for previous section
        if (currentUnderlying !== '') {
          const totalCostStr = sectionTotalCost > 0 ? sectionTotalCost.toFixed(2) : ''
          const totalProceedsStr = sectionTotalProceeds > 0 ? sectionTotalProceeds.toFixed(2) : ''
          // Empty Date column, then Totals in Description column
          outputLines.push(`,Totals for ${currentUnderlying},,,,,${totalCostStr},${totalProceedsStr},,,,,`)
          outputLines.push('')  // Blank line between sections
        }
        
        // Start new section
        const companyName = companyNames[row.underlying] || ''
        // Remove commas from company name to avoid CSV issues
        const cleanCompanyName = companyName.replace(/,/g, '')
        let header = cleanCompanyName 
          ? `*** ${row.underlying} - ${cleanCompanyName} ***`
          : `*** ${row.underlying} ***`
        
        // Empty Date column, then header in Description column
        outputLines.push(`,${header}`)
        
        currentUnderlying = row.underlying
        sectionTotalCost = 0
        sectionTotalProceeds = 0
      }
      
      const buyStr = row.buy > 0 ? Math.round(row.buy).toString() : ''
      const sellStr = row.sell > 0 ? Math.round(row.sell).toString() : ''
      const costStr = row.cost > 0 ? row.cost.toFixed(2) : ''
      const proceedsStr = row.proceeds > 0 ? row.proceeds.toFixed(2) : ''
      
      // Remove commas from description to avoid CSV issues
      const cleanDescription = row.description.replace(/,/g, '')
      
      // Add to section totals
      sectionTotalCost += row.cost
      sectionTotalProceeds += row.proceeds
      
      outputLines.push(
        `${row.date},${cleanDescription},${buyStr},${sellStr},${row.price.toFixed(2)},${row.commission.toFixed(6)},${costStr},${proceedsStr},,,,,`
      )
      
      // Add totals for last section
      if (index === groupedArray.length - 1) {
        const totalCostStr = sectionTotalCost > 0 ? sectionTotalCost.toFixed(2) : ''
        const totalProceedsStr = sectionTotalProceeds > 0 ? sectionTotalProceeds.toFixed(2) : ''
        // Empty Date column, then Totals in Description column
        outputLines.push(`,Totals for ${currentUnderlying},,,,,${totalCostStr},${totalProceedsStr},,,,,`)
      }
    })
    
    const outputContent = outputLines.join('\n')
    
    // Return CSV content
    return new Response(outputContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="option_tax_transform_output.csv"'
      }
    })
    
  } catch (error: any) {
    console.error('Error transforming option tax file:', error)
    return c.json({ error: error.message || 'Failed to transform file' }, 500)
  }
})

// Historical Balances API endpoints (using account_balance_history table)

// Get historical balances (last 24 entries)
routes.get('/api/historical-balances', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const accountId = c.req.query('account_id')
    
    let query = `
      SELECT hb.*, a.account_name, a.account_type
      FROM account_balance_history hb
      JOIN accounts a ON hb.account_id = a.id
      WHERE hb.user_id = ?
    `
    const params = [userId]
    
    // Add account filter if provided
    if (accountId) {
      query += ` AND hb.account_id = ?`
      params.push(accountId)
    }
    
    query += `
      ORDER BY hb.year DESC, hb.month DESC, hb.created_at DESC
      LIMIT 24
    `
    
    const result = await c.env.DB.prepare(query).bind(...params).all()
    
    return c.json(result.results || [])
  } catch (error: any) {
    console.error('Error fetching historical balances:', error)
    return c.json({ error: 'Failed to fetch historical balances' }, 500)
  }
})

// Create historical balance
routes.post('/api/historical-balances', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const body = await c.req.json()
    
    const { account_id, month, year, currency, balance, exchange_rate_to_cad } = body
    
    // Validate required fields
    if (!account_id || !month || !year || !currency || balance === undefined || !exchange_rate_to_cad) {
      return c.json({ error: 'Missing required fields' }, 400)
    }
    
    const exchange_rate_to_usd = 1 / parseFloat(exchange_rate_to_cad)
    
    // Insert or replace (UPSERT)
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO account_balance_history 
      (user_id, account_id, balance, cash_balance, currency, month, year, exchange_rate_to_usd, exchange_rate_to_cad)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      account_id,
      balance,
      0, // cash_balance - set to 0 for manual entries
      currency,
      month,
      year,
      exchange_rate_to_usd,
      exchange_rate_to_cad
    ).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error creating historical balance:', error)
    return c.json({ error: error.message || 'Failed to create historical balance' }, 500)
  }
})

// Update historical balance
routes.put('/api/historical-balances/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const body = await c.req.json()
    
    const { account_id, month, year, currency, balance, exchange_rate_to_cad } = body
    
    // Validate required fields
    if (!account_id || !month || !year || !currency || balance === undefined || !exchange_rate_to_cad) {
      return c.json({ error: 'Missing required fields' }, 400)
    }
    
    const exchange_rate_to_usd = 1 / parseFloat(exchange_rate_to_cad)
    
    // Update the balance
    await c.env.DB.prepare(`
      UPDATE account_balance_history 
      SET account_id = ?, month = ?, year = ?, currency = ?, balance = ?, 
          exchange_rate_to_usd = ?, exchange_rate_to_cad = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      account_id,
      month,
      year,
      currency,
      balance,
      exchange_rate_to_usd,
      exchange_rate_to_cad,
      id,
      userId
    ).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error updating historical balance:', error)
    return c.json({ error: error.message || 'Failed to update historical balance' }, 500)
  }
})

// Delete historical balance
routes.delete('/api/historical-balances/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const id = c.req.param('id')
    
    await c.env.DB.prepare(`
      DELETE FROM account_balance_history WHERE id = ? AND user_id = ?
    `).bind(id, userId).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting historical balance:', error)
    return c.json({ error: 'Failed to delete historical balance' }, 500)
  }
})
