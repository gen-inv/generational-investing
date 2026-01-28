// Global state
let token = localStorage.getItem('token') || null
let currentUser = null
let accountsList = []

// API Base URL
const API_BASE = window.location.origin

// Axios instance with auth header
const api = axios.create({
    baseURL: API_BASE
})

api.interceptors.request.use(config => {
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    if (token) {
        showMainApp()
        await loadAccountsList()
        loadDashboard()
    }
})

// ============================================================================
// AUTH FUNCTIONS
// ============================================================================

function showLogin() {
    document.getElementById('login-form').classList.remove('hidden')
    document.getElementById('register-form').classList.add('hidden')
}

function showRegister() {
    document.getElementById('login-form').classList.add('hidden')
    document.getElementById('register-form').classList.remove('hidden')
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const data = {
        email: formData.get('email'),
        password: formData.get('password')
    }
    
    try {
        const response = await axios.post('/api/auth/login', data)
        token = response.data.token
        currentUser = response.data.user
        localStorage.setItem('token', token)
        showMainApp()
        await loadAccountsList()
        loadDashboard()
    } catch (error) {
        alert(error.response?.data?.error || 'Login failed')
    }
})

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const data = {
        name: formData.get('name'),
        email: formData.get('email'),
        password: formData.get('password')
    }
    
    try {
        const response = await axios.post('/api/auth/register', data)
        token = response.data.token
        currentUser = response.data.user
        localStorage.setItem('token', token)
        showMainApp()
        await loadAccountsList()
        loadDashboard()
    } catch (error) {
        alert(error.response?.data?.error || 'Registration failed')
    }
})

function logout() {
    token = null
    currentUser = null
    localStorage.removeItem('token')
    document.getElementById('auth-screen').classList.remove('hidden')
    document.getElementById('main-app').classList.add('hidden')
    showLogin()
}

function showMainApp() {
    document.getElementById('auth-screen').classList.add('hidden')
    document.getElementById('main-app').classList.remove('hidden')
}

// ============================================================================
// NAVIGATION FUNCTIONS
// ============================================================================

function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden')
    })
    
    // Remove active class from all nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active')
    })
    
    // Show selected section
    document.getElementById(`${sectionName}-section`).classList.remove('hidden')
    
    // Add active class to selected nav link
    const activeLink = document.querySelector(`[data-section="${sectionName}"]`)
    if (activeLink) {
        activeLink.classList.add('active')
    }
    
    // Load section data
    switch(sectionName) {
        case 'dashboard':
            loadDashboard()
            break
        case 'companies':
            loadCompanies()
            break
        case 'accounts':
            loadAccounts()
            break
        case 'stocks':
            loadStocks()
            break
        case 'options':
            loadOptions()
            break
        case 'reports':
            break
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

async function loadAccountsList() {
    try {
        const response = await api.get('/api/accounts')
        accountsList = response.data.accounts || []
    } catch (error) {
        console.error('Failed to load accounts list:', error)
        accountsList = []
    }
}

// ============================================================================
// DASHBOARD FUNCTIONS
// ============================================================================

async function loadDashboard() {
    try {
        // Load account totals with currency conversion
        const totalsRes = await api.get('/api/dashboard/totals')
        const totals = totalsRes.data
        
        document.getElementById('total-cad').textContent = formatCurrency(totals.total_cad, 'CAD')
        document.getElementById('total-usd').textContent = formatCurrency(totals.total_usd, 'USD')
        document.getElementById('total-cash-cad').textContent = formatCurrency(totals.total_cash_cad, 'CAD')
        document.getElementById('total-cash-usd').textContent = formatCurrency(totals.total_cash_usd, 'USD')
        
        // Load open stock positions
        const stocksRes = await api.get('/api/stocks?open=true')
        const openStocksList = document.getElementById('open-stocks-list')
        openStocksList.innerHTML = ''
        
        if (stocksRes.data.length === 0) {
            openStocksList.innerHTML = '<p class="text-gray-500">No open positions</p>'
        } else {
            stocksRes.data.slice(0, 5).forEach(stock => {
                openStocksList.innerHTML += `
                    <div class="flex justify-between items-center border-b border-gray-200 pb-2">
                        <div>
                            <span class="font-semibold text-brand-teal">${stock.ticker}</span>
                            <span class="text-gray-600 text-sm ml-2">${stock.quantity} shares @ $${stock.price}</span>
                        </div>
                        <span class="text-sm text-gray-500">${stock.account_type}</span>
                    </div>
                `
            })
        }
        
        // Load open option trades
        const optionsRes = await api.get('/api/options?open=true')
        const openOptionsList = document.getElementById('open-options-list')
        openOptionsList.innerHTML = ''
        
        if (optionsRes.data.length === 0) {
            openOptionsList.innerHTML = '<p class="text-gray-500">No open positions</p>'
        } else {
            optionsRes.data.slice(0, 5).forEach(option => {
                openOptionsList.innerHTML += `
                    <div class="flex justify-between items-center border-b border-gray-200 pb-2">
                        <div>
                            <span class="font-semibold text-brand-teal">${option.ticker}</span>
                            <span class="text-gray-600 text-sm ml-2">${option.strategy_type.replace('_', ' ')}</span>
                        </div>
                        <span class="text-sm text-gray-500">$${option.strike_price}</span>
                    </div>
                `
            })
        }
    } catch (error) {
        console.error('Error loading dashboard:', error)
    }
}

// ============================================================================
// COMPANY FUNCTIONS
// ============================================================================

async function loadCompanies() {
    try {
        const response = await api.get('/api/companies')
        const companies = response.data
        
        const table = document.getElementById('companies-table')
        table.innerHTML = ''
        
        if (companies.length === 0) {
            table.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">No companies found</td></tr>'
            return
        }
        
        companies.forEach(company => {
            table.innerHTML += `
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-4 py-3 font-semibold text-brand-teal">${company.ticker}</td>
                    <td class="px-4 py-3">${company.company_name}</td>
                    <td class="px-4 py-3">${company.exchange || '-'}</td>
                    <td class="px-4 py-3">${company.sector || '-'}</td>
                    <td class="px-4 py-3 text-center">
                        ${company.is_wonderful ? '<i class="fas fa-star text-brand-gold"></i>' : '-'}
                    </td>
                    <td class="px-4 py-3 text-center">${company.research_score || '-'}</td>
                    <td class="px-4 py-3 text-center">${company.anti_fragile_score || '-'}</td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="editCompany(${company.id})" class="text-brand-teal hover:text-brand-gold mr-2">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteCompany(${company.id})" class="text-red-600 hover:text-red-800">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `
        })
    } catch (error) {
        console.error('Error loading companies:', error)
    }
}

function showCompanyForm(companyId = null) {
    const isEdit = companyId !== null
    const title = isEdit ? 'Edit Company' : 'Add Company'
    
    // Create modal
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 class="text-2xl font-bold text-brand-teal mb-6">${title}</h3>
            <form id="companyForm">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-gray-700 mb-2">Ticker *</label>
                        <input type="text" name="ticker" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Company Name *</label>
                        <input type="text" name="company_name" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Market Cap</label>
                        <input type="number" name="market_cap" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Exchange</label>
                        <input type="text" name="exchange" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Sector</label>
                        <input type="text" name="sector" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Industry</label>
                        <input type="text" name="industry" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Research Score</label>
                        <input type="number" name="research_score" min="0" max="100" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Anti-Fragile Score</label>
                        <input type="number" name="anti_fragile_score" min="0" max="100" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div class="col-span-2">
                        <label class="flex items-center">
                            <input type="checkbox" name="is_wonderful" class="mr-2">
                            <span class="text-gray-700">Wonderful Company</span>
                        </label>
                    </div>
                </div>
                <div class="flex gap-4 mt-6">
                    <button type="submit" class="btn-primary flex-1">Save</button>
                    <button type="button" onclick="this.closest('.fixed').remove()" class="btn-secondary flex-1">Cancel</button>
                </div>
            </form>
        </div>
    `
    
    document.body.appendChild(modal)
    
    // Handle form submission
    document.getElementById('companyForm').addEventListener('submit', async (e) => {
        e.preventDefault()
        const formData = new FormData(e.target)
        const data = {
            ticker: formData.get('ticker'),
            company_name: formData.get('company_name'),
            market_cap: formData.get('market_cap') || null,
            exchange: formData.get('exchange') || null,
            sector: formData.get('sector') || null,
            industry: formData.get('industry') || null,
            research_score: formData.get('research_score') || null,
            anti_fragile_score: formData.get('anti_fragile_score') || null,
            is_wonderful: formData.get('is_wonderful') === 'on'
        }
        
        try {
            if (isEdit) {
                await api.put(`/api/companies/${companyId}`, data)
            } else {
                await api.post('/api/companies', data)
            }
            modal.remove()
            loadCompanies()
        } catch (error) {
            alert(error.response?.data?.error || 'Operation failed')
        }
    })
    
    // Load existing data if editing
    if (isEdit) {
        api.get(`/api/companies/${companyId}`).then(response => {
            const company = response.data
            const form = document.getElementById('companyForm')
            form.ticker.value = company.ticker
            form.company_name.value = company.company_name
            form.market_cap.value = company.market_cap || ''
            form.exchange.value = company.exchange || ''
            form.sector.value = company.sector || ''
            form.industry.value = company.industry || ''
            form.research_score.value = company.research_score || ''
            form.anti_fragile_score.value = company.anti_fragile_score || ''
            form.is_wonderful.checked = company.is_wonderful === 1
        })
    }
}

async function editCompany(id) {
    showCompanyForm(id)
}

async function deleteCompany(id) {
    if (!confirm('Are you sure you want to delete this company?')) return
    
    try {
        await api.delete(`/api/companies/${id}`)
        loadCompanies()
    } catch (error) {
        alert('Delete failed')
    }
}

// ============================================================================
// ACCOUNT FUNCTIONS
// ============================================================================

async function loadAccounts() {
    try {
        const response = await api.get('/api/accounts')
        const accounts = response.data.accounts || []
        
        // Group accounts by type
        const grouped = {
            'Cash': [],
            'TFSA': [],
            'RRSP': [],
            'LIRA': []
        }
        
        accounts.forEach(acc => {
            if (grouped[acc.account_type]) {
                grouped[acc.account_type].push(acc)
            }
        })
        
        const container = document.getElementById('accounts-grid')
        container.innerHTML = ''
        
        Object.entries(grouped).forEach(([type, accts]) => {
            const section = document.createElement('div')
            section.className = 'mb-6'
            
            section.innerHTML = `
                <h3 class="text-xl font-semibold mb-3 text-brand-gold">${type} Accounts</h3>
                ${accts.length === 0 ? `
                    <p class="text-gray-400 italic">No ${type} accounts yet</p>
                ` : `
                    <div class="grid gap-4">
                        ${accts.map(acc => `
                            <div class="card">
                                <div class="flex justify-between items-start">
                                    <div class="flex-1">
                                        <h4 class="text-lg font-semibold mb-2">${acc.account_name}</h4>
                                        <div class="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <span class="text-gray-400">Total Balance:</span>
                                                <span class="ml-2 font-semibold">${acc.default_currency === 'CAD' ? formatCurrency(acc.balance_cad, 'CAD') : formatCurrency(acc.balance_usd, 'USD')}</span>
                                            </div>
                                            <div>
                                                <span class="text-gray-400">Cash Balance:</span>
                                                <span class="ml-2 font-semibold">${acc.default_currency === 'CAD' ? formatCurrency(acc.cash_balance_cad, 'CAD') : formatCurrency(acc.cash_balance_usd, 'USD')}</span>
                                            </div>
                                        </div>
                                        <div class="text-xs text-gray-400 mt-2">
                                            Currency: ${acc.default_currency} | Last updated: ${new Date(acc.updated_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div class="ml-4 flex space-x-2">
                                        <button onclick="showUpdateBalanceForm(${acc.id})" class="text-green-400 hover:text-green-300" title="Update Balance">
                                            <i class="fas fa-dollar-sign"></i>
                                        </button>
                                        <button onclick="showEditAccountForm(${acc.id})" class="text-blue-400 hover:text-blue-300" title="Edit Account">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button onclick="deleteAccount(${acc.id})" class="text-red-400 hover:text-red-300" title="Delete">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            `
            container.appendChild(section)
        })
    } catch (error) {
        console.error('Failed to load accounts:', error)
    }
}

function showAccountForm() {
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
    modal.id = 'account-modal'
    
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-2xl w-full">
            <h3 class="text-2xl font-bold text-brand-teal mb-6">Add New Account</h3>
            <form id="accountForm">
                <div class="mb-4">
                    <label class="block text-gray-700 mb-2">Account Name *</label>
                    <input type="text" name="account_name" placeholder="e.g., RRSP - Questrade" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    <small class="text-gray-400">Choose a descriptive name to identify this account</small>
                </div>
                
                <div class="mb-4">
                    <label class="block text-gray-700 mb-2">Account Type *</label>
                    <select name="account_type" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                        <option value="">Select account type...</option>
                        <option value="Cash">Cash</option>
                        <option value="TFSA">TFSA</option>
                        <option value="RRSP">RRSP</option>
                        <option value="LIRA">LIRA</option>
                    </select>
                </div>
                
                <div class="mb-4">
                    <label class="block text-gray-700 mb-2">Default Currency *</label>
                    <select name="default_currency" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                        <option value="">Select currency...</option>
                        <option value="CAD">CAD (Canadian Dollar)</option>
                        <option value="USD">USD (US Dollar)</option>
                    </select>
                    <small class="text-gray-400">The currency used to track this account's balance</small>
                </div>
                
                <div class="mb-4" id="balance-field">
                    <label class="block text-gray-700 mb-2">Initial Balance *</label>
                    <input type="number" step="0.01" name="balance" value="0" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                </div>
                
                <div class="mb-4">
                    <label class="block text-gray-700 mb-2">Cash Balance *</label>
                    <input type="number" step="0.01" name="cash_balance" value="0" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    <small class="text-gray-400">Available cash for trading (in default currency)</small>
                </div>
                
                <div class="flex gap-4 mt-6">
                    <button type="submit" class="btn-primary flex-1">Save Account</button>
                    <button type="button" onclick="document.getElementById('account-modal').remove()" class="btn-secondary flex-1">Cancel</button>
                </div>
            </form>
        </div>
    `
    
    document.body.appendChild(modal)
    
    document.getElementById('accountForm').addEventListener('submit', async (e) => {
        e.preventDefault()
        const formData = new FormData(e.target)
        const defaultCurrency = formData.get('default_currency')
        const balance = parseFloat(formData.get('balance')) || 0
        const cashBalance = parseFloat(formData.get('cash_balance')) || 0
        
        const data = {
            account_name: formData.get('account_name'),
            account_type: formData.get('account_type'),
            default_currency: defaultCurrency,
            balance_cad: defaultCurrency === 'CAD' ? balance : 0,
            balance_usd: defaultCurrency === 'USD' ? balance : 0,
            cash_balance_cad: defaultCurrency === 'CAD' ? cashBalance : 0,
            cash_balance_usd: defaultCurrency === 'USD' ? cashBalance : 0
        }
        
        try {
            await api.post('/api/accounts', data)
            modal.remove()
            await loadAccountsList()
            loadAccounts()
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to create account')
        }
    })
}

async function showEditAccountForm(accountId) {
    try {
        const response = await api.get(`/api/accounts/${accountId}`)
        const account = response.data.account
        
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.id = 'account-modal'
        
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-2xl w-full">
                <h3 class="text-2xl font-bold text-brand-teal mb-6">Edit Account</h3>
                <form id="editAccountForm">
                    <div class="mb-4">
                        <label class="block text-gray-700 mb-2">Account Name *</label>
                        <input type="text" name="account_name" value="${account.account_name}" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    
                    <div class="mb-4">
                        <label class="block text-gray-700 mb-2">Account Type *</label>
                        <select name="account_type" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                            <option value="Cash" ${account.account_type === 'Cash' ? 'selected' : ''}>Cash</option>
                            <option value="TFSA" ${account.account_type === 'TFSA' ? 'selected' : ''}>TFSA</option>
                            <option value="RRSP" ${account.account_type === 'RRSP' ? 'selected' : ''}>RRSP</option>
                            <option value="LIRA" ${account.account_type === 'LIRA' ? 'selected' : ''}>LIRA</option>
                        </select>
                    </div>
                    
                    <div class="mb-4">
                        <label class="block text-gray-700 mb-2">Default Currency *</label>
                        <select name="default_currency" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required disabled>
                            <option value="CAD" ${account.default_currency === 'CAD' ? 'selected' : ''}>CAD (Canadian Dollar)</option>
                            <option value="USD" ${account.default_currency === 'USD' ? 'selected' : ''}>USD (US Dollar)</option>
                        </select>
                        <small class="text-gray-400">Default currency cannot be changed after account creation</small>
                    </div>
                    
                    <div class="mb-4">
                        <label class="block text-gray-700 mb-2">Total Balance (${account.default_currency})</label>
                        <input type="number" step="0.01" name="balance" value="${account.default_currency === 'CAD' ? account.balance_cad : account.balance_usd}" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    </div>
                    
                    <div class="mb-4">
                        <label class="block text-gray-700 mb-2">Cash Balance (${account.default_currency})</label>
                        <input type="number" step="0.01" name="cash_balance" value="${account.default_currency === 'CAD' ? account.cash_balance_cad : account.cash_balance_usd}" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    </div>
                    
                    <div class="flex gap-4 mt-6">
                        <button type="submit" class="btn-primary flex-1">Update Account</button>
                        <button type="button" onclick="document.getElementById('account-modal').remove()" class="btn-secondary flex-1">Cancel</button>
                    </div>
                </form>
            </div>
        `
        
        document.body.appendChild(modal)
        
        document.getElementById('editAccountForm').addEventListener('submit', async (e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            const balance = parseFloat(formData.get('balance')) || 0
            const cashBalance = parseFloat(formData.get('cash_balance')) || 0
            
            const data = {
                account_name: formData.get('account_name'),
                account_type: formData.get('account_type'),
                balance_cad: account.default_currency === 'CAD' ? balance : 0,
                balance_usd: account.default_currency === 'USD' ? balance : 0,
                cash_balance_cad: account.default_currency === 'CAD' ? cashBalance : 0,
                cash_balance_usd: account.default_currency === 'USD' ? cashBalance : 0
            }
            
            try {
                await api.put(`/api/accounts/${accountId}`, data)
                modal.remove()
                await loadAccountsList()
                loadAccounts()
            } catch (error) {
                alert(error.response?.data?.error || 'Failed to update account')
            }
        })
    } catch (error) {
        console.error('Failed to load account:', error)
        alert('Failed to load account')
    }
}

async function showUpdateBalanceForm(accountId) {
    try {
        const response = await api.get(`/api/accounts/${accountId}`)
        const account = response.data.account
        
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.id = 'balance-modal'
        
        const currentBalance = account.default_currency === 'CAD' ? account.balance_cad : account.balance_usd
        const currentCash = account.default_currency === 'CAD' ? account.cash_balance_cad : account.cash_balance_usd
        const lastUpdated = new Date(account.updated_at).toLocaleString()
        
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-md w-full">
                <h3 class="text-2xl font-bold text-brand-teal mb-6">Update Balance</h3>
                
                <div class="mb-4 p-4 bg-gray-100 rounded-lg">
                    <h4 class="font-semibold text-gray-700 mb-2">${account.account_name}</h4>
                    <div class="text-sm text-gray-600">
                        <p>Account Type: <span class="font-semibold">${account.account_type}</span></p>
                        <p>Currency: <span class="font-semibold">${account.default_currency}</span></p>
                        <p>Last Updated: <span class="font-semibold">${lastUpdated}</span></p>
                    </div>
                </div>
                
                <form id="updateBalanceForm">
                    <div class="mb-4">
                        <label class="block text-gray-700 mb-2">Total Balance (${account.default_currency}) *</label>
                        <input type="number" step="0.01" name="balance" value="${currentBalance}" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                        <small class="text-gray-400">Current: ${formatCurrency(currentBalance, account.default_currency)}</small>
                    </div>
                    
                    <div class="mb-4">
                        <label class="block text-gray-700 mb-2">Cash Balance (${account.default_currency}) *</label>
                        <input type="number" step="0.01" name="cash_balance" value="${currentCash}" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                        <small class="text-gray-400">Current: ${formatCurrency(currentCash, account.default_currency)}</small>
                    </div>
                    
                    <div class="flex gap-4 mt-6">
                        <button type="submit" class="btn-primary flex-1">Update Balance</button>
                        <button type="button" onclick="document.getElementById('balance-modal').remove()" class="btn-secondary flex-1">Cancel</button>
                    </div>
                </form>
            </div>
        `
        
        document.body.appendChild(modal)
        
        document.getElementById('updateBalanceForm').addEventListener('submit', async (e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            const balance = parseFloat(formData.get('balance')) || 0
            const cashBalance = parseFloat(formData.get('cash_balance')) || 0
            
            const data = {
                balance_cad: account.default_currency === 'CAD' ? balance : account.balance_cad,
                balance_usd: account.default_currency === 'USD' ? balance : account.balance_usd,
                cash_balance_cad: account.default_currency === 'CAD' ? cashBalance : account.cash_balance_cad,
                cash_balance_usd: account.default_currency === 'USD' ? cashBalance : account.cash_balance_usd
            }
            
            try {
                await api.put(`/api/accounts/${accountId}`, data)
                modal.remove()
                await loadAccountsList()
                loadAccounts()
                loadDashboard()
            } catch (error) {
                alert(error.response?.data?.error || 'Failed to update balance')
            }
        })
    } catch (error) {
        console.error('Failed to load account:', error)
        alert('Failed to load account')
    }
}

async function deleteAccount(accountId) {
    if (!confirm('Are you sure you want to delete this account? This cannot be undone.')) {
        return
    }
    
    try {
        await api.delete(`/api/accounts/${accountId}`)
        await loadAccountsList()
        loadAccounts()
    } catch (error) {
        console.error('Failed to delete account:', error)
        const errorMsg = error.response?.data?.error || 'Failed to delete account'
        alert(errorMsg)
    }
}

// ============================================================================
// STOCK TRADE FUNCTIONS
// ============================================================================

async function loadStocks() {
    try {
        const response = await api.get('/api/stocks')
        const stocks = response.data
        
        const table = document.getElementById('stocks-table')
        table.innerHTML = ''
        
        if (stocks.length === 0) {
            table.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">No stock trades found</td></tr>'
            return
        }
        
        stocks.forEach(stock => {
            table.innerHTML += `
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-4 py-3">${stock.trade_date}</td>
                    <td class="px-4 py-3 font-semibold text-brand-teal">${stock.ticker}</td>
                    <td class="px-4 py-3">
                        <span class="px-2 py-1 rounded ${stock.trade_type === 'BUY' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                            ${stock.trade_type}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-right">${stock.quantity}</td>
                    <td class="px-4 py-3 text-right">$${parseFloat(stock.price).toFixed(2)}</td>
                    <td class="px-4 py-3">${stock.account_type}</td>
                    <td class="px-4 py-3 text-center">
                        <span class="px-2 py-1 rounded ${stock.is_open ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}">
                            ${stock.is_open ? 'Open' : 'Closed'}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="editStock(${stock.id})" class="text-brand-teal hover:text-brand-gold mr-2">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteStock(${stock.id})" class="text-red-600 hover:text-red-800">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `
        })
    } catch (error) {
        console.error('Error loading stocks:', error)
    }
}

function showStockForm(stockId = null) {
    const isEdit = stockId !== null
    const title = isEdit ? 'Edit Stock Trade' : 'Add Stock Trade'
    
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-2xl w-full">
            <h3 class="text-2xl font-bold text-brand-teal mb-6">${title}</h3>
            <form id="stockForm">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-gray-700 mb-2">Ticker *</label>
                        <input type="text" name="ticker" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Trade Type *</label>
                        <select name="trade_type" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                            <option value="BUY">BUY</option>
                            <option value="SELL">SELL</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Quantity *</label>
                        <input type="number" name="quantity" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Price *</label>
                        <input type="number" step="0.01" name="price" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Account *</label>
                        <select name="account_id" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                            <option value="">Select account...</option>
                            ${accountsList.map(acc => `
                                <option value="${acc.id}">${acc.account_name} (${acc.account_type})</option>
                            `).join('')}
                        </select>
                        <small class="text-gray-400">
                            <a href="#" onclick="showSection('accounts'); return false;" class="text-brand-gold hover:underline">
                                Manage accounts
                            </a>
                        </small>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Trade Date *</label>
                        <input type="date" name="trade_date" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Cost Basis Adjustment</label>
                        <input type="number" step="0.01" name="cost_basis_adjustment" value="0" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="flex items-center pt-8">
                            <input type="checkbox" name="is_open" checked class="mr-2">
                            <span class="text-gray-700">Position Open</span>
                        </label>
                    </div>
                    <div class="col-span-2">
                        <label class="block text-gray-700 mb-2">Notes</label>
                        <textarea name="notes" rows="3" class="w-full px-4 py-2 border border-gray-300 rounded-lg"></textarea>
                    </div>
                </div>
                <div class="flex gap-4 mt-6">
                    <button type="submit" class="btn-primary flex-1">Save</button>
                    <button type="button" onclick="this.closest('.fixed').remove()" class="btn-secondary flex-1">Cancel</button>
                </div>
            </form>
        </div>
    `
    
    document.body.appendChild(modal)
    
    document.getElementById('stockForm').addEventListener('submit', async (e) => {
        e.preventDefault()
        const formData = new FormData(e.target)
        const data = {
            ticker: formData.get('ticker'),
            trade_type: formData.get('trade_type'),
            quantity: parseInt(formData.get('quantity')),
            price: parseFloat(formData.get('price')),
            account_id: parseInt(formData.get('account_id')),
            trade_date: formData.get('trade_date'),
            cost_basis_adjustment: parseFloat(formData.get('cost_basis_adjustment')),
            is_open: formData.get('is_open') === 'on',
            notes: formData.get('notes') || null
        }
        
        try {
            if (isEdit) {
                await api.put(`/api/stocks/${stockId}`, data)
            } else {
                await api.post('/api/stocks', data)
            }
            modal.remove()
            loadStocks()
            loadDashboard()
        } catch (error) {
            alert(error.response?.data?.error || 'Operation failed')
        }
    })
    
    if (isEdit) {
        api.get(`/api/stocks/${stockId}`).then(response => {
            const stock = response.data
            const form = document.getElementById('stockForm')
            form.ticker.value = stock.ticker
            form.trade_type.value = stock.trade_type
            form.quantity.value = stock.quantity
            form.price.value = stock.price
            form.account_id.value = stock.account_id
            form.trade_date.value = stock.trade_date
            form.cost_basis_adjustment.value = stock.cost_basis_adjustment || 0
            form.is_open.checked = stock.is_open === 1
            form.notes.value = stock.notes || ''
        })
    } else {
        // Set default date to today
        const today = new Date().toISOString().split('T')[0]
        document.querySelector('[name="trade_date"]').value = today
    }
}

async function editStock(id) {
    showStockForm(id)
}

async function deleteStock(id) {
    if (!confirm('Are you sure you want to delete this stock trade?')) return
    
    try {
        await api.delete(`/api/stocks/${id}`)
        loadStocks()
        loadDashboard()
    } catch (error) {
        alert('Delete failed')
    }
}

// ============================================================================
// OPTION TRADE FUNCTIONS
// ============================================================================

async function loadOptions() {
    try {
        const response = await api.get('/api/options')
        const options = response.data
        
        const table = document.getElementById('options-table')
        table.innerHTML = ''
        
        if (options.length === 0) {
            table.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">No option trades found</td></tr>'
            return
        }
        
        options.forEach(option => {
            table.innerHTML += `
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-4 py-3">${option.trade_date}</td>
                    <td class="px-4 py-3 font-semibold text-brand-teal">${option.ticker}</td>
                    <td class="px-4 py-3">${option.strategy_type.replace(/_/g, ' ')}</td>
                    <td class="px-4 py-3 text-right">$${parseFloat(option.strike_price).toFixed(2)}</td>
                    <td class="px-4 py-3 text-right">$${parseFloat(option.premium).toFixed(2)}</td>
                    <td class="px-4 py-3">${option.expiration_date}</td>
                    <td class="px-4 py-3 text-center">
                        <span class="px-2 py-1 rounded ${option.is_open ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}">
                            ${option.is_open ? 'Open' : 'Closed'}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="editOption(${option.id})" class="text-brand-teal hover:text-brand-gold mr-2">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteOption(${option.id})" class="text-red-600 hover:text-red-800">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `
        })
    } catch (error) {
        console.error('Error loading options:', error)
    }
}

function showOptionForm(optionId = null) {
    const isEdit = optionId !== null
    const title = isEdit ? 'Edit Option Trade' : 'Add Option Trade'
    
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 class="text-2xl font-bold text-brand-teal mb-6">${title}</h3>
            <form id="optionForm">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-gray-700 mb-2">Ticker *</label>
                        <input type="text" name="ticker" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Strategy Type *</label>
                        <select name="strategy_type" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                            <option value="SELLING_PUT">Selling Put (Stockpiling)</option>
                            <option value="BUYING_PUT">Buying Put</option>
                            <option value="COVERED_CALL">Covered Call</option>
                            <option value="CREDIT_SPREAD">Credit Spread</option>
                            <option value="DEBIT_SPREAD">Debit Spread</option>
                            <option value="IRON_CONDOR">Iron Condor</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Strike Price *</label>
                        <input type="number" step="0.01" name="strike_price" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Premium *</label>
                        <input type="number" step="0.01" name="premium" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Quantity (Contracts) *</label>
                        <input type="number" name="quantity" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Expiration Date *</label>
                        <input type="date" name="expiration_date" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Account *</label>
                        <select name="account_id" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                            <option value="">Select account...</option>
                            ${accountsList.map(acc => `
                                <option value="${acc.id}">${acc.account_name} (${acc.account_type})</option>
                            `).join('')}
                        </select>
                        <small class="text-gray-400">
                            <a href="#" onclick="showSection('accounts'); return false;" class="text-brand-gold hover:underline">
                                Manage accounts
                            </a>
                        </small>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">Trade Date *</label>
                        <input type="date" name="trade_date" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                    </div>
                    <div>
                        <label class="flex items-center pt-8">
                            <input type="checkbox" name="is_open" checked class="mr-2">
                            <span class="text-gray-700">Position Open</span>
                        </label>
                    </div>
                    <div class="col-span-2">
                        <label class="block text-gray-700 mb-2">Notes</label>
                        <textarea name="notes" rows="3" class="w-full px-4 py-2 border border-gray-300 rounded-lg"></textarea>
                    </div>
                </div>
                <div class="flex gap-4 mt-6">
                    <button type="submit" class="btn-primary flex-1">Save</button>
                    <button type="button" onclick="this.closest('.fixed').remove()" class="btn-secondary flex-1">Cancel</button>
                </div>
            </form>
        </div>
    `
    
    document.body.appendChild(modal)
    
    document.getElementById('optionForm').addEventListener('submit', async (e) => {
        e.preventDefault()
        const formData = new FormData(e.target)
        const data = {
            ticker: formData.get('ticker'),
            strategy_type: formData.get('strategy_type'),
            strike_price: parseFloat(formData.get('strike_price')),
            premium: parseFloat(formData.get('premium')),
            quantity: parseInt(formData.get('quantity')),
            expiration_date: formData.get('expiration_date'),
            account_id: parseInt(formData.get('account_id')),
            trade_date: formData.get('trade_date'),
            is_open: formData.get('is_open') === 'on',
            notes: formData.get('notes') || null
        }
        
        try {
            if (isEdit) {
                await api.put(`/api/options/${optionId}`, data)
            } else {
                await api.post('/api/options', data)
            }
            modal.remove()
            loadOptions()
            loadDashboard()
        } catch (error) {
            alert(error.response?.data?.error || 'Operation failed')
        }
    })
    
    if (isEdit) {
        api.get(`/api/options/${optionId}`).then(response => {
            const option = response.data
            const form = document.getElementById('optionForm')
            form.ticker.value = option.ticker
            form.strategy_type.value = option.strategy_type
            form.strike_price.value = option.strike_price
            form.premium.value = option.premium
            form.quantity.value = option.quantity
            form.expiration_date.value = option.expiration_date
            form.account_id.value = option.account_id
            form.trade_date.value = option.trade_date
            form.is_open.checked = option.is_open === 1
            form.notes.value = option.notes || ''
        })
    } else {
        const today = new Date().toISOString().split('T')[0]
        document.querySelector('[name="trade_date"]').value = today
    }
}

async function editOption(id) {
    showOptionForm(id)
}

async function deleteOption(id) {
    if (!confirm('Are you sure you want to delete this option trade?')) return
    
    try {
        await api.delete(`/api/options/${id}`)
        loadOptions()
        loadDashboard()
    } catch (error) {
        alert('Delete failed')
    }
}

// ============================================================================
// REPORT FUNCTIONS
// ============================================================================

async function loadReport() {
    const year = document.getElementById('report-year').value
    const month = document.getElementById('report-month').value
    
    try {
        let url = '/api/reports/pl'
        const params = []
        if (year) params.push(`year=${year}`)
        if (month) params.push(`month=${month}`)
        if (params.length > 0) url += '?' + params.join('&')
        
        const response = await api.get(url)
        const data = response.data
        
        const resultsDiv = document.getElementById('report-results')
        resultsDiv.innerHTML = `
            <div class="card">
                <h3 class="text-xl font-bold text-brand-teal mb-4">Stock Trades P/L</h3>
                <div class="space-y-2">
                    ${data.stocks.length === 0 ? '<p class="text-gray-500">No data</p>' : ''}
                    ${data.stocks.map(item => `
                        <div class="flex justify-between border-b border-gray-200 pb-2">
                            <span>${item.year}-${item.month} (${item.account_type})</span>
                            <span class="${item.total >= 0 ? 'text-green-600' : 'text-red-600'} font-semibold">
                                ${formatCurrency(item.total, 'USD')}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="card">
                <h3 class="text-xl font-bold text-brand-teal mb-4">Option Trades P/L</h3>
                <div class="space-y-2">
                    ${data.options.length === 0 ? '<p class="text-gray-500">No data</p>' : ''}
                    ${data.options.map(item => `
                        <div class="flex justify-between border-b border-gray-200 pb-2">
                            <div>
                                <div>${item.year}-${item.month} (${item.account_type})</div>
                                <div class="text-sm text-gray-500">${item.strategy_type.replace(/_/g, ' ')}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-green-600 font-semibold">${formatCurrency(item.total_premium, 'USD')}</div>
                                ${item.realized_pl ? `<div class="text-sm ${item.realized_pl >= 0 ? 'text-green-600' : 'text-red-600'}">${formatCurrency(item.realized_pl, 'USD')}</div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `
    } catch (error) {
        console.error('Error loading report:', error)
    }
}

async function exportData(type) {
    const year = document.getElementById('report-year').value
    
    let url = `/api/reports/export?type=${type}`
    if (year) url += `&year=${year}`
    
    window.open(url, '_blank')
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatCurrency(value, currency = 'USD') {
    if (!value) return currency === 'USD' ? '$0.00' : 'C$0.00'
    const prefix = currency === 'USD' ? '$' : 'C$'
    return prefix + parseFloat(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
