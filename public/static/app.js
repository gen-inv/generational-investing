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

// Notification function for user feedback
function showNotification(message, type = 'success') {
    const notification = document.createElement('div')
    notification.className = `fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg z-50 transform transition-all duration-300 ${
        type === 'success' ? 'bg-green-500 text-white' : 
        type === 'error' ? 'bg-red-500 text-white' : 
        'bg-blue-500 text-white'
    }`
    notification.innerHTML = `
        <div class="flex items-center gap-3">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
        </div>
    `
    document.body.appendChild(notification)
    
    // Animate in
    setTimeout(() => notification.style.transform = 'translateY(0)', 10)
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(400px)'
        setTimeout(() => notification.remove(), 300)
    }, 3000)
}

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

// ============================================================================
// USER PROFILE FUNCTIONS
// ============================================================================

async function loadUserProfile() {
    try {
        const response = await api.get('/api/user/profile')
        currentUser = response.data
        
        // Update UI with user info
        const nameDisplay = document.getElementById('user-name-display')
        const emailDisplay = document.getElementById('user-email-display')
        
        if (nameDisplay) {
            nameDisplay.textContent = currentUser.name || currentUser.email
        }
        if (emailDisplay) {
            emailDisplay.textContent = currentUser.email
        }
    } catch (error) {
        console.error('Failed to load user profile:', error)
    }
}

function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown')
    dropdown.classList.toggle('hidden')
    
    // Close dropdown when clicking outside
    if (!dropdown.classList.contains('hidden')) {
        setTimeout(() => {
            document.addEventListener('click', function closeDropdown(e) {
                const container = document.getElementById('user-menu-container')
                if (!container.contains(e.target)) {
                    dropdown.classList.add('hidden')
                    document.removeEventListener('click', closeDropdown)
                }
            })
        }, 10)
    }
}

function showProfileModal() {
    // Close user dropdown
    document.getElementById('user-dropdown').classList.add('hidden')
    
    const modal = document.createElement('div')
    modal.id = 'profile-modal'
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-2xl font-bold text-brand-teal">
                    <i class="fas fa-user-edit mr-2"></i>Edit Profile
                </h2>
                <button onclick="document.getElementById('profile-modal').remove()" class="text-gray-500 hover:text-gray-700">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <form id="profileForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Name</label>
                    <input type="text" name="name" value="${currentUser.name}" required
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-teal focus:border-transparent">
                </div>
                
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                    <input type="email" name="email" value="${currentUser.email}" required
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-teal focus:border-transparent">
                </div>
                
                <div class="flex gap-3 pt-4">
                    <button type="submit" class="flex-1 bg-brand-teal text-white px-4 py-2 rounded-lg hover:bg-opacity-90 transition-colors">
                        <i class="fas fa-save mr-2"></i>Save Changes
                    </button>
                    <button type="button" onclick="document.getElementById('profile-modal').remove()"
                        class="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors">
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    `
    
    document.body.appendChild(modal)
    
    // Handle form submission
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault()
        const formData = new FormData(e.target)
        const data = {
            name: formData.get('name'),
            email: formData.get('email')
        }
        
        try {
            const response = await api.put('/api/user/profile', data)
            currentUser = response.data
            
            // Update UI
            await loadUserProfile()
            
            // Show success message
            alert('Profile updated successfully!')
            
            document.getElementById('profile-modal').remove()
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to update profile')
        }
    })
}

function showPasswordModal() {
    // Close user dropdown
    document.getElementById('user-dropdown').classList.add('hidden')
    
    const modal = document.createElement('div')
    modal.id = 'password-modal'
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-2xl font-bold text-brand-teal">
                    <i class="fas fa-key mr-2"></i>Change Password
                </h2>
                <button onclick="document.getElementById('password-modal').remove()" class="text-gray-500 hover:text-gray-700">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <form id="passwordForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Current Password</label>
                    <input type="password" name="current_password" required
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-teal focus:border-transparent">
                </div>
                
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">New Password</label>
                    <input type="password" name="new_password" required minlength="6"
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-teal focus:border-transparent">
                    <p class="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
                </div>
                
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Confirm New Password</label>
                    <input type="password" name="confirm_password" required minlength="6"
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-teal focus:border-transparent">
                </div>
                
                <div class="flex gap-3 pt-4">
                    <button type="submit" class="flex-1 bg-brand-teal text-white px-4 py-2 rounded-lg hover:bg-opacity-90 transition-colors">
                        <i class="fas fa-check mr-2"></i>Update Password
                    </button>
                    <button type="button" onclick="document.getElementById('password-modal').remove()"
                        class="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors">
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    `
    
    document.body.appendChild(modal)
    
    // Handle form submission
    document.getElementById('passwordForm').addEventListener('submit', async (e) => {
        e.preventDefault()
        const formData = new FormData(e.target)
        const data = {
            current_password: formData.get('current_password'),
            new_password: formData.get('new_password'),
            confirm_password: formData.get('confirm_password')
        }
        
        // Validate passwords match
        if (data.new_password !== data.confirm_password) {
            alert('New passwords do not match')
            return
        }
        
        try {
            await api.put('/api/user/password', {
                current_password: data.current_password,
                new_password: data.new_password
            })
            
            // Show success message
            alert('Password updated successfully!')
            
            document.getElementById('password-modal').remove()
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to update password')
        }
    })
}

function showMainApp() {
    document.getElementById('auth-screen').classList.add('hidden')
    document.getElementById('main-app').classList.remove('hidden')
    
    // Load user profile on app start (non-blocking)
    loadUserProfile().catch(err => {
        console.error('Failed to load user profile:', err)
        // Don't block login if profile load fails
    })
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
        case 'closed-trades':
            loadClosedTrades()
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
        
        // Display exchange rate
        if (totals.exchange_rate) {
            const rateText = `1 USD = ${totals.exchange_rate.usd_to_cad.toFixed(4)} CAD`
            document.getElementById('exchange-rate-display').textContent = rateText
        }
        
        // Load YTD account performance
        const ytdRes = await api.get('/api/dashboard/ytd-performance')
        const ytdData = ytdRes.data
        
        const ytdTable = document.getElementById('ytd-performance-table')
        ytdTable.innerHTML = ''
        
        if (ytdData.accounts.length === 0) {
            ytdTable.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">No account data available</td></tr>'
        } else {
            ytdData.accounts.forEach(account => {
                const plClass = account.ytd_pl >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
                ytdTable.innerHTML += `
                    <tr class="border-b border-gray-200 hover:bg-gray-50">
                        <td class="px-4 py-3 font-semibold">${account.account_name}</td>
                        <td class="px-4 py-3">${account.account_type}</td>
                        <td class="px-4 py-3 text-right">${formatCurrency(account.current_value, account.currency)}</td>
                        <td class="px-4 py-3 text-right ${plClass}">
                            ${formatCurrency(account.ytd_pl, account.currency)}
                        </td>
                        <td class="px-4 py-3 text-right ${account.ytd_rorc >= 0 ? 'text-green-600' : 'text-red-600'}">
                            ${account.ytd_rorc.toFixed(2)}%
                        </td>
                        <td class="px-4 py-3 text-right ${account.arorc >= 0 ? 'text-green-600' : 'text-red-600'}">
                            ${account.arorc.toFixed(2)}%
                        </td>
                    </tr>
                `
            })
            
            // Add totals row
            const totalPLClass = ytdData.totals.ytd_pl >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'
            ytdTable.innerHTML += `
                <tr class="border-t-2 border-gray-300 bg-gray-50">
                    <td class="px-4 py-3 font-bold" colspan="2">Total Portfolio (USD)</td>
                    <td class="px-4 py-3 text-right font-bold">${formatCurrency(ytdData.totals.current_value, 'USD')}</td>
                    <td class="px-4 py-3 text-right ${totalPLClass}">
                        ${formatCurrency(ytdData.totals.ytd_pl, 'CAD')}
                    </td>
                    <td class="px-4 py-3 text-right ${ytdData.totals.ytd_rorc >= 0 ? 'text-green-600' : 'text-red-600'}">
                        ${ytdData.totals.ytd_rorc.toFixed(2)}%
                    </td>
                    <td class="px-4 py-3 text-right ${ytdData.totals.arorc >= 0 ? 'text-green-600' : 'text-red-600'}">
                        ${ytdData.totals.arorc.toFixed(2)}%
                    </td>
                </tr>
            `
        }
    } catch (error) {
        console.error('Error loading dashboard:', error)
    }
}

// ============================================================================
// COMPANY FUNCTIONS
// ============================================================================

// Sorting state (load from localStorage if available)
let companiesSortColumn = localStorage.getItem('companiesSortColumn') || 'ticker'
let companiesSortDirection = localStorage.getItem('companiesSortDirection') || 'asc'

function updateSortIndicators() {
    // Reset all sort indicators
    const sortableColumns = ['ticker', 'company_name', 'research_score', 'anti_fragile_score']
    sortableColumns.forEach(col => {
        const indicator = document.getElementById(`sort-${col}`)
        if (indicator) {
            indicator.innerHTML = '<i class="fas fa-sort"></i>'
            indicator.className = 'text-xs text-gray-400'
        }
    })
    
    // Update active sort indicator
    const activeIndicator = document.getElementById(`sort-${companiesSortColumn}`)
    if (activeIndicator) {
        const icon = companiesSortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down'
        activeIndicator.innerHTML = `<i class="fas ${icon}"></i>`
        activeIndicator.className = 'text-xs text-brand-teal'
    }
}

function sortCompanies(column) {
    // Toggle direction if clicking same column, otherwise default to ascending
    if (companiesSortColumn === column) {
        companiesSortDirection = companiesSortDirection === 'asc' ? 'desc' : 'asc'
    } else {
        companiesSortColumn = column
        companiesSortDirection = 'asc'
    }
    
    // Save sort preference to localStorage
    localStorage.setItem('companiesSortColumn', companiesSortColumn)
    localStorage.setItem('companiesSortDirection', companiesSortDirection)
    
    updateSortIndicators()
    loadCompanies()
}

async function loadCompanies() {
    try {
        const response = await api.get('/api/companies')
        let companies = response.data.companies || response.data
        
        const table = document.getElementById('companies-table')
        table.innerHTML = ''
        
        if (!companies || companies.length === 0) {
            table.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">No companies found. Click "Add Company" to get started.</td></tr>'
            return
        }
        
        // Sort companies
        companies.sort((a, b) => {
            let aVal, bVal
            
            switch(companiesSortColumn) {
                case 'ticker':
                    aVal = (a.ticker || '').toLowerCase()
                    bVal = (b.ticker || '').toLowerCase()
                    break
                case 'company_name':
                    aVal = (a.company_name || '').toLowerCase()
                    bVal = (b.company_name || '').toLowerCase()
                    break
                case 'research_score':
                    aVal = a.research_score || 0
                    bVal = b.research_score || 0
                    break
                case 'anti_fragile_score':
                    aVal = a.anti_fragile_score || 0
                    bVal = b.anti_fragile_score || 0
                    break
                default:
                    return 0
            }
            
            if (aVal < bVal) return companiesSortDirection === 'asc' ? -1 : 1
            if (aVal > bVal) return companiesSortDirection === 'asc' ? 1 : -1
            return 0
        })
        
        // Update sort indicators after loading
        updateSortIndicators()
        
        companies.forEach(company => {
            // Check if company data is still loading (missing key fields)
            const isLoading = !company.company_name || company.company_name === company.ticker
            
            table.innerHTML += `
                <tr class="border-b border-gray-200 hover:bg-gray-50 ${isLoading ? 'animate-pulse' : ''}">
                    <td class="px-4 py-3 font-semibold">
                        <button onclick="showCompanyView(${company.id})" class="text-brand-teal hover:text-brand-gold underline">
                            ${company.ticker}
                        </button>
                    </td>
                    <td class="px-4 py-3">
                        ${isLoading ? '<i class="fas fa-spinner fa-spin mr-2 text-gray-400"></i><span class="text-gray-400">Fetching data...</span>' : company.company_name}
                    </td>
                    <td class="px-4 py-3">${company.exchange || '-'}</td>
                    <td class="px-4 py-3">${company.industry || '-'}</td>
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
        showNotification('Failed to load companies', 'error')
    }
}

function showCompanyForm(companyId = null) {
    const isEdit = companyId !== null
    const title = isEdit ? 'Edit Company' : 'Add Company'
    
    // Simplified form for adding (ticker + scores only)
    // Full form for editing
    const formFields = isEdit ? `
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
                <label class="block text-gray-700 mb-2">Target Buy Price</label>
                <input type="number" step="0.01" name="buy_price" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
            </div>
            <div>
                <label class="block text-gray-700 mb-2">Next Earnings Date</label>
                <input type="date" name="next_earnings_date" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
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
                <label class="block text-gray-700 mb-2">Research Score (0-100)</label>
                <input type="number" name="research_score" min="0" max="100" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
            </div>
            <div>
                <label class="block text-gray-700 mb-2">Anti-Fragile Score (0-100)</label>
                <input type="number" name="anti_fragile_score" min="0" max="100" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
            </div>
            <div class="col-span-2">
                <label class="flex items-center">
                    <input type="checkbox" name="is_wonderful" class="mr-2">
                    <span class="text-gray-700">Wonderful Company</span>
                </label>
            </div>
        </div>
    ` : `
        <div class="space-y-4">
            <div>
                <label class="block text-gray-700 mb-2">Ticker Symbol *</label>
                <input type="text" name="ticker" placeholder="e.g., AAPL, MSFT, GOOGL" 
                       class="w-full px-4 py-2 border border-gray-300 rounded-lg uppercase" required>
                <p class="text-sm text-gray-500 mt-1">Company data will be fetched automatically from Yahoo Finance</p>
            </div>
            <div>
                <label class="block text-gray-700 mb-2">Target Buy Price</label>
                <input type="number" step="0.01" name="buy_price" 
                       placeholder="150.00" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                <p class="text-sm text-gray-500 mt-1">Your target price to buy this stock</p>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-gray-700 mb-2">Research Score (0-100)</label>
                    <input type="number" name="research_score" min="0" max="100" 
                           placeholder="95" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    <p class="text-sm text-gray-500 mt-1">Your research quality rating</p>
                </div>
                <div>
                    <label class="block text-gray-700 mb-2">Anti-Fragile Score (0-100)</label>
                    <input type="number" name="anti_fragile_score" min="0" max="100" 
                           placeholder="88" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    <p class="text-sm text-gray-500 mt-1">Company resilience rating</p>
                </div>
            </div>
            <div>
                <label class="flex items-center">
                    <input type="checkbox" name="is_wonderful" class="mr-2">
                    <span class="text-gray-700">Mark as Wonderful Company</span>
                </label>
            </div>
        </div>
    `
    
    // Create modal
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 class="text-2xl font-bold text-brand-teal mb-6">${title}</h3>
            <form id="companyForm">
                ${formFields}
                <div class="flex gap-4 mt-6">
                    <button type="submit" class="btn-primary flex-1" id="saveBtn">
                        <span class="btn-text">Save</span>
                        <span class="btn-loading hidden">Fetching data...</span>
                    </button>
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
        const saveBtn = document.getElementById('saveBtn')
        const btnText = saveBtn.querySelector('.btn-text')
        const btnLoading = saveBtn.querySelector('.btn-loading')
        
        // Show loading state
        saveBtn.disabled = true
        btnText.classList.add('hidden')
        btnLoading.classList.remove('hidden')
        
        const data = {
            ticker: formData.get('ticker')?.toUpperCase(),
            buy_price: formData.get('buy_price') || null,
            research_score: formData.get('research_score') || null,
            anti_fragile_score: formData.get('anti_fragile_score') || null,
            is_wonderful: formData.get('is_wonderful') === 'on'
        }
        
        // For editing, include all fields
        if (isEdit) {
            data.company_name = formData.get('company_name')
            data.market_cap = formData.get('market_cap') || null
            data.exchange = formData.get('exchange') || null
            data.sector = formData.get('sector') || null
            data.industry = formData.get('industry') || null
            data.next_earnings_date = formData.get('next_earnings_date') || null
        }
        
        try {
            if (isEdit) {
                await api.put(`/api/companies/${companyId}`, data)
                modal.remove()
                loadCompanies()
            } else {
                // For new companies, show optimistic UI
                modal.remove()
                
                // Add a temporary "loading" row immediately
                const companiesTable = document.getElementById('companies-table')
                const loadingRow = document.createElement('tr')
                loadingRow.id = 'loading-company-row'
                loadingRow.className = 'border-t hover:bg-gray-50 transition-colors animate-pulse'
                loadingRow.innerHTML = `
                    <td class="px-6 py-4 text-sm font-medium text-blue-600">
                        ${data.ticker}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-500">
                        <i class="fas fa-spinner fa-spin mr-2"></i>Fetching data...
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-500">...</td>
                    <td class="px-6 py-4 text-sm text-gray-500">...</td>
                    <td class="px-6 py-4 text-center"></td>
                    <td class="px-6 py-4 text-center text-sm text-gray-500">-</td>
                    <td class="px-6 py-4 text-center text-sm text-gray-500">-</td>
                    <td class="px-6 py-4 text-sm">
                        <span class="text-gray-400">Processing...</span>
                    </td>
                `
                companiesTable.appendChild(loadingRow)
                
                // Fetch from backend
                const response = await api.post('/api/companies', data)
                
                // Remove loading row and reload with actual data
                loadingRow.remove()
                loadCompanies()
                
                // Show success notification
                showNotification(`${response.data.company_name || data.ticker} added successfully!`, 'success')
            }
        } catch (error) {
            // Remove loading row if it exists
            const loadingRow = document.getElementById('loading-company-row')
            if (loadingRow) loadingRow.remove()
            
            alert(error.response?.data?.error || 'Operation failed')
            // Restore button state
            saveBtn.disabled = false
            btnText.classList.remove('hidden')
            btnLoading.classList.add('hidden')
        }
    })
    
    // Load existing data if editing
    if (isEdit) {
        api.get(`/api/companies/${companyId}`).then(response => {
            const company = response.data.company
            const form = document.getElementById('companyForm')
            form.ticker.value = company.ticker
            form.company_name.value = company.company_name
            form.market_cap.value = company.market_cap || ''
            form.exchange.value = company.exchange || ''
            form.sector.value = company.sector || ''
            form.industry.value = company.industry || ''
            form.next_earnings_date.value = company.next_earnings_date || ''
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

// Show detailed company view with earnings date fetch option
async function showCompanyView(companyId) {
    try {
        const response = await api.get(`/api/companies/${companyId}`)
        const company = response.data.company
        
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <h2 class="text-2xl font-bold text-brand-teal">${company.ticker}</h2>
                        <p class="text-gray-600">${company.company_name}</p>
                    </div>
                    <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <div class="grid grid-cols-2 gap-4 mb-6">
                    <div>
                        <p class="text-sm text-gray-500 mb-1">Exchange</p>
                        <p class="font-semibold">${company.exchange || '-'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 mb-1">Market Cap</p>
                        <p class="font-semibold">${company.market_cap ? '$' + (company.market_cap / 1e9).toFixed(2) + 'B' : '-'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 mb-1">Sector</p>
                        <p class="font-semibold">${company.sector || '-'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 mb-1">Industry</p>
                        <p class="font-semibold">${company.industry || '-'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 mb-1">Research Score</p>
                        <p class="font-semibold">${company.research_score || '-'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 mb-1">Anti-Fragile Score</p>
                        <p class="font-semibold">${company.anti_fragile_score || '-'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 mb-1">Wonderful Company</p>
                        <p class="font-semibold">${company.is_wonderful ? '⭐ Yes' : 'No'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 mb-1">Next Earnings Date</p>
                        <p class="font-semibold" id="earningsDate">${company.next_earnings_date || '-'}</p>
                    </div>
                </div>
                
                <div class="border-t pt-4 flex gap-2">
                    <button onclick="fetchEarningsDate(${companyId})" class="btn-primary flex items-center gap-2">
                        <i class="fas fa-calendar-alt"></i>
                        <span class="btn-text">Fetch Earnings Date</span>
                        <span class="btn-loading hidden">Fetching...</span>
                    </button>
                    <button onclick="editCompany(${companyId}); this.closest('.fixed').remove()" class="btn-secondary flex items-center gap-2">
                        <i class="fas fa-edit"></i>
                        Edit Company
                    </button>
                    <button onclick="this.closest('.fixed').remove()" class="btn-secondary flex-1">Close</button>
                </div>
            </div>
        `
        
        document.body.appendChild(modal)
    } catch (error) {
        console.error('Error loading company details:', error)
        alert('Failed to load company details')
    }
}

// Fetch earnings date from FinanceBird
async function fetchEarningsDate(companyId) {
    const earningsDateElement = document.getElementById('earningsDate')
    const fetchBtn = event.target.closest('button')
    const btnText = fetchBtn.querySelector('.btn-text')
    const btnLoading = fetchBtn.querySelector('.btn-loading')
    
    // Show loading state
    fetchBtn.disabled = true
    btnText.classList.add('hidden')
    btnLoading.classList.remove('hidden')
    
    try {
        const response = await api.post(`/api/companies/${companyId}/fetch-earnings`)
        
        if (response.data.next_earnings_date) {
            // Show earnings date with ESTIMATED badge if applicable
            const estimatedBadge = response.data.is_estimated ? 
                ' <span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">ESTIMATED</span>' : ''
            earningsDateElement.innerHTML = response.data.next_earnings_date + estimatedBadge
            earningsDateElement.classList.add('text-brand-teal', 'font-bold')
        } else {
            earningsDateElement.textContent = 'Not available'
        }
        
        // Show success message
        const message = response.data.message || 'Earnings date updated'
        const messageDiv = document.createElement('div')
        messageDiv.className = 'mt-2 p-2 bg-green-100 text-green-700 rounded text-sm'
        messageDiv.textContent = message
        fetchBtn.parentElement.appendChild(messageDiv)
        
        setTimeout(() => messageDiv.remove(), 3000)
        
        // Reload companies to reflect updated data
        loadCompanies()
    } catch (error) {
        console.error('Error fetching earnings date:', error)
        alert(error.response?.data?.error || 'Failed to fetch earnings date')
    } finally {
        // Restore button state
        fetchBtn.disabled = false
        btnText.classList.remove('hidden')
        btnLoading.classList.add('hidden')
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
        console.log('Form submitted!')
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
        
        console.log('Account data to send:', data)
        
        try {
            console.log('Sending POST request...')
            console.log('Request URL:', `${api.defaults.baseURL}/api/accounts`)
            console.log('Request headers:', api.defaults.headers)
            const response = await api.post('/api/accounts', data, { timeout: 30000 })
            console.log('Response received!')
            console.log('Account created successfully:', response.data)
            console.log('Closing modal...')
            
            // Remove modal
            const modalElement = document.getElementById('account-modal')
            if (modalElement) {
                modalElement.remove()
                console.log('Modal removed successfully')
            } else {
                console.log('Modal element not found!')
            }
            
            // Refresh accounts list
            console.log('Refreshing accounts list...')
            await loadAccountsList()
            loadAccounts()
            console.log('Accounts refreshed')
        } catch (error) {
            console.error('Error creating account:', error)
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                response: error.response,
                status: error.response?.status,
                data: error.response?.data
            })
            
            // Show error message
            const errorMessage = error.response?.data?.error || error.message || 'Failed to create account'
            alert(`Error: ${errorMessage}`)
            
            // Don't remove modal on error so user can fix and retry
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
        // Check if balance can be updated this month
        const checkResponse = await api.get(`/api/accounts/${accountId}/can-update`)
        const updateCheck = checkResponse.data
        
        const response = await api.get(`/api/accounts/${accountId}`)
        const account = response.data.account
        
        const currentBalance = account.default_currency === 'CAD' ? account.balance_cad : account.balance_usd
        const currentCash = account.default_currency === 'CAD' ? account.cash_balance_cad : account.cash_balance_usd
        const lastUpdated = new Date(account.updated_at).toLocaleString()
        
        // If already updated this month, show information-only modal
        if (!updateCheck.canUpdate) {
            const modal = document.createElement('div')
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
            modal.id = 'balance-modal'
            
            modal.innerHTML = `
                <div class="bg-white rounded-lg p-6 max-w-md w-full">
                    <div class="flex items-center mb-6">
                        <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-4">
                            <i class="fas fa-check text-green-600 text-xl"></i>
                        </div>
                        <div>
                            <h3 class="text-2xl font-bold text-brand-teal">Balance Updated</h3>
                            <p class="text-sm text-gray-600">Monthly update complete</p>
                        </div>
                    </div>
                    
                    <div class="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div class="flex items-start">
                            <i class="fas fa-info-circle text-blue-600 mt-1 mr-3"></i>
                            <div>
                                <p class="font-semibold text-blue-900 mb-1">Monthly Update Already Completed</p>
                                <p class="text-sm text-blue-800">
                                    This account's balance was updated on <strong>${new Date(updateCheck.lastUpdate).toLocaleDateString()}</strong>.
                                    You can update account balances once per month to maintain accurate historical tracking.
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="mb-6 p-4 bg-gray-100 rounded-lg">
                        <h4 class="font-semibold text-gray-700 mb-3">${account.account_name}</h4>
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between">
                                <span class="text-gray-600">Account Type:</span>
                                <span class="font-semibold text-gray-900">${account.account_type}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Currency:</span>
                                <span class="font-semibold text-gray-900">${account.default_currency}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Update Period:</span>
                                <span class="font-semibold text-gray-900">${updateCheck.month}/${updateCheck.year}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Last Updated:</span>
                                <span class="font-semibold text-gray-900">${lastUpdated}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <h5 class="font-semibold text-gray-700 mb-2">Current Balances</h5>
                        <div class="space-y-2">
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600">Total Balance:</span>
                                <span class="text-xl font-bold text-brand-teal">${formatCurrency(currentBalance, account.default_currency)}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600">Cash Balance:</span>
                                <span class="text-lg font-semibold text-gray-700">${formatCurrency(currentCash, account.default_currency)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="text-center text-sm text-gray-600 mb-4">
                        <i class="fas fa-calendar-alt mr-2"></i>
                        Next update available: <strong>${updateCheck.month === 12 ? '1' : updateCheck.month + 1}/${updateCheck.month === 12 ? updateCheck.year + 1 : updateCheck.year}</strong>
                    </div>
                    
                    <button onclick="document.getElementById('balance-modal').remove()" class="btn-primary w-full">
                        <i class="fas fa-check mr-2"></i>Got It
                    </button>
                </div>
            `
            
            document.body.appendChild(modal)
            return
        }
        
        // If can update, show the update form
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.id = 'balance-modal'
        
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-md w-full">
                <h3 class="text-2xl font-bold text-brand-teal mb-6">Update Balance</h3>
                
                <div class="mb-4 p-4 bg-gray-100 rounded-lg">
                    <h4 class="font-semibold text-gray-700 mb-2">${account.account_name}</h4>
                    <div class="text-sm text-gray-600">
                        <p>Account Type: <span class="font-semibold">${account.account_type}</span></p>
                        <p>Currency: <span class="font-semibold">${account.default_currency}</span></p>
                        <p>Last Updated: <span class="font-semibold">${lastUpdated}</span></p>
                        <p>Update Period: <span class="font-semibold">${updateCheck.month}/${updateCheck.year}</span></p>
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
                balance: balance,
                cash_balance: cashBalance
            }
            
            try {
                const result = await api.put(`/api/accounts/${accountId}/balance`, data)
                modal.remove()
                
                // Show success message
                alert(`Balance updated successfully!\nHistory saved for ${result.data.month}/${result.data.year}`)
                
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
        const response = await api.get('/api/stocks?open=true')
        const stocks = response.data
        
        const table = document.getElementById('stocks-table')
        table.innerHTML = ''
        
        if (stocks.length === 0) {
            table.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">No open stock trades found</td></tr>'
            return
        }
        
        stocks.forEach(stock => {
            const avgPrice = stock.avg_price || stock.price
            const costBasis = stock.cost_basis || stock.price
            const accountName = stock.account_name || 'N/A'
            
            // Determine row color based on covered call status
            let rowClass = 'border-b border-gray-200 hover:bg-gray-50'
            let ccIndicator = ''
            
            if (stock.cc_status === 'urgent') {
                // Red highlight for covered calls expiring within 14 days
                rowClass = 'border-b border-gray-200 bg-red-50 hover:bg-red-100'
                ccIndicator = `<i class="fas fa-exclamation-triangle text-red-600 mr-2" title="Covered call expires in ${stock.days_until_cc_expiration} days"></i>`
            } else if (stock.cc_status === 'active') {
                // Orange highlight for covered calls expiring beyond 14 days
                rowClass = 'border-b border-gray-200 bg-orange-50 hover:bg-orange-100'
                ccIndicator = `<i class="fas fa-shield-alt text-orange-600 mr-2" title="Covered call expires in ${stock.days_until_cc_expiration} days"></i>`
            }
            
            table.innerHTML += `
                <tr class="${rowClass}">
                    <td class="px-4 py-3">${accountName}</td>
                    <td class="px-4 py-3 font-semibold text-brand-teal">${ccIndicator}${stock.ticker}</td>
                    <td class="px-4 py-3">${stock.trade_date}</td>
                    <td class="px-4 py-3 text-right">${stock.quantity}</td>
                    <td class="px-4 py-3 text-right">$${parseFloat(avgPrice).toFixed(2)}</td>
                    <td class="px-4 py-3 text-right">$${parseFloat(costBasis).toFixed(2)}</td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="manageStock(${stock.id})" class="text-brand-teal hover:text-brand-gold mr-2 font-semibold" title="Manage Trade">
                            <i class="fas fa-cog mr-1"></i>Manage
                        </button>
                        <button onclick="deleteStock(${stock.id})" class="text-red-600 hover:text-red-800 font-semibold" title="Delete Trade">
                            <i class="fas fa-trash mr-1"></i>Delete
                        </button>
                    </td>
                </tr>
            `
        })
    } catch (error) {
        console.error('Error loading stocks:', error)
    }
}

// New Stock Trade Form Functions

async function showStockForm(stockId = null) {
    try {
        const isEdit = stockId !== null
        const title = isEdit ? 'Edit Stock Trade' : 'Add Stock Trade'
        
        // Load companies and accounts
        const companiesResponse = await api.get('/api/companies')
        const companies = companiesResponse.data.companies || companiesResponse.data
        
        const accountsResponse = await api.get('/api/accounts')
        const accounts = accountsResponse.data.accounts || accountsResponse.data
        
        if (companies.length === 0) {
            alert('Please add companies first before creating stock trades.')
            showSection('companies')
            return
        }
        
        if (accounts.length === 0) {
            alert('Please create an account first before adding stock trades.')
            showSection('accounts')
            return
        }
        
        // Load existing data if editing
        let stock = null
        if (isEdit) {
            const response = await api.get(`/api/stocks`)
            stock = response.data.find(s => s.id === stockId)
        }
        
        const isClosed = stock && stock.is_open === 0
    
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <!-- Header -->
            <div class="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sticky top-0 z-10">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-2xl font-bold flex items-center">
                            <i class="fas fa-chart-bar mr-2"></i>${title}
                        </h3>
                        <p class="text-blue-100 text-sm">Configure Stock Position</p>
                    </div>
                    <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-blue-200 text-xl">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <!-- Content -->
            <div class="p-4">
                <form id="stockForm">
                    <!-- Basic Information Section -->
                    <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-300 mb-4">
                        <h4 class="text-sm font-bold text-gray-800 mb-3 flex items-center">
                            <i class="fas fa-info-circle mr-1 text-blue-600"></i>Basic Information
                        </h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-building mr-1 text-blue-600"></i>Company *
                                </label>
                                <select name="company_id" id="company_select" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition text-sm" required>
                                    <option value="">Select company...</option>
                                    ${companies.map(c => `
                                        <option value="${c.id}" data-ticker="${c.ticker}" data-buy-price="${c.buy_price || ''}">${c.ticker} - ${c.company_name}</option>
                                    `).join('')}
                                </select>
                                <div id="buy-price-info" class="mt-1 text-xs hidden">
                                    <span class="text-gray-600">Target Buy Price: </span>
                                    <span class="font-semibold text-brand-gold" id="target_buy_price"></span>
                                </div>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-wallet mr-1 text-green-600"></i>Account *
                                </label>
                                <select name="account_id" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition text-sm" required>
                                    <option value="">Select account...</option>
                                    ${accounts.map(acc => `
                                        <option value="${acc.id}">${acc.account_name}</option>
                                    `).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-exchange-alt mr-1 text-indigo-600"></i>Trade Type *
                                </label>
                                <select name="trade_type" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition text-sm" required>
                                    <option value="BUY">BUY</option>
                                    <option value="SELL">SELL</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-calendar mr-1 text-blue-600"></i>Open Date *
                                </label>
                                <input type="date" name="trade_date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition text-sm" required>
                            </div>
                        </div>
                    </div>

                    <!-- Trade Details Section -->
                    <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-lg border border-blue-300 mb-4">
                        <h4 class="text-sm font-bold text-blue-800 mb-3 flex items-center">
                            <i class="fas fa-sliders-h mr-1"></i>Trade Details
                        </h4>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-hashtag mr-1 text-indigo-600"></i>Shares *
                                </label>
                                <input type="number" name="quantity" id="quantity_input" min="1" class="stock-field w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition text-sm" required>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-dollar-sign mr-1 text-green-600"></i>Price per Share *
                                </label>
                                <input type="number" step="0.01" name="price" id="price_input" min="0.01" class="stock-field w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition text-sm" required>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-receipt mr-1 text-purple-600"></i>Open Commission
                                </label>
                                <input type="number" step="0.01" name="commission" id="commission_input" value="0" min="0" class="stock-field w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition text-sm">
                            </div>
                        </div>
                    </div>

                    <!-- Risk/Profit Analysis Section -->
                    <div class="bg-gradient-to-br from-green-50 to-green-100 p-3 rounded-lg border border-green-300 mb-4">
                        <h4 class="text-xs font-bold text-green-900 mb-2 flex items-center">
                            <i class="fas fa-calculator mr-1"></i>Risk & Profit Analysis
                        </h4>
                        <div id="stock_analysis_display" class="space-y-1 text-xs">
                            <p class="text-gray-500 text-center py-2">Enter trade details to see analysis</p>
                        </div>
                    </div>

                    <!-- Close Fields (if editing closed trade) -->
                    ${isClosed ? `
                    <div class="bg-gradient-to-br from-red-50 to-red-100 p-3 rounded-lg border border-red-300 mb-4">
                        <h4 class="text-sm font-bold text-red-800 mb-3 flex items-center">
                            <i class="fas fa-times-circle mr-1"></i>Closing Details
                        </h4>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">Close Date *</label>
                                <input type="date" name="close_date" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">Close Price *</label>
                                <input type="number" step="0.01" name="close_price" min="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">Close Commission</label>
                                <input type="number" step="0.01" name="close_commission" value="0" min="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Notes Section -->
                    <div class="mb-4">
                        <label class="block text-gray-700 font-semibold mb-1 text-sm">
                            <i class="fas fa-sticky-note mr-1 text-yellow-600"></i>Notes
                        </label>
                        <textarea name="notes" rows="2" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition text-sm"></textarea>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex gap-2">
                        <button type="submit" class="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 px-6 rounded-lg transition shadow-lg hover:shadow-xl">
                            <i class="fas fa-save mr-2"></i>Save Trade
                        </button>
                        <button type="button" onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-bold py-3 px-6 rounded-lg transition">
                            <i class="fas fa-times mr-2"></i>Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `
    
    document.body.appendChild(modal)
    
    // Store target buy price for calculations
    let currentTargetBuyPrice = 0
    
    // Real-time risk/profit analysis
    function calculateStockAnalysis() {
        const quantity = parseInt(document.getElementById('quantity_input')?.value) || 0
        const price = parseFloat(document.getElementById('price_input')?.value) || 0
        const commission = parseFloat(document.getElementById('commission_input')?.value) || 0
        
        if (quantity === 0 || price === 0) {
            document.getElementById('stock_analysis_display').innerHTML = '<p class="text-gray-500 text-center py-2">Enter trade details to see analysis</p>'
            return
        }
        
        // Calculate total risk (capital required)
        const totalRisk = (price * quantity) + commission
        
        // Calculate potential profit at target price (buy_price × 2)
        let html = '<div class="space-y-1">'
        
        html += `
            <div class="flex items-center justify-between">
                <span class="text-green-800 text-xs font-semibold">Total Capital Required:</span>
                <span class="font-bold text-red-700 text-sm">$${totalRisk.toFixed(2)}</span>
            </div>
        `
        
        html += `
            <div class="flex items-center justify-between">
                <span class="text-green-800 text-xs">Purchase Cost:</span>
                <span class="font-semibold text-gray-700 text-xs">$${(price * quantity).toFixed(2)}</span>
            </div>
        `
        
        html += `
            <div class="flex items-center justify-between">
                <span class="text-green-800 text-xs">Commission:</span>
                <span class="font-semibold text-gray-700 text-xs">$${commission.toFixed(2)}</span>
            </div>
        `
        
        // Show target profit if we have a target buy price
        if (currentTargetBuyPrice > 0) {
            const targetSellPrice = currentTargetBuyPrice * 2
            const saleProceeds = targetSellPrice * quantity
            const costBasis = totalRisk // Price * quantity + commission
            const potentialProfit = saleProceeds - costBasis
            const potentialROI = ((potentialProfit / costBasis) * 100).toFixed(2)
            
            html += `
                <div class="mt-2 pt-2 border-t border-green-300">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-green-900 text-xs font-semibold">Target Sell Price (Buy × 2):</span>
                        <span class="font-bold text-blue-700 text-xs">$${targetSellPrice.toFixed(2)}</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-green-900 text-xs font-semibold">Potential Profit:</span>
                        <span class="font-bold text-green-600 text-sm">+$${potentialProfit.toFixed(2)}</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-green-900 text-xs">Potential ROI:</span>
                        <span class="font-semibold text-green-600 text-xs">${potentialROI}%</span>
                    </div>
                </div>
            `
        }
        
        html += '</div>'
        document.getElementById('stock_analysis_display').innerHTML = html
    }
    
    // Add input listeners for real-time calculation
    document.querySelectorAll('.stock-field').forEach(input => {
        input.addEventListener('input', calculateStockAnalysis)
    })
    
    // Auto-fill ticker and show buy price when company is selected
    document.getElementById('company_select').addEventListener('change', (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex]
        const ticker = selectedOption.dataset.ticker
        const buyPrice = selectedOption.dataset.buyPrice
        
        const buyPriceInfo = document.getElementById('buy-price-info')
        if (buyPrice && buyPrice !== '' && buyPrice !== 'null') {
            currentTargetBuyPrice = parseFloat(buyPrice)
            buyPriceInfo.classList.remove('hidden')
            document.getElementById('target_buy_price').textContent = '$' + currentTargetBuyPrice.toFixed(2)
            calculateStockAnalysis() // Recalculate with new target
        } else {
            currentTargetBuyPrice = 0
            buyPriceInfo.classList.add('hidden')
            calculateStockAnalysis()
        }
    })
    
    document.getElementById('stockForm').addEventListener('submit', async (e) => {
        e.preventDefault()
        const formData = new FormData(e.target)
        
        const selectedCompany = companies.find(c => c.id === parseInt(formData.get('company_id')))
        
        const data = {
            company_id: parseInt(formData.get('company_id')),
            ticker: selectedCompany.ticker,
            trade_type: formData.get('trade_type'),
            quantity: parseInt(formData.get('quantity')),
            price: parseFloat(formData.get('price')),
            account_id: parseInt(formData.get('account_id')),
            trade_date: formData.get('trade_date'),
            commission: parseFloat(formData.get('commission')) || 0,
            notes: formData.get('notes') || null
        }
        
        // Include close fields if they exist (for closed trades)
        if (formData.get('close_date')) {
            data.close_date = formData.get('close_date')
            data.close_price = parseFloat(formData.get('close_price')) || null
            data.close_commission = parseFloat(formData.get('close_commission')) || 0
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
            loadClosedTrades()
            alert(isEdit ? 'Stock trade updated successfully!' : 'Stock trade added successfully!')
        } catch (error) {
            alert(error.response?.data?.error || 'Operation failed')
        }
    })
    
    // Load existing data for edit
    if (isEdit && stock) {
        const form = document.getElementById('stockForm')
        form.company_id.value = stock.company_id
        form.trade_type.value = stock.trade_type
        form.quantity.value = stock.quantity
        form.price.value = stock.price
        form.account_id.value = stock.account_id
        form.trade_date.value = stock.trade_date
        form.commission.value = stock.commission || 0
        form.notes.value = stock.notes || ''
        
        // Populate close fields if trade is closed
        if (stock.is_open === 0 && stock.close_date) {
            form.close_date.value = stock.close_date
            form.close_price.value = stock.close_price || ''
            form.close_commission.value = stock.close_commission || 0
        }
    } else {
        // Set default date to today
        const today = new Date().toISOString().split('T')[0]
        document.querySelector('[name="trade_date"]').value = today
    }
    } catch (error) {
        console.error('Error in showStockForm:', error)
        alert('Error loading form: ' + (error.message || 'Please try again'))
    }
}

async function closeStock(id) {
    try {
        // Fetch stock details
        const response = await api.get('/api/stocks')
        const stock = response.data.find(s => s.id === id)
        
        if (!stock) {
            alert('Stock not found')
            return
        }
        
        // Check for open covered calls on this position
        const coveredCallsResponse = await api.get(`/api/stocks/${id}/covered-calls`)
        const coveredCalls = coveredCallsResponse.data || []
        const openCoveredCalls = coveredCalls.filter(cc => cc.is_open === 1)
        
        if (openCoveredCalls.length > 0) {
            alert('Cannot close stock position while open covered calls exist. Please close the covered call(s) first.')
            return
        }
        
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.id = 'close-stock-modal'
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <!-- Header -->
                <div class="bg-gradient-to-r from-red-600 to-red-700 text-white p-4 sticky top-0 z-10">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-2xl font-bold flex items-center">
                                <i class="fas fa-times-circle mr-2"></i>Close Stock Position
                            </h3>
                            <p class="text-red-100 text-sm">${stock.ticker} - Finalize Position</p>
                        </div>
                        <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-red-200 text-xl">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Content -->
                <div class="p-4">
                    <!-- Position Summary -->
                    <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-300 mb-4">
                        <h4 class="text-sm font-bold text-gray-800 mb-2 flex items-center">
                            <i class="fas fa-info-circle mr-1 text-blue-600"></i>Position Summary
                        </h4>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                                <p class="text-xs text-gray-600">Shares</p>
                                <p class="font-semibold text-gray-900">${stock.quantity}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-600">Avg Price</p>
                                <p class="font-semibold text-gray-900">$${parseFloat(stock.price).toFixed(2)}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-600">Account</p>
                                <p class="font-semibold text-gray-900">${stock.account_name || stock.account_type || 'N/A'}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-600">Opened</p>
                                <p class="font-semibold text-gray-900">${stock.trade_date}</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Close Form -->
                    <form id="closeStockForm">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                            <!-- Close Date -->
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-calendar mr-1 text-blue-600"></i>Close Date *
                                </label>
                                <input type="date" name="close_date" 
                                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-1 focus:ring-brand-teal focus:outline-none transition text-sm" 
                                    required value="${new Date().toISOString().split('T')[0]}">
                            </div>
                            
                            <!-- Close Price -->
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-dollar-sign mr-1 text-green-600"></i>Close Price/Share *
                                </label>
                                <input type="number" step="0.01" name="close_price" 
                                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-1 focus:ring-brand-teal focus:outline-none transition text-sm" 
                                    required placeholder="0.00">
                            </div>
                            
                            <!-- Commission -->
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-receipt mr-1 text-purple-600"></i>Commission *
                                </label>
                                <input type="number" step="0.01" name="commission" 
                                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-1 focus:ring-brand-teal focus:outline-none transition text-sm" 
                                    required placeholder="0.00" value="0">
                            </div>
                        </div>
                        
                        <!-- P/L Calculation Info -->
                        <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-lg border border-blue-300 mb-4">
                            <h4 class="text-xs font-bold text-blue-900 mb-2 flex items-center">
                                <i class="fas fa-calculator mr-1"></i>P/L Calculation
                            </h4>
                            <div class="space-y-1 text-xs">
                                <div class="flex items-center justify-between">
                                    <span class="text-blue-800">Sale Proceeds:</span>
                                    <span class="font-semibold text-green-700" id="saleProceeds">$0.00</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-blue-800">Cost Basis:</span>
                                    <span class="font-semibold text-red-700">- $${(parseFloat(stock.price) * stock.quantity).toFixed(2)}</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-blue-800">Opening Commission:</span>
                                    <span class="font-semibold text-red-700">- $${(stock.commission || 0).toFixed(2)}</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-blue-800">Closing Commission:</span>
                                    <span class="font-semibold text-red-700" id="closingCommDisplay">- $0.00</span>
                                </div>
                                <div class="flex items-center justify-between pt-2 mt-2 border-t border-blue-300">
                                    <span class="text-blue-900 font-bold">Net Profit/Loss:</span>
                                    <span class="font-bold text-lg" id="stockProfitLoss">$0.00</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="flex gap-2">
                            <button type="submit" class="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-6 rounded-lg transition shadow-lg hover:shadow-xl">
                                <i class="fas fa-check-circle mr-2"></i>Close Position
                            </button>
                            <button type="button" onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-bold py-3 px-6 rounded-lg transition">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `
        
        document.body.appendChild(modal)
        
        // Real-time P/L calculation
        const closePriceInput = modal.querySelector('input[name="close_price"]')
        const closeCommissionInput = modal.querySelector('input[name="commission"]')
        const saleProceedsDisplay = document.getElementById('saleProceeds')
        const closingCommDisplay = document.getElementById('closingCommDisplay')
        const profitLossDisplay = document.getElementById('stockProfitLoss')
        
        function calculateStockProfitLoss() {
            const closePrice = parseFloat(closePriceInput.value) || 0
            const closeCommission = parseFloat(closeCommissionInput.value) || 0
            
            const saleProceeds = closePrice * stock.quantity
            const costBasis = parseFloat(stock.price) * stock.quantity
            const openCommission = stock.commission || 0
            
            const profitLoss = saleProceeds - costBasis - openCommission - closeCommission
            
            // Update displays
            saleProceedsDisplay.textContent = `$${saleProceeds.toFixed(2)}`
            closingCommDisplay.textContent = `- $${closeCommission.toFixed(2)}`
            
            const sign = profitLoss >= 0 ? '+' : ''
            profitLossDisplay.textContent = `${sign}$${profitLoss.toFixed(2)}`
            profitLossDisplay.className = `font-bold text-lg ${profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`
        }
        
        closePriceInput.addEventListener('input', calculateStockProfitLoss)
        closeCommissionInput.addEventListener('input', calculateStockProfitLoss)
        
        // Calculate initially
        calculateStockProfitLoss()
        
        // Handle form submission
        document.getElementById('closeStockForm').addEventListener('submit', async (e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            
            const data = {
                close_date: formData.get('close_date'),
                close_price: parseFloat(formData.get('close_price')),
                commission: parseFloat(formData.get('commission'))
            }
            
            try {
                await api.put(`/api/stocks/${id}/close`, data)
                modal.remove()
                
                // Close stock details modal if open
                const detailsModal = document.getElementById('stock-details-modal')
                if (detailsModal) detailsModal.remove()
                
                loadStocks()
                loadDashboard()
                alert('Position closed successfully!')
            } catch (error) {
                alert(error.response?.data?.error || 'Failed to close position')
            }
        })
    } catch (error) {
        console.error('Error loading stock for close:', error)
        alert('Failed to load stock details')
    }
}

async function showStockDetails(id) {
    try {
        const response = await api.get('/api/stocks')
        const stock = response.data.find(s => s.id === id)
        
        if (!stock) {
            alert('Stock not found')
            return
        }
        
        // Fetch company to get buy_price
        const companiesResponse = await api.get('/api/companies')
        const companies = companiesResponse.data.companies || companiesResponse.data
        const company = companies.find(c => c.id === stock.company_id)
        const buyPrice = company?.buy_price
        
        // Fetch dividend history and covered call history for this position
        const dividendHistoryPromise = api.get(`/api/stocks/${id}/dividends`).catch(() => ({ data: [] }))
        const coveredCallHistoryPromise = api.get(`/api/stocks/${id}/covered-calls`).catch(() => ({ data: [] }))
        
        const [dividendHistory, coveredCallHistory] = await Promise.all([
            dividendHistoryPromise,
            coveredCallHistoryPromise
        ])
        
        const dividends = dividendHistory.data || []
        const coveredCalls = coveredCallHistory.data || []
        
        const avgPrice = stock.avg_price || stock.price
        const costBasis = stock.cost_basis || stock.price
        const adjustments = stock.total_adjustments || 0
        
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.id = 'stock-details-modal'
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-0 max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <!-- Header -->
                <div class="flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-teal-700 to-teal-800">
                    <h3 class="text-2xl font-bold text-white">
                        <i class="fas fa-chart-line mr-2"></i>${stock.ticker} - Position Management
                    </h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-teal-200">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                
                <!-- Content: Sidebar + Main -->
                <div class="flex flex-1 overflow-hidden">
                    <!-- Left Sidebar - Actions -->
                    <div class="w-64 bg-gray-50 p-4 border-r border-gray-200 overflow-y-auto">
                        <h4 class="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Actions</h4>
                        <div class="space-y-2">
                            <button onclick="addStockToPosition(${id})" class="w-full text-left px-4 py-3 bg-white hover:bg-brand-teal hover:text-white rounded-lg border border-gray-200 transition-colors group">
                                <i class="fas fa-plus-circle mr-2 text-green-600 group-hover:text-white"></i>
                                <span class="font-medium">Add to Position</span>
                            </button>
                            
                            <button onclick="editStockTrade(${id})" class="w-full text-left px-4 py-3 bg-white hover:bg-brand-teal hover:text-white rounded-lg border border-gray-200 transition-colors group">
                                <i class="fas fa-edit mr-2 text-blue-600 group-hover:text-white"></i>
                                <span class="font-medium">Edit Trade</span>
                            </button>
                            
                            <button onclick="sellStockFromPosition(${id})" class="w-full text-left px-4 py-3 bg-white hover:bg-brand-teal hover:text-white rounded-lg border border-gray-200 transition-colors group">
                                <i class="fas fa-minus-circle mr-2 text-orange-600 group-hover:text-white"></i>
                                <span class="font-medium">Sell from Position</span>
                            </button>
                            
                            <button onclick="recordDividend(${id})" class="w-full text-left px-4 py-3 bg-white hover:bg-brand-teal hover:text-white rounded-lg border border-gray-200 transition-colors group">
                                <i class="fas fa-dollar-sign mr-2 text-brand-gold group-hover:text-white"></i>
                                <span class="font-medium">Record Dividend</span>
                            </button>
                            
                            <button onclick="initiateCoveredCall(${id})" class="w-full text-left px-4 py-3 bg-white hover:bg-brand-teal hover:text-white rounded-lg border border-gray-200 transition-colors group">
                                <i class="fas fa-file-contract mr-2 text-purple-600 group-hover:text-white"></i>
                                <span class="font-medium">Covered Call</span>
                            </button>
                            
                            <hr class="my-3 border-gray-300">
                            
                            <button onclick="closeStockPosition(${id})" class="w-full text-left px-4 py-3 bg-white hover:bg-red-600 hover:text-white rounded-lg border border-red-300 transition-colors group">
                                <i class="fas fa-times-circle mr-2 text-red-600 group-hover:text-white"></i>
                                <span class="font-medium">Close Position</span>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Main Content Area -->
                    <div class="flex-1 p-6 overflow-y-auto">
                        <!-- Position Summary (Compressed) -->
                        <div class="mb-4 text-white rounded-lg p-4 shadow-md" style="background: linear-gradient(to right, #004F59, #00636F);">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4 class="text-lg font-semibold mb-1">${stock.ticker} - ${stock.company_name || stock.ticker}</h4>
                                    <p class="text-sm opacity-90">${stock.account_name || 'N/A'} • Opened ${stock.trade_date}</p>
                                    ${buyPrice ? `<p class="text-sm opacity-90 mt-1">🎯 Target Buy Price: <span class="font-semibold">$${parseFloat(buyPrice).toFixed(2)}</span></p>` : ''}
                                </div>
                                <div class="text-right">
                                    <p class="text-3xl font-bold">${stock.quantity}</p>
                                    <p class="text-xs opacity-90">shares</p>
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/20">
                                <div>
                                    <p class="text-xs opacity-75">Avg Price</p>
                                    <p class="text-lg font-semibold">$${avgPrice.toFixed(2)}</p>
                                </div>
                                <div>
                                    <p class="text-xs opacity-75">Cost Basis/Share</p>
                                    <p class="text-lg font-bold text-yellow-300">$${costBasis.toFixed(2)}</p>
                                </div>
                                <div>
                                    <p class="text-xs opacity-75">CB Adjustments</p>
                                    <p class="text-lg font-semibold">${adjustments > 0 ? '-' : ''}$${Math.abs(adjustments).toFixed(2)}</p>
                                </div>
                            </div>
                            ${stock.notes ? `
                                <div class="mt-3 pt-3 border-t border-white/20">
                                    <p class="text-xs opacity-75"><i class="fas fa-sticky-note mr-1"></i>Notes</p>
                                    <p class="text-sm mt-1">${stock.notes}</p>
                                </div>
                            ` : ''}
                        </div>
                        
                        <!-- Covered Call History -->
                        <div class="mb-6">
                            <h4 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <i class="fas fa-file-contract text-purple-600 mr-2"></i>
                                Covered Call History
                            </h4>
                            ${coveredCalls.length > 0 ? `
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm">
                                        <thead class="bg-gray-100">
                                            <tr>
                                                <th class="px-4 py-2 text-left">Trade Date</th>
                                                <th class="px-4 py-2 text-center">Strike</th>
                                                <th class="px-4 py-2 text-left">Expiration</th>
                                                <th class="px-4 py-2 text-right">Credit Received</th>
                                                <th class="px-4 py-2 text-center">Contracts</th>
                                                <th class="px-4 py-2 text-right">Closed P/L</th>
                                                <th class="px-4 py-2 text-center">Status</th>
                                                <th class="px-4 py-2 text-center">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-gray-200">
                                            ${coveredCalls.map(cc => {
                                                // Calculate days until expiration
                                                const expDate = new Date(cc.expiration_date)
                                                const today = new Date()
                                                const daysUntil = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24))
                                                
                                                // Determine expiration warning color
                                                let expirationClass = ''
                                                let expirationWarning = ''
                                                if (cc.is_open && daysUntil <= 14) {
                                                    expirationClass = 'text-red-600 font-semibold'
                                                    expirationWarning = ` <i class="fas fa-exclamation-triangle text-red-600" title="Expires in ${daysUntil} days"></i>`
                                                } else if (cc.is_open && daysUntil <= 30) {
                                                    expirationClass = 'text-orange-600 font-semibold'
                                                    expirationWarning = ` <i class="fas fa-clock text-orange-600" title="Expires in ${daysUntil} days"></i>`
                                                }
                                                
                                                // Format closed P/L
                                                let closedPL = '-'
                                                let plClass = ''
                                                if (!cc.is_open && cc.profit_loss !== null && cc.profit_loss !== undefined) {
                                                    closedPL = '$' + cc.profit_loss.toFixed(2)
                                                    plClass = cc.profit_loss >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
                                                }
                                                
                                                return `
                                                <tr class="hover:bg-gray-50">
                                                    <td class="px-4 py-2">${cc.trade_date}</td>
                                                    <td class="px-4 py-2 text-center font-semibold">$${cc.strike_price.toFixed(2)}</td>
                                                    <td class="px-4 py-2 ${expirationClass}">${cc.expiration_date}${expirationWarning}</td>
                                                    <td class="px-4 py-2 text-right font-semibold text-green-600">$${cc.premium.toFixed(2)}</td>
                                                    <td class="px-4 py-2 text-center">${cc.quantity}</td>
                                                    <td class="px-4 py-2 text-right ${plClass}">${closedPL}</td>
                                                    <td class="px-4 py-2 text-center">
                                                        <span class="px-2 py-1 rounded text-xs ${cc.is_open ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}">
                                                            ${cc.is_open ? 'Open' : 'Closed'}
                                                        </span>
                                                    </td>
                                                    <td class="px-4 py-2 text-center">
                                                        ${cc.is_open ? `
                                                            <button onclick="viewCoveredCallDetails(${cc.id})" class="text-brand-teal hover:text-brand-gold mr-2" title="View Details">
                                                                <i class="fas fa-eye"></i>
                                                            </button>
                                                            <button onclick="editCoveredCall(${cc.id})" class="text-blue-600 hover:text-blue-800 mr-2" title="Edit">
                                                                <i class="fas fa-edit"></i>
                                                            </button>
                                                            <button onclick="closeCoveredCall(${cc.id}, ${id})" class="text-yellow-600 hover:text-yellow-800" title="Close">
                                                                <i class="fas fa-check-circle"></i>
                                                            </button>
                                                        ` : `
                                                            <button onclick="viewCoveredCallDetails(${cc.id})" class="text-brand-teal hover:text-brand-gold" title="View Details">
                                                                <i class="fas fa-eye"></i>
                                                            </button>
                                                        `}
                                                    </td>
                                                </tr>
                                            `}).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            ` : `
                                <div class="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                                    <i class="fas fa-inbox text-3xl mb-2"></i>
                                    <p>No covered calls recorded yet</p>
                                    <button onclick="initiateCoveredCall(${id})" class="mt-3 text-brand-teal hover:underline">
                                        <i class="fas fa-plus mr-1"></i>Initiate Covered Call
                                    </button>
                                </div>
                            `}
                        </div>
                        
                        <!-- Dividend History -->
                        <div class="mb-6">
                            <h4 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <i class="fas fa-dollar-sign text-brand-gold mr-2"></i>
                                Dividend History
                            </h4>
                            ${dividends.length > 0 ? `
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm">
                                        <thead class="bg-gray-100">
                                            <tr>
                                                <th class="px-4 py-2 text-left">Date</th>
                                                <th class="px-4 py-2 text-right">Amount</th>
                                                <th class="px-4 py-2 text-right">Per Share</th>
                                                <th class="px-4 py-2 text-center">Shares</th>
                                                <th class="px-4 py-2 text-left">Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-gray-200">
                                            ${dividends.map(div => `
                                                <tr class="hover:bg-gray-50">
                                                    <td class="px-4 py-2">${div.adjustment_date}</td>
                                                    <td class="px-4 py-2 text-right font-semibold text-green-600">$${div.amount.toFixed(2)}</td>
                                                    <td class="px-4 py-2 text-right">$${(div.amount / stock.quantity).toFixed(4)}</td>
                                                    <td class="px-4 py-2 text-center">${stock.quantity}</td>
                                                    <td class="px-4 py-2 text-gray-600">${div.notes || '-'}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            ` : `
                                <div class="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                                    <i class="fas fa-inbox text-3xl mb-2"></i>
                                    <p>No dividend payments recorded yet</p>
                                    <button onclick="recordDividend(${id})" class="mt-3 text-brand-teal hover:underline">
                                        <i class="fas fa-plus mr-1"></i>Record Dividend
                                    </button>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `
        
        document.body.appendChild(modal)
    } catch (error) {
        console.error('Error loading stock details:', error)
        alert('Failed to load stock details')
    }
}

// ============================================================================
// STOCK TRADE ACTION FUNCTIONS
// ============================================================================

// Add to existing position
async function addStockToPosition(stockId) {
    try {
        const response = await api.get('/api/stocks')
        const stock = response.data.find(s => s.id === stockId)
        
        if (!stock) {
            alert('Stock not found')
            return
        }
        
        // Close the details modal
        const modal = document.getElementById('stock-details-modal')
        if (modal) modal.remove()
        
        // Show add stock form (similar to buy stock but updates existing position)
        showAddToPositionForm(stock)
    } catch (error) {
        console.error('Error:', error)
        alert('Failed to load stock information')
    }
}

// Sell from existing position
async function sellStockFromPosition(stockId) {
    try {
        const response = await api.get('/api/stocks')
        const stock = response.data.find(s => s.id === stockId)
        
        if (!stock) {
            alert('Stock not found')
            return
        }
        
        // Close the details modal
        const modal = document.getElementById('stock-details-modal')
        if (modal) modal.remove()
        
        // Show sell stock form
        showSellFromPositionForm(stock)
    } catch (error) {
        console.error('Error:', error)
        alert('Failed to load stock information')
    }
}

// Record dividend payment
async function recordDividend(stockId) {
    try {
        const response = await api.get('/api/stocks')
        const stock = response.data.find(s => s.id === stockId)
        
        if (!stock) {
            alert('Stock not found')
            return
        }
        
        // Close the details modal
        const detailsModal = document.getElementById('stock-details-modal')
        if (detailsModal) detailsModal.remove()
        
        // Show dividend form
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.id = 'dividend-modal'
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-md w-full">
                <h3 class="text-2xl font-bold text-brand-teal mb-6">
                    <i class="fas fa-dollar-sign mr-2"></i>Record Dividend - ${stock.ticker}
                </h3>
                
                <div class="mb-4 p-4 bg-gray-100 rounded-lg">
                    <p class="text-sm text-gray-600">Position: <span class="font-semibold">${stock.quantity} shares</span></p>
                    <p class="text-sm text-gray-600">Account: <span class="font-semibold">${stock.account_name}</span></p>
                </div>
                
                <form id="dividendForm">
                    <div class="mb-4">
                        <label class="block text-gray-700 mb-2">Dividend Amount (Total) *</label>
                        <input type="number" step="0.01" name="amount" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                        <small class="text-gray-500">Total dividend received</small>
                    </div>
                    
                    <div class="mb-4">
                        <label class="block text-gray-700 mb-2">Payment Date *</label>
                        <input type="date" name="payment_date" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    
                    <div class="mb-4">
                        <label class="block text-gray-700 mb-2">Notes</label>
                        <textarea name="notes" class="w-full px-4 py-2 border border-gray-300 rounded-lg" rows="2" placeholder="Optional notes"></textarea>
                    </div>
                    
                    <div class="flex gap-4">
                        <button type="submit" class="btn-primary flex-1">
                            <i class="fas fa-save mr-2"></i>Save Dividend
                        </button>
                        <button type="button" onclick="this.closest('.fixed').remove(); showStockDetails(${stockId})" class="btn-secondary flex-1">Cancel</button>
                    </div>
                </form>
            </div>
        `
        
        document.body.appendChild(modal)
        
        document.getElementById('dividendForm').addEventListener('submit', async (e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            
            try {
                await api.post(`/api/stocks/${stockId}/dividends`, {
                    amount: parseFloat(formData.get('amount')),
                    payment_date: formData.get('payment_date'),
                    notes: formData.get('notes') || null
                })
                
                modal.remove()
                alert('Dividend recorded successfully!')
                
                // Reload the details view to show updated history
                showStockDetails(stockId)
                loadStocks()
                loadDashboard()
            } catch (error) {
                console.error('Error recording dividend:', error)
                alert(error.response?.data?.error || 'Failed to record dividend')
            }
        })
    } catch (error) {
        console.error('Error:', error)
        alert('Failed to load stock information')
    }
}

// Initiate covered call
async function initiateCoveredCall(stockId) {
    try {
        const response = await api.get('/api/stocks')
        const stock = response.data.find(s => s.id === stockId)
        
        if (!stock) {
            alert('Stock not found')
            return
        }
        
        const maxContracts = Math.floor(stock.quantity / 100)
        
        if (maxContracts === 0) {
            alert('You need at least 100 shares to sell a covered call')
            return
        }
        
        // Close the details modal
        const detailsModal = document.getElementById('stock-details-modal')
        if (detailsModal) detailsModal.remove()
        
        // Show covered call form
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.id = 'covered-call-modal'
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-4xl w-full">
                <h3 class="text-2xl font-bold text-brand-teal mb-6">
                    <i class="fas fa-file-contract mr-2"></i>Covered Call - ${stock.ticker}
                </h3>
                
                <div class="mb-6 p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                    <div class="grid grid-cols-3 gap-4 text-sm">
                        <div>
                            <p class="text-gray-600">Position</p>
                            <p class="font-semibold text-gray-900">${stock.quantity} shares</p>
                        </div>
                        <div>
                            <p class="text-gray-600">Account</p>
                            <p class="font-semibold text-gray-900">${stock.account_name}</p>
                        </div>
                        <div>
                            <p class="text-gray-600">Max Contracts</p>
                            <p class="font-semibold text-gray-900">${maxContracts}</p>
                        </div>
                    </div>
                </div>
                
                <form id="coveredCallForm">
                    <!-- Row 1: Strike, Premium, Contracts -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label class="block text-gray-700 font-semibold mb-2">Strike Price *</label>
                            <input type="number" step="0.01" name="strike_price" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-2 focus:ring-brand-teal focus:outline-none" required>
                        </div>
                        
                        <div>
                            <label class="block text-gray-700 font-semibold mb-2">Premium Per Share *</label>
                            <input type="number" step="0.01" name="premium" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-2 focus:ring-brand-teal focus:outline-none" required>
                            <small class="text-gray-500 text-xs">1 contract = 100 shares</small>
                        </div>
                        
                        <div>
                            <label class="block text-gray-700 font-semibold mb-2">Contracts *</label>
                            <input type="number" name="quantity" min="1" max="${maxContracts}" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-2 focus:ring-brand-teal focus:outline-none" required value="1">
                            <small class="text-gray-500 text-xs">Max: ${maxContracts}</small>
                        </div>
                    </div>
                    
                    <!-- Row 2: Expiration, Trade Date, Commission -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label class="block text-gray-700 font-semibold mb-2">Expiration Date *</label>
                            <input type="date" name="expiration_date" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-2 focus:ring-brand-teal focus:outline-none" required>
                        </div>
                        
                        <div>
                            <label class="block text-gray-700 font-semibold mb-2">Trade Date *</label>
                            <input type="date" name="trade_date" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-2 focus:ring-brand-teal focus:outline-none" required value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        
                        <div>
                            <label class="block text-gray-700 font-semibold mb-2">Commission</label>
                            <input type="number" step="0.01" name="commission" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-2 focus:ring-brand-teal focus:outline-none" placeholder="0.00" value="0">
                            <small class="text-gray-500 text-xs">Opening cost</small>
                        </div>
                    </div>
                    
                    <!-- Row 3: Notes (full width) -->
                    <div class="mb-6">
                        <label class="block text-gray-700 font-semibold mb-2">Notes</label>
                        <textarea name="notes" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-2 focus:ring-brand-teal focus:outline-none" rows="2" placeholder="Optional notes"></textarea>
                    </div>
                    
                    <!-- Action Buttons -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <button type="submit" class="w-full bg-gradient-to-r from-teal-700 to-teal-800 hover:from-teal-800 hover:to-teal-900 text-white font-bold py-3 px-6 rounded-lg transition shadow-lg hover:shadow-xl">
                            <i class="fas fa-save mr-2"></i>Save Covered Call
                        </button>
                        <button type="button" onclick="this.closest('.fixed').remove(); showStockDetails(${stockId})" class="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold py-3 px-6 rounded-lg transition shadow-lg hover:shadow-xl">
                            <i class="fas fa-times mr-2"></i>Cancel
                        </button>
                    </div>
                </form>
            </div>
        `
        
        document.body.appendChild(modal)
        
        document.getElementById('coveredCallForm').addEventListener('submit', async (e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            
            const quantity = parseInt(formData.get('quantity'))
            if (quantity > maxContracts) {
                alert(`Maximum ${maxContracts} contracts allowed for this position`)
                return
            }
            
            try {
                await api.post(`/api/stocks/${stockId}/covered-calls`, {
                    strike_price: parseFloat(formData.get('strike_price')),
                    premium: parseFloat(formData.get('premium')),
                    quantity: quantity,
                    expiration_date: formData.get('expiration_date'),
                    trade_date: formData.get('trade_date'),
                    commission: parseFloat(formData.get('commission')) || 0,
                    notes: formData.get('notes') || null
                })
                
                modal.remove()
                alert('Covered call recorded successfully!')
                
                // Reload the details view to show updated history
                showStockDetails(stockId)
                loadStocks()
                loadDashboard()
            } catch (error) {
                console.error('Error recording covered call:', error)
                alert(error.response?.data?.error || 'Failed to record covered call')
            }
        })
    } catch (error) {
        console.error('Error:', error)
        alert('Failed to load stock information')
    }
}

// Edit stock trade
async function editStockTrade(stockId) {
    // Close the details modal
    const modal = document.getElementById('stock-details-modal')
    if (modal) modal.remove()
    
    // Call existing editStock function
    editStock(stockId)
}

// Close position
async function closeStockPosition(stockId) {
    // Close the details modal
    const modal = document.getElementById('stock-details-modal')
    if (modal) modal.remove()
    
    // Call existing closeStock function
    closeStock(stockId)
}

// View covered call details
async function viewCoveredCallDetails(ccId) {
    try {
        // First get all stocks to find the one with this covered call
        const stocksResponse = await api.get('/api/stocks')
        let cc = null
        let stockId = null
        
        // Find the stock that has this covered call
        for (const stock of stocksResponse.data) {
            const ccResponse = await api.get(`/api/stocks/${stock.id}/covered-calls`)
            const foundCC = ccResponse.data.find(o => o.id === ccId)
            if (foundCC) {
                cc = foundCC
                stockId = stock.id
                break
            }
        }
        
        if (!cc) {
            alert('Covered call not found')
            return
        }
        
        // Calculate days until expiration
        const expDate = new Date(cc.expiration_date)
        const today = new Date()
        const daysUntil = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24))
        
        // Determine expiration urgency
        let expirationBgClass = 'bg-gray-50'
        let expirationTextClass = 'text-gray-900'
        let expirationBadge = ''
        
        if (cc.is_open && daysUntil <= 14) {
            expirationBgClass = 'bg-red-50 border-2 border-red-300'
            expirationTextClass = 'text-red-700'
            expirationBadge = `<span class="ml-2 px-2 py-1 bg-red-600 text-white text-xs rounded-full font-semibold">URGENT</span>`
        } else if (cc.is_open && daysUntil <= 30) {
            expirationBgClass = 'bg-orange-50 border-2 border-orange-300'
            expirationTextClass = 'text-orange-700'
            expirationBadge = `<span class="ml-2 px-2 py-1 bg-orange-600 text-white text-xs rounded-full">SOON</span>`
        }
        
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <!-- Header -->
                <div class="bg-gradient-to-r from-teal-700 to-teal-800 text-white p-6 sticky top-0 z-10">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-3xl font-bold flex items-center">
                                <i class="fas fa-file-contract mr-3"></i>Covered Call Details
                            </h3>
                            <p class="text-teal-100 mt-1">${cc.ticker} - ${cc.is_open ? 'Open Position' : 'Closed Position'}</p>
                        </div>
                        <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-teal-200 text-2xl">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Content -->
                <div class="p-6">
                    <!-- Status Badge -->
                    <div class="mb-6">
                        <span class="px-4 py-2 rounded-lg text-lg font-semibold ${cc.is_open ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}">
                            <i class="fas fa-${cc.is_open ? 'lock-open' : 'lock'} mr-2"></i>${cc.is_open ? 'OPEN' : 'CLOSED'}
                        </span>
                    </div>
                    
                    <!-- Premium & Contracts Summary -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div class="bg-gradient-to-br from-green-50 to-green-100 p-5 rounded-xl border-2 border-green-300">
                            <p class="text-sm text-green-700 mb-1 font-medium">Total Premium Received</p>
                            <p class="text-3xl font-bold text-green-700">$${(cc.premium * cc.quantity * 100).toFixed(2)}</p>
                            <p class="text-xs text-green-600 mt-2">
                                <i class="fas fa-info-circle mr-1"></i>$${cc.premium.toFixed(2)}/share × ${cc.quantity} contracts × 100 shares
                            </p>
                        </div>
                        <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-xl border-2 border-blue-300">
                            <p class="text-sm text-blue-700 mb-1 font-medium">Strike Price</p>
                            <p class="text-3xl font-bold text-blue-700">$${cc.strike_price.toFixed(2)}</p>
                            <p class="text-xs text-blue-600 mt-2">
                                <i class="fas fa-bullseye mr-1"></i>Target assignment price
                            </p>
                        </div>
                        <div class="bg-gradient-to-br from-purple-50 to-purple-100 p-5 rounded-xl border-2 border-purple-300">
                            <p class="text-sm text-purple-700 mb-1 font-medium">Contracts</p>
                            <p class="text-3xl font-bold text-purple-700">${cc.quantity}</p>
                            <p class="text-xs text-purple-600 mt-2">
                                <i class="fas fa-layer-group mr-1"></i>${cc.quantity * 100} shares covered
                            </p>
                        </div>
                    </div>
                    
                    <!-- Dates & Expiration -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div class="bg-gray-50 p-5 rounded-xl border border-gray-200">
                            <p class="text-sm text-gray-600 mb-2 font-medium">
                                <i class="fas fa-calendar-plus mr-2"></i>Trade Date
                            </p>
                            <p class="text-xl font-semibold text-gray-900">${cc.trade_date}</p>
                        </div>
                        <div class="${expirationBgClass} p-5 rounded-xl">
                            <p class="text-sm ${expirationTextClass} mb-2 font-medium flex items-center">
                                <i class="fas fa-calendar-day mr-2"></i>Expiration Date
                                ${expirationBadge}
                            </p>
                            <p class="text-xl font-semibold ${expirationTextClass}">${cc.expiration_date}</p>
                            ${cc.is_open ? `
                                <p class="text-sm ${expirationTextClass} mt-2 font-semibold">
                                    <i class="fas fa-clock mr-1"></i>${daysUntil} day${daysUntil !== 1 ? 's' : ''} remaining
                                </p>
                            ` : ''}
                        </div>
                    </div>
                    
                    ${!cc.is_open ? `
                        <!-- Closed Position Details -->
                        <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-5 rounded-xl border-2 border-gray-300 mb-6">
                            <h4 class="text-lg font-bold text-gray-800 mb-4">
                                <i class="fas fa-chart-line mr-2"></i>Closing Details
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <p class="text-sm text-gray-600 mb-1">Close Date</p>
                                    <p class="text-lg font-semibold text-gray-900">${cc.close_date || 'N/A'}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-600 mb-1">Close Price</p>
                                    <p class="text-lg font-semibold text-gray-900">$${(cc.close_price || 0).toFixed(2)}/share</p>
                                    <p class="text-xs text-gray-500">$${((cc.close_price || 0) * cc.quantity * 100).toFixed(2)} total</p>
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <p class="text-sm text-gray-600 mb-1">Commission In</p>
                                    <p class="text-lg font-semibold text-red-600">$${(cc.commission || 0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-600 mb-1">Commission Out</p>
                                    <p class="text-lg font-semibold text-red-600">$${(cc.close_commission || 0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-600 mb-1">Net Profit/Loss</p>
                                    <p class="text-2xl font-bold ${(cc.profit_loss || 0) >= 0 ? 'text-green-600' : 'text-red-600'}">
                                        ${(cc.profit_loss || 0) >= 0 ? '+' : ''}$${(cc.profit_loss || 0).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${cc.notes ? `
                        <!-- Notes -->
                        <div class="bg-yellow-50 p-5 rounded-xl border-2 border-yellow-300 mb-6">
                            <p class="text-sm text-yellow-800 mb-2 font-medium">
                                <i class="fas fa-sticky-note mr-2"></i>Notes
                            </p>
                            <p class="text-gray-700">${cc.notes}</p>
                        </div>
                    ` : ''}
                    
                    <!-- Action Buttons -->
                    <div class="flex gap-3 flex-wrap">
                        ${cc.is_open ? `
                            <button onclick="editCoveredCall(${ccId}); this.closest('.fixed').remove();" class="flex-1 min-w-[200px] bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition">
                                <i class="fas fa-edit mr-2"></i>Edit Details
                            </button>
                            <button onclick="closeCoveredCall(${ccId}, ${stockId}); this.closest('.fixed').remove();" class="flex-1 min-w-[200px] bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-3 px-6 rounded-lg transition">
                                <i class="fas fa-check-circle mr-2"></i>Close Position
                            </button>
                        ` : ''}
                        <button onclick="this.closest('.fixed').remove()" class="flex-1 min-w-[200px] bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition">
                            <i class="fas fa-times mr-2"></i>Close Window
                        </button>
                    </div>
                </div>
            </div>
        `
        
        document.body.appendChild(modal)
    } catch (error) {
        console.error('Error viewing covered call:', error)
        alert('Failed to load covered call details')
    }
}

// Edit covered call
async function editCoveredCall(ccId) {
    try {
        // First get all stocks to find the one with this covered call
        const stocksResponse = await api.get('/api/stocks')
        let cc = null
        
        // Find the stock that has this covered call
        for (const stock of stocksResponse.data) {
            const ccResponse = await api.get(`/api/stocks/${stock.id}/covered-calls`)
            const foundCC = ccResponse.data.find(o => o.id === ccId)
            if (foundCC) {
                cc = foundCC
                break
            }
        }
        
        if (!cc) {
            alert('Covered call not found')
            return
        }
        
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.id = 'edit-covered-call-modal'
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <h3 class="text-2xl font-bold text-brand-teal mb-6">
                    <i class="fas fa-edit mr-2"></i>Edit Covered Call - ${cc.ticker}
                </h3>
                
                <form id="editCoveredCallForm">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="mb-4">
                            <label class="block text-gray-700 mb-2">Strike Price *</label>
                            <input type="number" step="0.01" name="strike_price" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required value="${cc.strike_price}">
                        </div>
                        
                        <div class="mb-4">
                            <label class="block text-gray-700 mb-2">Premium Per Share *</label>
                            <input type="number" step="0.01" name="premium" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required value="${cc.premium}">
                            <small class="text-gray-500">Premium per share (1 contract = 100 shares)</small>
                        </div>
                        
                        <div class="mb-4">
                            <label class="block text-gray-700 mb-2">Number of Contracts *</label>
                            <input type="number" name="quantity" min="1" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required value="${cc.quantity}">
                        </div>
                        
                        <div class="mb-4">
                            <label class="block text-gray-700 mb-2">Expiration Date *</label>
                            <input type="date" name="expiration_date" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required value="${cc.expiration_date}">
                        </div>
                        
                        <div class="mb-4">
                            <label class="block text-gray-700 mb-2">Open Date *</label>
                            <input type="date" name="trade_date" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required value="${cc.trade_date}">
                        </div>
                        
                        <div class="mb-4">
                            <label class="block text-gray-700 mb-2">Open Commission</label>
                            <input type="number" step="0.01" name="commission" class="w-full px-4 py-2 border border-gray-300 rounded-lg" value="${cc.commission || 0}">
                        </div>
                    </div>
                    
                    ${!cc.is_open ? `
                    <div class="border-t-2 border-gray-300 mt-6 pt-6">
                        <h4 class="text-lg font-bold text-gray-800 mb-4">Closing Information</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="mb-4">
                                <label class="block text-gray-700 mb-2">Close Date ${!cc.is_open ? '*' : ''}</label>
                                <input type="date" name="close_date" class="w-full px-4 py-2 border border-gray-300 rounded-lg" ${!cc.is_open ? 'required' : ''} value="${cc.close_date || ''}">
                            </div>
                            
                            <div class="mb-4">
                                <label class="block text-gray-700 mb-2">Close Price (per share) ${!cc.is_open ? '*' : ''}</label>
                                <input type="number" step="0.01" name="close_price" class="w-full px-4 py-2 border border-gray-300 rounded-lg" ${!cc.is_open ? 'required' : ''} value="${cc.close_price || ''}">
                            </div>
                            
                            <div class="mb-4">
                                <label class="block text-gray-700 mb-2">Close Commission</label>
                                <input type="number" step="0.01" name="close_commission" class="w-full px-4 py-2 border border-gray-300 rounded-lg" value="${cc.close_commission || 0}">
                            </div>
                        </div>
                    </div>
                    ` : ''}
                    
                    <div class="mb-4">
                        <label class="block text-gray-700 mb-2">Notes</label>
                        <textarea name="notes" class="w-full px-4 py-2 border border-gray-300 rounded-lg" rows="2">${cc.notes || ''}</textarea>
                    </div>
                    
                    <div class="flex gap-4">
                        <button type="submit" class="btn-primary flex-1">
                            <i class="fas fa-save mr-2"></i>Save Changes
                        </button>
                        <button type="button" onclick="this.closest('.fixed').remove()" class="btn-secondary flex-1">Cancel</button>
                    </div>
                </form>
            </div>
        `
        
        document.body.appendChild(modal)
        
        document.getElementById('editCoveredCallForm').addEventListener('submit', async (e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            
            try {
                const data = {
                    strike_price: parseFloat(formData.get('strike_price')),
                    premium: parseFloat(formData.get('premium')),
                    quantity: parseInt(formData.get('quantity')),
                    expiration_date: formData.get('expiration_date'),
                    trade_date: formData.get('trade_date'),
                    commission: parseFloat(formData.get('commission')) || 0,
                    notes: formData.get('notes') || null
                }
                
                // Add close fields if present
                if (formData.get('close_date')) {
                    data.close_date = formData.get('close_date')
                    data.close_price = parseFloat(formData.get('close_price'))
                    data.close_commission = parseFloat(formData.get('close_commission')) || 0
                }
                
                await api.put(`/api/covered-calls/${ccId}`, data)
                
                modal.remove()
                alert('Covered call updated successfully!')
                
                // Reload stock details to reflect changes
                loadStocks()
                loadDashboard()
            } catch (error) {
                console.error('Error updating covered call:', error)
                alert(error.response?.data?.error || 'Failed to update covered call')
            }
        })
    } catch (error) {
        console.error('Error:', error)
        alert('Failed to load covered call details')
    }
}

// Close covered call
async function closeCoveredCall(ccId, stockId) {
    try {
        // Fetch the covered call details directly
        const response = await api.get(`/api/stocks/${stockId}/covered-calls`)
        const cc = response.data.find(o => o.id === ccId)
        
        if (!cc) {
            alert('Covered call not found')
            return
        }
        
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.id = 'close-covered-call-modal'
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <!-- Header -->
                <div class="bg-gradient-to-r from-yellow-600 to-yellow-700 text-white p-4 sticky top-0 z-10">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-2xl font-bold flex items-center">
                                <i class="fas fa-check-circle mr-2"></i>Close Covered Call
                            </h3>
                            <p class="text-yellow-100 text-sm">${cc.ticker} - Finalize Position</p>
                        </div>
                        <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-yellow-200 text-xl">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Content -->
                <div class="p-4">
                    <!-- Position Summary -->
                    <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-300 mb-4">
                        <h4 class="text-sm font-bold text-gray-800 mb-2 flex items-center">
                            <i class="fas fa-info-circle mr-1 text-blue-600"></i>Position Summary
                        </h4>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                                <p class="text-xs text-gray-600">Strike</p>
                                <p class="font-semibold text-gray-900">$${cc.strike_price.toFixed(2)}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-600">Premium</p>
                                <p class="font-semibold text-green-600">$${(cc.premium * cc.quantity * 100).toFixed(2)}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-600">Contracts</p>
                                <p class="font-semibold text-gray-900">${cc.quantity}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-600">Expires</p>
                                <p class="font-semibold text-gray-900">${cc.expiration_date}</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Close Form -->
                    <form id="closeCoveredCallForm">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                            <!-- Close Date -->
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-calendar mr-1 text-blue-600"></i>Close Date *
                                </label>
                                <input type="date" name="close_date" 
                                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-1 focus:ring-brand-teal focus:outline-none transition text-sm" 
                                    required value="${cc.expiration_date}">
                                <small class="text-gray-500 text-xs">
                                    <i class="fas fa-info-circle mr-1"></i>Defaults to expiration date
                                </small>
                            </div>
                            
                            <!-- Close Price -->
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-dollar-sign mr-1 text-green-600"></i>Close Price/Share *
                                </label>
                                <input type="number" step="0.01" name="close_price" 
                                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-1 focus:ring-brand-teal focus:outline-none transition text-sm" 
                                    required placeholder="0.00" value="0">
                            </div>
                            
                            <!-- Commission -->
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-receipt mr-1 text-purple-600"></i>Commission *
                                </label>
                                <input type="number" step="0.01" name="commission" 
                                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-1 focus:ring-brand-teal focus:outline-none transition text-sm" 
                                    required placeholder="0.00" value="0">
                            </div>
                        </div>
                        
                        <!-- P/L Calculation Info -->
                        <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-lg border border-blue-300 mb-4">
                            <h4 class="text-xs font-bold text-blue-900 mb-2 flex items-center">
                                <i class="fas fa-calculator mr-1"></i>P/L Calculation
                            </h4>
                            <div class="space-y-1 text-xs">
                                <div class="flex items-center justify-between">
                                    <span class="text-blue-800">Premium Received:</span>
                                    <span class="font-semibold text-green-700">+ $${(cc.premium * cc.quantity * 100).toFixed(2)}</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-blue-800">Close Cost:</span>
                                    <span class="font-semibold text-red-700" id="closeCost">- $0.00</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-blue-800">Opening Commission:</span>
                                    <span class="font-semibold text-red-700">- $${(cc.commission || 0).toFixed(2)}</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-blue-800">Closing Commission:</span>
                                    <span class="font-semibold text-red-700" id="closeCommDisplay">- $0.00</span>
                                </div>
                                <div class="flex items-center justify-between pt-2 mt-2 border-t border-blue-300">
                                    <span class="text-blue-900 font-bold">Net Profit/Loss:</span>
                                    <span class="font-bold text-lg" id="ccProfitLoss">$0.00</span>
                                </div>
                            </div>
                            <p class="text-xs text-blue-700 mt-2 bg-blue-200 p-2 rounded">
                                <i class="fas fa-lightbulb mr-1"></i>Net P/L updates your stock's cost basis
                            </p>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <button type="submit" class="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg hover:shadow-xl transform hover:scale-105">
                                <i class="fas fa-check-circle mr-2"></i>Close Position
                            </button>
                            <button type="button" onclick="this.closest('.fixed').remove()" class="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg hover:shadow-xl transform hover:scale-105">
                                <i class="fas fa-times mr-2"></i>Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `
        
        document.body.appendChild(modal)
        
        // Real-time P/L calculation
        const closePriceInput = modal.querySelector('input[name="close_price"]')
        const closeCommissionInput = modal.querySelector('input[name="commission"]')
        const closeCostDisplay = document.getElementById('closeCost')
        const closeCommDisplayCC = document.getElementById('closeCommDisplay')
        const profitLossDisplayCC = document.getElementById('ccProfitLoss')
        
        function calculateCCProfitLoss() {
            const closePrice = parseFloat(closePriceInput.value) || 0
            const closeCommission = parseFloat(closeCommissionInput.value) || 0
            
            const premiumReceived = cc.premium * cc.quantity * 100
            const closeCost = closePrice * cc.quantity * 100
            const openCommission = cc.commission || 0
            
            const profitLoss = premiumReceived - closeCost - openCommission - closeCommission
            
            // Update displays
            closeCostDisplay.textContent = `- $${closeCost.toFixed(2)}`
            closeCommDisplayCC.textContent = `- $${closeCommission.toFixed(2)}`
            
            const sign = profitLoss >= 0 ? '+' : ''
            profitLossDisplayCC.textContent = `${sign}$${profitLoss.toFixed(2)}`
            profitLossDisplayCC.className = `font-bold text-lg ${profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`
        }
        
        closePriceInput.addEventListener('input', calculateCCProfitLoss)
        closeCommissionInput.addEventListener('input', calculateCCProfitLoss)
        
        // Calculate initially
        calculateCCProfitLoss()
        
        document.getElementById('closeCoveredCallForm').addEventListener('submit', async (e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            
            const closePrice = parseFloat(formData.get('close_price'))
            const closeCommission = parseFloat(formData.get('commission'))
            
            // Calculate P/L: Premium Received - (Close Price × Contracts × 100) - Opening Commission - Closing Commission
            // Note: Premium is per share, 1 contract = 100 shares
            const premiumReceived = cc.premium * cc.quantity * 100
            const closeCost = closePrice * cc.quantity * 100
            const openCommission = cc.commission || 0
            const totalCommission = openCommission + closeCommission
            const profitLoss = premiumReceived - closeCost - totalCommission
            
            try {
                const response = await api.put(`/api/covered-calls/${ccId}/close`, {
                    close_date: formData.get('close_date'),
                    close_price: closePrice,
                    commission: closeCommission,
                    profit_loss: profitLoss
                })
                
                modal.remove()
                
                // Show P/L message
                const plMessage = profitLoss >= 0 
                    ? `✅ Covered call closed successfully!\n\n💰 Profit: $${profitLoss.toFixed(2)}\n\nPremium Received: $${premiumReceived.toFixed(2)}\nClose Cost: $${closeCost.toFixed(2)}\nOpening Commission: $${openCommission.toFixed(2)}\nClosing Commission: $${closeCommission.toFixed(2)}\nTotal Commissions: $${totalCommission.toFixed(2)}\n\nThis ${profitLoss >= 0 ? 'profit' : 'loss'} has been applied to the stock's cost basis.`
                    : `✅ Covered call closed successfully!\n\n📉 Loss: $${Math.abs(profitLoss).toFixed(2)}\n\nPremium Received: $${premiumReceived.toFixed(2)}\nClose Cost: $${closeCost.toFixed(2)}\nOpening Commission: $${openCommission.toFixed(2)}\nClosing Commission: $${closeCommission.toFixed(2)}\nTotal Commissions: $${totalCommission.toFixed(2)}\n\nThis loss has been applied to the stock's cost basis.`
                
                alert(plMessage)
                
                // Reload stock details to reflect changes
                if (stockId) {
                    showStockDetails(stockId)
                }
                loadStocks()
                loadDashboard()
            } catch (error) {
                console.error('Error closing covered call:', error)
                alert(error.response?.data?.error || 'Failed to close covered call')
            }
        })
    } catch (error) {
        console.error('Error:', error)
        alert('Failed to load covered call details')
    }
}

// ============================================================================
// OPTION TRADE FUNCTIONS
// ============================================================================

// Strategy filter state
let currentStrategyFilter = 'SELLING_PUT'
let includeClosedOptions = false

// Strategy type mappings
const STRATEGY_TYPES = [
    { value: 'SELLING_PUT', label: 'Short Put (Stockpiling)' },
    { value: 'SELLING_PUT_LONG_TERM', label: 'Short Put (Long Term)' },
    { value: 'BUYING_PUT', label: 'Long Put' },
    { value: 'LONG_CALL', label: 'Long Call' },
    { value: 'COVERED_CALL', label: 'Covered Call' },
    { value: 'CREDIT_SPREAD', label: 'Credit Spread' },
    { value: 'DEBIT_SPREAD', label: 'Debit Spread' },
    { value: 'IRON_CONDOR', label: 'Iron Condor' },
    { value: 'ZERO_DTE_SPX_IC', label: '0DTE SPX IC' }
]

// Helper function to get strategy configuration
function getStrategyConfig(strategyType) {
    const configs = {
        'SELLING_PUT': { legs: 1, isPremiumCredit: true },
        'SELLING_PUT_LONG_TERM': { legs: 1, isPremiumCredit: true },
        'BUYING_PUT': { legs: 1, isPremiumCredit: false },
        'LONG_CALL': { legs: 1, isPremiumCredit: false },
        'COVERED_CALL': { legs: 1, isPremiumCredit: true },
        'CREDIT_SPREAD': { legs: 2, isPremiumCredit: true },
        'DEBIT_SPREAD': { legs: 2, isPremiumCredit: false },
        'IRON_CONDOR': { legs: 4, isPremiumCredit: true },
        'ZERO_DTE_SPX_IC': { legs: 4, isPremiumCredit: true }
    }
    
    return configs[strategyType] || { legs: 1, isPremiumCredit: true }
}

function toggleClosedOptions() {
    includeClosedOptions = document.getElementById('include-closed-options').checked
    loadOptions()
}

async function loadOptions() {
    try {
        // Fetch based on toggle state
        const endpoint = includeClosedOptions ? '/api/options' : '/api/options?open=true'
        const response = await api.get(endpoint)
        const allOptions = response.data
        
        // Count options by strategy
        const strategyCounts = {}
        STRATEGY_TYPES.forEach(st => {
            strategyCounts[st.value] = allOptions.filter(o => o.strategy_type === st.value).length
        })
        
        // Render tabs
        const tabsContainer = document.getElementById('strategy-tabs')
        tabsContainer.innerHTML = STRATEGY_TYPES.map(st => {
            const count = strategyCounts[st.value]
            const isActive = currentStrategyFilter === st.value
            const countDisplay = count > 0 ? ` (${count})` : ''
            
            // Active tab: bold border, teal background, white text
            // Inactive tab: gray border, white background, gray text
            const activeClasses = isActive 
                ? 'bg-gradient-to-r from-teal-600 to-teal-700 text-white border-teal-700 border-2 shadow-lg transform scale-105' 
                : 'bg-white text-gray-700 border-gray-300 border hover:border-teal-500 hover:bg-teal-50'
            
            return `
                <button 
                    onclick="filterByStrategy('${st.value}')"
                    class="px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${activeClasses}"
                >
                    ${st.label}${countDisplay}
                </button>
            `
        }).join('')
        
        // Filter options by selected strategy
        const filteredOptions = allOptions.filter(o => o.strategy_type === currentStrategyFilter)
        
        // Render table
        const table = document.getElementById('options-table')
        table.innerHTML = ''
        
        if (filteredOptions.length === 0) {
            const strategyName = STRATEGY_TYPES.find(st => st.value === currentStrategyFilter)?.label || 'this strategy'
            table.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-gray-500">No open option trades found for ${strategyName}</td></tr>`
            return
        }
        
        filteredOptions.forEach(option => {
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
                        ${option.strategy_type === 'COVERED_CALL' ? 
                            '<span class="text-gray-400 text-sm italic">Managed in Stock Details</span>' :
                            `<button onclick="manageOption(${option.id})" class="text-brand-teal hover:text-brand-gold mr-2 font-semibold" title="Manage Trade">
                                <i class="fas fa-cog mr-1"></i>Manage
                            </button>
                            <button onclick="deleteOption(${option.id})" class="text-red-600 hover:text-red-800 font-semibold" title="Delete Trade">
                                <i class="fas fa-trash mr-1"></i>Delete
                            </button>`
                        }
                    </td>
                </tr>
            `
        })
    } catch (error) {
        console.error('Error loading options:', error)
    }
}

function filterByStrategy(strategy) {
    currentStrategyFilter = strategy
    loadOptions()
}

async function showOptionForm(optionId = null) {
    try {
        const isEdit = optionId !== null
        const title = isEdit ? 'Edit Option Trade' : 'Add Option Trade'
        
        // Load companies and accounts
        const companiesResponse = await api.get('/api/companies')
        const companies = companiesResponse.data.companies || companiesResponse.data
        
        const accountsResponse = await api.get('/api/accounts')
        const accounts = accountsResponse.data.accounts || accountsResponse.data
        
        if (companies.length === 0) {
            alert('Please add companies first before creating option trades.')
            showSection('companies')
            return
        }
        
        if (accounts.length === 0) {
            alert('Please create an account first before adding option trades.')
            showSection('accounts')
            return
        }
        
        // Load existing data if editing
        let option = null
        if (isEdit) {
            const response = await api.get(`/api/options`)
            option = response.data.find(o => o.id === optionId)
        }
        
        const isClosed = option && option.is_open === 0
        const isCoveredCall = option && option.strategy_type === 'COVERED_CALL'
    
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <!-- Header -->
            <div class="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 sticky top-0 z-10">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-2xl font-bold flex items-center">
                            <i class="fas fa-chart-line mr-2"></i>${title}
                        </h3>
                        <p class="text-purple-100 text-sm">Configure Option Strategy</p>
                    </div>
                    <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-purple-200 text-xl">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <!-- Content -->
            <div class="p-4">
                <form id="optionForm">
                    <!-- Basic Information Section -->
                    <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-300 mb-4">
                        <h4 class="text-sm font-bold text-gray-800 mb-3 flex items-center">
                            <i class="fas fa-info-circle mr-1 text-blue-600"></i>Basic Information
                        </h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-building mr-1 text-blue-600"></i>Company *
                                </label>
                                <select name="company_id" id="option_company_select" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-none transition text-sm" required>
                                    <option value="">Select company...</option>
                                    ${companies.map(c => `
                                        <option value="${c.id}" data-ticker="${c.ticker}" data-buy-price="${c.buy_price || ''}">${c.ticker} - ${c.company_name}</option>
                                    `).join('')}
                                </select>
                                <div id="option-buy-price-info" class="mt-1 text-xs hidden">
                                    <span class="text-gray-600">Target Buy Price: </span>
                                    <span class="font-semibold text-brand-gold"></span>
                                </div>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-wallet mr-1 text-green-600"></i>Account *
                                </label>
                                <select name="account_id" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-none transition text-sm" required>
                                    <option value="">Select account...</option>
                                    ${accounts.map(acc => `
                                        <option value="${acc.id}">${acc.account_name}</option>
                                    `).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-chess mr-1 text-purple-600"></i>Strategy Type *
                                </label>
                                ${isCoveredCall ? `
                                    <input type="text" value="Covered Call" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm" disabled>
                                    <input type="hidden" name="strategy_type" value="COVERED_CALL">
                                ` : `
                                    <select name="strategy_type" id="strategy_type_select" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-none transition text-sm" required>
                                        <option value="">Select Strategy...</option>
                                        <option value="SELLING_PUT">Selling Put (Stockpiling)</option>
                                        <option value="SELLING_PUT_LONG_TERM">Selling Put (Long Term)</option>
                                        <option value="BUYING_PUT">Long Put</option>
                                        <option value="LONG_CALL">Long Call</option>
                                        <option value="CREDIT_SPREAD">Credit Spread</option>
                                        <option value="DEBIT_SPREAD">Debit Spread</option>
                                        <option value="IRON_CONDOR">Iron Condor</option>
                                        <option value="ZERO_DTE_SPX_IC">0DTE SPX IC</option>
                                    </select>
                                `}
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-calendar mr-1 text-blue-600"></i>Open Date *
                                </label>
                                <input type="date" name="trade_date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-none transition text-sm" required>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-calendar-check mr-1 text-orange-600"></i>Expiration Date *
                                </label>
                                <input type="date" name="expiration_date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-none transition text-sm" required>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-hashtag mr-1 text-indigo-600"></i>Quantity (Contracts) *
                                </label>
                                <input type="number" name="quantity" id="quantity_input" min="1" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-none transition text-sm" required>
                            </div>
                        </div>
                    </div>

                    <!-- Dynamic Strategy Fields Container -->
                    <div id="strategy_fields_container"></div>

                    <!-- Trade Analysis Section -->
                    <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-lg border border-blue-300 mb-4">
                        <h4 class="text-xs font-bold text-blue-900 mb-2 flex items-center">
                            <i class="fas fa-calculator mr-1"></i><span id="risk_label">Trade Analysis</span>
                        </h4>
                        <div id="risk_calculation_display" class="space-y-1 text-xs">
                            <p class="text-gray-500 text-center py-2">Select a strategy to see calculations</p>
                        </div>
                    </div>

                    <!-- Close Fields (if editing closed trade) -->
                    ${isClosed ? `
                    <div class="bg-gradient-to-br from-red-50 to-red-100 p-3 rounded-lg border border-red-300 mb-4">
                        <h4 class="text-sm font-bold text-red-800 mb-3 flex items-center">
                            <i class="fas fa-times-circle mr-1"></i>Closing Details
                        </h4>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">Close Date *</label>
                                <input type="date" name="close_date" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">Close Price *</label>
                                <input type="number" step="0.01" name="close_price" min="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">Close Commission</label>
                                <input type="number" step="0.01" name="close_commission" value="0" min="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Notes Section -->
                    <div class="mb-4">
                        <label class="block text-gray-700 font-semibold mb-1 text-sm">
                            <i class="fas fa-sticky-note mr-1 text-yellow-600"></i>Notes
                        </label>
                        <textarea name="notes" rows="2" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-none transition text-sm"></textarea>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex gap-2">
                        <button type="submit" class="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold py-3 px-6 rounded-lg transition shadow-lg hover:shadow-xl">
                            <i class="fas fa-save mr-2"></i>Save Option Trade
                        </button>
                        <button type="button" onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-bold py-3 px-6 rounded-lg transition">
                            <i class="fas fa-times mr-2"></i>Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `
    
    document.body.appendChild(modal)
    
    // Strategy field configurations
    const strategyConfigs = {
        'SELLING_PUT': {
            legs: 1,
            fields: ['strike_price', 'premium', 'commission'],
            labels: { strike_price: 'Strike Price', premium: 'Premium/Share', commission: 'Open Commission' },
            riskCalc: (data) => {
                const strike = parseFloat(data.strike_price) || 0
                const premium = parseFloat(data.premium) || 0
                const quantity = parseInt(data.quantity) || 0
                const commission = parseFloat(data.commission) || 0
                const totalRisk = (strike * quantity * 100) - (premium * quantity * 100) + commission
                const maxProfit = (premium * quantity * 100) - commission
                return { totalRisk, maxProfit, isPremiumCredit: true }
            }
        },
        'SELLING_PUT_LONG_TERM': {
            legs: 1,
            fields: ['strike_price', 'premium', 'commission'],
            labels: { strike_price: 'Strike Price', premium: 'Premium/Share', commission: 'Open Commission' },
            riskCalc: (data) => {
                const strike = parseFloat(data.strike_price) || 0
                const premium = parseFloat(data.premium) || 0
                const quantity = parseInt(data.quantity) || 0
                const commission = parseFloat(data.commission) || 0
                const totalRisk = (strike * quantity * 100) - (premium * quantity * 100) + commission
                const maxProfit = (premium * quantity * 100) - commission
                return { totalRisk, maxProfit, isPremiumCredit: true }
            }
        },
        'BUYING_PUT': {
            legs: 1,
            fields: ['strike_price', 'premium', 'commission'],
            labels: { strike_price: 'Strike Price', premium: 'Premium/Share (Paid)', commission: 'Open Commission' },
            riskCalc: (data) => {
                const premium = parseFloat(data.premium) || 0
                const quantity = parseInt(data.quantity) || 0
                const commission = parseFloat(data.commission) || 0
                const totalRisk = (premium * quantity * 100) + commission
                return { totalRisk, maxProfit: null, isPremiumCredit: false }
            }
        },
        'LONG_CALL': {
            legs: 1,
            fields: ['strike_price', 'premium', 'commission'],
            labels: { strike_price: 'Strike Price', premium: 'Premium/Share (Paid)', commission: 'Open Commission' },
            riskCalc: (data) => {
                const premium = parseFloat(data.premium) || 0
                const quantity = parseInt(data.quantity) || 0
                const commission = parseFloat(data.commission) || 0
                const totalRisk = (premium * quantity * 100) + commission
                return { totalRisk, maxProfit: null, isPremiumCredit: false }
            }
        },
        'CREDIT_SPREAD': {
            legs: 2,
            fields: ['short_strike', 'short_premium', 'long_strike', 'long_premium', 'commission'],
            labels: {
                short_strike: 'Short Strike', 
                short_premium: 'Short Premium/Share', 
                long_strike: 'Long Strike',
                long_premium: 'Long Premium/Share (Paid)',
                commission: 'Open Commission'
            },
            riskCalc: (data) => {
                const shortStrike = parseFloat(data.short_strike) || 0
                const longStrike = parseFloat(data.long_strike) || 0
                const shortPremium = parseFloat(data.short_premium) || 0
                const longPremium = parseFloat(data.long_premium) || 0
                const quantity = parseInt(data.quantity) || 0
                const commission = parseFloat(data.commission) || 0
                const netCredit = (shortPremium - longPremium) * quantity * 100
                const strikeWidth = Math.abs(shortStrike - longStrike) * quantity * 100
                const totalRisk = strikeWidth - netCredit + commission
                const maxProfit = netCredit - commission
                return { totalRisk, maxProfit, isPremiumCredit: true, netCredit }
            }
        },
        'DEBIT_SPREAD': {
            legs: 2,
            fields: ['long_strike', 'long_premium', 'short_strike', 'short_premium', 'commission'],
            labels: {
                long_strike: 'Long Strike', 
                long_premium: 'Long Premium/Share (Paid)', 
                short_strike: 'Short Strike',
                short_premium: 'Short Premium/Share',
                commission: 'Open Commission'
            },
            riskCalc: (data) => {
                const longStrike = parseFloat(data.long_strike) || 0
                const shortStrike = parseFloat(data.short_strike) || 0
                const longPremium = parseFloat(data.long_premium) || 0
                const shortPremium = parseFloat(data.short_premium) || 0
                const quantity = parseInt(data.quantity) || 0
                const commission = parseFloat(data.commission) || 0
                const netDebit = (longPremium - shortPremium) * quantity * 100
                const totalRisk = netDebit + commission
                const strikeWidth = Math.abs(longStrike - shortStrike) * quantity * 100
                const maxProfit = strikeWidth - netDebit - commission
                return { totalRisk, maxProfit, isPremiumCredit: false, netDebit }
            }
        },
        'IRON_CONDOR': {
            legs: 4,
            fields: ['short_call_strike', 'short_call_premium', 'long_call_strike', 'long_call_premium', 
                     'short_put_strike', 'short_put_premium', 'long_put_strike', 'long_put_premium', 'commission'],
            labels: {
                short_call_strike: 'Short Call Strike',
                short_call_premium: 'Short Call Premium/Share',
                long_call_strike: 'Long Call Strike',
                long_call_premium: 'Long Call Premium/Share (Paid)',
                short_put_strike: 'Short Put Strike',
                short_put_premium: 'Short Put Premium/Share',
                long_put_strike: 'Long Put Strike',
                long_put_premium: 'Long Put Premium/Share (Paid)',
                commission: 'Open Commission'
            },
            riskCalc: (data) => {
                const quantity = parseInt(data.quantity) || 0
                const commission = parseFloat(data.commission) || 0
                
                const shortCallStrike = parseFloat(data.short_call_strike) || 0
                const longCallStrike = parseFloat(data.long_call_strike) || 0
                const shortCallPremium = parseFloat(data.short_call_premium) || 0
                const longCallPremium = parseFloat(data.long_call_premium) || 0
                const callCredit = (shortCallPremium - longCallPremium) * quantity * 100
                const callWidth = Math.abs(longCallStrike - shortCallStrike) * quantity * 100
                
                const shortPutStrike = parseFloat(data.short_put_strike) || 0
                const longPutStrike = parseFloat(data.long_put_strike) || 0
                const shortPutPremium = parseFloat(data.short_put_premium) || 0
                const longPutPremium = parseFloat(data.long_put_premium) || 0
                const putCredit = (shortPutPremium - longPutPremium) * quantity * 100
                const putWidth = Math.abs(shortPutStrike - longPutStrike) * quantity * 100
                
                const totalCredit = callCredit + putCredit
                const maxRisk = Math.max(callWidth, putWidth)
                const totalRisk = maxRisk - totalCredit + commission
                const maxProfit = totalCredit - commission
                
                return { totalRisk, maxProfit, isPremiumCredit: true, netCredit: totalCredit }
            }
        },
        'ZERO_DTE_SPX_IC': {
            legs: 4,
            fields: ['short_call_strike', 'short_call_premium', 'long_call_strike', 'long_call_premium', 
                     'short_put_strike', 'short_put_premium', 'long_put_strike', 'long_put_premium', 'commission'],
            labels: {
                short_call_strike: 'Short Call Strike',
                short_call_premium: 'Short Call Premium/Share',
                long_call_strike: 'Long Call Strike',
                long_call_premium: 'Long Call Premium/Share (Paid)',
                short_put_strike: 'Short Put Strike',
                short_put_premium: 'Short Put Premium/Share',
                long_put_strike: 'Long Put Strike',
                long_put_premium: 'Long Put Premium/Share (Paid)',
                commission: 'Open Commission'
            },
            riskCalc: (data) => {
                const quantity = parseInt(data.quantity) || 0
                const commission = parseFloat(data.commission) || 0
                
                const shortCallStrike = parseFloat(data.short_call_strike) || 0
                const longCallStrike = parseFloat(data.long_call_strike) || 0
                const shortCallPremium = parseFloat(data.short_call_premium) || 0
                const longCallPremium = parseFloat(data.long_call_premium) || 0
                const callCredit = (shortCallPremium - longCallPremium) * quantity * 100
                const callWidth = Math.abs(longCallStrike - shortCallStrike) * quantity * 100
                
                const shortPutStrike = parseFloat(data.short_put_strike) || 0
                const longPutStrike = parseFloat(data.long_put_strike) || 0
                const shortPutPremium = parseFloat(data.short_put_premium) || 0
                const longPutPremium = parseFloat(data.long_put_premium) || 0
                const putCredit = (shortPutPremium - longPutPremium) * quantity * 100
                const putWidth = Math.abs(shortPutStrike - longPutStrike) * quantity * 100
                
                const totalCredit = callCredit + putCredit
                const maxRisk = Math.max(callWidth, putWidth)
                const totalRisk = maxRisk - totalCredit + commission
                const maxProfit = totalCredit - commission
                
                return { totalRisk, maxProfit, isPremiumCredit: true, netCredit: totalCredit }
            }
        },
        'COVERED_CALL': {
            legs: 1,
            fields: ['strike_price', 'premium', 'commission'],
            labels: { strike_price: 'Strike Price', premium: 'Premium/Share', commission: 'Open Commission' },
            riskCalc: (data) => {
                const premium = parseFloat(data.premium) || 0
                const quantity = parseInt(data.quantity) || 0
                const commission = parseFloat(data.commission) || 0
                const maxProfit = (premium * quantity * 100) - commission
                return { totalRisk: null, maxProfit, isPremiumCredit: true }
            }
        }
    }
    
    // Function to render strategy-specific fields
    function renderStrategyFields(strategy) {
        const container = document.getElementById('strategy_fields_container')
        if (!strategy || !strategyConfigs[strategy]) {
            container.innerHTML = ''
            return
        }
        
        const config = strategyConfigs[strategy]
        
        // Organize fields by leg
        let legStructure = []
        
        if (config.legs === 1) {
            // Single leg: strike, premium, commission all in one row
            legStructure.push({
                name: '',
                fields: config.fields
            })
        } else if (config.legs === 2) {
            // Two legs: short leg, then long leg, commission on long leg row
            const fields = config.fields
            legStructure.push({
                name: 'Short Leg',
                fields: fields.filter(f => f.includes('short'))
            })
            legStructure.push({
                name: 'Long Leg',
                fields: fields.filter(f => f.includes('long') || f === 'commission')
            })
        } else if (config.legs === 4) {
            // Four legs: call spread (short, long), put spread (short, long), commission on last row
            const fields = config.fields
            legStructure.push({
                name: 'Short Call',
                fields: fields.filter(f => f.includes('short_call'))
            })
            legStructure.push({
                name: 'Long Call',
                fields: fields.filter(f => f.includes('long_call'))
            })
            legStructure.push({
                name: 'Short Put',
                fields: fields.filter(f => f.includes('short_put'))
            })
            legStructure.push({
                name: 'Long Put',
                fields: fields.filter(f => f.includes('long_put') || f === 'commission')
            })
        }
        
        let html = `
            <div class="bg-gradient-to-br from-purple-50 to-purple-100 p-3 rounded-lg border border-purple-300 mb-4">
                <h4 class="text-sm font-bold text-purple-800 mb-3 flex items-center">
                    <i class="fas fa-sliders-h mr-1"></i>Strategy Details (${config.legs} Leg${config.legs > 1 ? 's' : ''})
                </h4>
                <div class="space-y-2">
        `
        
        legStructure.forEach((leg, legIndex) => {
            if (leg.name) {
                html += `
                    <div class="text-xs font-semibold text-purple-700 mb-1">${leg.name}</div>
                `
            }
            
            html += `<div class="flex flex-wrap gap-2 items-end">`
            
            leg.fields.forEach(field => {
                const isCommission = field === 'commission'
                const label = config.labels[field]
                
                html += `
                    <div class="flex-shrink-0">
                        <label class="block text-gray-700 font-semibold mb-1 text-xs">
                            <i class="fas fa-${isCommission ? 'receipt' : 'dollar-sign'} mr-1 text-${isCommission ? 'purple' : 'green'}-600"></i>${label} ${!isCommission ? '*' : ''}
                        </label>
                        <input type="number" 
                               step="0.01" 
                               name="${field}" 
                               id="${field}_input"
                               class="strategy-field w-24 px-2 py-1.5 border border-gray-300 rounded-lg focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-none transition text-sm" 
                               ${!isCommission ? 'required' : ''} 
                               ${isCommission ? 'value="0"' : ''} 
                               placeholder="0.00"
                               min="0">
                    </div>
                `
            })
            
            html += `</div>`
        })
        
        html += `
                </div>
            </div>
        `
        
        container.innerHTML = html
        
        // Add input listeners for real-time calculation
        document.querySelectorAll('.strategy-field, #quantity_input').forEach(input => {
            input.addEventListener('input', calculateRisk)
        })
        
        // Calculate initial risk
        calculateRisk()
    }
    
    // Function to calculate and display risk
    function calculateRisk() {
        const strategy = document.querySelector('[name="strategy_type"]')?.value
        if (!strategy || !strategyConfigs[strategy]) {
            document.getElementById('risk_calculation_display').innerHTML = '<p class="text-gray-500 text-center py-2">Select a strategy to see calculations</p>'
            return
        }
        
        const config = strategyConfigs[strategy]
        const data = { quantity: document.getElementById('quantity_input').value }
        
        config.fields.forEach(field => {
            const input = document.getElementById(`${field}_input`)
            if (input) data[field] = input.value
        })
        
        const result = config.riskCalc(data)
        
        // Calculate DTE (Days to Expiration)
        const tradeDateInput = document.querySelector('[name="trade_date"]')?.value
        const expirationDateInput = document.querySelector('[name="expiration_date"]')?.value
        let dte = 0
        let rorc = null
        let arorc = null
        
        if (tradeDateInput && expirationDateInput) {
            const tradeDate = new Date(tradeDateInput)
            const expirationDate = new Date(expirationDateInput)
            dte = Math.ceil((expirationDate - tradeDate) / (1000 * 60 * 60 * 24))
            
            // Calculate RORC and ARORC if we have both maxProfit and totalRisk
            if (result.maxProfit !== null && result.totalRisk !== null && result.totalRisk > 0) {
                rorc = (result.maxProfit / result.totalRisk) * 100
                if (dte > 0) {
                    arorc = rorc * (365 / dte)
                }
            }
        }
        
        let html = '<div class="space-y-1">'
        
        if (result.netCredit !== undefined) {
            html += `
                <div class="flex items-center justify-between">
                    <span class="text-blue-800 text-xs">Net ${result.netCredit >= 0 ? 'Credit' : 'Debit'}:</span>
                    <span class="font-semibold ${result.netCredit >= 0 ? 'text-green-700' : 'text-red-700'} text-xs">${result.netCredit >= 0 ? '+' : ''}$${result.netCredit.toFixed(2)}</span>
                </div>
            `
        } else if (result.netDebit !== undefined) {
            html += `
                <div class="flex items-center justify-between">
                    <span class="text-blue-800 text-xs">Net Debit:</span>
                    <span class="font-semibold text-red-700 text-xs">-$${result.netDebit.toFixed(2)}</span>
                </div>
            `
        }
        
        if (result.totalRisk !== null) {
            html += `
                <div class="flex items-center justify-between">
                    <span class="text-blue-800 text-xs">Total Risk:</span>
                    <span class="font-semibold text-red-700 text-xs">$${result.totalRisk.toFixed(2)}</span>
                </div>
            `
        }
        
        if (result.maxProfit !== null) {
            html += `
                <div class="flex items-center justify-between">
                    <span class="text-blue-800 text-xs">Max Profit:</span>
                    <span class="font-semibold text-green-700 text-xs">$${result.maxProfit.toFixed(2)}</span>
                </div>
            `
        }
        
        // Show DTE, RORC, and ARORC if calculated
        if (dte > 0) {
            html += `
                <div class="mt-2 pt-2 border-t border-blue-300">
                    <div class="flex items-center justify-between">
                        <span class="text-blue-800 text-xs">DTE (Days to Expiration):</span>
                        <span class="font-semibold text-gray-700 text-xs">${dte} days</span>
                    </div>
            `
            
            if (rorc !== null) {
                html += `
                    <div class="flex items-center justify-between">
                        <span class="text-blue-900 text-xs font-semibold">RORC:</span>
                        <span class="font-bold text-purple-700 text-xs">${rorc.toFixed(2)}%</span>
                    </div>
                `
            }
            
            if (arorc !== null) {
                html += `
                    <div class="flex items-center justify-between">
                        <span class="text-blue-900 text-xs font-semibold">ARORC:</span>
                        <span class="font-bold text-purple-700 text-xs">${arorc.toFixed(2)}%</span>
                    </div>
                `
            }
            
            html += `</div>`
        }
        
        html += '</div>'
        document.getElementById('risk_calculation_display').innerHTML = html
        
        // Update risk label to Trade Analysis
        document.getElementById('risk_label').textContent = 'Trade Analysis'
    }
    
    // Event listener for strategy change
    if (!isCoveredCall) {
        document.getElementById('strategy_type_select').addEventListener('change', (e) => {
            renderStrategyFields(e.target.value)
        })
    } else {
        // For covered calls, render fields immediately
        renderStrategyFields('COVERED_CALL')
    }
    
    // Add event listeners to date fields for DTE/RORC/ARORC calculations
    document.querySelector('[name="trade_date"]').addEventListener('change', calculateRisk)
    document.querySelector('[name="expiration_date"]').addEventListener('change', calculateRisk)
    
    // Auto-fill ticker and show buy price when company is selected
    document.getElementById('option_company_select').addEventListener('change', (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex]
        const ticker = selectedOption.dataset.ticker
        const buyPrice = selectedOption.dataset.buyPrice
        
        const buyPriceInfo = document.getElementById('option-buy-price-info')
        if (buyPrice && buyPrice !== '' && buyPrice !== 'null') {
            buyPriceInfo.classList.remove('hidden')
            buyPriceInfo.querySelector('.font-semibold').textContent = '$' + parseFloat(buyPrice).toFixed(2)
        } else {
            buyPriceInfo.classList.add('hidden')
        }
    })
    
    document.getElementById('optionForm').addEventListener('submit', async (e) => {
        e.preventDefault()
        const formData = new FormData(e.target)
        
        const selectedCompany = companies.find(c => c.id === parseInt(formData.get('company_id')))
        
        const data = {
            company_id: parseInt(formData.get('company_id')),
            ticker: selectedCompany.ticker,
            strategy_type: formData.get('strategy_type'),
            strike_price: parseFloat(formData.get('strike_price')),
            premium: parseFloat(formData.get('premium')),
            quantity: parseInt(formData.get('quantity')),
            expiration_date: formData.get('expiration_date'),
            account_id: parseInt(formData.get('account_id')),
            trade_date: formData.get('trade_date'),
            commission: parseFloat(formData.get('commission')) || 0,
            is_open: true,
            notes: formData.get('notes') || null
        }
        
        // Include close fields if they exist (for closed trades)
        if (formData.get('close_date')) {
            data.close_date = formData.get('close_date')
            data.close_price = parseFloat(formData.get('close_price')) || null
            data.close_commission = parseFloat(formData.get('close_commission')) || 0
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
            loadClosedTrades()
            alert(isEdit ? 'Option trade updated successfully!' : 'Option trade added successfully!')
        } catch (error) {
            alert(error.response?.data?.error || 'Operation failed')
        }
    })
    
    // Load existing data for edit
    if (isEdit && option) {
        const form = document.getElementById('optionForm')
        form.company_id.value = option.company_id
        
        // Trigger company change to show buy price
        const companySelect = document.getElementById('option_company_select')
        companySelect.dispatchEvent(new Event('change'))
        
        // Set strategy type and trigger field rendering BEFORE setting field values
        if (!isCoveredCall) {
            form.strategy_type.value = option.strategy_type
            const strategySelect = document.getElementById('strategy_type_select')
            strategySelect.dispatchEvent(new Event('change'))
        } else {
            // For covered calls, trigger the rendering manually
            renderStrategyFields('COVERED_CALL')
        }
        
        // Wait a moment for fields to be rendered
        setTimeout(() => {
            // Now set the strategy field values
            if (document.getElementById('strike_price_input')) {
                document.getElementById('strike_price_input').value = option.strike_price || ''
            }
            if (document.getElementById('premium_input')) {
                document.getElementById('premium_input').value = option.premium || ''
            }
            if (document.getElementById('commission_input')) {
                document.getElementById('commission_input').value = option.commission || 0
            }
            
            // For two-leg strategies
            if (document.getElementById('short_strike_input')) {
                document.getElementById('short_strike_input').value = option.short_strike || ''
            }
            if (document.getElementById('long_strike_input')) {
                document.getElementById('long_strike_input').value = option.long_strike || ''
            }
            if (document.getElementById('short_premium_input')) {
                document.getElementById('short_premium_input').value = option.short_premium || ''
            }
            if (document.getElementById('long_premium_input')) {
                document.getElementById('long_premium_input').value = option.long_premium || ''
            }
            
            // For iron condor
            if (document.getElementById('short_call_strike_input')) {
                document.getElementById('short_call_strike_input').value = option.short_call_strike || ''
            }
            if (document.getElementById('long_call_strike_input')) {
                document.getElementById('long_call_strike_input').value = option.long_call_strike || ''
            }
            if (document.getElementById('short_call_premium_input')) {
                document.getElementById('short_call_premium_input').value = option.short_call_premium || ''
            }
            if (document.getElementById('long_call_premium_input')) {
                document.getElementById('long_call_premium_input').value = option.long_call_premium || ''
            }
            if (document.getElementById('short_put_strike_input')) {
                document.getElementById('short_put_strike_input').value = option.short_put_strike || ''
            }
            if (document.getElementById('long_put_strike_input')) {
                document.getElementById('long_put_strike_input').value = option.long_put_strike || ''
            }
            if (document.getElementById('short_put_premium_input')) {
                document.getElementById('short_put_premium_input').value = option.short_put_premium || ''
            }
            if (document.getElementById('long_put_premium_input')) {
                document.getElementById('long_put_premium_input').value = option.long_put_premium || ''
            }
            
            // Set other basic fields
            form.quantity.value = option.quantity
            form.expiration_date.value = option.expiration_date
            
            // Find account_id from account_type or use existing account_id
            if (option.account_id) {
                form.account_id.value = option.account_id
            } else {
                const matchingAccount = accounts.find(acc => acc.account_type === option.account_type)
                if (matchingAccount) {
                    form.account_id.value = matchingAccount.id
                }
            }
            
            form.trade_date.value = option.trade_date
            form.notes.value = option.notes || ''
            
            // Populate close fields if trade is closed
            if (isClosed && option.close_date) {
                form.close_date.value = option.close_date
                form.close_price.value = option.close_price || ''
                form.close_commission.value = option.close_commission || 0
            }
            
            // Trigger the input event to update analysis
            form.dispatchEvent(new Event('input', { bubbles: true }))
        }, 100)
    } else {
        const today = new Date().toISOString().split('T')[0]
        document.querySelector('[name="trade_date"]').value = today
    }
    } catch (error) {
        console.error('Error loading option form:', error)
        alert('Failed to load option form')
    }
}

async function editOption(id) {
    showOptionForm(id)
}

async function manageOption(id) {
    showOptionDetails(id)
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

async function showOptionDetails(id) {
    try {
        // Fetch all options and find the one we need
        const response = await api.get('/api/options')
        const option = response.data.find(o => o.id === id)
        
        if (!option) {
            alert('Option trade not found')
            return
        }
        
        // Fetch accounts to get account name
        const accountsResponse = await api.get('/api/accounts')
        const accounts = accountsResponse.data.accounts || accountsResponse.data
        
        // Find account name - try account_id first, then fall back to account_type
        let accountDisplay = option.account_type || 'N/A'
        if (option.account_id) {
            const account = accounts.find(a => a.id === option.account_id)
            if (account) {
                accountDisplay = `${account.account_name} (${account.account_type})`
            }
        }
        
        const strategyConfig = getStrategyConfig(option.strategy_type)
        const strategyLabel = STRATEGY_TYPES.find(st => st.value === option.strategy_type)?.label || option.strategy_type.replace(/_/g, ' ')
        
        // Calculate DTE
        const expirationDate = new Date(option.expiration_date)
        const tradeDate = new Date(option.trade_date)
        const today = new Date()
        const dte = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24))
        const originalDTE = Math.ceil((expirationDate - tradeDate) / (1000 * 60 * 60 * 24))
        
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.id = 'option-details-modal'
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-0 max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <!-- Header -->
                <div class="flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-purple-700">
                    <h3 class="text-2xl font-bold text-white">
                        <i class="fas fa-layer-group mr-2"></i>${option.ticker} - ${strategyLabel}
                    </h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-purple-200">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                
                <!-- Content: Sidebar + Main -->
                <div class="flex flex-1 overflow-hidden">
                    <!-- Left Sidebar - Actions -->
                    <div class="w-64 bg-gray-50 p-4 border-r border-gray-200 overflow-y-auto">
                        <h4 class="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Actions</h4>
                        <div class="space-y-2">
                            <button onclick="editOption(${id})" class="w-full text-left px-4 py-3 bg-white hover:bg-purple-600 hover:text-white rounded-lg border border-gray-200 transition-colors group">
                                <i class="fas fa-edit mr-2 text-blue-600 group-hover:text-white"></i>
                                <span class="font-medium">Edit Trade</span>
                            </button>
                            
                            ${option.is_open ? `
                            <button onclick="closeOption(${id}); document.getElementById('option-details-modal').remove();" class="w-full text-left px-4 py-3 bg-white hover:bg-green-600 hover:text-white rounded-lg border border-gray-200 transition-colors group">
                                <i class="fas fa-check-circle mr-2 text-green-600 group-hover:text-white"></i>
                                <span class="font-medium">Close Position</span>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                    
                    <!-- Main Content Area -->
                    <div class="flex-1 p-6 overflow-y-auto">
                        <!-- Position Summary -->
                        <div class="mb-6 text-white rounded-lg p-5 shadow-md" style="background: linear-gradient(to right, #7c3aed, #9333ea);">
                            <div class="flex items-center justify-between mb-4">
                                <div>
                                    <h4 class="text-2xl font-bold mb-1">${option.ticker}</h4>
                                    <p class="text-sm opacity-90">${strategyLabel}</p>
                                    <p class="text-sm opacity-90 mt-1">${accountDisplay} • Opened ${option.trade_date}</p>
                                </div>
                                <div class="text-right">
                                    <span class="px-4 py-2 rounded-full ${option.is_open ? 'bg-green-500' : 'bg-gray-500'} text-white font-semibold text-sm">
                                        ${option.is_open ? 'OPEN' : 'CLOSED'}
                                    </span>
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-white/20">
                                <div>
                                    <p class="text-xs opacity-75">Trade Date</p>
                                    <p class="text-lg font-semibold">${option.trade_date}</p>
                                </div>
                                <div>
                                    <p class="text-xs opacity-75">Contracts</p>
                                    <p class="text-xl font-bold">${option.quantity}</p>
                                </div>
                                <div>
                                    <p class="text-xs opacity-75">Expiration</p>
                                    <p class="text-lg font-semibold">${option.expiration_date}</p>
                                    <p class="text-xs opacity-90 mt-0.5">${dte > 0 ? dte + ' DTE' : dte === 0 ? 'Expires today' : 'Expired ' + Math.abs(dte) + ' days ago'}</p>
                                </div>
                                <div>
                                    <p class="text-xs opacity-75">Original DTE</p>
                                    <p class="text-lg font-semibold">${originalDTE} days</p>
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/20">
                                <div>
                                    <p class="text-xs opacity-75">Account</p>
                                    <p class="text-lg font-semibold">${accountDisplay}</p>
                                </div>
                                <div>
                                    <p class="text-xs opacity-75">Open Commission</p>
                                    <p class="text-lg font-semibold">$${parseFloat(option.commission || 0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <p class="text-xs opacity-75">Profit/Loss</p>
                                    <p class="text-xl font-bold ${option.profit_loss >= 0 ? 'text-green-300' : 'text-red-300'}">
                                        ${option.profit_loss !== null && option.profit_loss !== undefined ? 
                                            (option.profit_loss >= 0 ? '+' : '') + '$' + parseFloat(option.profit_loss).toFixed(2) : 
                                            'Not closed'}
                                    </p>
                                </div>
                            </div>
                            
                            ${option.close_date ? `
                                <div class="mt-4 pt-4 border-t border-white/20">
                                    <div class="grid grid-cols-2 gap-4">
                                        <div>
                                            <p class="text-xs opacity-75">Close Date</p>
                                            <p class="text-sm font-semibold">${option.close_date}</p>
                                        </div>
                                        ${option.close_commission !== null && option.close_commission !== undefined ? `
                                        <div>
                                            <p class="text-xs opacity-75">Close Commission</p>
                                            <p class="text-sm font-semibold">$${parseFloat(option.close_commission).toFixed(2)}</p>
                                        </div>
                                        ` : ''}
                                    </div>
                                </div>
                            ` : ''}
                            
                            ${option.notes ? `
                                <div class="mt-4 pt-4 border-t border-white/20">
                                    <p class="text-xs opacity-75"><i class="fas fa-sticky-note mr-1"></i>Notes</p>
                                    <p class="text-sm mt-1">${option.notes}</p>
                                </div>
                            ` : ''}
                        </div>
                        
                        <!-- Leg Details -->
                        <div class="mb-6">
                            <h4 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <i class="fas fa-list mr-2 text-purple-600"></i>
                                Position Details
                            </h4>
                            ${renderLegDetails(option, strategyConfig)}
                        </div>
                    </div>
                </div>
            </div>
        `
        
        document.body.appendChild(modal)
        
    } catch (error) {
        console.error('Error loading option details:', error)
        alert('Failed to load option details')
    }
}

function renderLegDetails(option, strategyConfig) {
    if (strategyConfig.legs === 1) {
        // Single leg
        return `
            <div class="bg-white border border-gray-200 rounded-lg p-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <span class="text-sm text-gray-600">Strike Price</span>
                        <div class="text-xl font-bold text-gray-900">$${parseFloat(option.strike_price).toFixed(2)}</div>
                    </div>
                    <div>
                        <span class="text-sm text-gray-600">Premium per Share</span>
                        <div class="text-xl font-bold ${strategyConfig.isPremiumCredit ? 'text-green-600' : 'text-red-600'}">
                            ${strategyConfig.isPremiumCredit ? '+' : '-'}$${parseFloat(option.premium).toFixed(2)}
                        </div>
                    </div>
                    <div>
                        <span class="text-sm text-gray-600">Total Premium</span>
                        <div class="text-lg font-semibold ${strategyConfig.isPremiumCredit ? 'text-green-600' : 'text-red-600'}">
                            ${strategyConfig.isPremiumCredit ? '+' : '-'}$${(parseFloat(option.premium) * option.quantity * 100).toFixed(2)}
                        </div>
                    </div>
                    ${option.close_price !== null && option.close_price !== undefined ? `
                    <div>
                        <span class="text-sm text-gray-600">Close Price</span>
                        <div class="text-lg font-semibold text-gray-900">$${parseFloat(option.close_price).toFixed(2)}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `
    } else if (strategyConfig.legs === 2) {
        // Two legs
        return `
            <div class="space-y-3">
                <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h5 class="font-semibold text-red-900 mb-3 flex items-center">
                        <i class="fas fa-arrow-down mr-2"></i>
                        Short Leg
                    </h5>
                    <div class="grid grid-cols-3 gap-3 text-sm">
                        <div>
                            <span class="text-gray-600">Strike</span>
                            <div class="font-bold text-gray-900 text-lg">$${parseFloat(option.short_strike).toFixed(2)}</div>
                        </div>
                        <div>
                            <span class="text-gray-600">Premium</span>
                            <div class="font-bold text-green-600 text-lg">+$${parseFloat(option.short_premium).toFixed(2)}</div>
                        </div>
                        <div>
                            <span class="text-gray-600">Total</span>
                            <div class="font-semibold text-green-600">+$${(parseFloat(option.short_premium) * option.quantity * 100).toFixed(2)}</div>
                        </div>
                    </div>
                </div>
                
                <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h5 class="font-semibold text-green-900 mb-3 flex items-center">
                        <i class="fas fa-arrow-up mr-2"></i>
                        Long Leg
                    </h5>
                    <div class="grid grid-cols-3 gap-3 text-sm">
                        <div>
                            <span class="text-gray-600">Strike</span>
                            <div class="font-bold text-gray-900 text-lg">$${parseFloat(option.long_strike).toFixed(2)}</div>
                        </div>
                        <div>
                            <span class="text-gray-600">Premium</span>
                            <div class="font-bold text-red-600 text-lg">-$${parseFloat(option.long_premium).toFixed(2)}</div>
                        </div>
                        <div>
                            <span class="text-gray-600">Total</span>
                            <div class="font-semibold text-red-600">-$${(parseFloat(option.long_premium) * option.quantity * 100).toFixed(2)}</div>
                        </div>
                    </div>
                </div>
                
                <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div class="flex justify-between items-center">
                        <span class="font-semibold text-gray-700">Net Credit:</span>
                        <span class="text-xl font-bold text-purple-600">
                            +$${((parseFloat(option.short_premium) - parseFloat(option.long_premium)) * option.quantity * 100).toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>
        `
    } else if (strategyConfig.legs === 4) {
        // Iron Condor
        const netCredit = ((parseFloat(option.short_call_premium) - parseFloat(option.long_call_premium)) +
                          (parseFloat(option.short_put_premium) - parseFloat(option.long_put_premium))) * option.quantity * 100
        
        return `
            <div class="space-y-3">
                <!-- Call Spread -->
                <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h5 class="font-semibold text-red-900 mb-3 flex items-center">
                        <i class="fas fa-phone mr-2"></i>
                        Call Spread
                    </h5>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <p class="text-xs text-gray-600 mb-1">Short Call</p>
                            <div class="text-sm font-semibold">Strike: $${parseFloat(option.short_call_strike).toFixed(2)}</div>
                            <div class="text-sm text-green-600">Premium: +$${parseFloat(option.short_call_premium).toFixed(2)}</div>
                        </div>
                        <div>
                            <p class="text-xs text-gray-600 mb-1">Long Call</p>
                            <div class="text-sm font-semibold">Strike: $${parseFloat(option.long_call_strike).toFixed(2)}</div>
                            <div class="text-sm text-red-600">Premium: -$${parseFloat(option.long_call_premium).toFixed(2)}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Put Spread -->
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h5 class="font-semibold text-blue-900 mb-3 flex items-center">
                        <i class="fas fa-hand-paper mr-2"></i>
                        Put Spread
                    </h5>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <p class="text-xs text-gray-600 mb-1">Short Put</p>
                            <div class="text-sm font-semibold">Strike: $${parseFloat(option.short_put_strike).toFixed(2)}</div>
                            <div class="text-sm text-green-600">Premium: +$${parseFloat(option.short_put_premium).toFixed(2)}</div>
                        </div>
                        <div>
                            <p class="text-xs text-gray-600 mb-1">Long Put</p>
                            <div class="text-sm font-semibold">Strike: $${parseFloat(option.long_put_strike).toFixed(2)}</div>
                            <div class="text-sm text-red-600">Premium: -$${parseFloat(option.long_put_premium).toFixed(2)}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Net Credit -->
                <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div class="flex justify-between items-center">
                        <span class="font-semibold text-gray-700">Total Net Credit:</span>
                        <span class="text-xl font-bold text-purple-600">
                            +$${netCredit.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>
        `
    }
    
    return '<p class="text-gray-500">No leg details available</p>'
}

async function closeOption(optionId) {
    try {
        // Fetch all options and find the one we need
        const response = await api.get('/api/options')
        const option = response.data.find(o => o.id === optionId)
        
        if (!option) {
            alert('Option trade not found')
            return
        }
        
        // Get strategy configuration
        const strategyConfig = getStrategyConfig(option.strategy_type)
        const strategyLabel = STRATEGY_TYPES.find(st => st.value === option.strategy_type)?.label || option.strategy_type.replace(/_/g, ' ')
        
        // Create modal
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'
        modal.innerHTML = `
            <div class="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                <!-- Header -->
                <div class="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6 rounded-t-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-2xl font-bold flex items-center">
                                <i class="fas fa-check-circle mr-3"></i>
                                Close Option Trade
                            </h3>
                            <p class="text-purple-100 mt-1">${option.ticker} - ${strategyLabel}</p>
                        </div>
                        <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-purple-200 text-2xl">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Body -->
                <div class="p-6">
                    <!-- Position Summary -->
                    <div class="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                        <h4 class="font-semibold text-purple-900 mb-3 flex items-center">
                            <i class="fas fa-info-circle mr-2"></i>
                            Position Summary
                        </h4>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <span class="text-gray-600">Trade Date:</span>
                                <div class="font-semibold text-gray-900">${option.trade_date}</div>
                            </div>
                            <div>
                                <span class="text-gray-600">Expiration:</span>
                                <div class="font-semibold text-gray-900">${option.expiration_date}</div>
                            </div>
                            <div>
                                <span class="text-gray-600">Contracts:</span>
                                <div class="font-semibold text-gray-900">${option.quantity}</div>
                            </div>
                            <div>
                                <span class="text-gray-600">Open Commission:</span>
                                <div class="font-semibold text-gray-900">$${parseFloat(option.commission || 0).toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Close Trade Form -->
                    <form id="closeOptionForm">
                        <div class="space-y-6">
                            <!-- Close Date -->
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-calendar mr-2 text-purple-600"></i>
                                    Close Date *
                                </label>
                                <input 
                                    type="date" 
                                    id="close_date" 
                                    name="close_date"
                                    value="${new Date().toISOString().split('T')[0]}"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-purple-600"
                                    required
                                >
                            </div>
                            
                            <!-- Strategy-specific close fields -->
                            <div id="close-legs-container">
                                ${renderCloseLegFields(option, strategyConfig)}
                            </div>
                            
                            <!-- Close Commission -->
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-dollar-sign mr-2 text-purple-600"></i>
                                    Close Commission
                                </label>
                                <input 
                                    type="number" 
                                    id="close_commission" 
                                    name="close_commission"
                                    step="0.01"
                                    value="0.00"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-purple-600"
                                    placeholder="0.00"
                                >
                            </div>
                            
                            <!-- Trade Analysis -->
                            <div class="bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-lg p-5">
                                <h4 class="font-bold text-purple-900 mb-4 flex items-center text-lg">
                                    <i class="fas fa-calculator mr-2"></i>
                                    Trade Analysis
                                </h4>
                                <div id="close-analysis" class="space-y-3">
                                    <!-- Dynamic P/L calculation -->
                                </div>
                            </div>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="flex gap-3 mt-6 pt-6 border-t border-gray-200">
                            <button 
                                type="submit" 
                                class="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-3 rounded-lg font-semibold hover:from-green-700 hover:to-green-800 transition-all transform hover:scale-[1.02] shadow-md"
                            >
                                <i class="fas fa-check-circle mr-2"></i>
                                Close Position
                            </button>
                            <button 
                                type="button" 
                                onclick="this.closest('.fixed').remove()"
                                class="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `
        
        document.body.appendChild(modal)
        
        // Calculate P/L on input change
        const form = document.getElementById('closeOptionForm')
        form.addEventListener('input', () => updateCloseAnalysis(option, strategyConfig))
        
        // Initial calculation
        updateCloseAnalysis(option, strategyConfig)
        
        // Handle form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault()
            
            const closeData = {
                close_date: document.getElementById('close_date').value,
                close_commission: parseFloat(document.getElementById('close_commission').value) || 0,
                is_open: false
            }
            
            // Add leg-specific close prices based on strategy
            if (strategyConfig.legs === 1) {
                closeData.close_price = parseFloat(document.getElementById('close_price').value) || 0
            } else if (strategyConfig.legs === 2) {
                closeData.short_close_price = parseFloat(document.getElementById('short_close_price').value) || 0
                closeData.long_close_price = parseFloat(document.getElementById('long_close_price').value) || 0
            } else if (strategyConfig.legs === 4) {
                closeData.short_call_close = parseFloat(document.getElementById('short_call_close').value) || 0
                closeData.long_call_close = parseFloat(document.getElementById('long_call_close').value) || 0
                closeData.short_put_close = parseFloat(document.getElementById('short_put_close').value) || 0
                closeData.long_put_close = parseFloat(document.getElementById('long_put_close').value) || 0
            }
            
            try {
                await api.put(`/api/options/${optionId}`, closeData)
                modal.remove()
                
                // Show success message with P/L
                const analysis = calculateOptionPL(option, strategyConfig, closeData)
                alert(`Option closed successfully!\n\nNet P/L: $${analysis.netPL.toFixed(2)}\n${analysis.netPL >= 0 ? '✅ Profitable trade' : '⚠️ Loss on trade'}`)
                
                loadOptions()
                loadDashboard()
            } catch (error) {
                console.error('Error closing option:', error)
                alert('Failed to close option trade. Please try again.')
            }
        })
        
    } catch (error) {
        console.error('Error loading option:', error)
        alert('Failed to load option details')
    }
}

function renderCloseLegFields(option, strategyConfig) {
    const contracts = option.quantity
    
    if (strategyConfig.legs === 1) {
        // Single leg (Selling Put, Long Put, Long Call)
        return `
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-2">
                    <i class="fas fa-tag mr-2 text-purple-600"></i>
                    Close Price per Share *
                </label>
                <input 
                    type="number" 
                    id="close_price" 
                    name="close_price"
                    step="0.01"
                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-purple-600"
                    placeholder="0.00"
                    required
                >
                <p class="text-xs text-gray-500 mt-1">Original Premium: $${parseFloat(option.premium).toFixed(2)}/share (${contracts} contracts)</p>
            </div>
        `
    } else if (strategyConfig.legs === 2) {
        // Two legs (Credit Spread, Debit Spread)
        return `
            <div class="space-y-4">
                <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h5 class="font-semibold text-red-900 mb-3 flex items-center">
                        <i class="fas fa-arrow-down mr-2"></i>
                        Short Leg Close
                    </h5>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs text-gray-600 mb-1">Strike</label>
                            <div class="font-semibold">$${parseFloat(option.short_strike).toFixed(2)}</div>
                        </div>
                        <div>
                            <label class="block text-xs text-gray-600 mb-1">Original Premium</label>
                            <div class="font-semibold">$${parseFloat(option.short_premium).toFixed(2)}</div>
                        </div>
                    </div>
                    <label class="block text-sm font-semibold text-gray-700 mt-3 mb-2">
                        Close Price per Share *
                    </label>
                    <input 
                        type="number" 
                        id="short_close_price" 
                        name="short_close_price"
                        step="0.01"
                        class="w-full px-4 py-2 border border-red-300 rounded-lg focus:outline-none focus:border-red-600"
                        placeholder="0.00"
                        required
                    >
                </div>
                
                <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h5 class="font-semibold text-green-900 mb-3 flex items-center">
                        <i class="fas fa-arrow-up mr-2"></i>
                        Long Leg Close
                    </h5>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs text-gray-600 mb-1">Strike</label>
                            <div class="font-semibold">$${parseFloat(option.long_strike).toFixed(2)}</div>
                        </div>
                        <div>
                            <label class="block text-xs text-gray-600 mb-1">Original Premium</label>
                            <div class="font-semibold">$${parseFloat(option.long_premium).toFixed(2)}</div>
                        </div>
                    </div>
                    <label class="block text-sm font-semibold text-gray-700 mt-3 mb-2">
                        Close Price per Share *
                    </label>
                    <input 
                        type="number" 
                        id="long_close_price" 
                        name="long_close_price"
                        step="0.01"
                        class="w-full px-4 py-2 border border-green-300 rounded-lg focus:outline-none focus:border-green-600"
                        placeholder="0.00"
                        required
                    >
                </div>
            </div>
        `
    } else if (strategyConfig.legs === 4) {
        // Four legs (Iron Condor)
        return `
            <div class="space-y-4">
                <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h5 class="font-semibold text-red-900 mb-3 flex items-center">
                        <i class="fas fa-phone mr-2"></i>
                        Call Spread
                    </h5>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <div class="flex items-center gap-2 mb-2">
                                <i class="fas fa-arrow-down text-red-600"></i>
                                <span class="text-sm font-semibold text-gray-700">Short Call</span>
                            </div>
                            <div class="text-xs text-gray-600 mb-1">Strike: $${parseFloat(option.short_call_strike).toFixed(2)}</div>
                            <div class="text-xs text-gray-600 mb-2">Premium: $${parseFloat(option.short_call_premium).toFixed(2)}</div>
                            <input 
                                type="number" 
                                id="short_call_close" 
                                name="short_call_close"
                                step="0.01"
                                class="w-full px-3 py-2 text-sm border border-red-300 rounded-lg focus:outline-none focus:border-red-600"
                                placeholder="Close price"
                                required
                            >
                        </div>
                        <div>
                            <div class="flex items-center gap-2 mb-2">
                                <i class="fas fa-arrow-up text-green-600"></i>
                                <span class="text-sm font-semibold text-gray-700">Long Call</span>
                            </div>
                            <div class="text-xs text-gray-600 mb-1">Strike: $${parseFloat(option.long_call_strike).toFixed(2)}</div>
                            <div class="text-xs text-gray-600 mb-2">Premium: $${parseFloat(option.long_call_premium).toFixed(2)}</div>
                            <input 
                                type="number" 
                                id="long_call_close" 
                                name="long_call_close"
                                step="0.01"
                                class="w-full px-3 py-2 text-sm border border-green-300 rounded-lg focus:outline-none focus:border-green-600"
                                placeholder="Close price"
                                required
                            >
                        </div>
                    </div>
                </div>
                
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h5 class="font-semibold text-blue-900 mb-3 flex items-center">
                        <i class="fas fa-hand-paper mr-2"></i>
                        Put Spread
                    </h5>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <div class="flex items-center gap-2 mb-2">
                                <i class="fas fa-arrow-down text-red-600"></i>
                                <span class="text-sm font-semibold text-gray-700">Short Put</span>
                            </div>
                            <div class="text-xs text-gray-600 mb-1">Strike: $${parseFloat(option.short_put_strike).toFixed(2)}</div>
                            <div class="text-xs text-gray-600 mb-2">Premium: $${parseFloat(option.short_put_premium).toFixed(2)}</div>
                            <input 
                                type="number" 
                                id="short_put_close" 
                                name="short_put_close"
                                step="0.01"
                                class="w-full px-3 py-2 text-sm border border-red-300 rounded-lg focus:outline-none focus:border-red-600"
                                placeholder="Close price"
                                required
                            >
                        </div>
                        <div>
                            <div class="flex items-center gap-2 mb-2">
                                <i class="fas fa-arrow-up text-green-600"></i>
                                <span class="text-sm font-semibold text-gray-700">Long Put</span>
                            </div>
                            <div class="text-xs text-gray-600 mb-1">Strike: $${parseFloat(option.long_put_strike).toFixed(2)}</div>
                            <div class="text-xs text-gray-600 mb-2">Premium: $${parseFloat(option.long_put_premium).toFixed(2)}</div>
                            <input 
                                type="number" 
                                id="long_put_close" 
                                name="long_put_close"
                                step="0.01"
                                class="w-full px-3 py-2 text-sm border border-green-300 rounded-lg focus:outline-none focus:border-green-600"
                                placeholder="Close price"
                                required
                            >
                        </div>
                    </div>
                </div>
            </div>
        `
    }
    
    return ''
}

function updateCloseAnalysis(option, strategyConfig) {
    const closeCommission = parseFloat(document.getElementById('close_commission').value) || 0
    
    const closeData = {
        close_commission: closeCommission
    }
    
    // Get close prices based on strategy
    if (strategyConfig.legs === 1) {
        closeData.close_price = parseFloat(document.getElementById('close_price')?.value) || 0
    } else if (strategyConfig.legs === 2) {
        closeData.short_close_price = parseFloat(document.getElementById('short_close_price')?.value) || 0
        closeData.long_close_price = parseFloat(document.getElementById('long_close_price')?.value) || 0
    } else if (strategyConfig.legs === 4) {
        closeData.short_call_close = parseFloat(document.getElementById('short_call_close')?.value) || 0
        closeData.long_call_close = parseFloat(document.getElementById('long_call_close')?.value) || 0
        closeData.short_put_close = parseFloat(document.getElementById('short_put_close')?.value) || 0
        closeData.long_put_close = parseFloat(document.getElementById('long_put_close')?.value) || 0
    }
    
    const analysis = calculateOptionPL(option, strategyConfig, closeData)
    
    const analysisDiv = document.getElementById('close-analysis')
    analysisDiv.innerHTML = `
        <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
                <span class="text-gray-600">Opening Premium:</span>
                <div class="font-bold text-lg ${analysis.openingCredit >= 0 ? 'text-green-600' : 'text-red-600'}">
                    ${analysis.openingCredit >= 0 ? '+' : ''}$${analysis.openingCredit.toFixed(2)}
                </div>
            </div>
            <div>
                <span class="text-gray-600">Closing Cost:</span>
                <div class="font-bold text-lg ${analysis.closingCost <= 0 ? 'text-green-600' : 'text-red-600'}">
                    ${analysis.closingCost >= 0 ? '-' : '+'}$${Math.abs(analysis.closingCost).toFixed(2)}
                </div>
            </div>
            <div>
                <span class="text-gray-600">Opening Commission:</span>
                <div class="font-semibold text-red-600">-$${analysis.openCommission.toFixed(2)}</div>
            </div>
            <div>
                <span class="text-gray-600">Closing Commission:</span>
                <div class="font-semibold text-red-600">-$${analysis.closeCommission.toFixed(2)}</div>
            </div>
        </div>
        
        <div class="border-t-2 border-purple-300 pt-3 mt-3">
            <div class="flex justify-between items-center">
                <span class="text-gray-700 font-semibold text-lg">Net Profit/Loss:</span>
                <div class="text-2xl font-bold ${analysis.netPL >= 0 ? 'text-green-600' : 'text-red-600'}">
                    ${analysis.netPL >= 0 ? '+' : ''}$${analysis.netPL.toFixed(2)}
                </div>
            </div>
            ${analysis.netPL >= 0 ? 
                '<p class="text-xs text-green-600 mt-1 flex items-center"><i class="fas fa-check-circle mr-1"></i>Profitable trade</p>' : 
                '<p class="text-xs text-red-600 mt-1 flex items-center"><i class="fas fa-exclamation-triangle mr-1"></i>Loss on trade</p>'
            }
        </div>
    `
}

function calculateOptionPL(option, strategyConfig, closeData) {
    const contracts = option.quantity
    const openCommission = parseFloat(option.commission || 0)
    const closeCommission = closeData.close_commission
    
    let openingCredit = 0
    let closingCost = 0
    
    if (strategyConfig.legs === 1) {
        // Single leg
        const openPremium = parseFloat(option.premium)
        const closePremium = closeData.close_price || 0
        
        if (strategyConfig.isPremiumCredit) {
            // Selling put - we receive premium opening, pay to close
            openingCredit = openPremium * contracts * 100
            closingCost = closePremium * contracts * 100
        } else {
            // Long put/call - we pay premium opening, receive when closing
            openingCredit = -(openPremium * contracts * 100)
            closingCost = -(closePremium * contracts * 100)
        }
    } else if (strategyConfig.legs === 2) {
        // Two legs
        const shortOpen = parseFloat(option.short_premium)
        const longOpen = parseFloat(option.long_premium)
        const shortClose = closeData.short_close_price || 0
        const longClose = closeData.long_close_price || 0
        
        // Net opening credit
        openingCredit = (shortOpen - longOpen) * contracts * 100
        
        // Net closing cost
        closingCost = (shortClose - longClose) * contracts * 100
    } else if (strategyConfig.legs === 4) {
        // Iron Condor
        const shortCallOpen = parseFloat(option.short_call_premium)
        const longCallOpen = parseFloat(option.long_call_premium)
        const shortPutOpen = parseFloat(option.short_put_premium)
        const longPutOpen = parseFloat(option.long_put_premium)
        
        const shortCallClose = closeData.short_call_close || 0
        const longCallClose = closeData.long_call_close || 0
        const shortPutClose = closeData.short_put_close || 0
        const longPutClose = closeData.long_put_close || 0
        
        // Net opening credit (receive short premiums, pay long premiums)
        openingCredit = ((shortCallOpen - longCallOpen) + (shortPutOpen - longPutOpen)) * contracts * 100
        
        // Net closing cost (pay to close shorts, receive from closing longs)
        closingCost = ((shortCallClose - longCallClose) + (shortPutClose - longPutClose)) * contracts * 100
    }
    
    const netPL = openingCredit - closingCost - openCommission - closeCommission
    
    return {
        openingCredit,
        closingCost,
        openCommission,
        closeCommission,
        netPL
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
// CLOSED TRADES FUNCTIONS
// ============================================================================

async function loadClosedTrades() {
    try {
        const tradeType = document.getElementById('closed-trade-type').value
        
        // Load closed stock trades
        if (tradeType === 'all' || tradeType === 'stocks') {
            const stocksResponse = await api.get('/api/stocks?closed=true')
            const closedStocks = stocksResponse.data
            
            const stocksTable = document.getElementById('closed-stocks-table')
            const stocksContainer = document.getElementById('closed-stocks-container')
            
            if (closedStocks.length === 0) {
                stocksContainer.style.display = 'none'
            } else {
                stocksContainer.style.display = 'block'
                stocksTable.innerHTML = closedStocks.map(stock => {
                    const plClass = stock.profit_loss >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
                    return `
                        <tr class="border-b border-gray-200 hover:bg-gray-50">
                            <td class="px-4 py-3">${stock.trade_date}</td>
                            <td class="px-4 py-3 font-semibold text-brand-teal">${stock.ticker}</td>
                            <td class="px-4 py-3">${stock.trade_type}</td>
                            <td class="px-4 py-3 text-right">${stock.quantity}</td>
                            <td class="px-4 py-3 text-right">$${parseFloat(stock.price).toFixed(2)}</td>
                            <td class="px-4 py-3">${stock.account_name || stock.account_type || 'N/A'}</td>
                            <td class="px-4 py-3 text-right ${plClass}">
                                ${stock.profit_loss !== null && stock.profit_loss !== undefined ? '$' + parseFloat(stock.profit_loss).toFixed(2) : '-'}
                            </td>
                            <td class="px-4 py-3 text-center">
                                <button onclick="editClosedStock(${stock.id})" class="text-blue-600 hover:text-blue-800 mr-2" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="reopenStock(${stock.id})" class="text-green-600 hover:text-green-800" title="Re-open Trade">
                                    <i class="fas fa-undo"></i>
                                </button>
                            </td>
                        </tr>
                    `
                }).join('')
            }
        } else {
            document.getElementById('closed-stocks-container').style.display = 'none'
        }
        
        // Load closed option trades
        if (tradeType === 'all' || tradeType === 'options') {
            const optionsResponse = await api.get('/api/options?closed=true')
            const closedOptions = optionsResponse.data
            
            const optionsTable = document.getElementById('closed-options-table')
            const optionsContainer = document.getElementById('closed-options-container')
            
            if (closedOptions.length === 0) {
                optionsContainer.style.display = 'none'
            } else {
                optionsContainer.style.display = 'block'
                optionsTable.innerHTML = closedOptions.map(option => {
                    const plClass = option.profit_loss >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
                    const strategyLabel = STRATEGY_TYPES.find(st => st.value === option.strategy_type)?.label || option.strategy_type.replace(/_/g, ' ')
                    return `
                        <tr class="border-b border-gray-200 hover:bg-gray-50">
                            <td class="px-4 py-3">${option.trade_date}</td>
                            <td class="px-4 py-3 font-semibold text-brand-teal">${option.ticker}</td>
                            <td class="px-4 py-3">${strategyLabel}</td>
                            <td class="px-4 py-3 text-right">$${parseFloat(option.strike_price).toFixed(2)}</td>
                            <td class="px-4 py-3 text-right">$${parseFloat(option.premium).toFixed(2)}</td>
                            <td class="px-4 py-3">${option.expiration_date}</td>
                            <td class="px-4 py-3">${option.account_type || 'N/A'}</td>
                            <td class="px-4 py-3 text-right ${plClass}">
                                ${option.profit_loss !== null && option.profit_loss !== undefined ? '$' + parseFloat(option.profit_loss).toFixed(2) : '-'}
                            </td>
                            <td class="px-4 py-3 text-center">
                                <button onclick="editClosedOption(${option.id})" class="text-blue-600 hover:text-blue-800 mr-2" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="reopenOption(${option.id})" class="text-green-600 hover:text-green-800" title="Re-open Trade">
                                    <i class="fas fa-undo"></i>
                                </button>
                            </td>
                        </tr>
                    `
                }).join('')
            }
        } else {
            document.getElementById('closed-options-container').style.display = 'none'
        }
        
    } catch (error) {
        console.error('Error loading closed trades:', error)
        alert('Failed to load closed trades')
    }
}

function editClosedStock(id) {
    showStockForm(id)
}

function editClosedOption(id) {
    showOptionForm(id)
}

async function reopenStock(id) {
    if (!confirm('Re-open this stock trade? This will discard close date, close price, and P/L.')) return
    
    try {
        await api.put(`/api/stocks/${id}/reopen`)
        loadClosedTrades()
        alert('Stock trade re-opened successfully!')
    } catch (error) {
        alert(error.response?.data?.error || 'Failed to re-open trade')
    }
}

async function reopenOption(id) {
    if (!confirm('Re-open this option trade? This will discard close date, close price, and P/L.')) return
    
    try {
        await api.put(`/api/options/${id}/reopen`)
        loadClosedTrades()
        alert('Option trade re-opened successfully!')
    } catch (error) {
        alert(error.response?.data?.error || 'Failed to re-open trade')
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatCurrency(value, currency = 'USD') {
    if (!value) return currency === 'USD' ? '$0.00' : 'C$0.00'
    const prefix = currency === 'USD' ? '$' : 'C$'
    return prefix + parseFloat(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}


async function editStock(id) {
    showStockForm(id)
}

async function manageStock(id) {
    showStockDetails(id)
}

async function deleteStock(id) {
    if (!confirm('Are you sure you want to delete this stock trade?')) return
    
    try {
        await api.delete(`/api/stocks/${id}`)
        loadStocks()
        loadDashboard()
        alert('Stock trade deleted successfully!')
    } catch (error) {
        alert(error.response?.data?.error || 'Delete failed')
    }
}
