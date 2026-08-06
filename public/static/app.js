// Global state
let token = localStorage.getItem('token') || null
let currentUser = null
let accountsList = []

// Chart instances for cleanup
let portfolioValueChart = null
let accountDistributionChart = null
let monthlyPLChart = null

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

// Auto-trigger dividend fetch on Monday mornings
async function checkAndTriggerWeeklyDividendFetch() {
    try {
        const now = new Date()
        const dayOfWeek = now.getDay() // 0 = Sunday, 1 = Monday, etc.
        
        // Only run on Mondays (1)
        if (dayOfWeek !== 1) {
            return
        }
        
        // Check if we've already run today
        const lastFetchDate = localStorage.getItem('lastDividendAutoFetch')
        const today = now.toISOString().split('T')[0] // YYYY-MM-DD
        
        if (lastFetchDate === today) {
            console.log('[AUTO-FETCH] Already ran dividend fetch today')
            return
        }
        
        console.log('[AUTO-FETCH] Monday detected - triggering weekly dividend fetch')
        
        // Trigger the fetch in the background (202 response expected)
        api.post('/api/dividend-repository/fetch')
            .then(response => {
                if (response.status === 202 || response.status === 200) {
                    console.log('[AUTO-FETCH] Dividend fetch started successfully:', response.data)
                    localStorage.setItem('lastDividendAutoFetch', today)
                    // Optional: show subtle notification
                    // showNotification('Weekly dividend fetch started in background', 'info')
                } else {
                    console.warn('[AUTO-FETCH] Unexpected response status:', response.status)
                }
            })
            .catch(error => {
                console.error('[AUTO-FETCH] Failed to trigger dividend fetch:', error)
            })
        
    } catch (error) {
        console.error('[AUTO-FETCH] Error in auto-trigger check:', error)
    }
}

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
    
    // Initialize Daily Trade calculations
    initializeDailyTradeCalculations()
    
    // Check for research query parameter
    checkResearchQueryParameter()
})

// Check for ?research=SYMBOL query parameter from research site
function checkResearchQueryParameter() {
    const urlParams = new URLSearchParams(window.location.search)
    const researchSymbol = urlParams.get('research')
    
    if (researchSymbol) {
        console.log(`[RESEARCH] Deep link detected for symbol: ${researchSymbol}`)
        
        // Wait for user to be logged in
        if (token) {
            // Open research modal immediately
            setTimeout(() => {
                openResearchModal(researchSymbol)
            }, 500)
        } else {
            // Store symbol and open after login
            localStorage.setItem('pendingResearchSymbol', researchSymbol)
        }
        
        // Clean up URL without refreshing page
        const cleanUrl = window.location.pathname
        window.history.replaceState({}, document.title, cleanUrl)
    }
    
    // Check if there's a pending research symbol after login
    const pendingSymbol = localStorage.getItem('pendingResearchSymbol')
    if (pendingSymbol && token) {
        localStorage.removeItem('pendingResearchSymbol')
        setTimeout(() => {
            openResearchModal(pendingSymbol)
        }, 500)
    }
}

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
    
    // Hide all daily-trade tab contents (ensure tabs are reset when switching away)
    document.querySelectorAll('.daily-trade-tab-content').forEach(content => {
        content.classList.add('hidden')
    })
    
    // Hide all utility tab contents (ensure utility tabs are reset when switching away)
    document.querySelectorAll('.utility-content').forEach(content => {
        content.classList.add('hidden')
    })
    
    // Hide all report tab contents (ensure report tabs are reset when switching away)
    document.querySelectorAll('.report-tab-content').forEach(content => {
        content.classList.add('hidden')
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
            // Load Portfolio Overview by default
            showReportTab('overview')
            loadPortfolioOverview()
            break
        case 'daily-trade':
            // Load config first, then show default tab (Performance)
            loadDailyTradeConfig().then(() => {
                showDailyTradeTab('performance')
                // Check for monthly expiration alert on initial load
                checkMonthlyExpirationAlert()
            }).catch(err => {
                console.error('Failed to load Daily Trade config:', err)
                // Still show the tab even if config fails
                showDailyTradeTab('performance')
            })
            break
        case 'utilities':
            // Clear the file input when utilities page loads
            const fileInput = document.getElementById('option-tax-file')
            if (fileInput) {
                fileInput.value = ''
            }
            // Hide any status messages
            const statusDiv = document.getElementById('option-tax-status')
            if (statusDiv) {
                statusDiv.classList.add('hidden')
            }
            // Show the default tab (option-tax)
            showUtilityTab('option-tax')
            break
    }
}

// ============================================================================
// DAILY TRADE (0DTE) FUNCTIONS
// ============================================================================

// Check if today is the Thursday before the 3rd Friday (monthly expiration)
function isThursdayBeforeMonthlyExpiration() {
    const today = new Date()
    const dayOfWeek = today.getDay() // 0 = Sunday, 4 = Thursday
    
    // Only check on Thursdays
    if (dayOfWeek !== 4) {
        return false
    }
    
    // Get the current month and year
    const year = today.getFullYear()
    const month = today.getMonth()
    
    // Find the third Friday of the current month
    // Start with the first day of the month
    const firstDay = new Date(year, month, 1)
    
    // Find the first Friday (day 5)
    let firstFriday = 1
    while (new Date(year, month, firstFriday).getDay() !== 5) {
        firstFriday++
    }
    
    // Third Friday is 14 days after first Friday
    const thirdFriday = firstFriday + 14
    const thirdFridayDate = new Date(year, month, thirdFriday)
    
    // Thursday before third Friday
    const thursdayBefore = new Date(thirdFridayDate)
    thursdayBefore.setDate(thirdFridayDate.getDate() - 1)
    
    // Check if today is that Thursday
    return today.getDate() === thursdayBefore.getDate() &&
           today.getMonth() === thursdayBefore.getMonth() &&
           today.getFullYear() === thursdayBefore.getFullYear()
}

function checkMonthlyExpirationAlert() {
    const alertElement = document.getElementById('dt-monthly-expiration-alert')
    const alertElementPerf = document.getElementById('dt-monthly-expiration-alert-perf')
    
    const shouldShow = isThursdayBeforeMonthlyExpiration()
    
    if (alertElement) {
        if (shouldShow) {
            alertElement.classList.remove('hidden')
        } else {
            alertElement.classList.add('hidden')
        }
    }
    
    if (alertElementPerf) {
        if (shouldShow) {
            alertElementPerf.classList.remove('hidden')
        } else {
            alertElementPerf.classList.add('hidden')
        }
    }
}

function showDailyTradeTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.daily-trade-tab-content').forEach(content => {
        content.classList.add('hidden')
    })
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.daily-trade-tab').forEach(tab => {
        tab.classList.remove('active', 'text-orange-600', 'border-b-2', 'border-orange-600')
        tab.classList.add('text-gray-600')
    })
    
    // Show selected tab content
    document.getElementById(`dt-${tabName}-tab`).classList.remove('hidden')
    
    // Add active class to selected tab button
    const activeTab = document.querySelector(`[data-tab="${tabName}"]`)
    if (activeTab) {
        activeTab.classList.add('active', 'text-orange-600', 'border-b-2', 'border-orange-600')
        activeTab.classList.remove('text-gray-600')
    }
    
    // Update rolling window labels when showing performance tab
    if (tabName === 'performance') {
        // Check for monthly expiration warning
        checkMonthlyExpirationAlert()
        updateRollingWindowLabels()
        // Load performance stats (default to 'rolling' to match the "Last X Trades" button as default active state)
        loadPerformanceStats(currentPerformancePeriod || 'rolling')
        // Load recent trades and day of week statistics
        loadRecentTrades()
        loadDayOfWeekStats()
    }
    
    // Special handling for Today's Trading tab
    if (tabName === 'today') {
        // Check for monthly expiration warning
        checkMonthlyExpirationAlert()
        
        // Always set entry date and time to current date/time when tab is opened
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        const hours = String(now.getHours()).padStart(2, '0')
        const minutes = String(now.getMinutes()).padStart(2, '0')
        
        const entryDateInput = document.getElementById('dt-entry-date')
        if (entryDateInput) {
            entryDateInput.value = `${year}-${month}-${day}`
        }
        
        const entryTimeInput = document.getElementById('dt-entry-time')
        if (entryTimeInput) {
            entryTimeInput.value = `${hours}:${minutes}`
        }
        
        // Load configuration to set default contracts value
        loadDailyTradeConfig().then(() => {
            // After config loads, set default contracts if not already set
            const contractsInput = document.getElementById('dt-contracts')
            const defaultContracts = parseInt(document.getElementById('dt-default-contracts')?.value || 1)
            if (contractsInput && contractsInput.value === '1') {
                contractsInput.value = defaultContracts
            }
        })
        
        // Initialize calculations
        initializeDailyTradeCalculations()
        
        // Load today's data
        loadActiveTrades()
        loadClosedPositionsToday()
        loadTodayJournal()
    }
}

// Update Performance tab labels with configured rolling window value
function updateRollingWindowLabels() {
    // Get rolling window value from cached configuration
    let rollingWindow = 50 // Default
    
    if (dailyTradeConfigCache && dailyTradeConfigCache.rolling_profit_window) {
        rollingWindow = parseInt(dailyTradeConfigCache.rolling_profit_window)
    } else {
        // Fallback: try to read from DOM if cache not available
        const rollingWindowInput = document.getElementById('dt-rolling-profit-window')
        if (rollingWindowInput && rollingWindowInput.value) {
            rollingWindow = parseInt(rollingWindowInput.value)
        }
    }
    
    // Update filter button text
    const filterButton = document.getElementById('dt-filter-rolling')
    if (filterButton) {
        filterButton.textContent = `Last ${rollingWindow} Trades`
    }
    
    // Update chart title
    const chartTitle = document.getElementById('dt-chart-title')
    if (chartTitle) {
        chartTitle.textContent = `P/L Trend (Last ${rollingWindow} Trades)`
    }
}

// Initialize Daily Trade spread calculations
function initializeDailyTradeCalculations() {
    // Note: Date and time are now set in showDailyTradeTab() before this function is called
    
    // Add listener to strike width to update displays
    const strikeWidthInput = document.getElementById('dt-strike-width')
    if (strikeWidthInput) {
        strikeWidthInput.addEventListener('input', updateStrikeWidthDisplays)
    }
    
    // Add listener to SPX price for recalculation
    const spxPriceInput = document.getElementById('dt-spx-price')
    if (spxPriceInput) {
        spxPriceInput.addEventListener('input', () => {
            updateCallSpreadCalculations()
            updatePutSpreadCalculations()
        })
    }
    
    // Get input elements
    const callShortStrike = document.getElementById('call-short-strike')
    const callTotalCredit = document.getElementById('call-total-credit')
    const putShortStrike = document.getElementById('put-short-strike')
    const putTotalCredit = document.getElementById('put-total-credit')
    
    const callCommission = document.getElementById('call-commission')
    const putCommission = document.getElementById('put-commission')
    const enableCallSpread = document.getElementById('enable-call-spread')
    const enablePutSpread = document.getElementById('enable-put-spread')
    const contractsInput = document.getElementById('dt-contracts')
    
    // Add event listeners for real-time calculations
    if (callShortStrike) callShortStrike.addEventListener('input', () => {
        updateCallSpreadCalculations()
        updateTradeSummary()
    })
    if (callTotalCredit) callTotalCredit.addEventListener('input', () => {
        updateCallSpreadCalculations()
        updateTradeSummary()
    })
    if (putShortStrike) putShortStrike.addEventListener('input', () => {
        updatePutSpreadCalculations()
        updateTradeSummary()
    })
    if (putTotalCredit) putTotalCredit.addEventListener('input', () => {
        updatePutSpreadCalculations()
        updateTradeSummary()
    })
    
    // Add event listeners for commission and contract updates
    if (callCommission) callCommission.addEventListener('input', updateTradeSummary)
    if (putCommission) putCommission.addEventListener('input', updateTradeSummary)
    if (enableCallSpread) enableCallSpread.addEventListener('change', () => {
        updateCallSpreadCalculations()
        updatePutSpreadCalculations()
        updateTradeSummary()
    })
    if (enablePutSpread) enablePutSpread.addEventListener('change', () => {
        updateCallSpreadCalculations()
        updatePutSpreadCalculations()
        updateTradeSummary()
    })
    if (contractsInput) contractsInput.addEventListener('input', () => {
        updateCallSpreadCalculations()
        updatePutSpreadCalculations()
        updateTradeSummary()
    })
    
    // Initial calculation
    updateCallSpreadCalculations()
    updatePutSpreadCalculations()
    updateTradeSummary()
}

// Update strike width displays from configuration
function updateStrikeWidthDisplays() {
    const strikeWidthInput = document.getElementById('dt-strike-width')
    const strikeWidth = strikeWidthInput ? parseInt(strikeWidthInput.value) : 5
    
    // Update the ($X wide) displays in spread titles - show strike width value, not multiplied
    const callSpreadWidthDisplay = document.getElementById('call-spread-width-display')
    const putSpreadWidthDisplay = document.getElementById('put-spread-width-display')
    
    if (callSpreadWidthDisplay) {
        callSpreadWidthDisplay.textContent = `($${strikeWidth} wide)`
    }
    
    if (putSpreadWidthDisplay) {
        putSpreadWidthDisplay.textContent = `($${strikeWidth} wide)`
    }
    
    // Trigger recalculation with new strike width
    updateCallSpreadCalculations()
    updatePutSpreadCalculations()
    updateTradeSummary()
}

// Update contracts hint based on position sizing configuration
function updateContractsHint(config) {
    const hintElement = document.getElementById('dt-contracts-hint')
    if (!hintElement) return
    
    // Check the Quick Entry toggle state
    const toggle = document.getElementById('dt-profit-sizing-toggle')
    const isToggleOn = toggle && toggle.checked
    
    if (!isToggleOn) {
        // Toggle is OFF - always show "Manual Entry"
        hintElement.innerHTML = 'Manual Entry'
        hintElement.className = 'text-xs text-gray-500 mt-1 block'
        return
    }
    
    // Toggle is ON - check position sizing config
    if (config.enable_position_sizing) {
        const sizingType = config.position_sizing_type || 'profit'
        
        if (sizingType === 'profit') {
            // Will be updated by calculateProfitBasedContracts with actual values
            const rollingWindow = config.rolling_profit_window || 50
            hintElement.innerHTML = `Profit-based: Loading... (last ${rollingWindow})`
            hintElement.className = 'text-xs text-orange-600 font-semibold mt-1 block'
        } else if (sizingType === 'account') {
            // Will be updated by calculateAccountBasedContracts with actual values
            const maxLossPct = config.account_max_loss_percent || 4.00
            hintElement.innerHTML = `Account-based: Loading... (${maxLossPct}% max loss)`
            hintElement.className = 'text-xs text-purple-600 font-semibold mt-1 block'
        }
    } else {
        // Config has auto-sizing disabled, fall back to manual
        hintElement.innerHTML = 'Manual Entry'
        hintElement.className = 'text-xs text-gray-500 mt-1 block'
    }
}

// Adjust contracts with +/- buttons
function adjustContracts(delta) {
    const contractsInput = document.getElementById('dt-contracts')
    if (contractsInput) {
        const currentValue = parseInt(contractsInput.value) || 1
        const newValue = Math.max(1, currentValue + delta)
        contractsInput.value = newValue
    }
}

// Update Call Spread calculations
function updateCallSpreadCalculations() {
    // Get strike width from configuration
    const strikeWidthInput = document.getElementById('dt-strike-width')
    const strikeWidth = strikeWidthInput ? parseInt(strikeWidthInput.value) : 5
    
    // Get SPX price (manual override or default)
    const spxPriceInput = document.getElementById('dt-spx-price')
    const spxPrice = spxPriceInput && spxPriceInput.value ? parseFloat(spxPriceInput.value) : 4856.20
    
    const shortStrike = parseFloat(document.getElementById('call-short-strike')?.value || 0)
    const premium = parseFloat(document.getElementById('call-total-credit')?.value || 0)
    
    // Get contracts
    const contracts = parseInt(document.getElementById('dt-contracts')?.value || 1)
    
    // Calculate Total Dollars At Work: spread width × 100 × contracts
    const dollarsAtWork = strikeWidth * 100 * contracts
    
    // Calculate Total Credit: premium × 100 × contracts
    const totalCredit = premium * 100 * contracts
    
    // Calculate distance from SPX
    const distancePoints = (shortStrike - spxPrice).toFixed(2)
    const distancePercent = ((distancePoints / spxPrice) * 100).toFixed(2)
    
    // Update display
    const dollarsAtWorkEl = document.getElementById('call-dollars-at-work')
    const totalCreditEl = document.getElementById('call-total-credit-display')
    const distanceEl = document.getElementById('call-distance')
    
    if (dollarsAtWorkEl) {
        dollarsAtWorkEl.textContent = `$${dollarsAtWork.toFixed(2)}`
    }
    
    if (totalCreditEl) {
        totalCreditEl.textContent = `$${totalCredit.toFixed(2)}`
    }
    
    if (distanceEl) {
        const sign = distancePoints >= 0 ? '+' : ''
        distanceEl.textContent = `${sign}${distancePoints} pts (${distancePercent}%)`
        // Color code based on distance
        if (Math.abs(distancePoints) < 20) {
            distanceEl.className = 'font-semibold text-red-600'
        } else if (Math.abs(distancePoints) < 40) {
            distanceEl.className = 'font-semibold text-yellow-600'
        } else {
            distanceEl.className = 'font-semibold text-green-600'
        }
    }
}

// Update Put Spread calculations
function updatePutSpreadCalculations() {
    // Get strike width from configuration
    const strikeWidthInput = document.getElementById('dt-strike-width')
    const strikeWidth = strikeWidthInput ? parseInt(strikeWidthInput.value) : 5
    
    // Get SPX price (manual override or default)
    const spxPriceInput = document.getElementById('dt-spx-price')
    const spxPrice = spxPriceInput && spxPriceInput.value ? parseFloat(spxPriceInput.value) : 4856.20
    
    const shortStrike = parseFloat(document.getElementById('put-short-strike')?.value || 0)
    const premium = parseFloat(document.getElementById('put-total-credit')?.value || 0)
    
    // Get contracts
    const contracts = parseInt(document.getElementById('dt-contracts')?.value || 1)
    
    // Calculate Total Dollars At Work: spread width × 100 × contracts
    const dollarsAtWork = strikeWidth * 100 * contracts
    
    // Calculate Total Credit: premium × 100 × contracts
    const totalCredit = premium * 100 * contracts
    
    // Calculate distance from SPX
    const distancePoints = (shortStrike - spxPrice).toFixed(2)
    const distancePercent = ((distancePoints / spxPrice) * 100).toFixed(2)
    
    // Update display
    const dollarsAtWorkEl = document.getElementById('put-dollars-at-work')
    const totalCreditEl = document.getElementById('put-total-credit-display')
    const distanceEl = document.getElementById('put-distance')
    
    if (dollarsAtWorkEl) {
        dollarsAtWorkEl.textContent = `$${dollarsAtWork.toFixed(2)}`
    }
    
    if (totalCreditEl) {
        totalCreditEl.textContent = `$${totalCredit.toFixed(2)}`
    }
    
    if (distanceEl) {
        const sign = distancePoints >= 0 ? '+' : ''
        distanceEl.textContent = `${sign}${distancePoints} pts (${distancePercent}%)`
        // Color code based on distance
        if (Math.abs(distancePoints) < 20) {
            distanceEl.className = 'font-semibold text-red-600'
        } else if (Math.abs(distancePoints) < 40) {
            distanceEl.className = 'font-semibold text-yellow-600'
        } else {
            distanceEl.className = 'font-semibold text-green-600'
        }
    }
}

// Update Trade Summary (all summary calculations)
function updateTradeSummary() {
    const callEnabled = document.getElementById('enable-call-spread')?.checked
    const putEnabled = document.getElementById('enable-put-spread')?.checked
    
    const callCredit = callEnabled ? (parseFloat(document.getElementById('call-total-credit')?.value) || 0) : 0
    const putCredit = putEnabled ? (parseFloat(document.getElementById('put-total-credit')?.value) || 0) : 0
    const callCommission = callEnabled ? (parseFloat(document.getElementById('call-commission')?.value) || 0) : 0
    const putCommission = putEnabled ? (parseFloat(document.getElementById('put-commission')?.value) || 0) : 0
    
    const contracts = parseInt(document.getElementById('dt-contracts')?.value || 1)
    const strikeWidthInput = document.getElementById('dt-strike-width')
    const strikeWidth = strikeWidthInput ? parseInt(strikeWidthInput.value) : 5
    
    // Total Premium Credit (per contract)
    const totalCredit = callCredit + putCredit
    
    // Total Commission
    const totalCommission = callCommission + putCommission
    
    // Max Risk calculation
    // For Iron Condor: (Spread Width × Contracts) - (TOTAL Premium × Contracts)
    // For single spread: (Spread Width × Contracts) - (Premium × Contracts)
    const spreadWidth = strikeWidth * 100 // e.g., 5 pts = $500
    
    let maxRisk = 0
    if (callEnabled && putEnabled) {
        // Iron Condor: Max dollars at work on one side, minus TOTAL premium collected
        maxRisk = (spreadWidth * contracts) - (totalCredit * 100 * contracts)
    } else if (callEnabled) {
        // Call spread only
        maxRisk = (spreadWidth * contracts) - (callCredit * 100 * contracts)
    } else if (putEnabled) {
        // Put spread only
        maxRisk = (spreadWidth * contracts) - (putCredit * 100 * contracts)
    }
    
    // Net Credit = (Total Credit * 100 * Contracts) - Total Commission
    const netCredit = (totalCredit * 100 * contracts) - totalCommission
    
    // Update displays
    const totalCreditEl = document.getElementById('dt-total-credit')
    const maxRiskEl = document.getElementById('dt-max-risk')
    const commissionEl = document.getElementById('dt-total-commission')
    const netCreditEl = document.getElementById('dt-net-credit')
    
    if (totalCreditEl) {
        totalCreditEl.textContent = `$${totalCredit.toFixed(2)}`
    }
    
    if (maxRiskEl) {
        maxRiskEl.textContent = `$${maxRisk.toFixed(2)}`
    }
    
    if (commissionEl) {
        commissionEl.textContent = `$${totalCommission.toFixed(2)}`
    }
    
    if (netCreditEl) {
        netCreditEl.textContent = `$${netCredit.toFixed(2)}`
    }
}

// ============================================================================
// DAILY TRADE CONFIGURATION FUNCTIONS
// ============================================================================

// Open configuration modal
function openDailyTradeConfig() {
    const modal = document.getElementById('dt-config-modal')
    if (modal) {
        modal.classList.remove('hidden')
        // Load config when opening modal
        loadDailyTradeConfig()
    }
}

// Close configuration modal
function closeDailyTradeConfig() {
    const modal = document.getElementById('dt-config-modal')
    if (modal) {
        modal.classList.add('hidden')
        // Update displays after closing
        updateStrikeWidthDisplays()
        updateRollingWindowLabels()
    }
}

// Global config cache
let dailyTradeConfigCache = null

// Load Daily Trade configuration
async function loadDailyTradeConfig() {
    try {
        // Ensure accounts are loaded first
        if (!accountsList || accountsList.length === 0) {
            console.log('Loading accounts list...')
            await loadAccountsList()
            console.log('Accounts loaded:', accountsList)
        } else {
            console.log('Using cached accounts:', accountsList)
        }
        
        // Check if user has any accounts
        if (!accountsList || accountsList.length === 0) {
            alert('⚠️ No accounts found!\n\nPlease create at least one account before configuring Daily Trades.\n\nGo to the Accounts section to create your first account.')
            closeDailyTradeConfig()
            return
        }
        
        const response = await api.get('/api/daily-trade/config')
        const config = response.data
        
        // Cache the config
        dailyTradeConfigCache = config
        
        console.log('Config received:', config)
        
        // Check if config modal is visible before populating form fields
        const configModal = document.getElementById('dt-config-modal')
        const isModalVisible = configModal && !configModal.classList.contains('hidden')
        
        if (isModalVisible) {
            // Populate form fields only if modal is open
            const setFieldValue = (id, value) => {
                const element = document.getElementById(id)
                if (element) {
                    element.value = value
                } else {
                    console.warn(`Element not found: ${id}`)
                }
            }
            
            setFieldValue('dt-max-contract-limit', config.max_contract_limit || 25)
            setFieldValue('dt-rolling-profit-window', config.rolling_profit_window || 50)
            setFieldValue('dt-target-premium-min', config.target_premium_min || 10.00)
            setFieldValue('dt-target-premium-max', config.target_premium_max || 15.00)
            setFieldValue('dt-guideline-delta', config.guideline_delta || -0.10)
            setFieldValue('dt-strike-width', config.strike_width || 5)
            setFieldValue('dt-default-contracts', config.default_contracts || 1)
            setFieldValue('dt-profit-target-percent', config.profit_target_percent || 50)
            setFieldValue('dt-atm-proximity-limit', config.atm_proximity_limit || 30)
            setFieldValue('dt-time-exit', config.time_exit ? config.time_exit.substring(0, 5) : '14:00')
            
            // New position sizing fields
            const enablePositionSizing = document.getElementById('dt-enable-position-sizing')
            if (enablePositionSizing) {
                enablePositionSizing.checked = config.enable_position_sizing || false
                // Initialize UI state
                if (typeof togglePositionSizing === 'function') {
                    togglePositionSizing()
                }
            }
            
            // Position sizing type
            const sizingType = config.position_sizing_type || 'profit'
            const profitRadio = document.querySelector('input[name="dt-position-sizing-type"][value="profit"]')
            const accountRadio = document.querySelector('input[name="dt-position-sizing-type"][value="account"]')
            if (sizingType === 'profit' && profitRadio) {
                profitRadio.checked = true
            } else if (sizingType === 'account' && accountRadio) {
                accountRadio.checked = true
            }
            
            // Initialize sizing type UI
            if (typeof toggleSizingType === 'function') {
                toggleSizingType()
            }
            
            // Load account select
            const accountSelect = document.getElementById('dt-default-account')
            if (accountSelect) {
                console.log('Populating account select. Accounts available:', accountsList ? accountsList.length : 0)
                accountSelect.innerHTML = '<option value="">Select account...</option>'
                if (accountsList && accountsList.length > 0) {
                    const accountOptions = accountsList.map(acc => {
                        console.log('Adding account:', acc.id, acc.account_name)
                        return `<option value="${acc.id}" ${acc.id === config.default_account_id ? 'selected' : ''}>${acc.account_name}</option>`
                    }).join('')
                    accountSelect.innerHTML += accountOptions
                    console.log('Account select populated with', accountsList.length, 'accounts')
                } else {
                    console.warn('No accounts available to populate dropdown')
                }
            }
        } else {
            console.log('Config modal not visible, skipping form population')
        }
        
        // Set the Quick Entry toggle based on config
        const quickEntryToggle = document.getElementById('dt-profit-sizing-toggle')
        if (quickEntryToggle && config.enable_position_sizing) {
            quickEntryToggle.checked = true
            // Trigger the toggle to update UI and calculate contracts
            toggleAutoPositionSizing()
        }
        
        // Always update these labels/displays (they exist outside the modal)
        updateRollingWindowLabels()
        updateStrikeWidthDisplays()
        updateContractsHint(config)
        
        console.log('Daily Trade config loaded successfully', config)
    } catch (error) {
        console.error('Error loading Daily Trade config:', error)
        
        // Provide more specific error message
        if (error.response && error.response.status === 401) {
            alert('❌ Authentication failed. Please log in again.')
        } else if (error.message && error.message.includes('accounts')) {
            alert('❌ Failed to load accounts.\n\nPlease ensure you have created at least one account before configuring Daily Trades.')
        } else {
            alert('❌ Failed to load Daily Trade configuration.\n\nPlease try refreshing the page. If the problem persists, check the browser console for details.')
        }
        closeDailyTradeConfig()
    }
}

// Save Daily Trade configuration
async function saveDailyTradeConfig() {
    try {
        const accountValue = document.getElementById('dt-default-account').value
        const config = {
            max_contract_limit: parseInt(document.getElementById('dt-max-contract-limit').value),
            rolling_profit_window: parseInt(document.getElementById('dt-rolling-profit-window').value),
            enable_position_sizing: document.getElementById('dt-enable-position-sizing').checked,
            position_sizing_type: document.querySelector('input[name="dt-position-sizing-type"]:checked').value,
            account_max_loss_percent: parseFloat(document.getElementById('dt-account-max-loss-percent').value),
            target_premium_min: parseFloat(document.getElementById('dt-target-premium-min').value),
            target_premium_max: parseFloat(document.getElementById('dt-target-premium-max').value),
            guideline_delta: parseFloat(document.getElementById('dt-guideline-delta').value),
            strike_width: parseInt(document.getElementById('dt-strike-width').value),
            default_contracts: parseInt(document.getElementById('dt-default-contracts').value),
            profit_target_percent: parseInt(document.getElementById('dt-profit-target-percent').value),
            atm_proximity_limit: parseInt(document.getElementById('dt-atm-proximity-limit').value),
            time_exit: document.getElementById('dt-time-exit').value + ':00',
            default_account_id: accountValue ? parseInt(accountValue) : null
        }
        
        console.log('Saving Daily Trade config:', config)
        
        const response = await api.post('/api/daily-trade/config', config)
        
        console.log('Save response:', response.data)
        
        if (response.data.success) {
            alert('✅ Configuration saved successfully!')
            // Update rolling window labels
            updateRollingWindowLabels()
            // Update contracts hint
            updateContractsHint(config)
            // Close modal
            closeDailyTradeConfig()
        } else {
            alert('Failed to save configuration')
        }
    } catch (error) {
        console.error('Error saving Daily Trade config:', error)
        alert('❌ Failed to save configuration. Please try again.')
    }
}

// Reset Daily Trade configuration to defaults
async function resetDailyTradeConfig() {
    if (!confirm('Are you sure you want to reset all configuration to default values?')) {
        return
    }
    
    try {
        const response = await api.post('/api/daily-trade/config/reset')
        
        if (response.data.success) {
            // Reload the configuration
            await loadDailyTradeConfig()
            alert('✅ Configuration reset to defaults successfully!')
        } else {
            alert('Failed to reset configuration')
        }
    } catch (error) {
        console.error('Error resetting Daily Trade config:', error)
        alert('❌ Failed to reset configuration. Please try again.')
    }
}

// Toggle position sizing master switch
function togglePositionSizing() {
    const isEnabled = document.getElementById('dt-enable-position-sizing').checked
    const sizingConfig = document.getElementById('dt-sizing-config')
    
    if (isEnabled) {
        sizingConfig.classList.remove('hidden')
        // Initialize the sizing type display
        toggleSizingType()
    } else {
        sizingConfig.classList.add('hidden')
    }
}

// Toggle between profit-based and account-based sizing
function toggleSizingType() {
    const selectedType = document.querySelector('input[name="dt-position-sizing-type"]:checked')?.value
    const profitConfig = document.getElementById('dt-profit-sizing-config')
    const accountConfig = document.getElementById('dt-account-sizing-config')
    
    if (selectedType === 'profit') {
        profitConfig.classList.remove('hidden')
        accountConfig.classList.add('hidden')
    } else if (selectedType === 'account') {
        profitConfig.classList.add('hidden')
        accountConfig.classList.remove('hidden')
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

async function loadAccountsList() {
    try {
        console.log('Fetching accounts from API...')
        const response = await api.get('/api/accounts')
        console.log('API response:', response.data)
        accountsList = response.data.accounts || []
        console.log('Accounts list set to:', accountsList)
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
        // Auto-trigger weekly dividend fetch on Monday mornings
        checkAndTriggerWeeklyDividendFetch()
        
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
            const sourceText = totals.exchange_rate.source || 'Bank of Canada'
            const sourceColor = totals.exchange_rate.is_default ? 'text-orange-600' : 'text-gray-500'
            document.getElementById('exchange-rate-display').innerHTML = `
                ${rateText}
                <span class="${sourceColor} text-sm ml-2">(${sourceText})</span>
            `
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
        
        // Check if company exists on research site
        let hasResearchData = false
        try {
            const researchResponse = await axios.get(`${RESEARCH_API}/api/research/company/${company.ticker}`, {
                validateStatus: function (status) {
                    // Accept 404 as valid status (company doesn't exist yet)
                    return (status >= 200 && status < 300) || status === 404
                }
            })
            
            // Only set to true if status is 200 and company data exists
            hasResearchData = researchResponse.status === 200 && researchResponse.data && researchResponse.data.company
        } catch (error) {
            // Unexpected error (not a 404)
            console.warn('Error checking research data:', error.message)
            hasResearchData = false
        }
        
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
                
                <div class="border-t pt-4 flex gap-2 flex-wrap">
                    <button onclick="fetchEarningsDate(${companyId})" class="btn-primary flex items-center gap-2">
                        <i class="fas fa-calendar-alt"></i>
                        <span class="btn-text">Fetch Earnings Date</span>
                        <span class="btn-loading hidden">Fetching...</span>
                    </button>
                    ${hasResearchData ? `
                        <button onclick="openResearchModal('${company.ticker}')" class="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded flex items-center gap-2">
                            <i class="fas fa-chart-line"></i>
                            View Financials
                        </button>
                    ` : `
                        <button onclick="fetchFinancials('${company.ticker}')" class="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded flex items-center gap-2" id="fetch-financials-btn">
                            <i class="fas fa-download"></i>
                            <span class="btn-text">Fetch Financials</span>
                            <span class="btn-loading hidden"><i class="fas fa-spinner fa-spin"></i> Fetching...</span>
                        </button>
                    `}
                    <button onclick="editCompany(${companyId}); this.closest('.fixed').remove()" class="btn-secondary flex items-center gap-2">
                        <i class="fas fa-edit"></i>
                        Edit Company
                    </button>
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

// Current filter state for stocks
let currentStockAccountFilter = 'all'

async function loadStocks() {
    try {
        const response = await api.get('/api/stocks?open=true')
        const stocks = response.data
        
        // Generate account tabs
        await generateStockAccountTabs(stocks)
        
        // Filter stocks based on current account filter
        const filteredStocks = currentStockAccountFilter === 'all' 
            ? stocks 
            : stocks.filter(stock => stock.account_id === currentStockAccountFilter)
        
        const table = document.getElementById('stocks-table')
        table.innerHTML = ''
        
        if (filteredStocks.length === 0) {
            table.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-gray-500">No open stock trades found</td></tr>'
            return
        }
        
        filteredStocks.forEach(stock => {
            const avgPrice = stock.avg_price || stock.price
            const costBasis = stock.cost_basis || stock.price
            const accountName = stock.account_name || 'N/A'
            
            // Determine row color and indicators based on both CC and dividend status
            let rowClass = 'border-b border-gray-200 hover:bg-gray-50'
            let indicators = ''
            
            // Covered Call indicator
            if (stock.cc_status === 'urgent') {
                // Red highlight for covered calls expiring within 14 days
                rowClass = 'border-b border-gray-200 bg-red-50 hover:bg-red-100'
                indicators += `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-600 text-white mr-1" title="Covered call expires in ${stock.days_until_cc_expiration} days">CC</span>`
            } else if (stock.cc_status === 'active') {
                // Orange highlight for covered calls expiring beyond 14 days
                rowClass = 'border-b border-gray-200 bg-orange-50 hover:bg-orange-100'
                indicators += `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-orange-600 text-white mr-1" title="Covered call expires in ${stock.days_until_cc_expiration} days">CC</span>`
            }
            
            // Missing Dividends indicator (purple/blue badge)
            if (stock.has_missing_dividends) {
                indicators += `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-600 text-white mr-1" title="${stock.missing_dividend_count} missing dividend(s) to record">DIV</span>`
                
                // If no CC status, set row to light blue background
                if (!stock.cc_status) {
                    rowClass = 'border-b border-gray-200 bg-blue-50 hover:bg-blue-100'
                }
            }
            
            // Strategy indicator badges
            let strategyBadge = ''
            if (stock.strategy_type === 'WHEEL') {
                strategyBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-600 text-white ml-1" title="Wheel Strategy"><i class="fas fa-dharmachakra"></i></span>`
            } else if (stock.strategy_type === 'DIVIDEND_ETFS') {
                strategyBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-600 text-white ml-1" title="Dividend ETFs"><i class="fas fa-money-bill-wave"></i></span>`
            }
            
            table.innerHTML += `
                <tr class="${rowClass}">
                    <td class="px-4 py-3">${accountName}</td>
                    <td class="px-4 py-3 font-semibold text-brand-teal">${indicators}${stock.ticker}${strategyBadge}</td>
                    <td class="px-4 py-3">${stock.trade_date}</td>
                    <td class="px-4 py-3 text-right">${stock.quantity}</td>
                    <td class="px-4 py-3 text-right">$${parseFloat(avgPrice).toFixed(3)}</td>
                    <td class="px-4 py-3 text-right">$${parseFloat(costBasis).toFixed(3)}</td>
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

// Generate account tabs for stock trades
async function generateStockAccountTabs(stocks) {
    const tabsContainer = document.getElementById('stock-account-tabs')
    if (!tabsContainer) return
    
    // Get unique accounts from stocks
    const accountMap = new Map()
    stocks.forEach(stock => {
        if (stock.account_id && stock.account_name) {
            accountMap.set(stock.account_id, stock.account_name)
        }
    })
    
    // Build tabs HTML
    let tabsHTML = ''
    
    // All Trades tab
    const allActive = currentStockAccountFilter === 'all' ? 'bg-brand-teal text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    tabsHTML += `
        <button onclick="filterStocksByAccount('all')" 
                class="px-4 py-2 rounded-lg font-medium transition-colors ${allActive}">
            All Trades (${stocks.length})
        </button>
    `
    
    // Individual account tabs
    accountMap.forEach((accountName, accountId) => {
        const accountStocks = stocks.filter(s => s.account_id === accountId)
        const isActive = currentStockAccountFilter === accountId ? 'bg-brand-teal text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        tabsHTML += `
            <button onclick="filterStocksByAccount(${accountId})" 
                    class="px-4 py-2 rounded-lg font-medium transition-colors ${isActive}">
                ${accountName} (${accountStocks.length})
            </button>
        `
    })
    
    tabsContainer.innerHTML = tabsHTML
}

// Filter stocks by account
function filterStocksByAccount(accountId) {
    currentStockAccountFilter = accountId
    loadStocks()
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
            const response = await api.get(`/api/stocks/${stockId}`)
            stock = response.data
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
                                <input type="number" step="0.001" name="price" id="price_input" min="0.001" class="stock-field w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition text-sm" required>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                    <i class="fas fa-receipt mr-1 text-purple-600"></i>Open Commission
                                </label>
                                <input type="number" step="0.01" name="commission" id="commission_input" value="0" min="0" class="stock-field w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition text-sm">
                            </div>
                        </div>
                    </div>

                    <!-- Strategy Type Section -->
                    <div class="bg-gradient-to-br from-purple-50 to-purple-100 p-3 rounded-lg border border-purple-300 mb-4">
                        <h4 class="text-sm font-bold text-purple-800 mb-3 flex items-center">
                            <i class="fas fa-bullseye mr-1"></i>Trading Strategy
                        </h4>
                        <div class="flex gap-6">
                            <label class="flex items-center cursor-pointer">
                                <input type="radio" name="strategy_type" value="STOCKPILING" class="mr-2" checked>
                                <span class="text-sm text-gray-700">Stockpiling</span>
                            </label>
                            <label class="flex items-center cursor-pointer">
                                <input type="radio" name="strategy_type" value="WHEEL" class="mr-2">
                                <span class="text-sm text-gray-700 flex items-center">
                                    <i class="fas fa-dharmachakra mr-1 text-purple-600"></i>Wheel Strategy
                                </span>
                            </label>
                            <label class="flex items-center cursor-pointer">
                                <input type="radio" name="strategy_type" value="DIVIDEND_ETFS" class="mr-2">
                                <span class="text-sm text-gray-700 flex items-center">
                                    <i class="fas fa-money-bill-wave mr-1 text-green-600"></i>Dividend ETFs
                                </span>
                            </label>
                        </div>
                        <p class="text-xs text-purple-700 mt-2">
                            <i class="fas fa-info-circle mr-1"></i>
                            Select "Wheel Strategy" for wheel trades (sell put → buy stock → sell covered call), or "Dividend ETFs" for dividend-focused investments
                        </p>
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
                    <!-- Profit/Loss Summary (Read-Only Display) -->
                    <div class="bg-gradient-to-br ${stock.profit_loss >= 0 ? 'from-green-50 to-green-100 border-green-300' : 'from-red-50 to-red-100 border-red-300'} p-4 rounded-lg border mb-4">
                        <h4 class="text-sm font-bold ${stock.profit_loss >= 0 ? 'text-green-800' : 'text-red-800'} mb-3 flex items-center">
                            <i class="fas ${stock.profit_loss >= 0 ? 'fa-check-circle' : 'fa-times-circle'} mr-2"></i>Trade Performance Summary
                        </h4>
                        <div class="space-y-2">
                            <!-- P/L Display -->
                            <div class="flex items-center justify-between py-2 border-b ${stock.profit_loss >= 0 ? 'border-green-200' : 'border-red-200'}">
                                <span class="text-sm font-semibold ${stock.profit_loss >= 0 ? 'text-green-900' : 'text-red-900'}">
                                    <i class="fas fa-chart-line mr-1"></i>Net Profit/Loss:
                                </span>
                                <span class="text-xl font-bold ${stock.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}">
                                    ${stock.profit_loss >= 0 ? '+' : ''}$${parseFloat(stock.profit_loss).toFixed(2)}
                                </span>
                            </div>
                            <!-- Trade Details -->
                            <div class="grid grid-cols-2 gap-2 text-xs">
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Opened:</span>
                                    <span class="font-semibold text-gray-800">${stock.trade_date}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Closed:</span>
                                    <span class="font-semibold text-gray-800">${stock.closed_date || 'N/A'}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Shares:</span>
                                    <span class="font-semibold text-gray-800">${stock.quantity}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Avg Price:</span>
                                    <span class="font-semibold text-gray-800">$${parseFloat(stock.price).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Closing Details (Editable) -->
                    <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-300 mb-4">
                        <h4 class="text-sm font-bold text-gray-800 mb-3 flex items-center">
                            <i class="fas fa-edit mr-1 text-blue-600"></i>Edit Closing Details
                        </h4>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">Close Date *</label>
                                <input type="date" name="close_date" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required>
                            </div>
                            <div>
                                <label class="block text-gray-700 font-semibold mb-1 text-sm">Close Price *</label>
                                <input type="number" step="0.001" name="close_price" min="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required>
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
            strategy_type: formData.get('strategy_type') || 'STOCKPILING',
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
        
        // Set strategy type radio button
        const strategyType = stock.strategy_type || 'STOCKPILING'
        const radioButton = form.querySelector(`input[name="strategy_type"][value="${strategyType}"]`)
        if (radioButton) radioButton.checked = true
        
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
        console.log('closeStock called with id:', id)
        
        // Fetch stock details
        const response = await api.get('/api/stocks')
        const stock = response.data.find(s => s.id === id)
        
        if (!stock) {
            alert('Stock not found')
            return
        }
        
        console.log('Stock found:', stock)
        
        // Check for open covered calls on this position
        const coveredCallsResponse = await api.get(`/api/stocks/${id}/covered-calls`)
        const coveredCalls = coveredCallsResponse.data || []
        const openCoveredCalls = coveredCalls.filter(cc => cc.is_open === 1)
        
        console.log('Covered calls:', coveredCalls, 'Open:', openCoveredCalls)
        
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
                                <input type="number" step="0.001" name="close_price" 
                                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-1 focus:ring-brand-teal focus:outline-none transition text-sm" 
                                    required placeholder="0.000">
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
            console.log('Close stock form submitted')
            
            const formData = new FormData(e.target)
            
            const data = {
                close_date: formData.get('close_date'),
                close_price: parseFloat(formData.get('close_price')),
                commission: parseFloat(formData.get('commission'))
            }
            
            console.log('Form data:', data)
            
            try {
                console.log('Calling API to close stock:', id)
                const response = await api.put(`/api/stocks/${id}/close`, data)
                console.log('API response:', response)
                
                modal.remove()
                
                // Close stock details modal if open
                const detailsModal = document.getElementById('stock-details-modal')
                if (detailsModal) detailsModal.remove()
                
                loadStocks()
                loadDashboard()
                alert('Position closed successfully!')
            } catch (error) {
                console.error('Error closing position:', error)
                console.error('Error response:', error.response)
                alert(error.response?.data?.error || 'Failed to close position')
            }
        })
    } catch (error) {
        console.error('Error loading stock for close:', error)
        alert('Failed to load stock details')
    }
}

// Close stock details modal and refresh stock trades view
function closeStockDetailsModal() {
    const modal = document.getElementById('stock-details-modal')
    if (modal) modal.remove()
    
    // Refresh stock trades view to update CC/DIV badges
    const stocksSection = document.getElementById('stocks-section')
    if (stocksSection && !stocksSection.classList.contains('hidden')) {
        loadStocks()
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
        
        // Fetch dividend history, covered call history, purchase history, and cost basis adjustments for this position
        const dividendHistoryPromise = api.get(`/api/stocks/${id}/dividends`).catch(() => ({ data: [] }))
        const missingDividendsPromise = api.get(`/api/stocks/${id}/missing-dividends`).catch(() => ({ data: [] }))
        const coveredCallHistoryPromise = api.get(`/api/stocks/${id}/covered-calls`).catch(() => ({ data: [] }))
        const purchaseHistoryPromise = api.get(`/api/stocks/${id}/purchase-history`).catch(() => ({ data: [] }))
        const costBasisAdjustmentsPromise = api.get(`/api/stocks/${id}/cost-basis-adjustments`).catch(() => ({ data: [] }))
        
        const [dividendHistory, missingDividendsResponse, coveredCallHistory, purchaseHistory, costBasisAdjustments] = await Promise.all([
            dividendHistoryPromise,
            missingDividendsPromise,
            coveredCallHistoryPromise,
            purchaseHistoryPromise,
            costBasisAdjustmentsPromise
        ])
        
        const dividends = dividendHistory.data || []
        const missingDividends = missingDividendsResponse.data || []
        const coveredCalls = coveredCallHistory.data || []
        const purchaseHistoryData = purchaseHistory.data || []
        const costBasisAdjustmentsData = costBasisAdjustments.data || []
        
        console.log('=== DIVIDEND DEBUG ===')
        console.log('Stock ID:', id)
        console.log('Stock ticker:', stock.ticker)
        console.log('Recorded dividends count:', dividends.length)
        console.log('Missing dividends response:', missingDividendsResponse)
        console.log('Missing dividends count:', missingDividends.length)
        console.log('Missing dividends data:', missingDividends)
        console.log('========================')
        
        // Calculate cost basis dynamically from ALL cost basis adjustments
        const avgPrice = stock.avg_price || stock.price
        const totalAdjustments = costBasisAdjustmentsData.reduce((sum, adj) => sum + adj.amount, 0)
        const costBasis = avgPrice - (totalAdjustments / stock.quantity)
        const adjustments = totalAdjustments
        
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.id = 'stock-details-modal'
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-0 max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <!-- Header -->
                <div class="flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-teal-700 to-teal-800">
                    <h3 class="text-2xl font-bold text-white">
                        <i class="fas fa-chart-line mr-2"></i>${stock.ticker} - Stock Trade Details
                    </h3>
                    <button onclick="closeStockDetailsModal()" class="text-white hover:text-teal-200">
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
                                    ${stock.strategy_type ? `<p class="text-sm opacity-90 font-medium">${stock.strategy_type === 'WHEEL' ? '🎯 Wheel Strategy' : stock.strategy_type === 'STOCKPILING' ? 'Stockpiling Strategy' : stock.strategy_type === 'DIVIDEND_ETFS' ? '💰 Dividend ETFs' : stock.strategy_type}</p>` : ''}
                                    <p class="text-sm opacity-90 ${stock.strategy_type ? 'mt-1' : ''}">${stock.account_name || 'N/A'} • Opened ${stock.trade_date}</p>
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
                        
                        <!-- Share Ownership History -->
                        <div class="mb-6">
                            <h4 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <i class="fas fa-chart-pie text-indigo-600 mr-2"></i>
                                Share Ownership History
                            </h4>
                            ${purchaseHistoryData.length > 0 ? `
                                <div class="overflow-x-auto bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl border-2 border-indigo-300 p-4">
                                    <table class="w-full text-sm">
                                        <thead class="bg-indigo-200 border-b-2 border-indigo-400">
                                            <tr>
                                                <th class="px-4 py-3 text-left text-indigo-800 font-semibold">Date</th>
                                                <th class="px-4 py-3 text-left text-indigo-800 font-semibold">Type</th>
                                                <th class="px-4 py-3 text-right text-indigo-800 font-semibold">Shares</th>
                                                <th class="px-4 py-3 text-right text-indigo-800 font-semibold">Price</th>
                                                <th class="px-4 py-3 text-right text-indigo-800 font-semibold">Total</th>
                                                <th class="px-4 py-3 text-center text-indigo-800 font-semibold">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-indigo-200">
                                            ${purchaseHistoryData.map(trade => {
                                                const total = trade.quantity * trade.price
                                                const typeColor = trade.trade_type === 'BUY' ? 'text-green-700' : 'text-red-700'
                                                const typeBg = trade.trade_type === 'BUY' ? 'bg-green-100' : 'bg-red-100'
                                                const statusColor = trade.is_open ? 'text-blue-700 bg-blue-100' : 'text-gray-600 bg-gray-100'
                                                const statusText = trade.is_open ? 'Open' : 'Closed'
                                                return `
                                                    <tr class="hover:bg-indigo-100">
                                                        <td class="px-4 py-3 text-gray-700">${trade.trade_date}</td>
                                                        <td class="px-4 py-3">
                                                            <span class="px-2 py-1 rounded ${typeBg} ${typeColor} font-semibold text-xs">
                                                                ${trade.trade_type}
                                                            </span>
                                                        </td>
                                                        <td class="px-4 py-3 text-right font-semibold text-gray-800">${trade.quantity}</td>
                                                        <td class="px-4 py-3 text-right text-gray-700">$${trade.price.toFixed(2)}</td>
                                                        <td class="px-4 py-3 text-right font-semibold text-gray-800">$${total.toFixed(2)}</td>
                                                        <td class="px-4 py-3 text-center">
                                                            <span class="px-2 py-1 rounded ${statusColor} text-xs font-medium">
                                                                ${statusText}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                `
                                            }).join('')}
                                        </tbody>
                                    </table>
                                    <div class="mt-4 pt-4 border-t-2 border-indigo-300 flex justify-between items-center">
                                        <p class="text-sm text-indigo-700 font-medium">
                                            <i class="fas fa-info-circle mr-1"></i>
                                            Showing all purchases/sales for ${stock.ticker} in ${stock.account_name || 'this account'}
                                        </p>
                                        <p class="text-sm text-indigo-700 font-semibold">
                                            Total Transactions: ${purchaseHistoryData.length}
                                        </p>
                                    </div>
                                </div>
                            ` : `
                                <div class="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border-2 border-gray-200">
                                    <i class="fas fa-inbox text-3xl mb-2"></i>
                                    <p>No purchase history recorded yet</p>
                                </div>
                            `}
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
                                                    <td class="px-4 py-2 text-center font-semibold">$${cc.strike_price.toFixed(3)}</td>
                                                    <td class="px-4 py-2 ${expirationClass}">${cc.expiration_date}${expirationWarning}</td>
                                                    <td class="px-4 py-2 text-right font-semibold text-green-600">$${cc.premium.toFixed(3)}</td>
                                                    <td class="px-4 py-2 text-center">${cc.quantity}</td>
                                                    <td class="px-4 py-2 text-right ${plClass}">${closedPL}</td>
                                                    <td class="px-4 py-2 text-center">
                                                        <span class="px-2 py-1 rounded text-xs ${cc.is_open ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}">
                                                            ${cc.is_open ? 'Open' : 'Closed'}
                                                        </span>
                                                    </td>
                                                    <td class="px-4 py-2 text-center">
                                                        ${cc.is_open ? `
                                                            <button onclick="editCoveredCall(${cc.id})" class="text-blue-600 hover:text-blue-800 mr-2" title="Edit">
                                                                <i class="fas fa-edit"></i>
                                                            </button>
                                                            <button onclick="closeCoveredCall(${cc.id}, ${id})" class="text-green-600 hover:text-green-800 mr-2" title="Close">
                                                                <i class="fas fa-check-circle"></i>
                                                            </button>
                                                            <button onclick="viewCoveredCallDetails(${cc.id})" class="text-brand-teal hover:text-brand-gold" title="View Details">
                                                                <i class="fas fa-eye"></i>
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
                            
                            <!-- Missing Dividends from Repository -->
                            ${missingDividends.length > 0 ? `
                                <div class="mb-4 bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
                                    <div class="flex items-center justify-between mb-3">
                                        <h5 class="text-md font-semibold text-amber-900 flex items-center">
                                            <i class="fas fa-exclamation-triangle text-amber-600 mr-2"></i>
                                            Missing Dividends from Repository
                                        </h5>
                                        <span class="text-xs bg-amber-200 text-amber-900 px-2 py-1 rounded font-semibold">
                                            ${missingDividends.length} found
                                        </span>
                                    </div>
                                    <p class="text-sm text-amber-800 mb-3">
                                        The following dividends were found in the dividend repository but not recorded for this position. 
                                        Click ADD to record them automatically.
                                    </p>
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-sm bg-white rounded border border-amber-200">
                                            <thead class="bg-amber-100">
                                                <tr>
                                                    <th class="px-4 py-2 text-left">Ex-Date</th>
                                                    <th class="px-4 py-2 text-left">Pay Date</th>
                                                    <th class="px-4 py-2 text-right">Per Share</th>
                                                    <th class="px-4 py-2 text-center">Shares</th>
                                                    <th class="px-4 py-2 text-right">Total Amount</th>
                                                    <th class="px-4 py-2 text-left">Frequency</th>
                                                    <th class="px-4 py-2 text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody class="divide-y divide-amber-100">
                                                ${missingDividends.map(div => {
                                                    const frequencyText = div.frequency === 52 ? 'Weekly' : 
                                                                         div.frequency === 12 ? 'Monthly' : 
                                                                         div.frequency === 4 ? 'Quarterly' : 
                                                                         div.frequency === 2 ? 'Semi-Annual' : 
                                                                         div.frequency === 1 ? 'Annual' : 
                                                                         div.frequency ? `${div.frequency}/year` : 'Unknown'
                                                    return `
                                                        <tr class="hover:bg-amber-50" id="missing-div-${div.id}">
                                                            <td class="px-4 py-2 font-semibold">${div.ex_date}</td>
                                                            <td class="px-4 py-2">${div.pay_date || 'N/A'}</td>
                                                            <td class="px-4 py-2 text-right">$${div.amount_per_share.toFixed(4)}</td>
                                                            <td class="px-4 py-2 text-center font-semibold">${div.shares_held}</td>
                                                            <td class="px-4 py-2 text-right font-semibold text-green-700">$${div.total_amount.toFixed(4)}</td>
                                                            <td class="px-4 py-2 text-gray-600">${frequencyText}</td>
                                                            <td class="px-4 py-2 text-center">
                                                                <button 
                                                                    onclick="addMissingDividend(${id}, ${JSON.stringify(div).replace(/"/g, '&quot;')})" 
                                                                    class="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs font-semibold mr-1"
                                                                    title="Add this dividend">
                                                                    <i class="fas fa-plus mr-1"></i>ADD
                                                                </button>
                                                                <button 
                                                                    onclick="editMissingDividend(${id}, ${JSON.stringify(div).replace(/"/g, '&quot;')})" 
                                                                    class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-semibold"
                                                                    title="Edit before adding">
                                                                    <i class="fas fa-edit mr-1"></i>EDIT
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    `
                                                }).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                    ${missingDividends.some(d => d.withholding_note) ? `
                                        <p class="text-xs text-amber-700 mt-3 flex items-start">
                                            <i class="fas fa-info-circle mr-1 mt-0.5"></i>
                                            <span>Amounts for CASH and TFSA accounts are shown after 20% withholding tax deduction.</span>
                                        </p>
                                    ` : ''}
                                </div>
                            ` : ''}
                            
                            <!-- Recorded Dividends -->
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
                                                    <td class="px-4 py-2 text-right font-semibold text-green-600">$${div.amount.toFixed(4)}</td>
                                                    <td class="px-4 py-2 text-right">$${(div.amount / stock.quantity).toFixed(4)}</td>
                                                    <td class="px-4 py-2 text-center">${stock.quantity}</td>
                                                    <td class="px-4 py-2 text-gray-600">${div.notes || '-'}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            ` : `
                                ${missingDividends.length === 0 ? `
                                    <div class="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                                        <i class="fas fa-inbox text-3xl mb-2"></i>
                                        <p>No dividend payments recorded yet</p>
                                        <button onclick="recordDividend(${id})" class="mt-3 text-brand-teal hover:underline">
                                            <i class="fas fa-plus mr-1"></i>Record Dividend
                                        </button>
                                    </div>
                                ` : ''}
                            `}
                        </div>
                        
                        <!-- Assignment History -->
                        ${(() => {
                            // Filter to show only SELLING_PUT adjustments
                            const assignmentAdjustments = costBasisAdjustmentsData.filter(adj => adj.adjustment_type === 'SELLING_PUT')
                            if (assignmentAdjustments.length === 0) return ''
                            
                            return `
                                <div class="mb-6">
                                    <h4 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                        <i class="fas fa-exchange-alt text-amber-600 mr-2"></i>
                                        Assignment History
                                    </h4>
                                    <div class="overflow-x-auto bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl border-2 border-amber-300 p-4">
                                        <table class="w-full text-sm">
                                            <thead class="bg-amber-200 border-b-2 border-amber-400">
                                                <tr>
                                                    <th class="px-4 py-3 text-left text-amber-800 font-semibold">Assignment Date</th>
                                                    <th class="px-4 py-3 text-right text-amber-800 font-semibold">Premium Credit</th>
                                                    <th class="px-4 py-3 text-left text-amber-800 font-semibold">Details</th>
                                                </tr>
                                            </thead>
                                            <tbody class="divide-y divide-amber-200">
                                                ${assignmentAdjustments.map(adj => `
                                                    <tr class="hover:bg-amber-100">
                                                        <td class="px-4 py-3 text-gray-700">${adj.adjustment_date}</td>
                                                        <td class="px-4 py-3 text-right font-semibold text-green-700">$${adj.amount.toFixed(2)}</td>
                                                        <td class="px-4 py-3 text-gray-600">${adj.notes || '-'}</td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                        <div class="mt-4 pt-4 border-t-2 border-amber-300 flex justify-between items-center">
                                            <p class="text-sm text-amber-800 font-medium">
                                                <i class="fas fa-info-circle mr-1"></i>
                                                Premium collected from assigned short puts reduces your cost basis
                                            </p>
                                            <p class="text-sm text-amber-800 font-semibold">
                                                Total: $${assignmentAdjustments.reduce((sum, adj) => sum + adj.amount, 0).toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            `
                        })()}
                    </div>
                </div>
            </div>
        `
        
        document.body.appendChild(modal)
        
        // Close modal when clicking the backdrop (not the content)
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeStockDetailsModal()
            }
        })
    } catch (error) {
        console.error('Error loading stock details:', error)
        alert('Failed to load stock details')
    }
}

// ============================================================================
// MISSING DIVIDEND FUNCTIONS
// ============================================================================

// Add a missing dividend immediately
// Refresh dividend sections in the Position Management modal without closing it
async function refreshDividendSections(holdingId) {
    try {
        // Fetch fresh data
        const stockResponse = await api.get('/api/stocks')
        const stock = stockResponse.data.find(s => s.id === holdingId)
        
        if (!stock) return
        
        const [dividendHistory, missingDividendsResponse] = await Promise.all([
            api.get(`/api/stocks/${holdingId}/dividends`).catch(() => ({ data: [] })),
            api.get(`/api/stocks/${holdingId}/missing-dividends`).catch(() => ({ data: [] }))
        ])
        
        const dividends = dividendHistory.data || []
        const missingDividends = missingDividendsResponse.data || []
        
        // Find the dividend history container
        const modal = document.getElementById('stock-details-modal')
        if (!modal) return
        
        // Find and replace the dividend sections
        const mainContent = modal.querySelector('.overflow-y-auto.p-6')
        if (!mainContent) return
        
        // Build the new dividend history HTML
        const newDividendHTML = `
            <div class="mb-6">
                <h4 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <i class="fas fa-dollar-sign text-brand-gold mr-2"></i>
                    Dividend History
                </h4>
                
                <!-- Missing Dividends from Repository -->
                ${missingDividends.length > 0 ? `
                    <div class="mb-4 bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
                        <div class="flex items-center justify-between mb-3">
                            <h5 class="text-md font-semibold text-amber-900 flex items-center">
                                <i class="fas fa-exclamation-triangle text-amber-600 mr-2"></i>
                                Missing Dividends from Repository
                            </h5>
                            <span class="text-xs bg-amber-200 text-amber-900 px-2 py-1 rounded font-semibold">
                                ${missingDividends.length} found
                            </span>
                        </div>
                        <p class="text-sm text-amber-800 mb-3">
                            The following dividends were found in the dividend repository but not recorded for this position. 
                            Click ADD to record them automatically.
                        </p>
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm bg-white rounded border border-amber-200">
                                <thead class="bg-amber-100">
                                    <tr>
                                        <th class="px-4 py-2 text-left">Ex-Date</th>
                                        <th class="px-4 py-2 text-left">Pay Date</th>
                                        <th class="px-4 py-2 text-right">Per Share</th>
                                        <th class="px-4 py-2 text-center">Shares</th>
                                        <th class="px-4 py-2 text-right">Total Amount</th>
                                        <th class="px-4 py-2 text-left">Frequency</th>
                                        <th class="px-4 py-2 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-amber-100">
                                    ${missingDividends.map(div => {
                                        const frequencyText = div.frequency === 52 ? 'Weekly' : 
                                                             div.frequency === 12 ? 'Monthly' : 
                                                             div.frequency === 4 ? 'Quarterly' : 
                                                             div.frequency === 2 ? 'Semi-Annual' : 
                                                             div.frequency === 1 ? 'Annual' : 
                                                             div.frequency ? `${div.frequency}/year` : 'Unknown'
                                        return `
                                            <tr class="hover:bg-amber-50" id="missing-div-${div.id}">
                                                <td class="px-4 py-2 font-semibold">${div.ex_date}</td>
                                                <td class="px-4 py-2">${div.pay_date || 'N/A'}</td>
                                                <td class="px-4 py-2 text-right">$${div.amount_per_share.toFixed(4)}</td>
                                                <td class="px-4 py-2 text-center font-semibold">${div.shares_held}</td>
                                                <td class="px-4 py-2 text-right font-semibold text-green-700">$${div.total_amount.toFixed(4)}</td>
                                                <td class="px-4 py-2 text-gray-600">${frequencyText}</td>
                                                <td class="px-4 py-2 text-center">
                                                    <button 
                                                        onclick="addMissingDividend(${holdingId}, ${JSON.stringify(div).replace(/"/g, '&quot;')})" 
                                                        class="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs font-semibold mr-1"
                                                        title="Add this dividend">
                                                        <i class="fas fa-plus mr-1"></i>ADD
                                                    </button>
                                                    <button 
                                                        onclick="editMissingDividend(${holdingId}, ${JSON.stringify(div).replace(/"/g, '&quot;')})" 
                                                        class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-semibold"
                                                        title="Edit before adding">
                                                        <i class="fas fa-edit mr-1"></i>EDIT
                                                    </button>
                                                </td>
                                            </tr>
                                        `
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                        ${missingDividends.some(d => d.withholding_note) ? `
                            <p class="text-xs text-amber-700 mt-3 flex items-start">
                                <i class="fas fa-info-circle mr-1 mt-0.5"></i>
                                <span>Amounts for CASH and TFSA accounts are shown after 20% withholding tax deduction.</span>
                            </p>
                        ` : ''}
                    </div>
                ` : ''}
                
                <!-- Recorded Dividends -->
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
                                        <td class="px-4 py-2 text-right font-semibold text-green-600">$${div.amount.toFixed(4)}</td>
                                        <td class="px-4 py-2 text-right">$${(div.amount / stock.quantity).toFixed(4)}</td>
                                        <td class="px-4 py-2 text-center">${stock.quantity}</td>
                                        <td class="px-4 py-2 text-gray-600">${div.notes || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : `
                    ${missingDividends.length === 0 ? `
                        <div class="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                            <i class="fas fa-inbox text-3xl mb-2"></i>
                            <p>No dividend payments recorded yet</p>
                            <button onclick="recordDividend(${holdingId})" class="mt-3 text-brand-teal hover:underline">
                                <i class="fas fa-plus mr-1"></i>Record Dividend
                            </button>
                        </div>
                    ` : ''}
                `}
            </div>
        `
        
        // Find the existing dividend history section and replace it
        const existingDividendSection = mainContent.querySelector('.mb-6:has(h4 .fa-dollar-sign)')
        if (existingDividendSection) {
            const tempDiv = document.createElement('div')
            tempDiv.innerHTML = newDividendHTML
            existingDividendSection.replaceWith(tempDiv.firstElementChild)
        }
        
    } catch (error) {
        console.error('Error refreshing dividend sections:', error)
    }
}

async function addMissingDividend(holdingId, dividend) {
    try {
        const confirmed = confirm(
            `Add dividend for ${dividend.ticker}?\n\n` +
            `Ex-Date: ${dividend.ex_date}\n` +
            `Pay Date: ${dividend.pay_date || 'N/A'}\n` +
            `Shares: ${dividend.shares_held}\n` +
            `Amount: $${dividend.total_amount.toFixed(4)}${dividend.withholding_note}`
        )
        
        if (!confirmed) return
        
        const payload = {
            dividend_repo_id: dividend.id,
            ex_date: dividend.ex_date,
            pay_date: dividend.pay_date,
            total_amount: dividend.total_amount,
            withholding_note: dividend.withholding_note
        }
        
        await api.post(`/api/stocks/${holdingId}/add-missing-dividend`, payload)
        
        showNotification('Dividend added successfully!', 'success')
        
        // Flash the row green before refreshing
        const row = document.getElementById(`missing-div-${dividend.id}`)
        if (row) {
            row.style.backgroundColor = '#d4edda'
        }
        
        // Refresh just the dividend sections without closing the modal
        setTimeout(() => {
            refreshDividendSections(holdingId)
        }, 500)
    } catch (error) {
        console.error('Error adding missing dividend:', error)
        showNotification(error.response?.data?.error || 'Failed to add dividend', 'error')
    }
}

// Edit a missing dividend before adding
async function editMissingDividend(holdingId, dividend) {
    // Close the stock details modal
    const detailsModal = document.getElementById('stock-details-modal')
    if (detailsModal) detailsModal.remove()
    
    // Create edit modal
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
    modal.id = 'edit-missing-dividend-modal'
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 border-b border-blue-800 px-6 py-4 flex justify-between items-center">
                <h3 class="text-2xl font-bold text-white">
                    <i class="fas fa-edit mr-2"></i>Edit Dividend Before Adding
                </h3>
                <button onclick="this.closest('.fixed').remove(); showStockDetails(${holdingId})" class="text-white hover:text-blue-200">
                    <i class="fas fa-times text-2xl"></i>
                </button>
            </div>
            
            <div class="p-6 space-y-4">
                <!-- Ticker (read-only) -->
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 class="font-semibold text-blue-900 mb-2">Stock Information</h4>
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <span class="text-gray-600">Ticker:</span>
                            <span class="font-semibold text-gray-900 ml-2">${dividend.ticker}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">Shares Held:</span>
                            <span class="font-semibold text-gray-900 ml-2">${dividend.shares_held}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">Per Share:</span>
                            <span class="font-semibold text-gray-900 ml-2">$${dividend.amount_per_share.toFixed(4)}</span>
                        </div>
                        <div>
                            <span class="text-gray-600">Account:</span>
                            <span class="font-semibold text-gray-900 ml-2">${dividend.account_type}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Ex-Date -->
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">
                        Ex-Dividend Date <span class="text-red-500">*</span>
                    </label>
                    <input type="date" id="edit-missing-ex-date" value="${dividend.ex_date}" 
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600" />
                    <p class="text-xs text-gray-500 mt-1">Date when stock trades without dividend</p>
                </div>
                
                <!-- Pay Date -->
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Pay Date</label>
                    <input type="date" id="edit-missing-pay-date" value="${dividend.pay_date || ''}" 
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600" />
                    <p class="text-xs text-gray-500 mt-1">Date when dividend is paid (optional)</p>
                </div>
                
                <!-- Total Amount -->
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">
                        Total Amount <span class="text-red-500">*</span>
                    </label>
                    <input type="number" id="edit-missing-total-amount" value="${dividend.total_amount.toFixed(4)}" step="0.0001" 
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600" />
                    <p class="text-xs text-gray-500 mt-1">
                        Calculated: ${dividend.shares_held} shares × $${dividend.amount_per_share.toFixed(4)}${dividend.withholding_note ? dividend.withholding_note : ''}
                    </p>
                </div>
                
                <!-- Buttons -->
                <div class="flex gap-3 justify-end pt-4 border-t">
                    <button onclick="this.closest('.fixed').remove(); showStockDetails(${holdingId})" 
                            class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400">
                        <i class="fas fa-times mr-2"></i>Cancel
                    </button>
                    <button onclick="saveEditedMissingDividend(${holdingId}, ${dividend.id}, '${dividend.withholding_note}')" 
                            class="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
                        <i class="fas fa-save mr-2"></i>Save & Add
                    </button>
                </div>
            </div>
        </div>
    `
    
    document.body.appendChild(modal)
}

// Save edited missing dividend
async function saveEditedMissingDividend(holdingId, dividendId, withholdingNote) {
    try {
        const exDate = document.getElementById('edit-missing-ex-date').value
        const payDate = document.getElementById('edit-missing-pay-date').value
        const totalAmount = parseFloat(document.getElementById('edit-missing-total-amount').value)
        
        if (!exDate || !totalAmount) {
            showNotification('Ex-date and total amount are required', 'error')
            return
        }
        
        const payload = {
            dividend_repo_id: dividendId,
            ex_date: exDate,
            pay_date: payDate || null,
            total_amount: totalAmount,
            withholding_note: withholdingNote
        }
        
        await api.post(`/api/stocks/${holdingId}/add-missing-dividend`, payload)
        
        showNotification('Dividend added successfully!', 'success')
        
        // Close edit modal
        const modal = document.getElementById('edit-missing-dividend-modal')
        if (modal) modal.remove()
        
        // Refresh dividend sections without closing the main modal
        refreshDividendSections(holdingId)
    } catch (error) {
        console.error('Error saving edited dividend:', error)
        showNotification(error.response?.data?.error || 'Failed to add dividend', 'error')
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
        const detailsModal = document.getElementById('stock-details-modal')
        if (detailsModal) detailsModal.remove()
        
        // Get accounts for the dropdown
        const accountsResponse = await api.get('/api/accounts')
        const accounts = accountsResponse.data.accounts || accountsResponse.data
        
        // Show add to position form
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.id = 'add-position-modal'
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <!-- Header -->
                <div class="bg-gradient-to-r from-green-600 to-green-700 text-white p-4 sticky top-0 z-10">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-2xl font-bold flex items-center">
                                <i class="fas fa-plus-circle mr-2"></i>Add to Position - ${stock.ticker}
                            </h3>
                            <p class="text-green-100 text-sm">Buy Additional Shares</p>
                        </div>
                        <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-green-200 text-xl">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Content -->
                <div class="p-4">
                    <form id="addPositionForm">
                        <input type="hidden" name="company_id" value="${stock.company_id}">
                        <input type="hidden" name="account_id" value="${stock.account_id}">
                        <input type="hidden" name="trade_type" value="BUY">
                        
                        <!-- Current Position Summary -->
                        <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-300 mb-4">
                            <h4 class="text-sm font-bold text-gray-800 mb-3 flex items-center">
                                <i class="fas fa-info-circle mr-1 text-blue-600"></i>Current Position
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                <div>
                                    <p class="text-gray-600">Shares Held</p>
                                    <p class="font-semibold text-gray-900">${stock.quantity} shares</p>
                                </div>
                                <div>
                                    <p class="text-gray-600">Average Price</p>
                                    <p class="font-semibold text-gray-900">$${(stock.avg_price || stock.price).toFixed(2)}</p>
                                </div>
                                <div>
                                    <p class="text-gray-600">Account</p>
                                    <p class="font-semibold text-gray-900">${stock.account_name}</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Purchase Details Section -->
                        <div class="bg-gradient-to-br from-green-50 to-green-100 p-3 rounded-lg border border-green-300 mb-4">
                            <h4 class="text-sm font-bold text-green-800 mb-3 flex items-center">
                                <i class="fas fa-shopping-cart mr-1"></i>Purchase Details
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                        <i class="fas fa-hashtag mr-1 text-green-600"></i>Additional Shares *
                                    </label>
                                    <input type="number" name="quantity" min="1" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-green-600 focus:ring-1 focus:ring-green-600 focus:outline-none transition text-sm" required>
                                    <small class="text-gray-500 text-xs">Number of shares to purchase</small>
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                        <i class="fas fa-dollar-sign mr-1 text-green-600"></i>Price per Share *
                                    </label>
                                    <input type="number" step="0.01" name="price" min="0.01" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-green-600 focus:ring-1 focus:ring-green-600 focus:outline-none transition text-sm" required>
                                    <small class="text-gray-500 text-xs">Purchase price per share</small>
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                        <i class="fas fa-calendar mr-1 text-blue-600"></i>Trade Date *
                                    </label>
                                    <input type="date" name="trade_date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-green-600 focus:ring-1 focus:ring-green-600 focus:outline-none transition text-sm" required value="${new Date().toISOString().split('T')[0]}">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                        <i class="fas fa-receipt mr-1 text-purple-600"></i>Commission
                                    </label>
                                    <input type="number" step="0.01" name="commission" value="0" min="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-green-600 focus:ring-1 focus:ring-green-600 focus:outline-none transition text-sm">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Notes Section -->
                        <div class="bg-gradient-to-br from-yellow-50 to-yellow-100 p-3 rounded-lg border border-yellow-300 mb-4">
                            <h4 class="text-sm font-bold text-yellow-800 mb-3 flex items-center">
                                <i class="fas fa-sticky-note mr-1"></i>Notes (Optional)
                            </h4>
                            <textarea name="notes" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-yellow-600 focus:ring-1 focus:ring-yellow-600 focus:outline-none transition text-sm" rows="2" placeholder="Optional notes about this purchase"></textarea>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="flex gap-3">
                            <button type="submit" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition">
                                <i class="fas fa-plus mr-2"></i>Add to Position
                            </button>
                            <button type="button" onclick="this.closest('.fixed').remove(); showStockDetails(${stockId})" class="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition">
                                <i class="fas fa-times mr-2"></i>Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `
        
        document.body.appendChild(modal)
        
        // Handle form submission
        document.getElementById('addPositionForm').addEventListener('submit', async (e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            
            const data = {
                company_id: parseInt(formData.get('company_id')),
                account_id: parseInt(formData.get('account_id')),
                ticker: stock.ticker,
                trade_type: formData.get('trade_type'),
                quantity: parseInt(formData.get('quantity')),
                price: parseFloat(formData.get('price')),
                trade_date: formData.get('trade_date'),
                commission: parseFloat(formData.get('commission')) || 0,
                notes: formData.get('notes')
            }
            
            try {
                await api.post('/api/stocks', data)
                modal.remove()
                loadStocks()
                loadDashboard()
                alert('Successfully added to position!')
                showStockDetails(stockId)
            } catch (error) {
                alert(error.response?.data?.error || 'Failed to add to position')
            }
        })
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
        const detailsModal = document.getElementById('stock-details-modal')
        if (detailsModal) detailsModal.remove()
        
        // Get accounts for the dropdown
        const accountsResponse = await api.get('/api/accounts')
        const accounts = accountsResponse.data.accounts || accountsResponse.data
        
        // Show sell from position form
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.id = 'sell-position-modal'
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <!-- Header -->
                <div class="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4 sticky top-0 z-10">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-2xl font-bold flex items-center">
                                <i class="fas fa-minus-circle mr-2"></i>Sell from Position - ${stock.ticker}
                            </h3>
                            <p class="text-orange-100 text-sm">Reduce Position Size</p>
                        </div>
                        <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-orange-200 text-xl">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Content -->
                <div class="p-4">
                    <form id="sellPositionForm">
                        <input type="hidden" name="company_id" value="${stock.company_id}">
                        <input type="hidden" name="account_id" value="${stock.account_id}">
                        <input type="hidden" name="trade_type" value="SELL">
                        
                        <!-- Current Position Summary -->
                        <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-300 mb-4">
                            <h4 class="text-sm font-bold text-gray-800 mb-3 flex items-center">
                                <i class="fas fa-info-circle mr-1 text-blue-600"></i>Current Position
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                                <div>
                                    <p class="text-gray-600">Shares Held</p>
                                    <p class="font-semibold text-gray-900">${stock.quantity} shares</p>
                                </div>
                                <div>
                                    <p class="text-gray-600">Average Price</p>
                                    <p class="font-semibold text-gray-900">$${(stock.avg_price || stock.price).toFixed(2)}</p>
                                </div>
                                <div>
                                    <p class="text-gray-600">Cost Basis</p>
                                    <p class="font-semibold text-gray-900">$${(stock.cost_basis || stock.price).toFixed(2)}</p>
                                </div>
                                <div>
                                    <p class="text-gray-600">Account</p>
                                    <p class="font-semibold text-gray-900">${stock.account_name}</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Sale Details Section -->
                        <div class="bg-gradient-to-br from-orange-50 to-orange-100 p-3 rounded-lg border border-orange-300 mb-4">
                            <h4 class="text-sm font-bold text-orange-800 mb-3 flex items-center">
                                <i class="fas fa-hand-holding-usd mr-1"></i>Sale Details
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                        <i class="fas fa-hashtag mr-1 text-orange-600"></i>Shares to Sell *
                                    </label>
                                    <input type="number" name="quantity" min="1" max="${stock.quantity}" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-600 focus:ring-1 focus:ring-orange-600 focus:outline-none transition text-sm" required>
                                    <small class="text-gray-500 text-xs">Maximum: ${stock.quantity} shares</small>
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                        <i class="fas fa-dollar-sign mr-1 text-orange-600"></i>Sale Price per Share *
                                    </label>
                                    <input type="number" step="0.01" name="price" min="0.01" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-600 focus:ring-1 focus:ring-orange-600 focus:outline-none transition text-sm" required>
                                    <small class="text-gray-500 text-xs">Selling price per share</small>
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                        <i class="fas fa-calendar mr-1 text-blue-600"></i>Trade Date *
                                    </label>
                                    <input type="date" name="trade_date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-600 focus:ring-1 focus:ring-orange-600 focus:outline-none transition text-sm" required value="${new Date().toISOString().split('T')[0]}">
                                </div>
                                <div>
                                    <label class="block text-gray-700 font-semibold mb-1 text-sm">
                                        <i class="fas fa-receipt mr-1 text-purple-600"></i>Commission
                                    </label>
                                    <input type="number" step="0.01" name="commission" value="0" min="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-orange-600 focus:ring-1 focus:ring-orange-600 focus:outline-none transition text-sm">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Notes Section -->
                        <div class="bg-gradient-to-br from-yellow-50 to-yellow-100 p-3 rounded-lg border border-yellow-300 mb-4">
                            <h4 class="text-sm font-bold text-yellow-800 mb-3 flex items-center">
                                <i class="fas fa-sticky-note mr-1"></i>Notes (Optional)
                            </h4>
                            <textarea name="notes" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-yellow-600 focus:ring-1 focus:ring-yellow-600 focus:outline-none transition text-sm" rows="2" placeholder="e.g., Partial sale, profit-taking, rebalancing"></textarea>
                        </div>
                        
                        <!-- Warning Section -->
                        <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-lg border border-blue-300 mb-4">
                            <h4 class="text-xs font-bold text-blue-800 mb-2 flex items-center">
                                <i class="fas fa-info-circle mr-1"></i>Important Information
                            </h4>
                            <p class="text-xs text-blue-700">
                                This will create a SELL trade and reduce your position. If selling all shares, consider using <strong>"Close Position"</strong> instead for proper position closure.
                            </p>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="flex gap-3">
                            <button type="submit" class="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-6 rounded-lg transition">
                                <i class="fas fa-minus mr-2"></i>Sell Shares
                            </button>
                            <button type="button" onclick="this.closest('.fixed').remove(); showStockDetails(${stockId})" class="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition">
                                <i class="fas fa-times mr-2"></i>Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `
        
        document.body.appendChild(modal)
        
        // Handle form submission
        document.getElementById('sellPositionForm').addEventListener('submit', async (e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            
            const quantity = parseInt(formData.get('quantity'))
            
            // Validate quantity
            if (quantity > stock.quantity) {
                alert(`Cannot sell more than ${stock.quantity} shares`)
                return
            }
            
            const data = {
                company_id: parseInt(formData.get('company_id')),
                account_id: parseInt(formData.get('account_id')),
                ticker: stock.ticker,
                trade_type: formData.get('trade_type'),
                quantity: quantity,
                price: parseFloat(formData.get('price')),
                trade_date: formData.get('trade_date'),
                commission: parseFloat(formData.get('commission')) || 0,
                notes: formData.get('notes')
            }
            
            try {
                await api.post('/api/stocks', data)
                modal.remove()
                loadStocks()
                loadDashboard()
                alert('Successfully sold shares from position!')
                showStockDetails(stockId)
            } catch (error) {
                alert(error.response?.data?.error || 'Failed to sell from position')
            }
        })
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
                        <input type="number" step="0.0001" name="amount" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                        <small class="text-gray-500">Total dividend received (4 decimal places)</small>
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
                            <input type="number" step="0.001" name="strike_price" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-2 focus:ring-brand-teal focus:outline-none" required>
                        </div>
                        
                        <div>
                            <label class="block text-gray-700 font-semibold mb-2">Premium Per Share *</label>
                            <input type="number" step="0.001" name="premium" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-2 focus:ring-brand-teal focus:outline-none" required>
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
                                <i class="fas fa-info-circle mr-1"></i>$${cc.premium.toFixed(3)}/share × ${cc.quantity} contracts × 100 shares
                            </p>
                        </div>
                        <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-xl border-2 border-blue-300">
                            <p class="text-sm text-blue-700 mb-1 font-medium">Strike Price</p>
                            <p class="text-3xl font-bold text-blue-700">$${cc.strike_price.toFixed(3)}</p>
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
        
        // Close the stock details modal
        const detailsModal = document.getElementById('stock-details-modal')
        if (detailsModal) detailsModal.remove()
        
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
                            <input type="number" step="0.001" name="strike_price" class="w-full px-4 py-2 border border-gray-300 rounded-lg" required value="${cc.strike_price}">
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
                                <input type="number" step="0.001" name="close_price" class="w-full px-4 py-2 border border-gray-300 rounded-lg" ${!cc.is_open ? 'required' : ''} value="${cc.close_price || ''}">
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
                        <button type="button" onclick="this.closest('.fixed').remove(); showStockDetails(${stockId})" class="btn-secondary flex-1">Cancel</button>
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
                    notes: formData.get('notes') || null,
                    holding_id: stockId  // Pass holding_id to ensure correct account_id is set
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
                if (stockId) {
                    showStockDetails(stockId)
                }
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
        
        // Close the stock details modal
        const detailsModal = document.getElementById('stock-details-modal')
        if (detailsModal) detailsModal.remove()
        
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
                        <button onclick="this.closest('.fixed').remove(); showStockDetails(${stockId})" class="text-white hover:text-yellow-200 text-xl">
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
                                <p class="font-semibold text-gray-900">$${cc.strike_price.toFixed(3)}</p>
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
                                <input type="number" step="0.001" name="close_price" 
                                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-brand-teal focus:ring-1 focus:ring-brand-teal focus:outline-none transition text-sm" 
                                    required placeholder="0.000" value="0">
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
                            <button type="button" onclick="this.closest('.fixed').remove(); showStockDetails(${stockId})" class="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg hover:shadow-xl transform hover:scale-105">
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
    { value: 'SELLING_PUT_WHEEL', label: 'Short Put (Wheel)' },
    { value: 'SELLING_PUT_LONG_TERM', label: 'Short Put (Long Term)' },
    { value: 'BUYING_PUT', label: 'Long Put' },
    { value: 'LONG_CALL', label: 'Long Call' },
    { value: 'COVERED_CALL', label: 'Covered Call' },
    { value: 'CREDIT_SPREAD', label: 'Credit Spread' },
    { value: 'DEBIT_SPREAD', label: 'Debit Spread' },
    { value: 'IRON_CONDOR', label: 'Iron Condor' }
]

// Helper function to get strategy configuration
function getStrategyConfig(strategyType) {
    const configs = {
        'SELLING_PUT': { legs: 1, isPremiumCredit: true },
        'SELLING_PUT_WHEEL': { legs: 1, isPremiumCredit: true },
        'SELLING_PUT_LONG_TERM': { legs: 1, isPremiumCredit: true },
        'BUYING_PUT': { legs: 1, isPremiumCredit: false },
        'LONG_CALL': { legs: 1, isPremiumCredit: false },
        'COVERED_CALL': { legs: 1, isPremiumCredit: true },
        'CREDIT_SPREAD': { legs: 2, isPremiumCredit: true },
        'DEBIT_SPREAD': { legs: 2, isPremiumCredit: false },
        'IRON_CONDOR': { legs: 4, isPremiumCredit: true }
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
        const filteredOptions = allOptions
            .filter(o => o.strategy_type === currentStrategyFilter)
            .sort((a, b) => {
                // Sort by expiration date ascending (earliest first)
                const dateA = new Date(a.expiration_date)
                const dateB = new Date(b.expiration_date)
                return dateA - dateB
            })
        
        // Render table
        const table = document.getElementById('options-table')
        table.innerHTML = ''
        
        // Update table header based on strategy
        const tableHeader = table.closest('table').querySelector('thead tr')
        const isCoveredCallTab = currentStrategyFilter === 'COVERED_CALL'
        
        // For covered calls, need to add Account column before Actions
        if (isCoveredCallTab) {
            // Check if Account column already exists
            const existingAccountHeader = tableHeader.querySelector('th:nth-last-child(2)')
            if (existingAccountHeader.textContent !== 'Account') {
                // Insert Account column before Actions
                const actionsHeader = tableHeader.querySelector('th:last-child')
                const accountHeader = document.createElement('th')
                accountHeader.className = 'px-4 py-3 text-center'
                accountHeader.textContent = 'Account'
                tableHeader.insertBefore(accountHeader, actionsHeader)
            }
        } else {
            // Remove Account column if it exists
            const headers = tableHeader.querySelectorAll('th')
            if (headers.length > 9) {
                const accountHeader = tableHeader.querySelector('th:nth-last-child(2)')
                if (accountHeader.textContent === 'Account') {
                    accountHeader.remove()
                }
            }
        }
        
        // Set Actions header text
        const lastHeaderCell = tableHeader.querySelector('th:last-child')
        lastHeaderCell.textContent = 'Actions'
        
        if (filteredOptions.length === 0) {
            const strategyName = STRATEGY_TYPES.find(st => st.value === currentStrategyFilter)?.label || 'this strategy'
            const colspanCount = isCoveredCallTab ? 10 : 9
            table.innerHTML = `<tr><td colspan="${colspanCount}" class="text-center py-4 text-gray-500">No open option trades found for ${strategyName}</td></tr>`
            return
        }
        
        filteredOptions.forEach(option => {
            const strategyLabel = STRATEGY_TYPES.find(st => st.value === option.strategy_type)?.label || option.strategy_type.replace(/_/g, ' ')
            const accountDisplay = option.account_name ? `${option.account_name} (${option.account_type_name || option.account_type})` : (option.account_type || 'N/A')
            
            table.innerHTML += `
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-4 py-3">${option.trade_date}</td>
                    <td class="px-4 py-3 font-semibold text-brand-teal">${option.ticker}</td>
                    <td class="px-4 py-3">${strategyLabel}</td>
                    <td class="px-4 py-3 text-right">$${parseFloat(option.strike_price).toFixed(3)}</td>
                    <td class="px-4 py-3 text-right">$${parseFloat(option.premium).toFixed(3)}</td>
                    <td class="px-4 py-3 text-center font-semibold">${option.quantity}</td>
                    <td class="px-4 py-3">${option.expiration_date}</td>
                    <td class="px-4 py-3 text-center">
                        <span class="px-2 py-1 rounded ${option.is_open ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}">
                            ${option.is_open ? 'Open' : 'Closed'}
                        </span>
                    </td>
                    ${option.strategy_type === 'COVERED_CALL' ? 
                        `<td class="px-4 py-3 text-center">
                            <span class="text-gray-700 font-medium">${accountDisplay}</span>
                        </td>
                        <td class="px-4 py-3 text-center">
                            <button onclick="deleteOption(${option.id})" class="text-red-600 hover:text-red-800 font-semibold" title="Delete Covered Call">
                                <i class="fas fa-trash mr-1"></i>Delete
                            </button>
                        </td>` :
                        `<td class="px-4 py-3 text-center">
                            <button onclick="manageOption(${option.id})" class="text-brand-teal hover:text-brand-gold mr-2 font-semibold" title="Manage Trade">
                                <i class="fas fa-cog mr-1"></i>Manage
                            </button>
                            <button onclick="deleteOption(${option.id})" class="text-red-600 hover:text-red-800 font-semibold" title="Delete Trade">
                                <i class="fas fa-trash mr-1"></i>Delete
                            </button>
                        </td>`
                    }
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
                                        <option value="SELLING_PUT">Short Put (Stockpiling)</option>
                                        <option value="SELLING_PUT_WHEEL">Short Put (Wheel)</option>
                                        <option value="SELLING_PUT_LONG_TERM">Short Put (Long Term)</option>
                                        <option value="BUYING_PUT">Long Put</option>
                                        <option value="LONG_CALL">Long Call</option>
                                        <option value="CREDIT_SPREAD">Credit Spread</option>
                                        <option value="DEBIT_SPREAD">Debit Spread</option>
                                        <option value="IRON_CONDOR">Iron Condor</option>
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
                                <input type="number" step="0.001" name="close_price" min="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required>
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
        'SELLING_PUT_WHEEL': {
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
        
        // Save current field values before re-rendering
        const currentValues = {}
        config.fields.forEach(field => {
            const input = document.getElementById(`${field}_input`)
            if (input) {
                currentValues[field] = input.value
            }
        })
        
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
        
        // Restore saved field values
        config.fields.forEach(field => {
            if (currentValues[field] !== undefined) {
                const input = document.getElementById(`${field}_input`)
                if (input) {
                    input.value = currentValues[field]
                }
            }
        })
        
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

async function assignStockPosition(optionId) {
    try {
        // Fetch option details
        const response = await api.get('/api/options')
        const option = response.data.find(o => o.id === optionId)
        
        if (!option) {
            alert('Option trade not found')
            return
        }
        
        // Validate this is a short put strategy
        if (option.strategy_type !== 'SELLING_PUT' && option.strategy_type !== 'SELLING_PUT_WHEEL') {
            alert('Assignment is only available for Short Put strategies')
            return
        }
        
        // Fetch accounts for display
        const accountsResponse = await api.get('/api/accounts')
        const accounts = accountsResponse.data.accounts || accountsResponse.data
        const account = accounts.find(a => a.id === option.account_id)
        const accountDisplay = account ? `${account.account_name} (${account.account_type})` : option.account_type || 'N/A'
        
        // Calculate shares (contracts * 100)
        const shares = option.quantity * 100
        
        // Strike price becomes stock purchase price
        const strikePrice = parseFloat(option.strike_price)
        
        // Calculate premium collected (reduces cost basis)
        // Net proceeds = (Premium per share * contracts * 100) - commission
        const premium = parseFloat(option.premium)
        const commission = parseFloat(option.commission || 0)
        const grossPremium = premium * option.quantity * 100
        const netProceeds = grossPremium - commission
        const adjustedCostBasis = strikePrice - (netProceeds / shares)
        
        // Determine strategy type based on option strategy
        const strategyType = option.strategy_type === 'SELLING_PUT_WHEEL' ? 'WHEEL' : 'STOCKPILING'
        
        // Calculate default assignment date: earlier of expiration date or today
        const today = new Date()
        const expirationDate = new Date(option.expiration_date)
        const defaultDate = expirationDate < today ? expirationDate : today
        const defaultDateString = defaultDate.toISOString().split('T')[0]
        
        // Create assignment modal
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <!-- Header -->
                <div class="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-6">
                    <h3 class="text-2xl font-bold flex items-center">
                        <i class="fas fa-exchange-alt mr-3"></i>Assign Stock Position
                    </h3>
                    <p class="text-amber-100 text-sm mt-2">Close option and create stock position from assignment</p>
                </div>
                
                <!-- Content with Scroll -->
                <div class="p-6 overflow-y-auto">
                    <!-- Assignment Summary -->
                    <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-300 mb-6">
                        <h4 class="text-sm font-bold text-blue-900 mb-3 flex items-center">
                            <i class="fas fa-info-circle mr-2"></i>Assignment Summary
                        </h4>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p class="text-gray-600">Ticker</p>
                                <p class="font-bold text-gray-900">${option.ticker}</p>
                            </div>
                            <div>
                                <p class="text-gray-600">Strategy</p>
                                <p class="font-bold text-gray-900">${strategyType === 'WHEEL' ? '🎡 Wheel' : 'Stockpiling'}</p>
                            </div>
                            <div>
                                <p class="text-gray-600">Shares</p>
                                <p class="font-bold text-gray-900">${shares}</p>
                            </div>
                            <div>
                                <p class="text-gray-600">Strike Price</p>
                                <p class="font-bold text-gray-900">$${strikePrice.toFixed(2)}</p>
                            </div>
                            <div>
                                <p class="text-gray-600">Account</p>
                                <p class="font-bold text-gray-900">${accountDisplay}</p>
                            </div>
                            <div>
                                <p class="text-gray-600">Contracts</p>
                                <p class="font-bold text-gray-900">${option.quantity}</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Assignment Form -->
                    <form id="assignmentForm">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-gray-700 font-semibold mb-2">
                                    <i class="fas fa-calendar mr-2 text-amber-600"></i>Assignment Date *
                                </label>
                                <input type="date" name="assignment_date" value="${defaultDateString}" 
                                       class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-amber-600 focus:ring-2 focus:ring-amber-200 focus:outline-none" 
                                       required>
                                <p class="text-xs text-gray-500 mt-1">Date when option was assigned and stock was purchased</p>
                            </div>
                            
                            <div>
                                <label class="block text-gray-700 font-semibold mb-2">
                                    <i class="fas fa-sticky-note mr-2 text-yellow-600"></i>Notes (Optional)
                                </label>
                                <textarea name="notes" rows="3" 
                                          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-amber-600 focus:ring-2 focus:ring-amber-200 focus:outline-none"
                                          placeholder="Add any notes about this assignment..."></textarea>
                            </div>
                        </div>
                        
                        <!-- What Will Happen Section -->
                        <div class="mt-6 bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-300">
                            <h5 class="text-sm font-bold text-green-900 mb-2 flex items-center">
                                <i class="fas fa-check-circle mr-2"></i>What Will Happen
                            </h5>
                            <ul class="text-sm text-green-900 space-y-1">
                                <li>✓ Option position will be closed with $0 close price (assignment = max profit)</li>
                                <li>✓ Stock position will be created: ${shares} shares @ $${strikePrice.toFixed(2)} = $${(shares * strikePrice).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</li>
                                <li>✓ <strong>Cost basis adjustment:</strong> Premium collected $${grossPremium.toFixed(2)}${commission > 0 ? ` - $${commission.toFixed(2)} commission = $${netProceeds.toFixed(2)}` : ''} reduces cost basis to $${adjustedCostBasis.toFixed(2)}/share</li>
                                <li>✓ Strategy type will be set to: <strong>${strategyType === 'WHEEL' ? 'Wheel Strategy' : 'Stockpiling'}</strong></li>
                                <li>✓ Account will remain: ${accountDisplay}</li>
                            </ul>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="flex gap-3 mt-6">
                            <button type="submit" class="flex-1 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold py-3 px-6 rounded-lg transition shadow-lg hover:shadow-xl">
                                <i class="fas fa-check mr-2"></i>Confirm Assignment
                            </button>
                            <button type="button" onclick="this.closest('.fixed').remove()" 
                                    class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-bold py-3 px-6 rounded-lg transition">
                                <i class="fas fa-times mr-2"></i>Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `
        
        document.body.appendChild(modal)
        
        // Handle form submission
        const form = document.getElementById('assignmentForm')
        form.addEventListener('submit', async (e) => {
            e.preventDefault()
            
            const formData = new FormData(form)
            const assignmentDate = formData.get('assignment_date')
            const notes = formData.get('notes') || ''
            
            try {
                // Call API to assign stock position
                const response = await api.post(`/api/options/${optionId}/assign`, {
                    assignment_date: assignmentDate,
                    notes: notes
                })
                
                // Close modal
                modal.remove()
                
                // Close the option details modal if it exists
                const detailsModal = document.getElementById('option-details-modal')
                if (detailsModal) detailsModal.remove()
                
                // Reload data
                await loadOptions()
                await loadStocks()
                await loadDashboard()
                
                // Show success message with cost basis adjustment info
                const premiumAdjustment = response.data.premium_adjustment || 0
                const adjustedCostBasis = strikePrice - (premiumAdjustment / shares)
                
                alert(`✓ Assignment completed successfully!\n\nOption closed and ${shares} shares of ${option.ticker} added to your portfolio.\n\nPurchase Price: $${strikePrice.toFixed(2)}/share\nPremium Credit: $${premiumAdjustment.toFixed(2)} total\nAdjusted Cost Basis: $${adjustedCostBasis.toFixed(2)}/share\n\nThe premium collected reduces your cost basis - this is the power of the Wheel!`)
                
            } catch (error) {
                console.error('Assignment error:', error)
                alert(error.response?.data?.error || 'Failed to assign stock position')
            }
        })
        
    } catch (error) {
        console.error('Error preparing assignment:', error)
        alert('Failed to prepare assignment')
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
        
        // Find account name - try account_id first, then fall back to account_type matching
        let accountDisplay = option.account_type || 'N/A'
        if (option.account_id) {
            const account = accounts.find(a => a.id === option.account_id)
            if (account) {
                accountDisplay = `${account.account_name} (${account.account_type})`
            }
        } else if (option.account_type) {
            // Try to match by account_type if account_id doesn't exist
            const account = accounts.find(a => a.account_type === option.account_type)
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
                        <i class="fas fa-layer-group mr-2"></i>${option.ticker} - Option Trade Details
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
                            <button onclick="addToOptionPosition(${id})" class="w-full text-left px-4 py-3 bg-white hover:bg-teal-600 hover:text-white rounded-lg border border-gray-200 transition-colors group">
                                <i class="fas fa-plus-circle mr-2 text-teal-600 group-hover:text-white"></i>
                                <span class="font-medium">Add To Position</span>
                            </button>
                            
                            <button onclick="reduceFromOptionPosition(${id})" class="w-full text-left px-4 py-3 bg-white hover:bg-orange-600 hover:text-white rounded-lg border border-gray-200 transition-colors group">
                                <i class="fas fa-minus-circle mr-2 text-orange-600 group-hover:text-white"></i>
                                <span class="font-medium">Reduce From Position</span>
                            </button>
                            
                            ${(option.strategy_type === 'SELLING_PUT' || option.strategy_type === 'SELLING_PUT_WHEEL') ? `
                            <button onclick="assignStockPosition(${id})" class="w-full text-left px-4 py-3 bg-white hover:bg-amber-600 hover:text-white rounded-lg border border-gray-200 transition-colors group">
                                <i class="fas fa-exchange-alt mr-2 text-amber-600 group-hover:text-white"></i>
                                <span class="font-medium">Assign Stock Position</span>
                            </button>
                            ` : ''}
                            
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
                                    <p class="text-sm opacity-90 font-medium">${strategyLabel}</p>
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
                        <div class="text-xl font-bold text-gray-900">$${parseFloat(option.strike_price).toFixed(3)}</div>
                    </div>
                    <div>
                        <span class="text-sm text-gray-600">Premium per Share</span>
                        <div class="text-xl font-bold ${strategyConfig.isPremiumCredit ? 'text-green-600' : 'text-red-600'}">
                            ${strategyConfig.isPremiumCredit ? '+' : '-'}$${parseFloat(option.premium).toFixed(3)}
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
                            <div class="font-bold text-gray-900 text-lg">$${parseFloat(option.short_strike).toFixed(3)}</div>
                        </div>
                        <div>
                            <span class="text-gray-600">Premium</span>
                            <div class="font-bold text-green-600 text-lg">+$${parseFloat(option.short_premium).toFixed(3)}</div>
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
                            <div class="font-bold text-gray-900 text-lg">$${parseFloat(option.long_strike).toFixed(3)}</div>
                        </div>
                        <div>
                            <span class="text-gray-600">Premium</span>
                            <div class="font-bold text-red-600 text-lg">-$${parseFloat(option.long_premium).toFixed(3)}</div>
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
            
            // Build close data with all required fields from the original option
            const closeData = {
                // Original option data (required for backend update)
                ticker: option.ticker,
                strategy_type: option.strategy_type,
                strike_price: option.strike_price,
                strike_price_2: option.strike_price_2,
                strike_price_3: option.strike_price_3,
                strike_price_4: option.strike_price_4,
                premium: option.premium,
                quantity: option.quantity,
                expiration_date: option.expiration_date,
                account_type: option.account_type,
                account_id: option.account_id,
                trade_date: option.trade_date,
                commission: option.commission || 0,
                notes: option.notes,
                // Close data
                close_date: document.getElementById('close_date').value,
                close_commission: parseFloat(document.getElementById('close_commission').value) || 0,
                is_open: false
            }
            
            // Add leg-specific close prices based on strategy
            // Map frontend field names to backend schema
            if (strategyConfig.legs === 1) {
                closeData.close_price = parseFloat(document.getElementById('close_price').value) || 0
            } else if (strategyConfig.legs === 2) {
                // Two-leg: short = close_price, long = close_price_2
                closeData.close_price = parseFloat(document.getElementById('short_close_price').value) || 0
                closeData.close_price_2 = parseFloat(document.getElementById('long_close_price').value) || 0
            } else if (strategyConfig.legs === 4) {
                // Four-leg: SC = close_price, LC = close_price_2, SP = close_price_3, LP = close_price_4
                closeData.close_price = parseFloat(document.getElementById('short_call_close').value) || 0
                closeData.close_price_2 = parseFloat(document.getElementById('long_call_close').value) || 0
                closeData.close_price_3 = parseFloat(document.getElementById('short_put_close').value) || 0
                closeData.close_price_4 = parseFloat(document.getElementById('long_put_close').value) || 0
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

// Add To Position - adds more contracts to an existing open position
async function addToOptionPosition(optionId) {
    try {
        const response = await api.get('/api/options')
        const option = response.data.find(o => o.id === optionId)
        
        console.log('Option data for add:', option)
        
        if (!option || !option.is_open) {
            alert('Option trade not found or already closed')
            return
        }
        
        const strategyLabel = STRATEGY_TYPES.find(st => st.value === option.strategy_type)?.label || option.strategy_type.replace(/_/g, ' ')
        
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'
        modal.innerHTML = `
            <div class="bg-white rounded-lg max-w-2xl w-full">
                <div class="bg-gradient-to-r from-teal-600 to-teal-700 text-white p-6 rounded-t-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-2xl font-bold flex items-center">
                                <i class="fas fa-plus-circle mr-3"></i>Add To Position
                            </h3>
                            <p class="text-teal-100 mt-1">${option.ticker} - ${strategyLabel}</p>
                        </div>
                        <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-teal-200 text-2xl">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <div class="p-6">
                    <div class="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-6">
                        <h4 class="font-semibold text-teal-900 mb-3">Current Position</h4>
                        <div class="grid grid-cols-3 gap-4 text-sm">
                            <div>
                                <span class="text-gray-600">Contracts:</span>
                                <div class="font-semibold text-gray-900">${option.quantity}</div>
                            </div>
                            <div>
                                <span class="text-gray-600">Premium:</span>
                                <div class="font-semibold text-gray-900">$${parseFloat(option.premium).toFixed(3)}</div>
                            </div>
                            <div>
                                <span class="text-gray-600">Commission:</span>
                                <div class="font-semibold text-gray-900">$${parseFloat(option.commission || 0).toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                    
                    <form id="addToPositionForm">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-calendar mr-2 text-teal-600"></i>Trade Date *
                                </label>
                                <input type="date" id="add_trade_date" value="${new Date().toISOString().split('T')[0]}" 
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-600" required>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-layer-group mr-2 text-teal-600"></i>Additional Contracts *
                                </label>
                                <input type="number" id="add_contracts" min="1" value="1"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-600" required>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-dollar-sign mr-2 text-teal-600"></i>Premium Per Contract *
                                </label>
                                <input type="number" id="add_premium" step="0.001" value="${option.premium}"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-600" required>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-dollar-sign mr-2 text-teal-600"></i>Commission
                                </label>
                                <input type="number" id="add_commission" step="0.01" value="0.00"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-600">
                            </div>
                        </div>
                        
                        <div class="flex gap-3 mt-6">
                            <button type="button" onclick="this.closest('.fixed').remove()" 
                                class="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300">
                                Cancel
                            </button>
                            <button type="submit" 
                                class="flex-1 px-6 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700">
                                Add To Position
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `
        
        document.body.appendChild(modal)
        
        document.getElementById('addToPositionForm').addEventListener('submit', async (e) => {
            e.preventDefault()
            
            const newContracts = parseInt(document.getElementById('add_contracts').value)
            const newPremium = parseFloat(document.getElementById('add_premium').value)
            const newCommission = parseFloat(document.getElementById('add_commission').value)
            const tradeDate = document.getElementById('add_trade_date').value
            
            // Calculate weighted average premium
            const totalContracts = option.quantity + newContracts
            const totalPremiumValue = (option.quantity * option.premium) + (newContracts * newPremium)
            const avgPremium = totalPremiumValue / totalContracts
            
            // Add commissions together
            const totalCommission = (option.commission || 0) + newCommission
            
            try {
                // Send full trade data to PUT endpoint
                const updateData = {
                    ticker: option.ticker,
                    strategy_type: option.strategy_type,
                    strike_price: option.strike_price,
                    strike_price_2: option.strike_price_2 || null,
                    strike_price_3: option.strike_price_3 || null,
                    strike_price_4: option.strike_price_4 || null,
                    premium: avgPremium,
                    quantity: totalContracts,
                    expiration_date: option.expiration_date,
                    account_type: option.account_type,
                    account_id: option.account_id,
                    trade_date: tradeDate,
                    commission: totalCommission,
                    notes: option.notes || null
                }
                
                console.log('Adding to position:', updateData)
                await api.put(`/api/options/${optionId}`, updateData)
                
                modal.remove()
                loadOptions()
                showNotification('Position increased successfully', 'success')
                document.getElementById('option-details-modal')?.remove()
            } catch (error) {
                console.error('Error adding to position:', error)
                console.error('Error response:', error.response?.data)
                alert(`Failed to add to position: ${error.response?.data?.error || error.message}`)
            }
        })
    } catch (error) {
        console.error('Error loading option:', error)
        alert('Failed to load option details')
    }
}

// Reduce From Position - partially closes a position
async function reduceFromOptionPosition(optionId) {
    try {
        const response = await api.get('/api/options')
        const option = response.data.find(o => o.id === optionId)
        
        console.log('Option data for reduce:', option)
        
        if (!option || !option.is_open) {
            alert('Option trade not found or already closed')
            return
        }
        
        if (option.quantity <= 1) {
            alert('Cannot reduce position - only 1 contract remaining. Use "Close Position" instead.')
            return
        }
        
        const strategyLabel = STRATEGY_TYPES.find(st => st.value === option.strategy_type)?.label || option.strategy_type.replace(/_/g, ' ')
        
        const modal = document.createElement('div')
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'
        modal.innerHTML = `
            <div class="bg-white rounded-lg max-w-2xl w-full">
                <div class="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-6 rounded-t-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-2xl font-bold flex items-center">
                                <i class="fas fa-minus-circle mr-3"></i>Reduce From Position
                            </h3>
                            <p class="text-orange-100 mt-1">${option.ticker} - ${strategyLabel}</p>
                        </div>
                        <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-orange-200 text-2xl">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <div class="p-6">
                    <div class="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                        <h4 class="font-semibold text-orange-900 mb-3">Current Position</h4>
                        <div class="grid grid-cols-4 gap-4 text-sm">
                            <div>
                                <span class="text-gray-600">Contracts:</span>
                                <div class="font-semibold text-gray-900">${option.quantity}</div>
                            </div>
                            <div>
                                <span class="text-gray-600">Premium:</span>
                                <div class="font-semibold text-gray-900">$${parseFloat(option.premium).toFixed(3)}</div>
                            </div>
                            <div>
                                <span class="text-gray-600">Commission:</span>
                                <div class="font-semibold text-gray-900">$${parseFloat(option.commission || 0).toFixed(2)}</div>
                            </div>
                            <div>
                                <span class="text-gray-600">Opened:</span>
                                <div class="font-semibold text-gray-900">${option.trade_date}</div>
                            </div>
                        </div>
                    </div>
                    
                    <form id="reduceFromPositionForm">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-calendar mr-2 text-orange-600"></i>Close Date *
                                </label>
                                <input type="date" id="reduce_close_date" value="${new Date().toISOString().split('T')[0]}" 
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange-600" required>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-layer-group mr-2 text-orange-600"></i>Contracts To Close *
                                </label>
                                <input type="number" id="reduce_contracts" min="1" max="${option.quantity - 1}" value="1"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange-600" required>
                                <p class="text-xs text-gray-500 mt-1">Maximum: ${option.quantity - 1} (must leave at least 1 contract open)</p>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-dollar-sign mr-2 text-orange-600"></i>Close Premium Per Contract *
                                </label>
                                <input type="number" id="reduce_close_premium" step="0.001" value="${option.premium}"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange-600" required>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-dollar-sign mr-2 text-orange-600"></i>Close Commission
                                </label>
                                <input type="number" id="reduce_close_commission" step="0.01" value="0.00"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange-600">
                            </div>
                        </div>
                        
                        <div class="flex gap-3 mt-6">
                            <button type="button" onclick="this.closest('.fixed').remove()" 
                                class="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300">
                                Cancel
                            </button>
                            <button type="submit" 
                                class="flex-1 px-6 py-3 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700">
                                Reduce Position
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `
        
        document.body.appendChild(modal)
        
        document.getElementById('reduceFromPositionForm').addEventListener('submit', async (e) => {
            e.preventDefault()
            
            const contractsToClose = parseInt(document.getElementById('reduce_contracts').value)
            const closePremium = parseFloat(document.getElementById('reduce_close_premium').value)
            const closeCommission = parseFloat(document.getElementById('reduce_close_commission').value)
            const closeDate = document.getElementById('reduce_close_date').value
            
            if (contractsToClose >= option.quantity) {
                alert('Cannot close all contracts. Use "Close Position" instead.')
                return
            }
            
            // Calculate proportional commission for the part being closed
            const proportionalOpenCommission = (option.commission || 0) * (contractsToClose / option.quantity)
            const remainingOpenCommission = (option.commission || 0) - proportionalOpenCommission
            
            // Create a new closed trade for the contracts being closed
            const closedTrade = {
                company_id: option.company_id,
                account_id: option.account_id,
                ticker: option.ticker,
                trade_date: option.trade_date,
                strategy_type: option.strategy_type,
                strike_price: option.strike_price,
                strike_price_2: option.strike_price_2 || null,
                strike_price_3: option.strike_price_3 || null,
                strike_price_4: option.strike_price_4 || null,
                premium: option.premium,
                quantity: contractsToClose,
                expiration_date: option.expiration_date,
                option_type: option.option_type || null,
                commission: proportionalOpenCommission,
                is_open: false,
                close_date: closeDate,
                close_price: closePremium,
                close_commission: closeCommission
            }
            
            // Calculate P/L for the closed portion
            const openCost = contractsToClose * option.premium * 100
            const closeCost = contractsToClose * closePremium * 100
            const totalCommissions = proportionalOpenCommission + closeCommission
            closedTrade.profit_loss = openCost - closeCost - totalCommissions
            
            try {
                console.log('Creating closed trade:', closedTrade)
                
                // Create the new closed trade
                await api.post('/api/options', closedTrade)
                
                // Update the original trade: reduce quantity and commission
                const remainingContracts = option.quantity - contractsToClose
                const updateData = {
                    ticker: option.ticker,
                    strategy_type: option.strategy_type,
                    strike_price: option.strike_price,
                    strike_price_2: option.strike_price_2 || null,
                    strike_price_3: option.strike_price_3 || null,
                    strike_price_4: option.strike_price_4 || null,
                    premium: option.premium,
                    quantity: remainingContracts,
                    expiration_date: option.expiration_date,
                    account_type: option.account_type,
                    account_id: option.account_id,
                    trade_date: option.trade_date,
                    commission: remainingOpenCommission,
                    notes: option.notes || null
                }
                
                console.log('Updating original trade:', updateData)
                await api.put(`/api/options/${optionId}`, updateData)
                
                modal.remove()
                loadOptions()
                showNotification(`Closed ${contractsToClose} contract(s). ${remainingContracts} contract(s) remaining.`, 'success')
                document.getElementById('option-details-modal')?.remove()
            } catch (error) {
                console.error('Error reducing position:', error)
                console.error('Error response:', error.response?.data)
                console.error('Closed trade data:', closedTrade)
                alert(`Failed to reduce position: ${error.response?.data?.error || error.message}`)
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
        // Single leg (Short Put, Long Put, Long Call)
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
                    ${data.options.map(item => {
                        const strategyLabel = STRATEGY_TYPES.find(st => st.value === item.strategy_type)?.label || item.strategy_type.replace(/_/g, ' ')
                        return `
                        <div class="flex justify-between border-b border-gray-200 pb-2">
                            <div>
                                <div>${item.year}-${item.month} (${item.account_type})</div>
                                <div class="text-sm text-gray-500">${strategyLabel}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-green-600 font-semibold">${formatCurrency(item.total_premium, 'USD')}</div>
                                ${item.realized_pl ? `<div class="text-sm ${item.realized_pl >= 0 ? 'text-green-600' : 'text-red-600'}">${formatCurrency(item.realized_pl, 'USD')}</div>` : ''}
                            </div>
                        </div>
                        `
                    }).join('')}
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
                            <td class="px-4 py-3">${stock.opened_date || stock.trade_date}</td>
                            <td class="px-4 py-3 font-semibold text-brand-teal">${stock.ticker}</td>
                            <td class="px-4 py-3">${stock.closed_date || '-'}</td>
                            <td class="px-4 py-3 text-right">${stock.total_shares || stock.quantity}</td>
                            <td class="px-4 py-3 text-right">$${parseFloat(stock.average_price || stock.price).toFixed(3)}</td>
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
                            <td class="px-4 py-3">${option.close_date || '-'}</td>
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

// ============================================================================
// DAILY TRADE PROFIT-BASED SIZING AND PERFORMANCE
// ============================================================================

// Global variable to store current performance stats
let dailyTradePerformanceStats = null
let currentPerformancePeriod = 'rolling' // Default to rolling window (Last X Trades)

// Toggle profit-based position sizing
function toggleAutoPositionSizing() {
    const toggle = document.getElementById('dt-profit-sizing-toggle')
    const contractsInput = document.getElementById('dt-contracts')
    const hint = document.getElementById('dt-contracts-hint')
    const minusBtn = document.getElementById('dt-contracts-minus')
    const plusBtn = document.getElementById('dt-contracts-plus')
    
    if (toggle.checked) {
        // Auto-Position Sizing is ON
        // Check configuration to determine sizing method
        if (dailyTradeConfigCache && dailyTradeConfigCache.enable_position_sizing) {
            const sizingType = dailyTradeConfigCache.position_sizing_type || 'profit'
            
            if (sizingType === 'profit') {
                // Profit-based sizing
                calculateProfitBasedContracts()
            } else if (sizingType === 'account') {
                // Account-based sizing
                calculateAccountBasedContracts()
            }
        } else {
            // Config doesn't have position sizing enabled, fall back to manual
            toggle.checked = false
            hint.innerHTML = 'Manual Entry (Position sizing not enabled in config)'
            hint.className = 'text-xs text-red-500 mt-1 block'
            return
        }
        
        // Disable manual controls
        contractsInput.disabled = true
        if (minusBtn) minusBtn.disabled = true
        if (plusBtn) plusBtn.disabled = true
        contractsInput.classList.add('bg-gray-100', 'cursor-not-allowed')
    } else {
        // Manual Entry
        const defaultContracts = parseInt(document.getElementById('dt-default-contracts')?.value || 1)
        contractsInput.value = defaultContracts
        contractsInput.disabled = false
        if (minusBtn) minusBtn.disabled = false
        if (plusBtn) plusBtn.disabled = false
        contractsInput.classList.remove('bg-gray-100', 'cursor-not-allowed')
        hint.innerHTML = 'Manual Entry'
        hint.className = 'text-xs text-gray-500 mt-1 block'
        updateTradeSummary() // Recalculate with manual value
    }
}

// Calculate profit-based contracts
async function calculateProfitBasedContracts() {
    const hint = document.getElementById('dt-contracts-hint')
    
    try {
        // Get configuration values from cached config (not DOM, as modal may not be open)
        if (!dailyTradeConfigCache) {
            throw new Error('Configuration not loaded')
        }
        
        const rollingWindow = parseInt(dailyTradeConfigCache.rolling_profit_window || 50)
        const maxContractLimit = parseInt(dailyTradeConfigCache.max_contract_limit || 25)
        const strikeWidth = parseInt(dailyTradeConfigCache.strike_width || 5)
        
        console.log('Profit-based sizing configuration:', { rollingWindow, maxContractLimit, strikeWidth })
        
        // Get stats for the rolling window period using the "Last X Trades" filter
        const response = await api.get(`/api/daily-trades/stats?period=rolling&limit=${rollingWindow}`)
        const stats = response.data
        
        console.log('API response stats:', stats)
        console.log('Raw net_pl value:', stats.net_pl, 'Type:', typeof stats.net_pl)
        
        // Calculate contracts based on net P/L and strike width
        // Formula: Profit ÷ (Strike Width × 100) = Contracts (truncated, not rounded)
        const netPL = parseFloat(stats.net_pl) || 0
        let calculatedContracts = 1 // Default minimum
        
        console.log('Parsed net_pl:', netPL)
        
        if (netPL > 0) {
            // Calculate contracts: profit / (strikeWidth * 100)
            const rawContracts = netPL / (strikeWidth * 100)
            console.log('Raw contracts before truncation:', rawContracts)
            // Truncate (not round) and apply limits
            calculatedContracts = Math.max(1, Math.min(Math.floor(rawContracts), maxContractLimit))
            console.log('Final contracts after truncation and limits:', calculatedContracts)
        } else {
            console.log('Net P/L is not positive, using minimum 1 contract')
        }
        
        // Update the contracts input
        const contractsInput = document.getElementById('dt-contracts')
        if (contractsInput) {
            contractsInput.value = calculatedContracts
            updateTradeSummary() // Recalculate risk with new contract count
        }
        
        // Update hint with profit info
        if (hint) {
            const profitSign = netPL >= 0 ? '+' : ''
            hint.innerHTML = `Profit-based: ${profitSign}${formatCurrency(netPL)} (last ${rollingWindow}) = ${calculatedContracts} contracts`
            hint.classList.remove('text-gray-500')
            hint.classList.add('text-orange-600', 'font-semibold')
        }
        
        console.log(`✅ Profit-based sizing complete: Net P/L=${netPL}, Window=${rollingWindow}, Strike Width=${strikeWidth}, Raw=${netPL / (strikeWidth * 100)}, Calculated contracts=${calculatedContracts} (truncated, not rounded)`)
    } catch (error) {
        console.error('❌ Error calculating profit-based contracts:', error)
        console.error('Error details:', error.message, error.stack)
        // Fallback to minimum
        document.getElementById('dt-contracts').value = 1
        
        // Update hint with error state
        if (hint) {
            hint.innerHTML = `Profit-based: Error loading data = 1 contract`
            hint.classList.remove('text-gray-500')
            hint.classList.add('text-orange-600', 'font-semibold')
        }
    }
}

// Calculate account-based contracts
async function calculateAccountBasedContracts() {
    const hint = document.getElementById('dt-contracts-hint')
    
    try {
        // Get configuration values from cached config (not DOM, as modal may not be open)
        if (!dailyTradeConfigCache) {
            throw new Error('Configuration not loaded')
        }
        
        const maxLossPct = parseFloat(dailyTradeConfigCache.account_max_loss_percent || 4.00)
        const maxContractLimit = parseInt(dailyTradeConfigCache.max_contract_limit || 25)
        const strikeWidth = parseInt(dailyTradeConfigCache.strike_width || 5)
        const defaultAccountId = parseInt(dailyTradeConfigCache.default_account_id)
        
        if (!defaultAccountId) {
            throw new Error('No default account selected in configuration')
        }
        
        console.log('Account-based sizing configuration:', { maxLossPct, maxContractLimit, strikeWidth, defaultAccountId })
        
        // Get the account balance
        const accountResponse = await api.get(`/api/accounts/${defaultAccountId}`)
        const accountData = accountResponse.data.account // API returns { account: {...} }
        
        if (!accountData) {
            throw new Error('Account data not found')
        }
        
        // Calculate total balance based on default currency
        let accountBalance = 0
        if (accountData.default_currency === 'USD') {
            accountBalance = parseFloat(accountData.balance_usd) || 0
        } else {
            accountBalance = parseFloat(accountData.balance_cad) || 0
        }
        
        console.log('Account data:', accountData, 'Balance:', accountBalance, 'Currency:', accountData.default_currency)
        
        // Calculate maximum loss amount: (maxLossPct / 100) * accountBalance
        const maxLossAmount = (maxLossPct / 100) * accountBalance
        
        // Calculate contracts based on max loss and strike width
        // Formula: Max Loss Amount ÷ (Strike Width × 100) = Contracts (truncated)
        let calculatedContracts = 1 // Default minimum
        
        if (accountBalance > 0 && maxLossAmount > 0) {
            const rawContracts = maxLossAmount / (strikeWidth * 100)
            console.log('Raw contracts before truncation:', rawContracts)
            // Truncate (not round) and apply limits
            calculatedContracts = Math.max(1, Math.min(Math.floor(rawContracts), maxContractLimit))
            console.log('Final contracts after truncation and limits:', calculatedContracts)
        } else {
            console.log('Account balance or max loss is not positive, using minimum 1 contract')
        }
        
        // Update the contracts input
        const contractsInput = document.getElementById('dt-contracts')
        if (contractsInput) {
            contractsInput.value = calculatedContracts
            updateTradeSummary() // Recalculate risk with new contract count
        }
        
        // Update hint with account info
        if (hint) {
            hint.innerHTML = `Account-based: ${maxLossPct}% of ${formatCurrency(accountBalance)} = ${calculatedContracts} contracts`
            hint.classList.remove('text-gray-500')
            hint.classList.add('text-purple-600', 'font-semibold')
        }
        
        console.log(`✅ Account-based sizing complete: Balance=${accountBalance}, Max Loss %=${maxLossPct}, Max Loss $=${maxLossAmount}, Strike Width=${strikeWidth}, Calculated contracts=${calculatedContracts} (truncated)`)
    } catch (error) {
        console.error('❌ Error calculating account-based contracts:', error)
        console.error('Error details:', error.message, error.stack)
        // Fallback to minimum
        document.getElementById('dt-contracts').value = 1
        
        // Update hint with error state
        if (hint) {
            hint.innerHTML = `Account-based: Error loading data = 1 contract`
            hint.classList.remove('text-gray-500')
            hint.classList.add('text-purple-600', 'font-semibold')
        }
    }
}

// Load performance stats for a specific period
async function loadPerformanceStats(period) {
    try {
        currentPerformancePeriod = period
        
        // Update button styles
        const allButtons = ['dt-filter-rolling', 'dt-filter-year', 'dt-filter-all']
        const activeButton = `dt-filter-${period}`
        
        allButtons.forEach(btnId => {
            const btn = document.getElementById(btnId)
            if (btn) {
                if (btnId === activeButton) {
                    btn.className = 'px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold'
                } else {
                    btn.className = 'px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300'
                }
            }
        })
        
        // Build API query params
        let queryParams = `period=${period}`
        if (period === 'rolling') {
            // Get rolling window from cached config
            let rollingWindow = 50 // Default
            if (dailyTradeConfigCache && dailyTradeConfigCache.rolling_profit_window) {
                rollingWindow = parseInt(dailyTradeConfigCache.rolling_profit_window)
            } else {
                // Fallback: try to read from DOM if cache not available
                const rollingWindowInput = document.getElementById('dt-rolling-profit-window')
                if (rollingWindowInput && rollingWindowInput.value) {
                    rollingWindow = parseInt(rollingWindowInput.value)
                }
            }
            queryParams += `&limit=${rollingWindow}`
        }
        
        // Fetch stats from API
        const response = await api.get(`/api/daily-trades/stats?${queryParams}`)
        const stats = response.data
        dailyTradePerformanceStats = stats
        
        // Update UI
        document.getElementById('dt-perf-total-trades').textContent = stats.total_trades || 0
        document.getElementById('dt-perf-win-rate').textContent = stats.total_trades > 0 ? `${stats.win_rate}%` : '-'
        document.getElementById('dt-perf-avg-win').textContent = stats.avg_win ? formatCurrency(stats.avg_win) : '-'
        document.getElementById('dt-perf-avg-loss').textContent = stats.avg_loss ? formatCurrency(stats.avg_loss) : '-'
        
        // Net P/L with color
        const netPLElement = document.getElementById('dt-perf-net-pl')
        if (stats.net_pl !== null && stats.net_pl !== undefined) {
            const sign = stats.net_pl >= 0 ? '+' : ''
            netPLElement.textContent = sign + formatCurrency(stats.net_pl)
            netPLElement.className = `text-2xl font-bold ${stats.net_pl >= 0 ? 'text-green-600' : 'text-red-600'}`
        } else {
            netPLElement.textContent = '-'
            netPLElement.className = 'text-2xl font-bold text-gray-900'
        }
        
        // Avg P/L with color
        const avgPLElement = document.getElementById('dt-perf-avg-pl')
        if (stats.avg_pl !== null && stats.avg_pl !== undefined) {
            const sign = stats.avg_pl >= 0 ? '+' : ''
            avgPLElement.textContent = sign + formatCurrency(stats.avg_pl)
            avgPLElement.className = `text-2xl font-bold ${stats.avg_pl >= 0 ? 'text-green-600' : 'text-red-600'}`
        } else {
            avgPLElement.textContent = '-'
            avgPLElement.className = 'text-2xl font-bold text-gray-900'
        }
        
        // Best trade with date
        document.getElementById('dt-perf-best-trade').textContent = stats.best_trade ? '+' + formatCurrency(stats.best_trade) : '-'
        document.getElementById('dt-perf-best-trade-date').textContent = stats.best_trade_date 
            ? formatDate(stats.best_trade_date) 
            : '-'
        
        // Worst trade with date
        document.getElementById('dt-perf-worst-trade').textContent = stats.worst_trade ? formatCurrency(stats.worst_trade) : '-'
        document.getElementById('dt-perf-worst-trade-date').textContent = stats.worst_trade_date 
            ? formatDate(stats.worst_trade_date) 
            : '-'
        
        // Update chart title
        let chartTitle = 'P/L Trend'
        if (period === 'rolling') {
            // Get rolling window from cached config
            let rollingWindow = 50 // Default
            if (dailyTradeConfigCache && dailyTradeConfigCache.rolling_profit_window) {
                rollingWindow = parseInt(dailyTradeConfigCache.rolling_profit_window)
            } else {
                // Fallback: try to read from DOM if cache not available
                const rollingWindowInput = document.getElementById('dt-rolling-profit-window')
                if (rollingWindowInput && rollingWindowInput.value) {
                    rollingWindow = parseInt(rollingWindowInput.value)
                }
            }
            chartTitle += ` (Last ${rollingWindow} Trades)`
        } else if (period === 'year') {
            chartTitle += ' (YTD)'
        } else {
            chartTitle += ' (All Time)'
        }
        document.getElementById('dt-chart-title').innerHTML = `<i class="fas fa-chart-line mr-2 text-orange-600"></i>${chartTitle}`
        
        // Render P/L Trend Chart
        await renderPLTrendChart(period)
        
        console.log('Performance stats loaded:', stats)
    } catch (error) {
        console.error('Error loading performance stats:', error)
        // Reset to defaults
        document.getElementById('dt-perf-total-trades').textContent = '-'
        document.getElementById('dt-perf-win-rate').textContent = '-'
        document.getElementById('dt-perf-avg-win').textContent = '-'
        document.getElementById('dt-perf-avg-loss').textContent = '-'
        document.getElementById('dt-perf-net-pl').textContent = '-'
        document.getElementById('dt-perf-avg-pl').textContent = '-'
        document.getElementById('dt-perf-best-trade').textContent = '-'
        document.getElementById('dt-perf-best-trade-date').textContent = '-'
        document.getElementById('dt-perf-worst-trade').textContent = '-'
        document.getElementById('dt-perf-worst-trade-date').textContent = '-'
    }
}

// Format date helper (YYYY-MM-DD to Mon DD, YYYY)
function formatDate(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr + 'T00:00:00')
    const options = { month: 'short', day: 'numeric', year: 'numeric' }
    return date.toLocaleDateString('en-US', options)
}

// Format currency helper
// Global chart instance
let plTrendChart = null

// Render P/L Trend Chart
async function renderPLTrendChart(period) {
    try {
        // Helper function to format strategy type
        const formatStrategyType = (strategyType) => {
            if (!strategyType) return 'N/A'
            const strategyObj = STRATEGY_TYPES.find(st => st.value === strategyType)
            return strategyObj ? strategyObj.label : strategyType.replace(/_/g, ' ')
        }
        
        // Build API query params
        let queryParams = `period=${period}`
        if (period === 'rolling') {
            // Get rolling window from cached config
            let rollingWindow = 50 // Default
            if (dailyTradeConfigCache && dailyTradeConfigCache.rolling_profit_window) {
                rollingWindow = parseInt(dailyTradeConfigCache.rolling_profit_window)
            } else {
                // Fallback: try to read from DOM if cache not available
                const rollingWindowInput = document.getElementById('dt-rolling-profit-window')
                if (rollingWindowInput && rollingWindowInput.value) {
                    rollingWindow = parseInt(rollingWindowInput.value)
                }
            }
            queryParams += `&limit=${rollingWindow}`
        }
        
        // Fetch trade data for chart
        const response = await api.get(`/api/daily-trades/chart-data?${queryParams}`)
        const trades = response.data.trades || []
        
        // Prepare chart data
        const labels = []
        const plData = []
        const cumulativeData = []
        const tradeDetails = [] // Store trade details for tooltips
        let cumulativePL = 0
        
        trades.forEach((trade, index) => {
            // Label: Trade # or Date
            labels.push(`#${index + 1}`)
            
            // Individual P/L
            plData.push(trade.profit_loss || 0)
            
            // Cumulative P/L
            cumulativePL += (trade.profit_loss || 0)
            cumulativeData.push(cumulativePL)
            
            // Store trade details for tooltip
            tradeDetails.push({
                date: trade.trade_date,
                strategy: formatStrategyType(trade.strategy_type),
                ticker: 'SPX' // Daily trades are SPX options
            })
        })
        
        // Calculate Y-axis ranges
        // Left axis (cumulative): based on cumulative data
        const cumulativeMax = Math.max(...cumulativeData, 0)
        const cumulativeMin = Math.min(...cumulativeData, 0)
        
        let cumulativeRange = cumulativeMax - cumulativeMin
        const minCumulativeRange = 500 // Minimum $500 range
        if (cumulativeRange < minCumulativeRange) {
            cumulativeRange = minCumulativeRange
        }
        
        // Add 15% padding for cumulative axis
        const cumulativePadding = cumulativeRange * 0.15
        let yMaxCumulative = cumulativeMax + cumulativePadding
        let yMinCumulative = cumulativeMin - cumulativePadding
        
        // Round to nearest $1000
        yMaxCumulative = Math.ceil(yMaxCumulative / 1000) * 1000
        yMinCumulative = Math.floor(yMinCumulative / 1000) * 1000
        
        // Right axis (individual trades): based on individual P/L data
        const maxProfit = Math.max(...plData.filter(v => v > 0), 0)
        const maxLoss = Math.min(...plData.filter(v => v < 0), 0)
        
        // Max value: double the current max profit (or $500 minimum)
        let yMaxIndividual = Math.max(maxProfit * 2, 500)
        
        // Min value: 20% larger than the largest loss (more negative)
        let yMinIndividual = maxLoss * 1.2 // 1.2 makes it 20% larger in magnitude
        if (yMinIndividual === 0) {
            yMinIndividual = -500 // Default minimum if no losses
        }
        
        // Round individual axis to nice values
        yMaxIndividual = Math.ceil(yMaxIndividual / 100) * 100
        yMinIndividual = Math.floor(yMinIndividual / 100) * 100
        
        // Store the required minimum (cannot be less negative than this)
        const requiredMinIndividual = yMinIndividual
        
        // Normalize both axes so zero appears at the same vertical position
        // The ratio (max / range) should be equal for both axes
        // ratio = max / (max - min)
        const cumulativeRatio = Math.abs(yMaxCumulative) / (yMaxCumulative - yMinCumulative)
        const individualRatio = Math.abs(yMaxIndividual) / (yMaxIndividual - yMinIndividual)
        
        // Adjust axes to match ratios
        if (cumulativeRatio > individualRatio) {
            // Individual axis needs more negative range to match cumulative ratio
            const targetRange = yMaxIndividual / cumulativeRatio
            yMinIndividual = yMaxIndividual - targetRange
            yMinIndividual = Math.floor(yMinIndividual / 100) * 100
            
            // Ensure we don't violate the 20% buffer requirement
            if (yMinIndividual > requiredMinIndividual) {
                // The normalization made it less negative, so use the required minimum
                // and adjust the cumulative axis instead to maintain normalization
                yMinIndividual = requiredMinIndividual
                const individualRatioFinal = Math.abs(yMaxIndividual) / (yMaxIndividual - yMinIndividual)
                const targetRangeCumulative = yMaxCumulative / individualRatioFinal
                yMinCumulative = yMaxCumulative - targetRangeCumulative
                yMinCumulative = Math.floor(yMinCumulative / 1000) * 1000
            }
        } else if (individualRatio > cumulativeRatio) {
            // Cumulative axis needs adjustment to match individual ratio
            const targetRange = yMaxCumulative / individualRatio
            yMinCumulative = yMaxCumulative - targetRange
            yMinCumulative = Math.floor(yMinCumulative / 1000) * 1000
        }
        
        // Destroy existing chart if it exists
        if (plTrendChart) {
            plTrendChart.destroy()
        }
        
        // Get canvas context
        const ctx = document.getElementById('dt-pl-trend-chart')
        if (!ctx) {
            console.error('Chart canvas not found')
            return
        }
        
        // Create new chart with mixed type (bar + line)
        plTrendChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Individual P/L',
                        data: plData,
                        backgroundColor: plData.map(val => val >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
                        borderColor: plData.map(val => val >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'),
                        borderWidth: 1,
                        yAxisID: 'y-right',
                        order: 2
                    },
                    {
                        type: 'line',
                        label: 'Cumulative P/L',
                        data: cumulativeData,
                        borderColor: 'rgb(59, 130, 246)', // Blue-500
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        tension: 0.3,
                        yAxisID: 'y',
                        fill: false,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            font: {
                                size: 12
                            },
                            usePointStyle: true,
                            padding: 15,
                            generateLabels: function(chart) {
                                // Custom legend to show profit, loss, and cumulative
                                return [
                                    {
                                        text: 'Individual P/L Profit',
                                        fillStyle: 'rgba(34, 197, 94, 0.7)',
                                        strokeStyle: 'rgb(34, 197, 94)',
                                        lineWidth: 1,
                                        hidden: false,
                                        index: 0
                                    },
                                    {
                                        text: 'Individual P/L Loss',
                                        fillStyle: 'rgba(239, 68, 68, 0.7)',
                                        strokeStyle: 'rgb(239, 68, 68)',
                                        lineWidth: 1,
                                        hidden: false,
                                        index: 1
                                    },
                                    {
                                        text: 'Cumulative P/L',
                                        fillStyle: 'rgba(59, 130, 246, 0.1)',
                                        strokeStyle: 'rgb(59, 130, 246)',
                                        lineWidth: 3,
                                        hidden: false,
                                        index: 2
                                    }
                                ]
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                // Show trade number and date in title
                                const index = context[0].dataIndex
                                const trade = tradeDetails[index]
                                if (trade) {
                                    return [`Trade ${context[0].label}`, `Date: ${trade.date}`, `Strategy: ${trade.strategy}${trade.ticker ? ' (' + trade.ticker + ')' : ''}`]
                                }
                                return `Trade ${context[0].label}`
                            },
                            label: function(context) {
                                let label = context.dataset.label || ''
                                if (label) {
                                    label += ': '
                                }
                                const value = context.parsed.y
                                if (value === null || value === undefined) {
                                    return null // Skip null values
                                }
                                const sign = value >= 0 ? '+' : '-'
                                label += sign + '$' + Math.abs(value).toFixed(2)
                                return label
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Trade Number',
                            font: {
                                size: 12
                            }
                        },
                        ticks: {
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 20
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        min: yMinCumulative,
                        max: yMaxCumulative,
                        title: {
                            display: true,
                            text: 'Cumulative P/L ($)',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            callback: function(value) {
                                const sign = value >= 0 ? '+' : '-'
                                return sign + '$' + Math.abs(value).toLocaleString()
                            }
                        },
                        grid: {
                            color: function(context) {
                                if (context.tick.value === 0) {
                                    return 'rgba(0, 0, 0, 0.3)'
                                }
                                return 'rgba(0, 0, 0, 0.05)'
                            }
                        }
                    },
                    'y-right': {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: yMinIndividual,
                        max: yMaxIndividual,
                        title: {
                            display: true,
                            text: 'Individual Trade P/L ($)',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            callback: function(value) {
                                const sign = value >= 0 ? '+' : '-'
                                return sign + '$' + Math.abs(value).toLocaleString()
                            }
                        },
                        grid: {
                            drawOnChartArea: false // Don't draw grid lines for right axis
                        }
                    }
                }
            }
        })
        
        console.log(`P/L Trend chart rendered with ${trades.length} trades`)
    } catch (error) {
        console.error('Error rendering P/L trend chart:', error)
    }
}


// Load recent trade history (last 7 days)
async function loadRecentTrades() {
    try {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        const startDate = sevenDaysAgo.toISOString().split('T')[0]
        
        const response = await api.get('/api/daily-trades')
        const allTrades = response.data.trades || []
        
        // Filter trades from last 7 days and closed only
        const recentTrades = allTrades.filter(trade => {
            return trade.trade_date >= startDate && !trade.is_open
        })
        
        // Calculate current week (Mon-Fri) P/L
        calculateWeeklyPL(allTrades)
        
        const tbody = document.getElementById('dt-recent-trades-tbody')
        
        if (recentTrades.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-4 py-8 text-center text-gray-500 italic">
                        No trades in the last 7 days
                    </td>
                </tr>
            `
            return
        }
        
        // Render trades
        tbody.innerHTML = recentTrades.map(trade => {
            const strategyLabel = trade.strategy_type === 'IRON_CONDOR' ? 'Iron Condor' 
                : trade.strategy_type === 'CREDIT_SPREAD_CALL' ? 'Call Spread'
                : 'Put Spread'
            
            const entryTime = trade.entry_time ? trade.entry_time.substring(0, 5) : '-'
            const exitTime = trade.exit_time ? trade.exit_time.substring(0, 5) : '-'
            
            const plColor = trade.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'
            const plSign = trade.profit_loss >= 0 ? '+' : ''
            const statusIcon = trade.profit_loss >= 0 ? '✅' : '❌'
            
            return `
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-4 py-3">${trade.trade_date}</td>
                    <td class="px-4 py-3">${strategyLabel}</td>
                    <td class="px-4 py-3">${entryTime}</td>
                    <td class="px-4 py-3">${exitTime}</td>
                    <td class="px-4 py-3 text-right">${formatCurrency(trade.total_credit)}</td>
                    <td class="px-4 py-3 text-center">${trade.contracts}</td>
                    <td class="px-4 py-3 text-right ${plColor} font-semibold">${plSign}${formatCurrency(trade.profit_loss)}</td>
                    <td class="px-4 py-3 text-center">${statusIcon}</td>
                </tr>
            `
        }).join('')
        
        console.log('Recent trades loaded:', recentTrades.length, 'trades')
    } catch (error) {
        console.error('Error loading recent trades:', error)
        const tbody = document.getElementById('dt-recent-trades-tbody')
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-4 py-8 text-center text-red-500">
                    Failed to load trades. Please try again.
                </td>
            </tr>
        `
    }
}

// Calculate and display current week (Mon-Fri) P/L
function calculateWeeklyPL(allTrades) {
    // Get current date
    const today = new Date()
    
    // Find the Monday of the current week
    const dayOfWeek = today.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Sunday counts as 6 days from Monday
    const monday = new Date(today)
    monday.setDate(today.getDate() - daysFromMonday)
    monday.setHours(0, 0, 0, 0)
    
    // Find Friday of the current week
    const friday = new Date(monday)
    friday.setDate(monday.getDate() + 4)
    friday.setHours(23, 59, 59, 999)
    
    // Format dates for comparison (YYYY-MM-DD)
    const mondayStr = monday.toISOString().split('T')[0]
    const fridayStr = friday.toISOString().split('T')[0]
    
    console.log('Weekly P/L calculation:', {
        today: today.toISOString().split('T')[0],
        dayOfWeek,
        monday: mondayStr,
        friday: fridayStr,
        totalTrades: allTrades.length
    })
    
    // Filter trades for this week (Mon-Fri) that are closed
    const weekTrades = allTrades.filter(trade => {
        // Compare date strings directly (YYYY-MM-DD format)
        const tradeDate = trade.trade_date
        const isInRange = tradeDate >= mondayStr && tradeDate <= fridayStr
        const isClosed = !trade.is_open
        
        if (isInRange && isClosed) {
            console.log('Week trade:', {
                date: tradeDate,
                pl: trade.profit_loss,
                isClosed
            })
        }
        
        return isInRange && isClosed
    })
    
    console.log('Week trades found:', weekTrades.length)
    
    // Calculate total P/L
    const totalPL = weekTrades.reduce((sum, trade) => sum + (trade.profit_loss || 0), 0)
    
    console.log('Weekly P/L total:', totalPL)
    
    // Update display
    const plElement = document.getElementById('dt-weekly-pl')
    const tradesElement = document.getElementById('dt-weekly-trades')
    const startDateElement = document.getElementById('dt-week-start-date')
    const endDateElement = document.getElementById('dt-week-end-date')
    
    if (plElement) {
        const plColor = totalPL >= 0 ? 'text-green-600' : 'text-red-600'
        const plSign = totalPL >= 0 ? '+' : ''
        plElement.textContent = plSign + formatCurrency(totalPL, 'USD')
        plElement.className = `text-2xl font-bold ${plColor}`
    }
    
    if (tradesElement) {
        tradesElement.textContent = `${weekTrades.length} trade${weekTrades.length !== 1 ? 's' : ''}`
    }
    
    if (startDateElement) {
        startDateElement.textContent = formatDate(mondayStr)
    }
    
    if (endDateElement) {
        endDateElement.textContent = formatDate(fridayStr)
    }
}

// Helper function to format date as MMM DD
// Load day of week statistics
async function loadDayOfWeekStats() {
    try {
        const response = await api.get('/api/daily-trades/day-stats')
        const days = response.data.days || []
        
        const container = document.getElementById('dt-day-stats-container')
        
        if (days.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500 italic">
                    No trades yet to calculate day of week statistics
                </div>
            `
            return
        }
        
        // Find best day (highest avg P/L)
        let bestDay = null
        let bestAvgPL = -Infinity
        days.forEach(day => {
            if (day.avg_pl > bestAvgPL) {
                bestAvgPL = day.avg_pl
                bestDay = day.day_name
            }
        })
        
        // Day name emojis
        const dayEmojis = {
            'Monday': '📅',
            'Tuesday': '📊',
            'Wednesday': '💼',
            'Thursday': '📈',
            'Friday': '🚀',
            'Saturday': '🏖️',
            'Sunday': '☀️'
        }
        
        // Render day statistics
        container.innerHTML = days.map(day => {
            const isBestDay = day.day_name === bestDay && day.avg_pl > 0
            const bgClass = isBestDay ? 'bg-green-50 border-2 border-green-200' : 'bg-gray-50'
            const winRateClass = parseFloat(day.win_rate) >= 70 ? 'text-green-700' : 'text-gray-700'
            const plColor = day.net_pl >= 0 ? 'text-green-600' : 'text-red-600'
            const plSign = day.net_pl >= 0 ? '+' : ''
            const avgSign = day.avg_pl >= 0 ? '+' : ''
            
            const emoji = dayEmojis[day.day_name] || ''
            const displayName = isBestDay ? `${day.day_name} ${emoji}` : day.day_name
            
            return `
                <div class="flex items-center justify-between p-3 ${bgClass} rounded-lg">
                    <div class="font-semibold w-24">${displayName}</div>
                    <div class="text-sm text-gray-600 w-20">${day.total_trades} trades</div>
                    <div class="text-sm font-semibold ${winRateClass} w-20">${day.win_rate}% win</div>
                    <div class="text-sm font-semibold ${plColor} w-24">${plSign}${formatCurrency(day.net_pl)}</div>
                    <div class="text-sm text-gray-600 w-28">Avg: ${avgSign}${formatCurrency(day.avg_pl)}</div>
                </div>
            `
        }).join('')
        
        console.log('Day of week stats loaded:', days.length, 'days')
    } catch (error) {
        console.error('Error loading day of week stats:', error)
        const container = document.getElementById('dt-day-stats-container')
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                Failed to load statistics. Please try again.
            </div>
        `
    }
}


// ============================================================================
// TODAY'S TRADING - ACTIVE/CLOSED POSITIONS AND JOURNAL
// ============================================================================

// Global variable to store today's journal entries
let todayJournalEntries = []

// Store all trades data for modal access (shared with Full History)
let allTradesData = []
let filteredTradesData = []

// Load active trades table (displays in Active Positions section)
async function loadActiveTrades() {
    const section = document.getElementById('dt-active-trades-section')
    const tbody = document.getElementById('dt-active-trades-tbody')
    const countBadge = document.getElementById('dt-active-trade-count')
    const openPositionDisplay = document.getElementById('dt-open-position-display')
    const noOpenPositionDisplay = document.getElementById('dt-no-open-position')
    
    if (!token) {
        section.classList.add('hidden')
        if (openPositionDisplay) openPositionDisplay.classList.add('hidden')
        if (noOpenPositionDisplay) noOpenPositionDisplay.classList.remove('hidden')
        return
    }
    
    try {
        // Get ALL open trades, not just today's
        const response = await api.get('/api/daily-trades')
        const trades = response.data.trades || []
        
        // Update shared data (for modals)
        allTradesData = trades
        
        // Filter only open trades
        const activeTrades = trades.filter(trade => trade.is_open)
        
        if (activeTrades.length === 0) {
            section.classList.add('hidden')
            if (openPositionDisplay) openPositionDisplay.classList.add('hidden')
            if (noOpenPositionDisplay) noOpenPositionDisplay.classList.remove('hidden')
            return
        }
        
        // Show section and update count
        section.classList.remove('hidden')
        countBadge.textContent = `${activeTrades.length} open`
        
        // Hide the "no position" message, show the active trades section
        if (openPositionDisplay) openPositionDisplay.classList.add('hidden')
        if (noOpenPositionDisplay) noOpenPositionDisplay.classList.add('hidden')
        
        // Build table rows
        tbody.innerHTML = activeTrades.map(trade => {
            const entryTime = trade.entry_time ? trade.entry_time.substring(0, 5) : '-'
            const strategyLabel = trade.strategy_type === 'IRON_CONDOR' ? 'Iron Condor' 
                : trade.strategy_type === 'CREDIT_SPREAD_CALL' ? 'Call Spread'
                : 'Put Spread'
            
            // Build spreads display
            let callSpreadDisplay = '-'
            if (trade.call_enabled) {
                callSpreadDisplay = `${trade.call_short_strike} ($${parseFloat(trade.call_total_credit).toFixed(2)})`
            }
            
            let putSpreadDisplay = '-'
            if (trade.put_enabled) {
                putSpreadDisplay = `${trade.put_short_strike} ($${parseFloat(trade.put_total_credit).toFixed(2)})`
            }
            
            return `
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-4 py-3">
                        <div class="font-semibold">${trade.trade_date}</div>
                        <div class="text-xs text-gray-500">${entryTime}</div>
                    </td>
                    <td class="px-4 py-3">${strategyLabel}</td>
                    <td class="px-4 py-3 text-center font-semibold">${trade.contracts}</td>
                    <td class="px-4 py-3">${callSpreadDisplay}</td>
                    <td class="px-4 py-3">${putSpreadDisplay}</td>
                    <td class="px-4 py-3 text-right font-semibold text-green-600">$${parseFloat(trade.total_credit).toFixed(2)}</td>
                    <td class="px-4 py-3 text-right text-gray-600">$${parseFloat(trade.commission || 0).toFixed(2)}</td>
                    <td class="px-4 py-3">
                        <div class="flex justify-center gap-2">
                            <button onclick="openEditTradeModal(${trade.id})" class="text-blue-600 hover:text-blue-800" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="openCloseTradeModal(${trade.id})" class="text-green-600 hover:text-green-800" title="Close Trade">
                                <i class="fas fa-check-circle"></i>
                            </button>
                            <button onclick="deleteTrade(${trade.id})" class="text-red-600 hover:text-red-800" title="Delete Trade">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `
        }).join('')
        
    } catch (error) {
        console.error('Error loading active trades:', error)
        section.classList.add('hidden')
        if (openPositionDisplay) openPositionDisplay.classList.add('hidden')
        if (noOpenPositionDisplay) noOpenPositionDisplay.classList.remove('hidden')
    }
}

// Load closed positions for today
async function loadClosedPositionsToday() {
    const container = document.getElementById('dt-closed-positions-container')
    
    // If no token, show friendly empty state immediately
    if (!token) {
        container.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-calendar-check text-gray-300 text-6xl mb-4"></i>
                <p class="text-gray-500 text-lg">No closed positions today</p>
                <p class="text-gray-400 text-sm mt-2">Closed trades will appear here once you exit a position</p>
            </div>
        `
        return
    }
    
    try {
        const response = await api.get('/api/daily-trades/today')
        const trades = response.data.trades || []
        
        // Filter only closed trades
        const closedPositions = trades.filter(trade => !trade.is_open)
        
        if (closedPositions.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-calendar-check text-gray-300 text-6xl mb-4"></i>
                    <p class="text-gray-500 text-lg">No closed positions today</p>
                    <p class="text-gray-400 text-sm mt-2">Closed trades will appear here once you exit a position</p>
                </div>
            `
            return
        }
        
        // Build table with closed positions
        let tableHTML = `
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-gray-100">
                        <th class="px-4 py-3 text-left">Entry</th>
                        <th class="px-4 py-3 text-left">Exit</th>
                        <th class="px-4 py-3 text-left">Strategy</th>
                        <th class="px-4 py-3 text-right">Credit</th>
                        <th class="px-4 py-3 text-right">Debit</th>
                        <th class="px-4 py-3 text-center">Contracts</th>
                        <th class="px-4 py-3 text-right">P/L</th>
                        <th class="px-4 py-3 text-center">Result</th>
                        <th class="px-4 py-3 text-center">Actions</th>
                    </tr>
                </thead>
                <tbody>
        `
        
        closedPositions.forEach(trade => {
            const entryTime = trade.entry_time ? trade.entry_time.substring(0, 5) : '-'
            const exitTime = trade.exit_time ? trade.exit_time.substring(0, 5) : '-'
            const strategyLabel = trade.strategy_type === 'IRON_CONDOR' ? 'Iron Condor' 
                : trade.strategy_type === 'CREDIT_SPREAD_CALL' ? 'Call Spread'
                : 'Put Spread'
            
            const plColor = trade.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'
            const plSign = trade.profit_loss >= 0 ? '+' : ''
            const statusIcon = trade.profit_loss >= 0 ? '✅' : '❌'
            
            // Calculate profit percentage
            const profitPercent = trade.total_credit > 0 
                ? ((trade.profit_loss / (trade.total_credit * trade.contracts * 100)) * 100).toFixed(0)
                : 0
            
            tableHTML += `
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-4 py-3">${entryTime}</td>
                    <td class="px-4 py-3">${exitTime}</td>
                    <td class="px-4 py-3">${strategyLabel}</td>
                    <td class="px-4 py-3 text-right text-green-600">${formatCurrency(trade.total_credit)}</td>
                    <td class="px-4 py-3 text-right text-red-600">${formatCurrency(trade.total_debit || 0)}</td>
                    <td class="px-4 py-3 text-center font-semibold">${trade.contracts}</td>
                    <td class="px-4 py-3 text-right">
                        <div class="${plColor} font-bold">${plSign}${formatCurrency(trade.profit_loss)}</div>
                        <div class="text-xs text-gray-500">(${profitPercent}%)</div>
                    </td>
                    <td class="px-4 py-3 text-center text-xl">${statusIcon}</td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="reopenDailyTrade(${trade.id})" class="px-3 py-1 bg-amber-500 text-white text-xs rounded hover:bg-amber-600 transition" title="Reopen this trade">
                            <i class="fas fa-undo mr-1"></i>Reopen
                        </button>
                    </td>
                </tr>
            `
        })
        
        tableHTML += '</tbody></table>'
        container.innerHTML = tableHTML
        
        console.log('Closed positions loaded:', closedPositions.length)
    } catch (error) {
        console.error('Error loading closed positions:', error)
        console.log('Error response:', error.response)
        
        // Always show friendly message for any error when loading positions
        // Common scenarios: auth errors, network errors, empty database
        container.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-calendar-check text-gray-300 text-6xl mb-4"></i>
                <p class="text-gray-500 text-lg">No closed positions today</p>
                <p class="text-gray-400 text-sm mt-2">Closed trades will appear here once you exit a position</p>
            </div>
        `
    }
}

// Load trade journal entries for today
async function loadTodayJournal() {
    try {
        const today = new Date().toISOString().split('T')[0]
        
        // For now, store journal entries in localStorage per date
        const storageKey = `journal_${today}`
        const stored = localStorage.getItem(storageKey)
        todayJournalEntries = stored ? JSON.parse(stored) : []
        
        const container = document.getElementById('dt-journal-entries')
        
        if (todayJournalEntries.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-journal-whills text-gray-300 text-6xl mb-4"></i>
                    <p class="text-gray-500 text-lg">No journal entries yet</p>
                    <p class="text-gray-400 text-sm mt-2">Track your thoughts, market observations, and trade rationale</p>
                </div>
            `
            return
        }
        
        // Render journal entries
        container.innerHTML = todayJournalEntries.map((entry, index) => `
            <div class="p-3 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg text-sm flex justify-between items-start">
                <div class="flex-1">
                    <span class="font-semibold text-orange-700">${entry.time}</span>
                    <span class="text-gray-700"> - ${entry.text}</span>
                </div>
                <button onclick="deleteJournalEntry(${index})" class="text-red-500 hover:text-red-700 ml-2" title="Delete entry">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `).join('')
        
        console.log('Journal entries loaded:', todayJournalEntries.length)
    } catch (error) {
        console.error('Error loading journal:', error)
        const container = document.getElementById('dt-journal-entries')
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-triangle mr-2"></i>Failed to load journal
            </div>
        `
    }
}

// Add a journal entry
function addJournalEntry() {
    const input = document.getElementById('dt-journal-input')
    const text = input.value.trim()
    
    if (!text) {
        alert('Please enter a journal entry')
        return
    }
    
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    
    todayJournalEntries.push({ time, text })
    
    // Save to localStorage
    const today = new Date().toISOString().split('T')[0]
    localStorage.setItem(`journal_${today}`, JSON.stringify(todayJournalEntries))
    
    // Clear input and reload
    input.value = ''
    loadTodayJournal()
}

// Delete a journal entry
function deleteJournalEntry(index) {
    if (!confirm('Delete this journal entry?')) return
    
    todayJournalEntries.splice(index, 1)
    
    // Save to localStorage
    const today = new Date().toISOString().split('T')[0]
    localStorage.setItem(`journal_${today}`, JSON.stringify(todayJournalEntries))
    
    // Reload
    loadTodayJournal()
}

// Placeholder functions for trade actions
function closeTrade(tradeId) {
    alert(`Close trade functionality will be implemented. Trade ID: ${tradeId}`)
    // TODO: Implement close trade modal/form
}

function editTradeNotes(tradeId) {
    alert(`Edit notes functionality will be implemented. Trade ID: ${tradeId}`)
    // TODO: Implement edit notes modal
}


// ============================================================================
// DAILY TRADE ENTRY - SUBMIT AND RESET
// ============================================================================

// Submit a new daily trade
async function submitDailyTrade() {
    try {
        // Collect form data
        const entryDate = document.getElementById('dt-entry-date').value
        const entryTime = document.getElementById('dt-entry-time').value
        const spxPrice = parseFloat(document.getElementById('dt-spx-price').value) || null
        const vixPrice = parseFloat(document.getElementById('dt-vix-price').value) || null
        const contracts = parseInt(document.getElementById('dt-contracts').value)
        const strikeWidth = dailyTradeConfigCache?.strike_width || 5
        const notes = document.getElementById('dt-notes').value.trim()
        
        // Check required fields
        if (!entryDate) {
            alert('Please enter an entry date')
            return
        }
        
        if (!entryTime) {
            alert('Please enter an entry time')
            return
        }
        
        if (contracts < 1) {
            alert('Contracts must be at least 1')
            return
        }
        
        // Get call spread data
        const callEnabled = document.getElementById('enable-call-spread').checked
        const callShortStrike = callEnabled ? parseFloat(document.getElementById('call-short-strike').value) : null
        const callTotalCredit = callEnabled ? parseFloat(document.getElementById('call-total-credit').value) : null
        const callCommission = callEnabled ? parseFloat(document.getElementById('call-commission').value) || 0 : 0
        
        // Get put spread data
        const putEnabled = document.getElementById('enable-put-spread').checked
        const putShortStrike = putEnabled ? parseFloat(document.getElementById('put-short-strike').value) : null
        const putTotalCredit = putEnabled ? parseFloat(document.getElementById('put-total-credit').value) : null
        const putCommission = putEnabled ? parseFloat(document.getElementById('put-commission').value) || 0 : 0
        
        // Validate at least one side is enabled
        if (!callEnabled && !putEnabled) {
            alert('Please enable at least one side (Call Spread or Put Spread)')
            return
        }
        
        // Validate strikes and credits
        if (callEnabled && (!callShortStrike || !callTotalCredit)) {
            alert('Please enter Call Spread short strike and credit')
            return
        }
        
        if (putEnabled && (!putShortStrike || !putTotalCredit)) {
            alert('Please enter Put Spread short strike and credit')
            return
        }
        
        // Determine strategy type
        let strategyType = 'IRON_CONDOR'
        if (callEnabled && !putEnabled) {
            strategyType = 'CREDIT_SPREAD_CALL'
        } else if (putEnabled && !callEnabled) {
            strategyType = 'CREDIT_SPREAD_PUT'
        }
        
        // Calculate total credit and commission
        const totalCredit = (callEnabled ? callTotalCredit : 0) + (putEnabled ? putTotalCredit : 0)
        const totalCommission = callCommission + putCommission
        
        // Get account ID from config (if loaded)
        const accountId = null // TODO: Get from config when implemented
        
        // Build trade data
        const tradeData = {
            trade_date: entryDate, // Use the date from the form
            entry_time: entryTime + ':00', // Add seconds
            strategy_type: strategyType,
            contracts: contracts,
            strike_width: strikeWidth,
            call_enabled: callEnabled ? 1 : 0,
            call_short_strike: callShortStrike,
            call_total_credit: callTotalCredit,
            put_enabled: putEnabled ? 1 : 0,
            put_short_strike: putShortStrike,
            put_total_credit: putTotalCredit,
            spx_entry_price: spxPrice,
            vix_entry_price: vixPrice,
            total_credit: totalCredit,
            commission: totalCommission,
            notes: notes || null,
            is_open: 1
        }
        
        // Submit to API
        const response = await api.post('/api/daily-trades', tradeData)
        
        if (response.data.error) {
            alert(`Error: ${response.data.error}`)
            return
        }
        
        // Success!
        showNotification('Trade entered successfully!', 'success')
        
        // Reset form
        resetDailyTradeForm()
        
        // Reload active positions
        await loadActiveTrades()
        
    } catch (error) {
        console.error('Error submitting trade:', error)
        alert(`Failed to enter trade: ${error.response?.data?.error || error.message}`)
    }
}

// Delete a daily trade
async function deleteDailyTrade(tradeId) {
    if (!confirm('Are you sure you want to delete this trade? This action cannot be undone.')) {
        return
    }
    
    try {
        await api.delete(`/api/daily-trades/${tradeId}`)
        showNotification('Trade deleted successfully', 'success')
        
        // Reload all daily trade data
        await loadActiveTrades()
        await loadClosedPositionsToday()
        
        // If on full history, reload that too
        if (allTradesData) {
            await loadFullTradeHistory()
        }
    } catch (error) {
        console.error('Error deleting trade:', error)
        alert(`Failed to delete trade: ${error.response?.data?.error || error.message}`)
    }
}

// Reset the daily trade form
function resetDailyTradeForm() {
    // Reset date and time to current date/time
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    
    document.getElementById('dt-entry-date').value = `${year}-${month}-${day}`
    document.getElementById('dt-entry-time').value = `${hours}:${minutes}`
    
    // Clear SPX price
    document.getElementById('dt-spx-price').value = ''
    
    // Reset contracts to default or 1
    document.getElementById('dt-contracts').value = '1'
    
    // Enable both sides
    document.getElementById('enable-call-spread').checked = true
    document.getElementById('enable-put-spread').checked = true
    
    // Clear strikes and credits
    document.getElementById('call-short-strike').value = ''
    document.getElementById('call-total-credit').value = ''
    document.getElementById('call-commission').value = '1.30'
    document.getElementById('put-short-strike').value = ''
    document.getElementById('put-total-credit').value = ''
    document.getElementById('put-commission').value = '1.30'
    
    // Clear notes
    document.getElementById('dt-notes').value = ''
    
    // Recalculate
    initializeDailyTradeCalculations()
    
    showNotification('Form reset', 'info')
}

// Full History Modal Functions
// (allTradesData and filteredTradesData are declared earlier with Active Trades)

async function openFullHistoryModal() {
    const modal = document.getElementById('full-history-modal')
    modal.classList.remove('hidden')
    await loadFullHistory()
}

function closeFullHistoryModal() {
    const modal = document.getElementById('full-history-modal')
    modal.classList.add('hidden')
}

async function loadFullHistory() {
    try {
        const response = await api.get('/api/daily-trades')
        allTradesData = response.data.trades || []
        filteredTradesData = allTradesData
        renderFullHistory()
    } catch (error) {
        console.error('Error loading full history:', error)
        const tbody = document.getElementById('full-history-tbody')
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="px-4 py-8 text-center text-red-500">
                    Failed to load trade history. Please try again.
                </td>
            </tr>
        `
    }
}

function filterFullHistory() {
    const statusFilter = document.getElementById('history-status-filter').value
    const searchText = document.getElementById('history-search').value.toLowerCase()
    
    filteredTradesData = allTradesData.filter(trade => {
        // Status filter
        if (statusFilter === 'closed' && trade.is_open) return false
        if (statusFilter === 'open' && !trade.is_open) return false
        
        // Search filter
        if (searchText) {
            const strategyLabel = trade.strategy_type === 'IRON_CONDOR' ? 'Iron Condor' 
                : trade.strategy_type === 'CREDIT_SPREAD_CALL' ? 'Call Spread'
                : 'Put Spread'
            
            const searchable = [
                trade.trade_date,
                strategyLabel,
                trade.notes || '',
                trade.exit_reason || ''
            ].join(' ').toLowerCase()
            
            if (!searchable.includes(searchText)) return false
        }
        
        return true
    })
    
    renderFullHistory()
}

function renderFullHistory() {
    const tbody = document.getElementById('full-history-tbody')
    
    if (filteredTradesData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="px-4 py-8 text-center text-gray-500 italic">
                    No trades found matching your filters
                </td>
            </tr>
        `
        return
    }
    
    tbody.innerHTML = filteredTradesData.map(trade => {
        const strategyLabel = trade.strategy_type === 'IRON_CONDOR' ? 'Iron Condor' 
            : trade.strategy_type === 'CREDIT_SPREAD_CALL' ? 'Call Spread'
            : 'Put Spread'
        
        const entryTime = trade.entry_time ? trade.entry_time.substring(0, 5) : '-'
        const exitTime = trade.exit_time ? trade.exit_time.substring(0, 5) : '-'
        
        let statusBadge = ''
        let plDisplay = '-'
        let plColor = 'text-gray-600'
        
        if (trade.is_open) {
            statusBadge = '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">Open</span>'
        } else {
            const plColor = trade.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'
            const plSign = trade.profit_loss >= 0 ? '+' : ''
            plDisplay = `<span class="${plColor} font-semibold">${plSign}${formatCurrency(trade.profit_loss)}</span>`
            const statusIcon = trade.profit_loss >= 0 ? '✅' : '❌'
            statusBadge = `<span class="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">${statusIcon} Closed</span>`
        }
        
        const actionButtons = trade.is_open 
            ? `
                <button onclick="openEditTradeModal(${trade.id})" class="text-blue-600 hover:text-blue-800 mr-2" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="openCloseTradeModal(${trade.id})" class="text-green-600 hover:text-green-800 mr-2" title="Close Trade">
                    <i class="fas fa-check-circle"></i>
                </button>
                <button onclick="deleteTrade(${trade.id})" class="text-red-600 hover:text-red-800" title="Delete Trade">
                    <i class="fas fa-trash"></i>
                </button>
            `
            : `
                <button onclick="openEditTradeModal(${trade.id})" class="text-blue-600 hover:text-blue-800 mr-2" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteTrade(${trade.id})" class="text-red-600 hover:text-red-800" title="Delete Trade">
                    <i class="fas fa-trash"></i>
                </button>
            `
        
        return `
            <tr class="border-b border-gray-200 hover:bg-gray-50">
                <td class="px-4 py-3">${trade.trade_date}</td>
                <td class="px-4 py-3">${entryTime}</td>
                <td class="px-4 py-3">${exitTime}</td>
                <td class="px-4 py-3">${strategyLabel}</td>
                <td class="px-4 py-3 text-right">${formatCurrency(trade.total_credit)}</td>
                <td class="px-4 py-3 text-center">${trade.contracts}</td>
                <td class="px-4 py-3 text-right">${plDisplay}</td>
                <td class="px-4 py-3 text-center">${statusBadge}</td>
                <td class="px-4 py-3 text-center">${actionButtons}</td>
            </tr>
        `
    }).join('')
}

// Edit Trade Modal Functions
async function openEditTradeModal(tradeId) {
    try {
        // Find trade in our data
        const trade = allTradesData.find(t => t.id === tradeId)
        if (!trade) {
            alert('Trade not found')
            return
        }
        
        // Populate ENTRY form fields
        document.getElementById('edit-trade-id').value = trade.id
        document.getElementById('edit-trade-date').value = trade.trade_date
        document.getElementById('edit-entry-time').value = trade.entry_time || ''
        document.getElementById('edit-spx-entry').value = trade.spx_entry_price || ''
        document.getElementById('edit-vix-entry').value = trade.vix_entry_price || ''
        document.getElementById('edit-contracts').value = trade.contracts
        document.getElementById('edit-strike-width').value = trade.strike_width || 5
        document.getElementById('edit-entry-commission').value = trade.commission || 1.30
        document.getElementById('edit-trade-notes').value = trade.notes || ''
        
        // Set strategy type
        document.getElementById('edit-strategy-type').value = trade.strategy_type
        
        // Set up spread sections based on strategy
        const callEnabled = trade.call_enabled || trade.strategy_type === 'IRON_CONDOR' || trade.strategy_type === 'CREDIT_SPREAD_CALL'
        const putEnabled = trade.put_enabled || trade.strategy_type === 'IRON_CONDOR' || trade.strategy_type === 'CREDIT_SPREAD_PUT'
        
        document.getElementById('edit-enable-call-spread').checked = callEnabled
        document.getElementById('edit-enable-put-spread').checked = putEnabled
        
        // Populate spread data
        document.getElementById('edit-call-short-strike').value = trade.call_short_strike || ''
        document.getElementById('edit-call-credit').value = trade.call_total_credit || ''
        document.getElementById('edit-put-short-strike').value = trade.put_short_strike || ''
        document.getElementById('edit-put-credit').value = trade.put_total_credit || ''
        
        // Show/hide EXIT section based on trade status
        const exitSection = document.getElementById('edit-exit-section')
        if (trade.is_open === 0 || trade.is_open === false) {
            // Trade is closed - show exit data
            exitSection.classList.remove('hidden')
            document.getElementById('edit-exit-time').value = trade.exit_time || ''
            document.getElementById('edit-exit-cost').value = trade.total_debit || ''
            document.getElementById('edit-exit-commission').value = trade.close_commission || 1.30
            document.getElementById('edit-exit-reason').value = trade.exit_reason || 'MANUAL'
        } else {
            // Trade is open - hide exit section
            exitSection.classList.add('hidden')
        }
        
        // Update strike width displays
        updateEditStrikeWidthDisplays()
        
        // Update strategy display (show/hide spreads)
        updateEditStrategyDisplay()
        
        // Show modal
        document.getElementById('edit-trade-modal').classList.remove('hidden')
        
    } catch (error) {
        console.error('Error opening edit modal:', error)
        alert('Failed to open edit modal')
    }
}

function closeEditTradeModal() {
    document.getElementById('edit-trade-modal').classList.add('hidden')
}

function updateEditStrikeWidthDisplays() {
    const strikeWidthInput = document.getElementById('edit-strike-width')
    const strikeWidth = strikeWidthInput ? parseInt(strikeWidthInput.value) : 5
    
    const callSpreadTitle = document.getElementById('edit-call-spread-title')
    const putSpreadTitle = document.getElementById('edit-put-spread-title')
    
    if (callSpreadTitle) {
        callSpreadTitle.innerHTML = `<span class="text-red-600">BEARISH:</span> Call Spread <span class="text-sm font-normal text-gray-600">($${strikeWidth} wide)</span>`
    }
    if (putSpreadTitle) {
        putSpreadTitle.innerHTML = `<span class="text-green-600">BULLISH:</span> Put Spread <span class="text-sm font-normal text-gray-600">($${strikeWidth} wide)</span>`
    }
}

function updateEditStrategyDisplay() {
    const strategyType = document.getElementById('edit-strategy-type').value
    const callEnabled = document.getElementById('edit-enable-call-spread').checked
    const putEnabled = document.getElementById('edit-enable-put-spread').checked
    
    const callSection = document.getElementById('edit-call-spread-section')
    const putSection = document.getElementById('edit-put-spread-section')
    const callCheckbox = document.getElementById('edit-enable-call-spread')
    const putCheckbox = document.getElementById('edit-enable-put-spread')
    
    // Strategy-specific behavior
    if (strategyType === 'IRON_CONDOR') {
        // Both spreads must be enabled for Iron Condor
        callSection.classList.remove('hidden')
        putSection.classList.remove('hidden')
        callCheckbox.checked = true
        callCheckbox.disabled = true
        putCheckbox.checked = true
        putCheckbox.disabled = true
    } else if (strategyType === 'CREDIT_SPREAD_CALL') {
        // Only call spread for Call Credit Spread
        callSection.classList.remove('hidden')
        putSection.classList.add('hidden')
        callCheckbox.checked = true
        callCheckbox.disabled = true
        putCheckbox.checked = false
        putCheckbox.disabled = true
    } else if (strategyType === 'CREDIT_SPREAD_PUT') {
        // Only put spread for Put Credit Spread
        callSection.classList.add('hidden')
        putSection.classList.remove('hidden')
        callCheckbox.checked = false
        callCheckbox.disabled = true
        putCheckbox.checked = true
        putCheckbox.disabled = true
    }
}

async function updateTrade(event) {
    event.preventDefault()
    
    try {
        const tradeId = document.getElementById('edit-trade-id').value
        const trade = allTradesData.find(t => t.id == tradeId)
        const strategyType = document.getElementById('edit-strategy-type').value
        const callEnabled = document.getElementById('edit-enable-call-spread').checked
        const putEnabled = document.getElementById('edit-enable-put-spread').checked
        
        const updateData = {
            trade_date: document.getElementById('edit-trade-date').value,
            entry_time: document.getElementById('edit-entry-time').value,
            spx_entry_price: parseFloat(document.getElementById('edit-spx-entry').value) || null,
            vix_entry_price: parseFloat(document.getElementById('edit-vix-entry').value) || null,
            contracts: parseInt(document.getElementById('edit-contracts').value),
            strike_width: parseInt(document.getElementById('edit-strike-width').value) || 5,
            commission: parseFloat(document.getElementById('edit-entry-commission').value) || 1.30,
            strategy_type: strategyType,
            notes: document.getElementById('edit-trade-notes').value
        }
        
        // Add call spread data if enabled
        if (callEnabled) {
            updateData.call_enabled = true
            updateData.call_short_strike = parseFloat(document.getElementById('edit-call-short-strike').value) || 0
            updateData.call_total_credit = parseFloat(document.getElementById('edit-call-credit').value) || 0
        } else {
            updateData.call_enabled = false
            updateData.call_short_strike = null
            updateData.call_total_credit = 0
        }
        
        // Add put spread data if enabled
        if (putEnabled) {
            updateData.put_enabled = true
            updateData.put_short_strike = parseFloat(document.getElementById('edit-put-short-strike').value) || 0
            updateData.put_total_credit = parseFloat(document.getElementById('edit-put-credit').value) || 0
        } else {
            updateData.put_enabled = false
            updateData.put_short_strike = null
            updateData.put_total_credit = 0
        }
        
        // Calculate new total credit
        updateData.total_credit = (updateData.call_total_credit || 0) + (updateData.put_total_credit || 0)
        
        // Add exit data if trade is closed
        const exitSection = document.getElementById('edit-exit-section')
        if (!exitSection.classList.contains('hidden')) {
            updateData.exit_time = document.getElementById('edit-exit-time').value
            updateData.total_debit = parseFloat(document.getElementById('edit-exit-cost').value) || 0
            updateData.close_commission = parseFloat(document.getElementById('edit-exit-commission').value) || 0
            updateData.exit_reason = document.getElementById('edit-exit-reason').value
            
            // Recalculate profit/loss
            const entryCredit = updateData.total_credit * updateData.contracts * 100
            const exitDebit = updateData.total_debit * updateData.contracts * 100
            const entryCommission = updateData.commission || 0
            const closeCommission = updateData.close_commission || 0
            updateData.profit_loss = entryCredit - exitDebit - entryCommission - closeCommission
        }
        
        await api.put(`/api/daily-trades/${tradeId}`, updateData)
        
        showNotification('Trade updated successfully', 'success')
        closeEditTradeModal()
        await loadFullHistory()
        
        // Also reload other views if needed
        if (document.getElementById('dt-performance-tab').classList.contains('hidden') === false) {
            loadRecentTrades()
        }
        if (document.getElementById('dt-today-tab').classList.contains('hidden') === false) {
            loadActiveTrades()
            loadClosedPositionsToday()
        }
        
    } catch (error) {
        console.error('Error updating trade:', error)
        alert(`Failed to update trade: ${error.response?.data?.error || error.message}`)
    }
}

// Close Trade Modal Functions
async function openCloseTradeModal(tradeId) {
    try {
        const trade = allTradesData.find(t => t.id === tradeId)
        if (!trade) {
            alert('Trade not found')
            return
        }
        
        if (!trade.is_open) {
            alert('This trade is already closed')
            return
        }
        
        // Populate hidden field
        document.getElementById('close-trade-id').value = trade.id
        
        // Set exit time to current time (no exit date field - 0DTE uses trade_date)
        const now = new Date()
        const hours = String(now.getHours()).padStart(2, '0')
        const minutes = String(now.getMinutes()).padStart(2, '0')
        
        document.getElementById('close-exit-time').value = `${hours}:${minutes}`
        
        // Clear other fields
        // SPX Exit Price removed - not needed for 0DTE
        document.getElementById('close-exit-cost').value = ''
        document.getElementById('close-commission').value = '1.30'
        document.getElementById('close-trade-notes').value = ''
        
        // Show/hide spread sections - NO LONGER NEEDED
        // Removed call/put spread sections - using single Exit Cost field instead
        
        // Build summary
        const strategyLabel = trade.strategy_type === 'IRON_CONDOR' ? 'Iron Condor' 
            : trade.strategy_type === 'CREDIT_SPREAD_CALL' ? 'Call Spread'
            : 'Put Spread'
        
        // Get strike width from config (default 5)
        const strikeWidth = dailyTradeConfigCache?.strike_width || 5
        
        let strikeInfo = ''
        let titleStrikes = ''
        
        if (trade.call_spread_enabled) {
            const callShort = parseFloat(trade.call_short_strike)
            const callLong = callShort + strikeWidth
            strikeInfo += `<div><strong>Call Strikes:</strong> ${callShort}/${callLong} (Credit: $${parseFloat(trade.call_total_credit).toFixed(2)})</div>`
            titleStrikes += `Call ${callShort}/${callLong}`
        }
        if (trade.put_spread_enabled) {
            const putShort = parseFloat(trade.put_short_strike)
            const putLong = putShort - strikeWidth
            strikeInfo += `<div><strong>Put Strikes:</strong> ${putLong}/${putShort} (Credit: $${parseFloat(trade.put_total_credit).toFixed(2)})</div>`
            if (titleStrikes) titleStrikes += ' | '
            titleStrikes += `Put ${putLong}/${putShort}`
        }
        
        // Update modal title to include strikes
        const modalTitle = document.querySelector('#close-trade-modal h3')
        if (modalTitle) {
            modalTitle.innerHTML = `
                <i class="fas fa-check-circle mr-2"></i>Close Trade: ${strategyLabel} - ${titleStrikes}
            `
        }
        
        document.getElementById('close-trade-summary').innerHTML = `
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div><strong>Date:</strong> ${trade.trade_date}</div>
                <div><strong>Entry:</strong> ${trade.entry_time ? trade.entry_time.substring(0, 5) : '-'}</div>
                <div><strong>Strategy:</strong> ${strategyLabel}</div>
                <div><strong>Contracts:</strong> ${trade.contracts}</div>
                ${strikeInfo}
                <div><strong>Entry Credit:</strong> $${parseFloat(trade.total_credit).toFixed(2)}</div>
                <div><strong>Entry Commission:</strong> $${parseFloat(trade.commission || 1.30).toFixed(2)}</div>
            </div>
        `
        
        // Add listeners for P/L preview
        document.getElementById('close-exit-cost').addEventListener('input', updateClosePLPreview)
        document.getElementById('close-commission').addEventListener('input', updateClosePLPreview)
        
        // Initial preview calculation
        updateClosePLPreview()
        
        // Show modal
        document.getElementById('close-trade-modal').classList.remove('hidden')
        
    } catch (error) {
        console.error('Error opening close modal:', error)
        alert('Failed to open close modal')
    }
}

function closeCloseTradeModal() {
    document.getElementById('close-trade-modal').classList.add('hidden')
}

function updateClosePLPreview() {
    try {
        const tradeId = document.getElementById('close-trade-id').value
        const trade = allTradesData.find(t => t.id == tradeId)
        if (!trade) return
        
        const exitCost = parseFloat(document.getElementById('close-exit-cost').value) || 0
        const closeCommission = parseFloat(document.getElementById('close-commission').value) || 0
        
        const exitDebit = exitCost * trade.contracts * 100
        const entryCredit = trade.total_credit * trade.contracts * 100
        const entryCommission = trade.commission || 1.30
        
        const profitLoss = entryCredit - exitDebit - entryCommission - closeCommission
        
        // Calculate Dollars At Work: For both single spreads and iron condors,
        // only ONE side can be at risk at a time, so use: strike_width × contracts × 100
        // Get strike width from config (not from trade record, which may be outdated)
        const strikeWidth = dailyTradeConfigCache?.strike_width || 5
        const dollarsAtWork = strikeWidth * trade.contracts * 100
        
        // Calculate RORC (Return on Risk Capital)
        const rorc = dollarsAtWork > 0 ? (profitLoss / dollarsAtWork) * 100 : 0
        
        const plDiv = document.getElementById('close-pl-preview')
        const plAmount = document.getElementById('close-pl-amount')
        const rorcAmount = document.getElementById('close-rorc-amount')
        const dollarsAtWorkSpan = document.getElementById('close-dollars-at-work')
        
        // Always show preview when modal is open
        plDiv.classList.remove('hidden')
        
        // Update P/L
        const plColor = profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
        const plSign = profitLoss >= 0 ? '+' : ''
        plAmount.innerHTML = `<span class="${plColor}">${plSign}$${profitLoss.toFixed(2)}</span>`
        
        // Update RORC
        const rorcColor = rorc >= 0 ? 'text-green-600' : 'text-red-600'
        const rorcSign = rorc >= 0 ? '+' : ''
        rorcAmount.innerHTML = `<span class="${rorcColor}">${rorcSign}${rorc.toFixed(2)}%</span>`
        
        // Update Dollars At Work
        dollarsAtWorkSpan.textContent = `$${dollarsAtWork.toFixed(2)}`
        
    } catch (error) {
        console.error('Error calculating P/L preview:', error)
    }
}

async function submitCloseTrade(event) {
    event.preventDefault()
    
    try {
        const tradeId = document.getElementById('close-trade-id').value
        const trade = allTradesData.find(t => t.id == tradeId)
        
        const exitTime = document.getElementById('close-exit-time').value
        const exitCost = parseFloat(document.getElementById('close-exit-cost').value) || 0
        const closeCommission = parseFloat(document.getElementById('close-commission').value) || 0
        
        // Validate required fields
        if (!exitTime) {
            alert('Please enter an exit time')
            return
        }
        
        const closeData = {
            exit_time: exitTime,
            exit_cost: exitCost,
            close_commission: closeCommission,
            exit_reason: document.getElementById('close-exit-reason').value,
            notes: document.getElementById('close-trade-notes').value
        }
        
        await api.post(`/api/daily-trades/${tradeId}/close`, closeData)
        
        showNotification('Trade closed successfully', 'success')
        closeCloseTradeModal()
        await loadFullHistory()
        
        // Reload other views
        if (document.getElementById('dt-performance-tab').classList.contains('hidden') === false) {
            loadRecentTrades()
        }
        if (document.getElementById('dt-today-tab').classList.contains('hidden') === false) {
            loadActiveTrades()
            loadClosedPositionsToday()
        }
        
    } catch (error) {
        console.error('Error closing trade:', error)
        console.error('Error response:', error.response?.data)
        const errorMsg = error.response?.data?.details || error.response?.data?.error || error.message
        alert(`Failed to close trade: ${errorMsg}`)
    }
}

// Delete Trade Function
async function deleteTrade(tradeId) {
    try {
        const trade = allTradesData.find(t => t.id === tradeId)
        if (!trade) {
            alert('Trade not found')
            return
        }
        
        const strategyLabel = trade.strategy_type === 'IRON_CONDOR' ? 'Iron Condor' 
            : trade.strategy_type === 'CREDIT_SPREAD_CALL' ? 'Call Spread'
            : 'Put Spread'
        
        const confirmMsg = `Are you sure you want to DELETE this trade?\n\n` +
            `Date: ${trade.trade_date}\n` +
            `Strategy: ${strategyLabel}\n` +
            `Contracts: ${trade.contracts}\n` +
            `Credit: $${trade.total_credit}\n` +
            `Status: ${trade.is_open ? 'OPEN' : 'CLOSED'}\n\n` +
            `This action cannot be undone!`
        
        if (!confirm(confirmMsg)) {
            return
        }
        
        await api.delete(`/api/daily-trades/${tradeId}`)
        
        showNotification('Trade deleted successfully', 'success')
        await loadFullHistory()
        
        // Reload other views
        if (document.getElementById('dt-performance-tab').classList.contains('hidden') === false) {
            loadRecentTrades()
            loadDayOfWeekStats()
        }
        if (document.getElementById('dt-today-tab').classList.contains('hidden') === false) {
            loadActiveTrades()
            loadClosedPositionsToday()
        }
        
    } catch (error) {
        console.error('Error deleting trade:', error)
        alert(`Failed to delete trade: ${error.response?.data?.error || error.message}`)
    }
}

// Reopen a closed daily trade
async function reopenDailyTrade(tradeId) {
    if (!confirm('Reopen this closed trade? This will clear the exit information and mark it as open.')) {
        return
    }
    
    try {
        await api.put(`/api/daily-trades/${tradeId}/reopen`)
        
        showNotification('Trade reopened successfully!', 'success')
        
        // Reload views
        loadActiveTrades()
        loadClosedPositionsToday()
        
        // Reload other views if visible
        if (document.getElementById('dt-performance-tab').classList.contains('hidden') === false) {
            loadRecentTrades()
            loadDayOfWeekStats()
        }
        
    } catch (error) {
        console.error('Error reopening trade:', error)
        alert(`Failed to reopen trade: ${error.response?.data?.error || error.message}`)
    }
}

// ============================================================================
// REPORTS SECTION - NEW TAB-BASED REPORTS DASHBOARD
// ============================================================================

// Tab switching for reports
function showReportTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.report-tab-content').forEach(tab => {
        tab.classList.add('hidden')
    })
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.report-tab').forEach(btn => {
        btn.classList.remove('active', 'text-brand-teal', 'border-b-2', 'border-brand-teal')
        btn.classList.add('text-gray-600')
    })
    
    // Show selected tab
    const selectedTab = document.getElementById(`report-tab-${tabName}`)
    if (selectedTab) {
        selectedTab.classList.remove('hidden')
    }
    
    // Add active class to selected button
    const selectedBtn = document.querySelector(`.report-tab[data-tab="${tabName}"]`)
    if (selectedBtn) {
        selectedBtn.classList.add('active', 'text-brand-teal', 'border-b-2', 'border-brand-teal')
        selectedBtn.classList.remove('text-gray-600')
    }
    
    // Load data for the selected tab
    switch(tabName) {
        case 'overview':
            loadPortfolioOverview()
            break
        case 'pl-summary':
            loadPLSummary('ytd')
            break
        case 'performance':
            loadPerformanceAnalysis('ytd')
            break
        case 'strategy':
            loadStrategyAnalysis('ytd')
            break
        case 'positions':
            loadPositionAnalysis()
            break
        case 'dividends':
            loadDividendsReport('account', 'ytd')
            break
        case 'closed-trades':
            loadClosedTrades()
            break
        case 'monthly-income':
            initializeMonthlyIncome()
            break
    }
}

// Portfolio Overview - Main function
async function loadPortfolioOverview(timeframe = '12months') {
    try {
        // Fetch portfolio overview data from backend
        const response = await api.get(`/api/reports/portfolio-overview?timeframe=${timeframe}`)
        const data = response.data
        
        // Update key metrics cards
        updateOverviewMetrics(data.metrics)
        
        // Render charts
        renderPortfolioValueChart(data.portfolioValue)
        renderAccountDistributionChart(data.accounts)
        renderMonthlyPLChart(data.monthlyPL)
        
    } catch (error) {
        console.error('Error loading portfolio overview:', error)
        showNotification('Failed to load portfolio overview', 'error')
    }
}

// Change portfolio value chart timeframe
async function changePortfolioTimeframe(timeframe) {
    // Show loading indicator
    const loadingIndicator = document.getElementById('portfolio-chart-loading')
    if (loadingIndicator) {
        loadingIndicator.style.display = 'flex'
    }
    
    // Update button states and disable all buttons
    const buttons = document.querySelectorAll('.portfolio-timeframe-btn')
    buttons.forEach(btn => {
        btn.disabled = true
        const btnTimeframe = btn.getAttribute('data-timeframe')
        if (btnTimeframe === timeframe) {
            btn.classList.add('bg-brand-teal', 'text-white', 'border-brand-teal')
            btn.classList.remove('bg-white', 'text-gray-700')
        } else {
            btn.classList.remove('bg-brand-teal', 'text-white', 'border-brand-teal')
            btn.classList.add('bg-white', 'text-gray-700')
        }
    })
    
    try {
        // Fetch portfolio overview data from backend
        const response = await api.get(`/api/reports/portfolio-overview?timeframe=${timeframe}`)
        const data = response.data
        
        // Update key metrics cards
        updateOverviewMetrics(data.metrics)
        
        // Render charts
        renderPortfolioValueChart(data.portfolioValue)
        renderAccountDistributionChart(data.accounts)
        renderMonthlyPLChart(data.monthlyPL)
    } catch (error) {
        console.error('Error loading portfolio overview:', error)
        showNotification('Failed to load portfolio data', 'error')
    } finally {
        // Hide loading indicator and re-enable buttons
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none'
        }
        buttons.forEach(btn => {
            btn.disabled = false
        })
    }
}

// Store current display currency and metrics for toggling
let currentTotalValueCurrency = 'CAD'
let cachedMetrics = null

// Update metrics cards
function updateOverviewMetrics(metrics) {
    // Cache metrics for currency toggle
    cachedMetrics = metrics
    
    // Total Value - display based on current currency preference
    updateTotalValueDisplay()
    
    // YTD P/L
    const ytdPL = metrics.ytdPL || 0
    const ytdPLElement = document.getElementById('overview-ytd-pl')
    ytdPLElement.textContent = (ytdPL >= 0 ? '+' : '') + formatCurrency(ytdPL, 'USD')
    ytdPLElement.className = `text-2xl font-bold ${ytdPL >= 0 ? 'text-green-600' : 'text-red-600'}`
    
    const ytdChange = metrics.ytdPercentage || 0
    document.getElementById('overview-ytd-pl-change').textContent = 
        `${ytdChange >= 0 ? '↑' : '↓'} ${Math.abs(ytdChange).toFixed(2)}%`
    
    // Win Rate
    document.getElementById('overview-win-rate').textContent = `${(metrics.winRate || 0).toFixed(1)}%`
    document.getElementById('overview-trades-count').textContent = 
        `${metrics.totalTrades || 0} trades (${metrics.winningTrades || 0} wins)`
    
    // Avg P/L
    const avgPL = metrics.avgPL || 0
    const avgPLElement = document.getElementById('overview-avg-pl')
    avgPLElement.textContent = (avgPL >= 0 ? '+' : '') + formatCurrency(avgPL, 'USD')
    avgPLElement.className = `text-2xl font-bold ${avgPL >= 0 ? 'text-green-600' : 'text-red-600'}`
    document.getElementById('overview-best-trade').textContent = 
        `Best: ${formatCurrency(metrics.bestTrade || 0, 'USD')}`
}

// Update total value display based on current currency
function updateTotalValueDisplay() {
    if (!cachedMetrics) return
    
    const totalValueElement = document.getElementById('overview-total-value')
    const subtitleElement = document.getElementById('overview-total-value-subtitle')
    const currencyLabel = document.getElementById('overview-currency-label')
    
    if (currentTotalValueCurrency === 'CAD') {
        totalValueElement.textContent = formatCurrency(cachedMetrics.totalValueCAD, 'CAD')
        subtitleElement.textContent = `USD: ${formatCurrency(cachedMetrics.totalValueUSD, 'USD')}`
        currencyLabel.textContent = '(CAD)'
    } else {
        totalValueElement.textContent = formatCurrency(cachedMetrics.totalValueUSD, 'USD')
        subtitleElement.textContent = `CAD: ${formatCurrency(cachedMetrics.totalValueCAD, 'CAD')}`
        currencyLabel.textContent = '(USD)'
    }
}

// Toggle between CAD and USD display
function toggleTotalValueCurrency() {
    currentTotalValueCurrency = currentTotalValueCurrency === 'CAD' ? 'USD' : 'CAD'
    updateTotalValueDisplay()
}

// Render Portfolio Value Chart (ApexCharts)
function renderPortfolioValueChart(portfolioData) {
    const chartElement = document.getElementById('overview-portfolio-chart')
    
    // Destroy previous chart instance if exists
    if (portfolioValueChart) {
        portfolioValueChart.destroy()
    }
    
    // Prepare data - separate USD and CAD lines
    const dates = portfolioData.map(d => d.date)
    const valuesUSD = portfolioData.map(d => d.valueUSD || 0)
    const valuesCAD = portfolioData.map(d => d.valueCAD || 0)
    const exchangeRates = portfolioData.map(d => d.exchangeRate || 1.35)
    
    const options = {
        series: [{
            name: 'USD Value',
            data: valuesUSD
        }, {
            name: 'CAD Value',
            data: valuesCAD
        }],
        chart: {
            type: 'line',
            height: 350,
            zoom: {
                enabled: true
            },
            toolbar: {
                show: true
            }
        },
        dataLabels: {
            enabled: false
        },
        stroke: {
            curve: 'smooth',
            width: 3
        },
        colors: ['#10B981', '#000000'],  // Green for USD, Black for CAD
        markers: {
            size: 5,
            hover: {
                size: 7
            }
        },
        xaxis: {
            categories: dates,
            labels: {
                rotate: -45,
                style: {
                    fontSize: '12px'
                }
            }
        },
        yaxis: {
            labels: {
                formatter: function(value) {
                    return '$' + (value / 1000).toFixed(0) + 'k'
                }
            }
        },
        legend: {
            position: 'top',
            horizontalAlign: 'center'
        },
        tooltip: {
            shared: true,
            intersect: false,
            custom: function({series, seriesIndex, dataPointIndex, w}) {
                const date = dates[dataPointIndex]
                const usdValue = series[0][dataPointIndex]
                const cadValue = series[1][dataPointIndex]
                const rate = exchangeRates[dataPointIndex]
                
                return '<div class="apexcharts-tooltip-custom" style="padding: 10px; background: white; border: 1px solid #e5e7eb; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">' +
                    '<div style="font-weight: 600; margin-bottom: 8px; color: #111827;">' + date + '</div>' +
                    '<div style="display: flex; align-items: center; margin-bottom: 4px;">' +
                        '<span style="width: 12px; height: 12px; background: #10B981; border-radius: 50%; margin-right: 8px;"></span>' +
                        '<span style="color: #6B7280;">USD:</span>' +
                        '<span style="margin-left: auto; font-weight: 600; color: #111827;">$' + usdValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '</span>' +
                    '</div>' +
                    '<div style="display: flex; align-items: center; margin-bottom: 8px;">' +
                        '<span style="width: 12px; height: 12px; background: #000000; border-radius: 50%; margin-right: 8px;"></span>' +
                        '<span style="color: #6B7280;">CAD:</span>' +
                        '<span style="margin-left: auto; font-weight: 600; color: #111827;">$' + cadValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '</span>' +
                    '</div>' +
                    '<div style="padding-top: 8px; border-top: 1px solid #e5e7eb; color: #6B7280; font-size: 12px;">' +
                        'Exchange Rate: 1 USD = ' + rate.toFixed(4) + ' CAD' +
                    '</div>' +
                '</div>'
            }
        },
        grid: {
            borderColor: '#f1f1f1'
        }
    }
    
    portfolioValueChart = new ApexCharts(chartElement, options)
    portfolioValueChart.render()
}

// Render Account Distribution Chart (Donut)
function renderAccountDistributionChart(accountsData) {
    const chartElement = document.getElementById('overview-account-chart')
    
    // Destroy previous chart instance if exists
    if (accountDistributionChart) {
        accountDistributionChart.destroy()
    }
    
    const accountNames = accountsData.map(a => a.name)
    const accountValues = accountsData.map(a => a.value)
    
    const options = {
        series: accountValues,
        chart: {
            type: 'donut',
            height: 300
        },
        labels: accountNames,
        colors: ['#0D9488', '#F59E0B', '#3B82F6', '#8B5CF6', '#10B981'],
        legend: {
            position: 'bottom'
        },
        plotOptions: {
            pie: {
                donut: {
                    size: '65%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total Value',
                            formatter: function(w) {
                                const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0)
                                return '$' + (total / 1000).toFixed(1) + 'k'
                            }
                        }
                    }
                }
            }
        },
        tooltip: {
            y: {
                formatter: function(value) {
                    return '$' + value.toFixed(2)
                }
            }
        }
    }
    
    accountDistributionChart = new ApexCharts(chartElement, options)
    accountDistributionChart.render()
}

// Render Monthly P/L Chart (Bar)
function renderMonthlyPLChart(monthlyData) {
    const chartElement = document.getElementById('overview-monthly-pl-chart')
    
    // Destroy previous chart instance if exists
    if (monthlyPLChart) {
        monthlyPLChart.destroy()
    }
    
    const months = monthlyData.map(m => m.month)
    const plValues = monthlyData.map(m => m.pl)
    
    const options = {
        series: [{
            name: 'Monthly P/L',
            data: plValues
        }],
        chart: {
            type: 'bar',
            height: 300
        },
        plotOptions: {
            bar: {
                borderRadius: 4,
                dataLabels: {
                    position: 'top'
                },
                colors: {
                    ranges: [{
                        from: -10000,
                        to: 0,
                        color: '#EF4444'
                    }, {
                        from: 0,
                        to: 100000,
                        color: '#10B981'
                    }]
                }
            }
        },
        dataLabels: {
            enabled: false
        },
        xaxis: {
            categories: months,
            labels: {
                style: {
                    fontSize: '12px'
                }
            }
        },
        yaxis: {
            labels: {
                formatter: function(value) {
                    return '$' + (value / 1000).toFixed(1) + 'k'
                }
            }
        },
        tooltip: {
            y: {
                formatter: function(value) {
                    return '$' + value.toFixed(2)
                }
            }
        },
        grid: {
            borderColor: '#f1f1f1'
        }
    }
    
    monthlyPLChart = new ApexCharts(chartElement, options)
    monthlyPLChart.render()
}

// ===== UTILITIES FUNCTIONS =====

// Handle option tax file upload
async function handleOptionTaxFileUpload(event) {
    const file = event.target.files[0]
    if (!file) return
    
    // Validate file type
    if (!file.name.endsWith('.csv')) {
        alert('Please upload a CSV file')
        event.target.value = '' // Clear on validation failure
        return
    }
    
    // Show status
    const statusDiv = document.getElementById('option-tax-status')
    const statusText = document.getElementById('option-tax-status-text')
    statusDiv.classList.remove('hidden')
    statusText.textContent = 'Processing file...'
    
    try {
        // Create form data
        const formData = new FormData()
        formData.append('file', file)
        
        // Clear the input immediately after reading the file to prevent re-uploads
        event.target.value = ''
        
        // Upload and process
        const response = await fetch('/api/utilities/transform-option-tax', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        })
        
        if (!response.ok) {
            const errorData = await response.json()
            let errorMessage = errorData.error || 'Failed to process file'
            
            // If debug info is available, show it in console and alert
            if (errorData.debug) {
                console.log('Debug information:', errorData.debug)
                errorMessage += '\n\nDebug Info (check console for details):\n'
                if (errorData.debug.missingColumns) {
                    errorMessage += `\nMissing columns: ${errorData.debug.missingColumns.join(', ')}`
                    errorMessage += `\nFound columns: ${errorData.debug.foundHeaders.join(', ')}`
                }
                if (errorData.debug.hint) {
                    errorMessage += `\n\n${errorData.debug.hint}`
                }
            }
            
            throw new Error(errorMessage)
        }
        
        // Download the result
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'option_tax_transform_output.csv'
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        
        // Show success
        statusText.textContent = 'File processed successfully! Download started.'
        statusDiv.querySelector('i').classList.remove('fa-spinner', 'fa-spin')
        statusDiv.querySelector('i').classList.add('fa-check-circle', 'text-green-600')
        
        // Reset after 3 seconds (file input already cleared above)
        setTimeout(() => {
            statusDiv.classList.add('hidden')
            statusDiv.querySelector('i').classList.remove('fa-check-circle', 'text-green-600')
            statusDiv.querySelector('i').classList.add('fa-spinner', 'fa-spin')
        }, 3000)
        
    } catch (error) {
        console.error('Error processing file:', error)
        statusText.textContent = `Error: ${error.message}`
        statusDiv.querySelector('i').classList.remove('fa-spinner', 'fa-spin')
        statusDiv.querySelector('i').classList.add('fa-exclamation-circle', 'text-red-600')
        
        // Reset after 5 seconds (file input already cleared above, but do it again to be safe)
        setTimeout(() => {
            statusDiv.classList.add('hidden')
            statusDiv.querySelector('i').classList.remove('fa-exclamation-circle', 'text-red-600')
            statusDiv.querySelector('i').classList.add('fa-spinner', 'fa-spin')
            event.target.value = ''  // Clear file input again
        }, 5000)
    }
}

// ============================================================================
// HISTORICAL BALANCES FUNCTIONS
// ============================================================================

// Load historical balances when utilities section is shown
async function loadHistoricalBalances() {
    try {
        // Check if user is logged in
        const token = localStorage.getItem('token')
        if (!token) {
            const tbody = document.getElementById('historical-balances-table')
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="px-4 py-8 text-center text-gray-500">
                            <i class="fas fa-lock text-3xl mb-2"></i>
                            <p class="font-semibold">Please log in to view historical balances</p>
                        </td>
                    </tr>
                `
            }
            return
        }
        
        // Load accounts for dropdown
        const accountsResponse = await fetch('/api/accounts', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        })
        
        if (accountsResponse.ok) {
            const data = await accountsResponse.json()
            const accounts = data.accounts || []
            
            // Populate form dropdown
            const select = document.getElementById('hist-balance-account')
            if (select) {
                select.innerHTML = '<option value="">Select Account...</option>'
                accounts.forEach(account => {
                    const option = document.createElement('option')
                    option.value = account.id
                    option.textContent = `${account.account_name} (${account.account_type})`
                    select.appendChild(option)
                })
            }
            
            // Populate filter dropdown
            const filterSelect = document.getElementById('hist-balance-filter')
            if (filterSelect) {
                filterSelect.innerHTML = '<option value="">All Accounts</option>'
                accounts.forEach(account => {
                    const option = document.createElement('option')
                    option.value = account.id
                    option.textContent = `${account.account_name} (${account.account_type})`
                    filterSelect.appendChild(option)
                })
            }
        }
        
        // Load historical balances for the table
        await loadHistoricalBalancesTable()
        
    } catch (error) {
        console.error('Error loading historical balances:', error)
        const tbody = document.getElementById('historical-balances-table')
        if (tbody) {
            // Show error message in table instead of alert
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-4 py-8 text-center text-orange-500">
                        <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                        <p class="font-semibold">Unable to load historical balances</p>
                        <p class="text-sm mt-2 text-gray-600">Please ensure you're logged in and try refreshing the page</p>
                    </td>
                </tr>
            `
        }
    }
}

// Calculate the other currency balance
function calculateHistoricalBalance() {
    const currency = document.getElementById('hist-balance-currency').value
    const amount = parseFloat(document.getElementById('hist-balance-amount').value) || 0
    const rate = parseFloat(document.getElementById('hist-balance-rate').value) || 0
    
    const calculatedInput = document.getElementById('hist-balance-calculated')
    const calculatedLabel = document.getElementById('hist-balance-calculated-label')
    
    if (amount && rate) {
        if (currency === 'USD') {
            const cad = (amount * rate).toFixed(2)
            calculatedInput.value = `$${cad}`
            calculatedLabel.textContent = 'CAD Balance'
        } else {
            const usd = (amount / rate).toFixed(2)
            calculatedInput.value = `$${usd}`
            calculatedLabel.textContent = 'USD Balance'
        }
    } else {
        calculatedInput.value = ''
    }
}

// Save historical balance
async function saveHistoricalBalance() {
    try {
        const account_id = document.getElementById('hist-balance-account').value
        const balance_date = document.getElementById('hist-balance-date').value
        const currency = document.getElementById('hist-balance-currency').value
        const entered_amount = document.getElementById('hist-balance-amount').value
        const exchange_rate = document.getElementById('hist-balance-rate').value
        const edit_id = document.getElementById('hist-balance-edit-id').value
        
        // Validate
        if (!account_id) {
            alert('Please select an account')
            return
        }
        if (!balance_date) {
            alert('Please select a month/year')
            return
        }
        if (!entered_amount || parseFloat(entered_amount) <= 0) {
            alert('Please enter a valid balance amount')
            return
        }
        if (!exchange_rate || parseFloat(exchange_rate) <= 0) {
            alert('Please enter a valid exchange rate')
            return
        }
        
        // Parse month and year from YYYY-MM format
        const [year, month] = balance_date.split('-').map(n => parseInt(n))
        
        const method = edit_id ? 'PUT' : 'POST'
        const url = edit_id ? `/api/historical-balances/${edit_id}` : '/api/historical-balances'
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                account_id,
                month,
                year,
                currency,
                balance: parseFloat(entered_amount),
                exchange_rate_to_cad: parseFloat(exchange_rate)
            })
        })
        
        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Failed to save balance')
        }
        
        alert(edit_id ? 'Balance updated successfully!' : 'Balance saved successfully!')
        clearHistoricalBalanceForm()
        
        // Reload table with current filter
        const filterSelect = document.getElementById('hist-balance-filter')
        const accountId = filterSelect && filterSelect.value ? filterSelect.value : null
        loadHistoricalBalancesTable(accountId)
        
    } catch (error) {
        console.error('Error saving historical balance:', error)
        alert(error.message)
    }
}

// Edit historical balance - show modal
async function editHistoricalBalance(id) {
    try {
        const response = await fetch('/api/historical-balances', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        })
        
        if (!response.ok) throw new Error('Failed to load balance')
        
        const balances = await response.json()
        const balance = balances.find(b => b.id === id)
        
        if (!balance) throw new Error('Balance not found')
        
        // Populate modal accounts dropdown
        const accountsResponse = await fetch('/api/accounts', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        })
        
        if (accountsResponse.ok) {
            const data = await accountsResponse.json()
            const accounts = data.accounts || []
            const select = document.getElementById('edit-hist-balance-account')
            if (select) {
                select.innerHTML = '<option value="">Select Account...</option>'
                accounts.forEach(account => {
                    const option = document.createElement('option')
                    option.value = account.id
                    option.textContent = `${account.account_name} (${account.account_type})`
                    select.appendChild(option)
                })
            }
        }
        
        // Populate modal form
        document.getElementById('edit-hist-balance-account').value = balance.account_id
        const monthStr = String(balance.month).padStart(2, '0')
        document.getElementById('edit-hist-balance-date').value = `${balance.year}-${monthStr}`
        document.getElementById('edit-hist-balance-currency').value = balance.currency
        document.getElementById('edit-hist-balance-amount').value = balance.balance
        document.getElementById('edit-hist-balance-rate').value = balance.exchange_rate_to_cad
        document.getElementById('edit-hist-balance-id').value = balance.id
        
        calculateEditHistoricalBalance()
        
        // Show modal
        document.getElementById('edit-hist-balance-modal').classList.remove('hidden')
        
    } catch (error) {
        console.error('Error editing historical balance:', error)
        alert('Failed to load balance for editing')
    }
}

// Delete historical balance
async function deleteHistoricalBalance(id) {
    if (!confirm('Are you sure you want to delete this historical balance entry?')) {
        return
    }
    
    try {
        const response = await fetch(`/api/historical-balances/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        })
        
        if (!response.ok) throw new Error('Failed to delete balance')
        
        alert('Balance deleted successfully!')
        
        // Reload table with current filter
        const filterSelect = document.getElementById('hist-balance-filter')
        const accountId = filterSelect && filterSelect.value ? filterSelect.value : null
        loadHistoricalBalancesTable(accountId)
        
    } catch (error) {
        console.error('Error deleting historical balance:', error)
        alert('Failed to delete balance')
    }
}

// Clear historical balance form
function clearHistoricalBalanceForm() {
    document.getElementById('hist-balance-account').value = ''
    document.getElementById('hist-balance-date').value = ''
    document.getElementById('hist-balance-currency').value = 'USD'
    document.getElementById('hist-balance-amount').value = ''
    document.getElementById('hist-balance-rate').value = ''
    document.getElementById('hist-balance-calculated').value = ''
    document.getElementById('hist-balance-edit-id').value = ''
}

// ============================================================================
// UTILITIES TAB SWITCHING
// ============================================================================

function showUtilityTab(tabName) {
    // Hide all utility content
    document.querySelectorAll('.utility-content').forEach(content => {
        content.classList.add('hidden')
    })
    
    // Remove active class from all tabs
    document.querySelectorAll('.utility-tab').forEach(tab => {
        tab.classList.remove('active', 'border-brand-teal', 'text-brand-teal')
        tab.classList.add('text-gray-600', 'border-transparent')
    })
    
    // Show selected content
    const content = document.getElementById(`${tabName}-utility`)
    if (content) {
        content.classList.remove('hidden')
    }
    
    // Add active class to selected tab
    const activeTab = document.querySelector(`[data-utility-tab="${tabName}"]`)
    if (activeTab) {
        activeTab.classList.add('active', 'border-brand-teal', 'text-brand-teal')
        activeTab.classList.remove('text-gray-600', 'border-transparent')
    }
    
    // Load data if switching to historical balances
    if (tabName === 'historical-balances') {
        loadHistoricalBalances()
    }
    
    // Load data if switching to dividend repository
    if (tabName === 'dividend-repository') {
        loadDividendRepository()
        loadDividendFetchLogs()
    }
}

// ====================================
// Dividend Repository Functions
// ====================================

async function fetchDividends() {
    try {
        const token = localStorage.getItem('token')
        if (!token) {
            showNotification('Please log in first', 'error')
            return
        }
        
        const btn = document.getElementById('fetch-dividends-btn')
        const statusDiv = document.getElementById('fetch-status')
        
        btn.disabled = true
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Fetching dividends...'
        statusDiv.innerHTML = '<div class="text-blue-600"><i class="fas fa-info-circle mr-1"></i>Processing... This may take a few minutes.</div>'
        
        const response = await fetch('/api/dividend-repository/fetch', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })
        
        const data = await response.json()
        
        btn.disabled = false
        btn.innerHTML = '<i class="fas fa-sync mr-2"></i>Fetch Dividends for All Holdings'
        
        if (response.ok || response.status === 202) {
            // Handle 202 Accepted response (background processing started)
            if (data.status === 'accepted') {
                statusDiv.innerHTML = `
                    <div class="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
                        <div class="font-semibold text-blue-900 mb-1">
                            <i class="fas fa-clock mr-1"></i>Dividend fetch started in background
                        </div>
                        <div class="text-blue-700">
                            • Processing is running in the background (4-5 minutes)<br>
                            • Check "Fetch History Logs" below for progress<br>
                            • You can continue using the app while it completes<br>
                            • Started at: ${new Date(data.started_at).toLocaleTimeString()}
                        </div>
                    </div>
                `
                
                // Reload logs immediately to show the new "in_progress" entry
                loadDividendFetchLogs()
                
                // Poll for completion every 15 seconds for up to 6 minutes
                let pollCount = 0
                const maxPolls = 24 // 6 minutes (24 * 15 seconds)
                const pollInterval = setInterval(async () => {
                    pollCount++
                    
                    // Check if we should stop polling
                    if (pollCount >= maxPolls) {
                        clearInterval(pollInterval)
                        statusDiv.innerHTML = `
                            <div class="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
                                <div class="font-semibold text-yellow-900 mb-1">
                                    <i class="fas fa-info-circle mr-1"></i>Still processing...
                                </div>
                                <div class="text-yellow-700">
                                    The fetch is taking longer than expected. Check the Fetch History Logs below for the latest status.
                                </div>
                            </div>
                        `
                        return
                    }
                    
                    // Reload logs to check for completion
                    await loadDividendFetchLogs()
                    
                    // Check if the most recent log is completed
                    try {
                        const logsResponse = await fetch('/api/dividend-repository/logs', {
                            headers: { 'Authorization': `Bearer ${token}` }
                        })
                        if (logsResponse.ok) {
                            const logsData = await logsResponse.json()
                            if (logsData.logs && logsData.logs.length > 0) {
                                const latestLog = logsData.logs[0]
                                if (latestLog.status === 'success' || latestLog.status === 'partial' || latestLog.status === 'failed') {
                                    // Fetch completed!
                                    clearInterval(pollInterval)
                                    
                                    statusDiv.innerHTML = `
                                        <div class="bg-green-50 border border-green-200 rounded p-3 text-sm">
                                            <div class="font-semibold text-green-900 mb-1">
                                                <i class="fas fa-check-circle mr-1"></i>Fetch completed!
                                            </div>
                                            <div class="text-green-700">
                                                • Status: ${latestLog.status}<br>
                                                • Found ${latestLog.dividends_found || 0} dividends<br>
                                                • ${latestLog.dividends_eligible || 0} eligible based on holding dates<br>
                                                • ${latestLog.api_calls_made || 0} API calls made<br>
                                                • Completed in ${((latestLog.fetch_duration_ms || 0) / 1000).toFixed(2)} seconds
                                            </div>
                                            ${latestLog.error_message ? `<div class="text-orange-600 mt-2">Errors: ${latestLog.error_message}</div>` : ''}
                                        </div>
                                    `
                                    
                                    // Reload the dividend repository to show new data
                                    loadDividendRepository()
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error polling for fetch completion:', e)
                    }
                }, 15000) // Poll every 15 seconds
                
            } else {
                // Legacy synchronous response (should not happen with new code)
                // Build debug info HTML if available
                let debugHTML = ''
                if (data.debug && data.debug.length > 0) {
                    debugHTML = `
                        <details class="mt-3">
                            <summary class="cursor-pointer text-gray-700 font-medium">
                                <i class="fas fa-bug mr-1"></i>Debug Info (${data.debug.length} entries)
                            </summary>
                            <div class="mt-2 text-xs text-gray-600 max-h-64 overflow-y-auto bg-gray-50 p-2 rounded">
                                ${data.debug.map(log => `<div class="mb-1">${log}</div>`).join('')}
                            </div>
                        </details>
                    `
                }
                
                statusDiv.innerHTML = `
                    <div class="bg-green-50 border border-green-200 rounded p-3 text-sm">
                        <div class="font-semibold text-green-900 mb-1">
                            <i class="fas fa-check-circle mr-1"></i>Fetch completed successfully!
                        </div>
                        <div class="text-green-700">
                            • Found ${data.dividends_found} dividends<br>
                            • ${data.dividends_eligible} are eligible based on your holding dates<br>
                            • ${data.api_calls_made} API calls made<br>
                            • Completed in ${(data.duration_ms / 1000).toFixed(2)} seconds
                        </div>
                        ${data.errors ? `<div class="text-orange-600 mt-2">Some errors occurred: ${data.errors.join('; ')}</div>` : ''}
                        ${debugHTML}
                    </div>
                `
                loadDividendRepository()
                loadDividendFetchLogs()
            }
        } else {
            statusDiv.innerHTML = `
                <div class="text-red-600">
                    <i class="fas fa-exclamation-triangle mr-1"></i>
                    ${data.error || 'Failed to fetch dividends'}
                </div>
            `
        }
    } catch (error) {
        console.error('Error fetching dividends:', error)
        const btn = document.getElementById('fetch-dividends-btn')
        const statusDiv = document.getElementById('fetch-status')
        btn.disabled = false
        btn.innerHTML = '<i class="fas fa-sync mr-2"></i>Fetch Dividends for All Holdings'
        statusDiv.innerHTML = '<div class="text-red-600"><i class="fas fa-times-circle mr-1"></i>Error: ' + error.message + '</div>'
    }
}

async function loadDividendRepository() {
    try {
        const token = localStorage.getItem('token')
        if (!token) return
        
        const tickerFilter = document.getElementById('dividend-ticker-filter')
        if (!tickerFilter) return // Not on dividend page
        
        const ticker = tickerFilter.value
        
        let url = `/api/dividend-repository?status=all`
        if (ticker) {
            url += `&ticker=${ticker.toUpperCase()}`
        }
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        
        if (!response.ok) throw new Error('Failed to load dividends')
        
        const data = await response.json()
        const tbody = document.getElementById('dividend-repository-table')
        
        if (!tbody) return // Table not found
        
        if (!data.dividends || data.dividends.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                        <i class="fas fa-coins text-3xl mb-2"></i>
                        <p>No dividends found matching your filters</p>
                    </td>
                </tr>
            `
            updateDividendStats([])
            return
        }
        
        tbody.innerHTML = ''
        data.dividends.forEach(div => {
            const row = document.createElement('tr')
            row.className = 'border-b border-gray-100 hover:bg-gray-50'
            
            // Format frequency
            let frequencyText = 'Unknown'
            if (div.frequency === 52) frequencyText = 'Weekly'
            else if (div.frequency === 12) frequencyText = 'Monthly'
            else if (div.frequency === 4) frequencyText = 'Quarterly'
            else if (div.frequency === 2) frequencyText = 'Semi-Annual'
            else if (div.frequency === 1) frequencyText = 'Annual'
            else if (div.frequency) frequencyText = `${div.frequency}/year`
            
            row.innerHTML = `
                <td class="px-4 py-3">
                    <div class="font-semibold text-gray-800">${div.ticker}</div>
                </td>
                <td class="px-4 py-3 text-sm">${div.ex_date}</td>
                <td class="px-4 py-3 text-sm">${div.pay_date || 'N/A'}</td>
                <td class="px-4 py-3 text-right font-mono text-sm">$${parseFloat(div.amount).toFixed(4)}</td>
                <td class="px-4 py-3 text-sm text-gray-600">${frequencyText}</td>
                <td class="px-4 py-3 text-center">
                    <button onclick="openEditDividendModal(${div.id})" class="text-brand-teal hover:text-teal-700" title="Edit dividend">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            `
            tbody.appendChild(row)
        })
        
        updateDividendStats(data.dividends)
        
    } catch (error) {
        console.error('Error loading dividend repository:', error)
        showNotification('Failed to load dividend repository', 'error')
    }
}

function updateDividendStats(dividends) {
    const total = dividends.length
    const weekly = dividends.filter(d => d.frequency === 52).length
    const monthly = dividends.filter(d => d.frequency === 12).length
    const quarterly = dividends.filter(d => d.frequency === 4).length
    
    const statsTotal = document.getElementById('stats-total')
    const statsEligible = document.getElementById('stats-eligible')
    const statsPending = document.getElementById('stats-pending')
    const statsTotalAmount = document.getElementById('stats-total-amount')
    
    if (statsTotal) statsTotal.textContent = total
    if (statsEligible) statsEligible.textContent = weekly
    if (statsPending) statsPending.textContent = monthly
    if (statsTotalAmount) statsTotalAmount.textContent = quarterly
}

async function loadDividendFetchLogs() {
    try {
        const token = localStorage.getItem('token')
        if (!token) return
        
        const response = await fetch('/api/dividend-repository/logs', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        
        if (!response.ok) return
        
        const data = await response.json()
        const logsDiv = document.getElementById('dividend-fetch-logs')
        
        if (!logsDiv) return // Not on dividend page
        
        if (!data.logs || data.logs.length === 0) {
            logsDiv.innerHTML = '<p class="text-sm text-gray-500">No fetch history yet</p>'
            return
        }
        
        logsDiv.innerHTML = data.logs.map(log => `
            <div class="bg-white border border-gray-200 rounded p-3">
                <div class="flex justify-between items-start mb-1">
                    <span class="font-semibold text-sm">${new Date(log.started_at).toLocaleString()}</span>
                    <span class="text-xs px-2 py-1 rounded ${log.status === 'success' ? 'bg-green-100 text-green-700' : log.status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">
                        ${log.status}
                    </span>
                </div>
                <div class="text-xs text-gray-600">
                    Tickers: ${log.tickers_processed || 'N/A'}<br>
                    Found: ${log.dividends_found} | Eligible: ${log.dividends_eligible} | API Calls: ${log.api_calls_made}<br>
                    Duration: ${log.fetch_duration_ms ? (log.fetch_duration_ms / 1000).toFixed(2) + 's' : 'N/A'}
                    ${log.error_message ? `<br><span class="text-red-600">Errors: ${log.error_message}</span>` : ''}
                </div>
            </div>
        `).join('')
    } catch (error) {
        console.error('Error loading fetch logs:', error)
    }
}

async function openEditDividendModal(dividendId) {
    try {
        const token = localStorage.getItem('token')
        if (!token) return
        
        // Fetch dividend details
        const response = await fetch(`/api/dividend-repository/${dividendId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        
        if (!response.ok) throw new Error('Failed to load dividend details')
        
        const dividend = await response.json()
        
        // Populate form fields
        document.getElementById('edit-dividend-id').value = dividend.id
        document.getElementById('edit-dividend-ticker').value = dividend.ticker
        document.getElementById('edit-dividend-ex-date').value = dividend.ex_date
        document.getElementById('edit-dividend-pay-date').value = dividend.pay_date || ''
        document.getElementById('edit-dividend-record-date').value = dividend.record_date || ''
        document.getElementById('edit-dividend-declared-date').value = dividend.declared_date || ''
        document.getElementById('edit-dividend-amount').value = dividend.amount
        document.getElementById('edit-dividend-frequency').value = dividend.frequency || '12'
        
        // Show modal
        document.getElementById('edit-dividend-modal').classList.remove('hidden')
    } catch (error) {
        console.error('Error opening edit modal:', error)
        showNotification('Failed to load dividend details', 'error')
    }
}

function closeEditDividendModal() {
    document.getElementById('edit-dividend-modal').classList.add('hidden')
}

async function saveEditDividend() {
    try {
        const token = localStorage.getItem('token')
        if (!token) return
        
        const dividendId = document.getElementById('edit-dividend-id').value
        const exDate = document.getElementById('edit-dividend-ex-date').value
        const amount = document.getElementById('edit-dividend-amount').value
        
        // Validate required fields
        if (!exDate || !amount) {
            showNotification('Ex-Date and Amount are required', 'error')
            return
        }
        
        // Build update payload
        const payload = {
            ex_date: exDate,
            pay_date: document.getElementById('edit-dividend-pay-date').value || null,
            record_date: document.getElementById('edit-dividend-record-date').value || null,
            declared_date: document.getElementById('edit-dividend-declared-date').value || null,
            amount: parseFloat(amount),
            frequency: parseInt(document.getElementById('edit-dividend-frequency').value)
        }
        
        const response = await fetch(`/api/dividend-repository/${dividendId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        
        if (!response.ok) throw new Error('Failed to update dividend')
        
        showNotification('Dividend updated successfully', 'success')
        closeEditDividendModal()
        loadDividendRepository()
        
    } catch (error) {
        console.error('Error saving dividend:', error)
        showNotification('Failed to save dividend changes', 'error')
    }
}

// Load historical balances table with optional account filter
async function loadHistoricalBalancesTable(accountId = null) {
    try {
        const token = localStorage.getItem('token')
        if (!token) {
            const tbody = document.getElementById('historical-balances-table')
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="px-4 py-8 text-center text-gray-500">
                            <i class="fas fa-lock text-3xl mb-2"></i>
                            <p class="font-semibold">Please log in to view historical balances</p>
                        </td>
                    </tr>
                `
            }
            return
        }
        
        // Build URL with optional filter
        let url = '/api/historical-balances'
        if (accountId) {
            url += `?account_id=${accountId}`
        }
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        
        if (!response.ok) {
            const error = await response.json()
            if (response.status === 401) {
                throw new Error('Please log in to view historical balances')
            }
            throw new Error(error.error || 'Failed to load historical balances')
        }
        
        const balances = await response.json()
        const tbody = document.getElementById('historical-balances-table')
        
        if (!tbody) return
        
        if (balances.length === 0) {
            const filterSelect = document.getElementById('hist-balance-filter')
            const accountName = filterSelect && filterSelect.value ? 
                filterSelect.options[filterSelect.selectedIndex].text : 'this account'
            
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-4 py-8 text-center text-gray-500">
                        <i class="fas fa-inbox text-3xl mb-2"></i>
                        <p>${accountId ? `No historical balances for ${accountName}` : 'No historical balances yet'}</p>
                    </td>
                </tr>
            `
            return
        }
        
        tbody.innerHTML = balances.map(balance => {
            const date = `${balance.year}-${String(balance.month).padStart(2, '0')}`
            const balanceAmount = parseFloat(balance.balance).toFixed(2)
            const rate = parseFloat(balance.exchange_rate_to_cad).toFixed(6)
            
            // Calculate USD and CAD balances
            let usd, cad
            if (balance.currency === 'USD') {
                usd = balanceAmount
                cad = (parseFloat(balance.balance) * balance.exchange_rate_to_cad).toFixed(2)
            } else {
                cad = balanceAmount
                usd = (parseFloat(balance.balance) * balance.exchange_rate_to_usd).toFixed(2)
            }
            
            return `
                <tr class="border-t border-gray-200 hover:bg-gray-50">
                    <td class="px-4 py-2 text-sm">${date}</td>
                    <td class="px-4 py-2 text-sm">${balance.account_name}</td>
                    <td class="px-4 py-2 text-sm">${balance.currency}</td>
                    <td class="px-4 py-2 text-sm text-right">$${balanceAmount}</td>
                    <td class="px-4 py-2 text-sm text-right">${rate}</td>
                    <td class="px-4 py-2 text-sm text-right">$${usd}</td>
                    <td class="px-4 py-2 text-sm text-right">$${cad}</td>
                    <td class="px-4 py-2 text-center">
                        <button onclick="editHistoricalBalance(${balance.id})" class="text-blue-600 hover:text-blue-800 mx-1" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteHistoricalBalance(${balance.id})" class="text-red-600 hover:text-red-800 mx-1" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `
        }).join('')
        
    } catch (error) {
        console.error('Error loading historical balances table:', error)
        const tbody = document.getElementById('historical-balances-table')
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-4 py-8 text-center text-orange-500">
                        <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                        <p class="font-semibold">Unable to load historical balances</p>
                        <p class="text-sm mt-2 text-gray-600">Please ensure you're logged in and try refreshing the page</p>
                    </td>
                </tr>
            `
        }
    }
}

// Filter historical balances by account
function filterHistoricalBalances() {
    const filterSelect = document.getElementById('hist-balance-filter')
    const accountId = filterSelect ? filterSelect.value : null
    loadHistoricalBalancesTable(accountId || null)
}

// Calculate the other currency balance for edit modal
function calculateEditHistoricalBalance() {
    const currency = document.getElementById('edit-hist-balance-currency').value
    const amount = parseFloat(document.getElementById('edit-hist-balance-amount').value) || 0
    const rate = parseFloat(document.getElementById('edit-hist-balance-rate').value) || 0
    
    const calculatedInput = document.getElementById('edit-hist-balance-calculated')
    const calculatedLabel = document.getElementById('edit-hist-balance-calculated-label')
    
    if (amount && rate) {
        if (currency === 'USD') {
            const cad = (amount * rate).toFixed(2)
            calculatedInput.value = `$${cad}`
            calculatedLabel.textContent = 'CAD Balance'
        } else {
            const usd = (amount / rate).toFixed(2)
            calculatedInput.value = `$${usd}`
            calculatedLabel.textContent = 'USD Balance'
        }
    } else {
        calculatedInput.value = ''
    }
}

// Save edited historical balance
async function saveEditHistoricalBalance() {
    try {
        const account_id = document.getElementById('edit-hist-balance-account').value
        const balance_date = document.getElementById('edit-hist-balance-date').value
        const currency = document.getElementById('edit-hist-balance-currency').value
        const entered_amount = document.getElementById('edit-hist-balance-amount').value
        const exchange_rate = document.getElementById('edit-hist-balance-rate').value
        const edit_id = document.getElementById('edit-hist-balance-id').value
        
        // Validate
        if (!account_id) {
            alert('Please select an account')
            return
        }
        if (!balance_date) {
            alert('Please select a month/year')
            return
        }
        if (!entered_amount || parseFloat(entered_amount) <= 0) {
            alert('Please enter a valid balance amount')
            return
        }
        if (!exchange_rate || parseFloat(exchange_rate) <= 0) {
            alert('Please enter a valid exchange rate')
            return
        }
        
        // Parse month and year from YYYY-MM format
        const [year, month] = balance_date.split('-').map(n => parseInt(n))
        
        const response = await fetch(`/api/historical-balances/${edit_id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                account_id,
                month,
                year,
                currency,
                balance: parseFloat(entered_amount),
                exchange_rate_to_cad: parseFloat(exchange_rate)
            })
        })
        
        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Failed to update balance')
        }
        
        alert('Balance updated successfully!')
        closeEditHistBalanceModal()
        
        // Reload table with current filter
        const filterSelect = document.getElementById('hist-balance-filter')
        const accountId = filterSelect && filterSelect.value ? filterSelect.value : null
        loadHistoricalBalancesTable(accountId)
        
    } catch (error) {
        console.error('Error updating historical balance:', error)
        alert(error.message)
    }
}

// Close edit modal
function closeEditHistBalanceModal() {
    document.getElementById('edit-hist-balance-modal').classList.add('hidden')
    // Clear form
    document.getElementById('edit-hist-balance-account').value = ''
    document.getElementById('edit-hist-balance-date').value = ''
    document.getElementById('edit-hist-balance-currency').value = 'USD'
    document.getElementById('edit-hist-balance-amount').value = ''
    document.getElementById('edit-hist-balance-rate').value = ''
    document.getElementById('edit-hist-balance-calculated').value = ''
    document.getElementById('edit-hist-balance-id').value = ''
}
// ============================================================================
// P/L SUMMARY REPORT FUNCTIONS
// ============================================================================

let plSummaryCharts = {
    asset: null,
    account: null,
    monthly: null
}

// Main P/L Summary loading function
async function loadPLSummary(period = 'ytd') {
    try {
        // Update button states
        document.querySelectorAll('.pl-period-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-brand-teal', 'text-white')
            btn.classList.add('bg-gray-200', 'text-gray-700')
        })
        const activeBtn = document.querySelector(`.pl-period-btn[data-period="${period}"]`)
        if (activeBtn) {
            activeBtn.classList.add('active', 'bg-brand-teal', 'text-white')
            activeBtn.classList.remove('bg-gray-200', 'text-gray-700')
        }
        
        // Fetch P/L summary data
        const response = await api.get(`/api/reports/pl-summary?period=${period}`)
        const data = response.data
        
        console.log('P/L Summary data loaded:', data)
        
        // Update summary metrics
        updatePLSummaryMetrics(data.summary)
        
        // Render charts
        renderPLAssetChart(data.byAssetType)
        renderPLAccountChart(data.byAccountType)
        renderPLMonthlyChart(data.monthlyTrend)
        
        // Update tables
        updatePLAssetTable(data.byAssetType)
        updatePLAccountTable(data.byAccountType)
        
    } catch (error) {
        console.error('Error loading P/L summary:', error)
        console.error('Error response:', error.response?.data)
        console.error('Error status:', error.response?.status)
        
        if (error.response?.status === 401) {
            showNotification('Please log in to view P/L Summary', 'error')
        } else {
            showNotification('Failed to load P/L summary: ' + (error.response?.data?.error || error.message), 'error')
        }
    }
}

// Update summary metrics cards
function updatePLSummaryMetrics(summary) {
    // Total P/L
    const totalEl = document.getElementById('pl-total')
    const totalSubtitle = document.getElementById('pl-total-subtitle')
    if (totalEl) {
        const sign = summary.totalPL >= 0 ? '+' : ''
        const color = summary.totalPL >= 0 ? 'text-green-600' : 'text-red-600'
        totalEl.textContent = `${sign}$${summary.totalPL.toFixed(2)}`
        totalEl.className = `text-2xl font-bold ${color}`
    }
    if (totalSubtitle) {
        totalSubtitle.textContent = `${summary.totalTrades} trades`
    }
    
    // Win Rate
    const winRateEl = document.getElementById('pl-win-rate')
    const winLossEl = document.getElementById('pl-win-loss')
    if (winRateEl) {
        winRateEl.textContent = `${summary.winRate.toFixed(1)}%`
    }
    if (winLossEl) {
        winLossEl.textContent = `${summary.winningTrades}W / ${summary.losingTrades}L`
    }
    
    // Average Trade
    const avgTradeEl = document.getElementById('pl-avg-trade')
    if (avgTradeEl) {
        const sign = summary.avgTrade >= 0 ? '+' : ''
        const color = summary.avgTrade >= 0 ? 'text-green-600' : 'text-red-600'
        avgTradeEl.textContent = `${sign}$${summary.avgTrade.toFixed(2)}`
        avgTradeEl.className = `text-2xl font-bold ${color}`
    }
    
    // Best Trade
    const bestTradeEl = document.getElementById('pl-best-trade')
    const worstTradeEl = document.getElementById('pl-worst-trade')
    if (bestTradeEl) {
        bestTradeEl.textContent = `$${summary.bestTrade.toFixed(2)}`
    }
    if (worstTradeEl) {
        worstTradeEl.textContent = `Worst: $${summary.worstTrade.toFixed(2)}`
    }
}

// Render P/L by Asset Type chart
function renderPLAssetChart(data) {
    const chartElement = document.getElementById('pl-asset-chart')
    if (!chartElement) return
    
    // Destroy previous chart
    if (plSummaryCharts.asset) {
        plSummaryCharts.asset.destroy()
    }
    
    if (data.length === 0) {
        chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">No data available</div>'
        return
    }
    
    // Check if there are any negative values - pie charts can't handle negatives
    const hasNegative = data.some(item => item.pl < 0)
    
    if (hasNegative) {
        // Use bar chart instead for mixed positive/negative data
        const options = {
            series: [{
                name: 'P/L',
                data: data.map(item => item.pl)
            }],
            chart: {
                type: 'bar',
                height: 300,
                toolbar: {
                    show: false
                }
            },
            plotOptions: {
                bar: {
                    horizontal: false,
                    dataLabels: {
                        position: 'top'
                    },
                    colors: {
                        ranges: [{
                            from: -Infinity,
                            to: 0,
                            color: '#ef4444'
                        }, {
                            from: 0,
                            to: Infinity,
                            color: '#10b981'
                        }]
                    }
                }
            },
            dataLabels: {
                enabled: false
            },
            xaxis: {
                categories: data.map(item => item.name)
            },
            yaxis: {
                labels: {
                    formatter: function(val) {
                        return '$' + val.toFixed(0)
                    }
                }
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return '$' + val.toFixed(2)
                    }
                }
            }
        }
        plSummaryCharts.asset = new ApexCharts(chartElement, options)
    } else {
        // Use pie chart for all positive data
        const options = {
            series: data.map(item => item.pl),
            chart: {
                type: 'pie',
                height: 300
            },
            labels: data.map(item => item.name),
            colors: ['#14b8a6', '#f59e0b', '#8b5cf6'],
            legend: {
                position: 'bottom'
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return '$' + val.toFixed(2)
                    }
                }
            }
        }
        plSummaryCharts.asset = new ApexCharts(chartElement, options)
    }
    
    plSummaryCharts.asset.render()
}

// Render P/L by Account Type chart
function renderPLAccountChart(data) {
    const chartElement = document.getElementById('pl-account-chart')
    if (!chartElement) return
    
    // Destroy previous chart
    if (plSummaryCharts.account) {
        plSummaryCharts.account.destroy()
    }
    
    if (data.length === 0) {
        chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">No data available</div>'
        return
    }
    
    const options = {
        series: [{
            name: 'P/L',
            data: data.map(item => item.pl)
        }],
        chart: {
            type: 'bar',
            height: 300,
            toolbar: {
                show: false
            }
        },
        plotOptions: {
            bar: {
                horizontal: true,
                dataLabels: {
                    position: 'top'
                },
                colors: {
                    ranges: [{
                        from: -Infinity,
                        to: 0,
                        color: '#ef4444'
                    }, {
                        from: 0,
                        to: Infinity,
                        color: '#10b981'
                    }]
                }
            }
        },
        dataLabels: {
            enabled: true,
            formatter: function(val) {
                return '$' + val.toFixed(0)
            },
            offsetX: 0
        },
        xaxis: {
            categories: data.map(item => item.name),
            labels: {
                formatter: function(val) {
                    return '$' + val.toFixed(0)
                }
            }
        }
    }
    
    plSummaryCharts.account = new ApexCharts(chartElement, options)
    plSummaryCharts.account.render()
}

// Render monthly P/L trend chart
function renderPLMonthlyChart(data) {
    const chartElement = document.getElementById('pl-monthly-chart')
    if (!chartElement) return
    
    // Destroy previous chart
    if (plSummaryCharts.monthly) {
        plSummaryCharts.monthly.destroy()
    }
    
    if (data.length === 0) {
        chartElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">No data available</div>'
        return
    }
    
    const options = {
        series: [{
            name: 'Monthly P/L',
            data: data.map(item => item.pl)
        }],
        chart: {
            type: 'bar',
            height: 350,
            toolbar: {
                show: true
            }
        },
        plotOptions: {
            bar: {
                colors: {
                    ranges: [{
                        from: -Infinity,
                        to: 0,
                        color: '#ef4444'
                    }, {
                        from: 0,
                        to: Infinity,
                        color: '#10b981'
                    }]
                },
                columnWidth: '70%'
            }
        },
        dataLabels: {
            enabled: false
        },
        xaxis: {
            categories: data.map(item => {
                const [year, month] = item.month.split('-')
                const date = new Date(year, month - 1)
                return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
            }),
            labels: {
                rotate: -45
            }
        },
        yaxis: {
            labels: {
                formatter: function(val) {
                    return '$' + val.toFixed(0)
                }
            }
        },
        tooltip: {
            y: {
                formatter: function(val) {
                    return '$' + val.toFixed(2)
                }
            }
        }
    }
    
    plSummaryCharts.monthly = new ApexCharts(chartElement, options)
    plSummaryCharts.monthly.render()
}

// Update asset type breakdown table
function updatePLAssetTable(data) {
    const tbody = document.getElementById('pl-asset-table')
    if (!tbody) return
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-3 text-center text-gray-500">No data available</td></tr>'
        return
    }
    
    tbody.innerHTML = data.map(item => {
        const plColor = item.pl >= 0 ? 'text-green-600' : 'text-red-600'
        const plSign = item.pl >= 0 ? '+' : ''
        return `
            <tr class="border-t hover:bg-gray-50">
                <td class="px-4 py-3 font-semibold">${item.name}</td>
                <td class="px-4 py-3 text-right">${item.trades}</td>
                <td class="px-4 py-3 text-right ${plColor} font-semibold">${plSign}$${item.pl.toFixed(2)}</td>
                <td class="px-4 py-3 text-right">${item.winRate.toFixed(1)}%</td>
            </tr>
        `
    }).join('')
}

// Update account type breakdown table
function updatePLAccountTable(data) {
    const tbody = document.getElementById('pl-account-table')
    if (!tbody) return
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-3 text-center text-gray-500">No data available</td></tr>'
        return
    }
    
    tbody.innerHTML = data.map(item => {
        const plColor = item.pl >= 0 ? 'text-green-600' : 'text-red-600'
        const plSign = item.pl >= 0 ? '+' : ''
        return `
            <tr class="border-t hover:bg-gray-50">
                <td class="px-4 py-3 font-semibold">${item.name}</td>
                <td class="px-4 py-3 text-right">${item.trades}</td>
                <td class="px-4 py-3 text-right ${plColor} font-semibold">${plSign}$${item.pl.toFixed(2)}</td>
                <td class="px-4 py-3 text-right">${item.winRate.toFixed(1)}%</td>
            </tr>
        `
    }).join('')
}

// ============================================================================
// STRATEGY ANALYSIS FUNCTIONS
// ============================================================================

async function loadStrategyAnalysis(period = 'ytd') {
    try {
        // Update button states
        document.querySelectorAll('.strategy-period-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-brand-teal', 'text-white')
            btn.classList.add('bg-gray-200', 'text-gray-700')
        })
        const activeBtn = document.querySelector(`.strategy-period-btn[data-period="${period}"]`)
        if (activeBtn) {
            activeBtn.classList.add('active', 'bg-brand-teal', 'text-white')
            activeBtn.classList.remove('bg-gray-200', 'text-gray-700')
        }
        
        // Fetch strategy analysis data
        const response = await api.get(`/api/reports/strategy-analysis?period=${period}`)
        const data = response.data
        
        console.log('Strategy Analysis data:', data)
        
        // Update overall metrics
        updateStrategyMetrics(data.overall)
        
        // Render strategy comparison chart and table
        renderStrategyPerformanceChart(data.strategies)
        renderStrategyWinRateChart(data.strategies)
        updateStrategyTable(data.strategies)
        
        // Update benchmark comparison (placeholder for now)
        updateBenchmarkComparison(data.overall)
        
        // Render monthly heatmap
        renderMonthlyHeatmap(data.monthlyData)
        
    } catch (error) {
        console.error('Error loading strategy analysis:', error)
        console.error('Error response:', error.response?.data)
        if (error.response?.status === 401) {
            showNotification('Please log in to view Strategy Analysis', 'error')
        } else {
            showNotification('Failed to load strategy analysis: ' + (error.response?.data?.error || error.message), 'error')
        }
    }
}

function updateStrategyMetrics(overall) {
    // Total Return
    const returnEl = document.getElementById('strategy-total-return')
    const plEl = document.getElementById('strategy-total-pl')
    if (returnEl) {
        const sign = overall.totalReturn >= 0 ? '+' : ''
        returnEl.textContent = `${sign}${overall.totalReturn.toFixed(2)}%`
        returnEl.className = `text-2xl font-bold ${overall.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`
    }
    if (plEl) {
        const sign = overall.totalPL >= 0 ? '+' : ''
        plEl.textContent = `${sign}$${overall.totalPL.toFixed(2)}`
    }
    
    // Sharpe Ratio
    const sharpeEl = document.getElementById('strategy-sharpe')
    if (sharpeEl) {
        sharpeEl.textContent = overall.sharpe.toFixed(2)
    }
    
    // Max Drawdown
    const ddEl = document.getElementById('strategy-max-dd')
    if (ddEl) {
        ddEl.textContent = `-${overall.maxDrawdown.toFixed(2)}%`
    }
    
    // Win Rate
    const winRateEl = document.getElementById('strategy-win-rate')
    const winLossEl = document.getElementById('strategy-win-loss')
    if (winRateEl) {
        winRateEl.textContent = `${overall.winRate.toFixed(1)}%`
    }
    if (winLossEl) {
        winLossEl.textContent = `${overall.wins}W / ${overall.losses}L`
    }
}

function renderStrategyPerformanceChart(strategies) {
    const chartElement = document.getElementById('strategy-performance-chart')
    if (!chartElement || strategies.length === 0) return
    
    // Strategy name mapping
    const strategyNames = {
        'SELLING_PUT': 'Short Put',
        'CREDIT_SPREAD': 'Credit Spread',
        'DEBIT_SPREAD': 'Debit Spread',
        'IRON_CONDOR': 'Iron Condor',
        'CREDIT_SPREAD_CALL': 'Call Credit Spread',
        'CREDIT_SPREAD_PUT': 'Put Credit Spread'
    }
    
    const options = {
        series: [{
            name: 'Total P/L',
            data: strategies.map(s => s.totalPL)
        }],
        chart: {
            type: 'bar',
            height: 350
        },
        plotOptions: {
            bar: {
                horizontal: false,
                colors: {
                    ranges: [{
                        from: -Infinity,
                        to: 0,
                        color: '#ef4444'
                    }, {
                        from: 0,
                        to: Infinity,
                        color: '#10b981'
                    }]
                }
            }
        },
        dataLabels: {
            enabled: false
        },
        xaxis: {
            categories: strategies.map(s => strategyNames[s.strategy] || s.strategy)
        },
        yaxis: {
            labels: {
                formatter: function(val) {
                    return '$' + val.toFixed(0)
                }
            }
        }
    }
    
    new ApexCharts(chartElement, options).render()
}

function renderStrategyWinRateChart(strategies) {
    const chartElement = document.getElementById('strategy-winrate-chart')
    if (!chartElement || strategies.length === 0) return
    
    const strategyNames = {
        'SELLING_PUT': 'Short Put',
        'CREDIT_SPREAD': 'Credit Spread',
        'DEBIT_SPREAD': 'Debit Spread',
        'IRON_CONDOR': 'Iron Condor',
        'CREDIT_SPREAD_CALL': 'Call Credit Spread',
        'CREDIT_SPREAD_PUT': 'Put Credit Spread'
    }
    
    const options = {
        series: [{
            name: 'Win Rate',
            data: strategies.map(s => s.winRate)
        }],
        chart: {
            type: 'bar',
            height: 350
        },
        plotOptions: {
            bar: {
                horizontal: true
            }
        },
        colors: ['#14b8a6'],
        xaxis: {
            categories: strategies.map(s => strategyNames[s.strategy] || s.strategy),
            labels: {
                formatter: function(val) {
                    return val.toFixed(1) + '%'
                }
            }
        }
    }
    
    new ApexCharts(chartElement, options).render()
}

function updateStrategyTable(strategies) {
    const tbody = document.getElementById('strategy-table')
    if (!tbody) return
    
    const strategyNames = {
        'SELLING_PUT': 'Short Put',
        'CREDIT_SPREAD': 'Credit Spread',
        'DEBIT_SPREAD': 'Debit Spread',
        'IRON_CONDOR': 'Iron Condor',
        'CREDIT_SPREAD_CALL': 'Call Credit Spread',
        'CREDIT_SPREAD_PUT': 'Put Credit Spread'
    }
    
    tbody.innerHTML = strategies.map(s => {
        const plColor = s.totalPL >= 0 ? 'text-green-600' : 'text-red-600'
        const plSign = s.totalPL >= 0 ? '+' : ''
        return `
            <tr class="border-t hover:bg-gray-50">
                <td class="px-4 py-3 font-semibold">${strategyNames[s.strategy] || s.strategy}</td>
                <td class="px-4 py-3 text-right">${s.trades}</td>
                <td class="px-4 py-3 text-right ${plColor} font-semibold">${plSign}$${s.totalPL.toFixed(2)}</td>
                <td class="px-4 py-3 text-right">${plSign}$${s.avgPL.toFixed(2)}</td>
                <td class="px-4 py-3 text-right">${s.winRate.toFixed(1)}%</td>
                <td class="px-4 py-3 text-right text-green-600">$${s.bestTrade.toFixed(2)}</td>
                <td class="px-4 py-3 text-right text-red-600">$${s.worstTrade.toFixed(2)}</td>
                <td class="px-4 py-3 text-right">${s.sharpe.toFixed(2)}</td>
            </tr>
        `
    }).join('')
}

function updateBenchmarkComparison(overall) {
    // Placeholder - would need actual market data API
    document.getElementById('benchmark-spy').textContent = '+10.5%'
    document.getElementById('benchmark-qqq').textContent = '+12.8%'
    const portfolioReturn = overall.totalReturn
    const portfolioEl = document.getElementById('benchmark-portfolio')
    if (portfolioEl) {
        const sign = portfolioReturn >= 0 ? '+' : ''
        portfolioEl.textContent = `${sign}${portfolioReturn.toFixed(1)}%`
        portfolioEl.className = `text-xl font-bold ${portfolioReturn >= 0 ? 'text-green-600' : 'text-red-600'}`
    }
    
    // Update comparison table
    const tbody = document.getElementById('benchmark-table')
    if (tbody) {
        tbody.innerHTML = `
            <tr class="border-t"><td class="px-4 py-3">YTD Return</td><td class="px-4 py-3 text-right font-semibold">${portfolioReturn.toFixed(1)}%</td><td class="px-4 py-3 text-right">10.5%</td><td class="px-4 py-3 text-right">12.8%</td><td class="px-4 py-3 text-right">8-12%</td></tr>
            <tr class="border-t"><td class="px-4 py-3">Sharpe Ratio</td><td class="px-4 py-3 text-right font-semibold">${overall.sharpe.toFixed(2)}</td><td class="px-4 py-3 text-right">1.2</td><td class="px-4 py-3 text-right">1.4</td><td class="px-4 py-3 text-right">1.5-2.0</td></tr>
            <tr class="border-t"><td class="px-4 py-3">Max Drawdown</td><td class="px-4 py-3 text-right font-semibold">${overall.maxDrawdown.toFixed(1)}%</td><td class="px-4 py-3 text-right">8.5%</td><td class="px-4 py-3 text-right">12.3%</td><td class="px-4 py-3 text-right">10-15%</td></tr>
            <tr class="border-t"><td class="px-4 py-3">Win Rate</td><td class="px-4 py-3 text-right font-semibold">${overall.winRate.toFixed(1)}%</td><td class="px-4 py-3 text-right">N/A</td><td class="px-4 py-3 text-right">N/A</td><td class="px-4 py-3 text-right">55-65%</td></tr>
        `
    }
}

function renderMonthlyHeatmap(monthlyData) {
    const chartElement = document.getElementById('strategy-heatmap-chart')
    if (!chartElement || monthlyData.length === 0) return
    
    const options = {
        series: [{
            name: 'Monthly P/L',
            data: monthlyData.map(m => m.pl)
        }],
        chart: {
            type: 'bar',
            height: 400
        },
        plotOptions: {
            bar: {
                colors: {
                    ranges: [{
                        from: -Infinity,
                        to: 0,
                        color: '#ef4444'
                    }, {
                        from: 0,
                        to: Infinity,
                        color: '#10b981'
                    }]
                }
            }
        },
        xaxis: {
            categories: monthlyData.map(m => {
                const [year, month] = m.month.split('-')
                const date = new Date(year, month - 1)
                return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
            }),
            labels: {
                rotate: -45
            }
        },
        yaxis: {
            labels: {
                formatter: function(val) {
                    return '$' + val.toFixed(0)
                }
            }
        }
    }
    
    new ApexCharts(chartElement, options).render()
}

// ============================================================================
// PERFORMANCE ANALYSIS FUNCTIONS
// ============================================================================

// Chart instances for performance tab
const performanceCharts = {
    growth: null,
    drawdown: null,
    rolling: null
}

async function loadPerformanceAnalysis(period = 'ytd') {
    try {
        console.log(`Loading performance analysis for period: ${period}`)
        
        // Update button states
        document.querySelectorAll('.performance-period-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-brand-teal', 'text-white')
            btn.classList.add('bg-gray-200', 'text-gray-700')
        })
        const activeBtn = document.querySelector(`.performance-period-btn[data-period="${period}"]`)
        if (activeBtn) {
            activeBtn.classList.add('active', 'bg-brand-teal', 'text-white')
            activeBtn.classList.remove('bg-gray-200', 'text-gray-700')
        }
        
        // Fetch performance data
        const response = await api.get(`/api/reports/performance?period=${period}`)
        const data = response.data
        
        console.log('Performance data:', data)
        
        // Update summary metrics
        updatePerformanceMetrics(data.summary)
        
        // Render charts
        renderPortfolioGrowthChart(data.portfolioGrowth)
        renderDrawdownChart(data.drawdownData)
        renderRollingReturnsChart(data.rollingReturns.rolling30)
        
        // Update monthly returns table
        updateMonthlyReturnsTable(data.rollingReturns.monthly)
        
    } catch (error) {
        console.error('Error loading performance analysis:', error)
        console.error('Error response:', error.response?.data)
        if (error.response?.status === 401) {
            showNotification('Please log in to view Performance Analysis', 'error')
        } else {
            showNotification('Failed to load performance analysis: ' + (error.response?.data?.error || error.message), 'error')
        }
    }
}

function updatePerformanceMetrics(summary) {
    // Total Return
    const returnEl = document.getElementById('perf-total-return')
    const plEl = document.getElementById('perf-total-pl')
    if (returnEl) {
        const sign = summary.totalReturn >= 0 ? '+' : ''
        returnEl.textContent = `${sign}${summary.totalReturn.toFixed(2)}%`
        returnEl.className = `text-2xl font-bold ${summary.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`
    }
    if (plEl) {
        const sign = summary.totalPL >= 0 ? '+' : ''
        plEl.textContent = `${sign}$${summary.totalPL.toFixed(2)}`
    }
    
    // Max Drawdown
    const ddEl = document.getElementById('perf-max-dd')
    const ddDateEl = document.getElementById('perf-dd-date')
    if (ddEl) {
        ddEl.textContent = `-${summary.maxDrawdown.toFixed(2)}%`
    }
    if (ddDateEl && summary.maxDrawdownDate) {
        const date = new Date(summary.maxDrawdownDate)
        ddDateEl.textContent = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    }
    
    // Volatility
    const volEl = document.getElementById('perf-volatility')
    if (volEl) {
        volEl.textContent = `${summary.volatility.toFixed(2)}%`
    }
    
    // Sharpe Ratio
    const sharpeEl = document.getElementById('perf-sharpe')
    if (sharpeEl) {
        sharpeEl.textContent = summary.sharpeRatio.toFixed(2)
        // Color code based on Sharpe value
        if (summary.sharpeRatio > 2) {
            sharpeEl.className = 'text-2xl font-bold text-green-600'
        } else if (summary.sharpeRatio > 1) {
            sharpeEl.className = 'text-2xl font-bold text-blue-600'
        } else {
            sharpeEl.className = 'text-2xl font-bold text-purple-600'
        }
    }
    
    // Drawdown details
    const ddDetailEl = document.getElementById('perf-max-dd-detail')
    const ddDateDetailEl = document.getElementById('perf-max-dd-date')
    if (ddDetailEl) {
        ddDetailEl.textContent = `-${summary.maxDrawdown.toFixed(2)}%`
    }
    if (ddDateDetailEl && summary.maxDrawdownDate) {
        const date = new Date(summary.maxDrawdownDate)
        ddDateDetailEl.textContent = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    }
    
    // Longest drawdown
    const longestDDEl = document.getElementById('perf-longest-dd')
    if (longestDDEl) {
        longestDDEl.textContent = `${summary.longestDrawdown} days`
    }
}

function renderPortfolioGrowthChart(growthData) {
    const chartElement = document.getElementById('portfolio-growth-chart')
    if (!chartElement) return
    
    // Destroy existing chart
    if (performanceCharts.growth) {
        performanceCharts.growth.destroy()
    }
    
    if (growthData.length === 0) {
        chartElement.innerHTML = '<div class="text-center text-gray-500 py-8"><i class="fas fa-chart-line text-4xl mb-2"></i><p>No data available</p></div>'
        return
    }
    
    const options = {
        series: [
            {
                name: 'Cumulative P/L',
                data: growthData.map(d => ({ x: new Date(d.date).getTime(), y: d.value }))
            },
            {
                name: 'Peak Value',
                data: growthData.map(d => ({ x: new Date(d.date).getTime(), y: d.peak }))
            }
        ],
        chart: {
            type: 'area',
            height: 400,
            toolbar: {
                show: true,
                tools: {
                    download: true,
                    zoom: true,
                    zoomin: true,
                    zoomout: true,
                    pan: true,
                    reset: true
                }
            },
            animations: {
                enabled: true
            }
        },
        colors: ['#14b8a6', '#94a3b8'],
        dataLabels: {
            enabled: false
        },
        stroke: {
            curve: 'smooth',
            width: [3, 2]
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.7,
                opacityTo: 0.2,
                stops: [0, 90, 100]
            }
        },
        xaxis: {
            type: 'datetime',
            labels: {
                datetimeUTC: false
            }
        },
        yaxis: {
            labels: {
                formatter: function(val) {
                    return '$' + val.toFixed(0)
                }
            }
        },
        tooltip: {
            x: {
                format: 'MMM dd, yyyy'
            },
            y: {
                formatter: function(val) {
                    return '$' + val.toFixed(2)
                }
            }
        },
        legend: {
            position: 'top',
            horizontalAlign: 'right'
        },
        grid: {
            borderColor: '#e5e7eb'
        }
    }
    
    performanceCharts.growth = new ApexCharts(chartElement, options)
    performanceCharts.growth.render()
}

function renderDrawdownChart(drawdownData) {
    const chartElement = document.getElementById('drawdown-chart')
    if (!chartElement) return
    
    // Destroy existing chart
    if (performanceCharts.drawdown) {
        performanceCharts.drawdown.destroy()
    }
    
    if (drawdownData.length === 0) {
        chartElement.innerHTML = '<div class="text-center text-gray-500 py-8"><i class="fas fa-arrow-down text-4xl mb-2"></i><p>No data available</p></div>'
        return
    }
    
    const options = {
        series: [{
            name: 'Drawdown %',
            data: drawdownData.map(d => ({ x: new Date(d.date).getTime(), y: d.drawdown }))
        }],
        chart: {
            type: 'area',
            height: 300,
            toolbar: {
                show: false
            }
        },
        colors: ['#ef4444'],
        dataLabels: {
            enabled: false
        },
        stroke: {
            curve: 'smooth',
            width: 2
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.7,
                opacityTo: 0.2,
                stops: [0, 90, 100]
            }
        },
        xaxis: {
            type: 'datetime',
            labels: {
                datetimeUTC: false
            }
        },
        yaxis: {
            labels: {
                formatter: function(val) {
                    return val.toFixed(1) + '%'
                }
            },
            max: 0 // Drawdowns are negative, so max is 0
        },
        tooltip: {
            x: {
                format: 'MMM dd, yyyy'
            },
            y: {
                formatter: function(val) {
                    return val.toFixed(2) + '%'
                }
            }
        },
        grid: {
            borderColor: '#e5e7eb'
        }
    }
    
    performanceCharts.drawdown = new ApexCharts(chartElement, options)
    performanceCharts.drawdown.render()
}

function renderRollingReturnsChart(rollingData) {
    const chartElement = document.getElementById('rolling-returns-chart')
    if (!chartElement) return
    
    // Destroy existing chart
    if (performanceCharts.rolling) {
        performanceCharts.rolling.destroy()
    }
    
    if (rollingData.length === 0) {
        chartElement.innerHTML = '<div class="text-center text-gray-500 py-8"><i class="fas fa-calendar-check text-4xl mb-2"></i><p>No data available</p></div>'
        return
    }
    
    const options = {
        series: [{
            name: '30-Day Return %',
            data: rollingData.map(d => ({ x: new Date(d.date).getTime(), y: d.return }))
        }],
        chart: {
            type: 'line',
            height: 300,
            toolbar: {
                show: false
            }
        },
        colors: ['#3b82f6'],
        dataLabels: {
            enabled: false
        },
        stroke: {
            curve: 'smooth',
            width: 2
        },
        xaxis: {
            type: 'datetime',
            labels: {
                datetimeUTC: false
            }
        },
        yaxis: {
            labels: {
                formatter: function(val) {
                    return val.toFixed(1) + '%'
                }
            }
        },
        tooltip: {
            x: {
                format: 'MMM dd, yyyy'
            },
            y: {
                formatter: function(val) {
                    return val.toFixed(2) + '%'
                }
            }
        },
        markers: {
            size: 0,
            hover: {
                size: 5
            }
        },
        grid: {
            borderColor: '#e5e7eb'
        },
        annotations: {
            yaxis: [{
                y: 0,
                borderColor: '#94a3b8',
                strokeDashArray: 3,
                label: {
                    text: 'Break-even',
                    style: {
                        color: '#64748b',
                        background: '#f1f5f9'
                    }
                }
            }]
        }
    }
    
    performanceCharts.rolling = new ApexCharts(chartElement, options)
    performanceCharts.rolling.render()
}

function updateMonthlyReturnsTable(monthlyData) {
    const tbody = document.getElementById('monthly-returns-table')
    if (!tbody) return
    
    tbody.innerHTML = ''
    
    if (monthlyData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">No monthly data available</td></tr>'
        return
    }
    
    // Sort by month descending (most recent first)
    const sortedData = [...monthlyData].sort((a, b) => b.month.localeCompare(a.month))
    
    sortedData.forEach(month => {
        const row = document.createElement('tr')
        row.className = 'border-b border-gray-100 hover:bg-gray-50'
        
        // Format month
        const [year, monthNum] = month.month.split('-')
        const date = new Date(year, monthNum - 1)
        const monthLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
        
        // Color coding for return
        const returnClass = month.return >= 0 ? 'text-green-600' : 'text-red-600'
        const plClass = month.pl >= 0 ? 'text-green-600' : 'text-red-600'
        const sign = month.return >= 0 ? '+' : ''
        const plSign = month.pl >= 0 ? '+' : ''
        
        // Status icon
        const statusIcon = month.return >= 0 
            ? '<i class="fas fa-arrow-up text-green-600"></i>' 
            : '<i class="fas fa-arrow-down text-red-600"></i>'
        
        row.innerHTML = `
            <td class="px-4 py-3">
                <span class="font-semibold text-gray-800">${monthLabel}</span>
            </td>
            <td class="px-4 py-3 text-right ${returnClass} font-bold">
                ${sign}${month.return.toFixed(2)}%
            </td>
            <td class="px-4 py-3 text-right ${plClass} font-semibold">
                ${plSign}$${month.pl.toFixed(2)}
            </td>
            <td class="px-4 py-3 text-center">
                <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">${month.trades}</span>
            </td>
            <td class="px-4 py-3 text-center">
                ${statusIcon}
            </td>
        `
        
        tbody.appendChild(row)
    })
}

// ============================================================================
// POSITION ANALYSIS FUNCTIONS
// ============================================================================

// Chart instances for position tab
const positionCharts = {
    sector: null,
    account: null
}

// Position analysis state
let positionAnalysisData = null
let currentHoldingsView = 'account' // 'account' or 'portfolio'

async function loadPositionAnalysis() {
    try {
        console.log('Loading position analysis')
        
        // Fetch position data
        const response = await api.get('/api/reports/positions')
        positionAnalysisData = response.data
        
        console.log('Position data:', positionAnalysisData)
        
        // Update summary metrics
        updatePositionMetrics(positionAnalysisData.summary)
        
        // Render holdings based on current view
        renderHoldingsByView()
        
        // Render charts
        renderSectorAllocationChart(positionAnalysisData.sectorAllocation)
        renderAccountAllocationChart(positionAnalysisData.accountAllocation)
        
        // Update breakdown tables
        updateSectorBreakdownTable(positionAnalysisData.sectorAllocation)
        updateIndustryBreakdownTable(positionAnalysisData.industryAllocation)
        
        // Update concentration analysis
        updateConcentrationAnalysis(positionAnalysisData.summary)
        
    } catch (error) {
        console.error('Error loading position analysis:', error)
        console.error('Error response:', error.response?.data)
        if (error.response?.status === 401) {
            showNotification('Please log in to view Position Analysis', 'error')
        } else {
            showNotification('Failed to load position analysis: ' + (error.response?.data?.error || error.message), 'error')
        }
    }
}

// Dividends Report Functions
async function loadDividendsReport(groupBy = 'account', period = 'ytd') {
    try {
        const response = await axios.get(`/api/reports/dividends?groupBy=${groupBy}&period=${period}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
        
        const data = response.data
        console.log('Dividends report loaded:', data)
        
        // Update active buttons
        document.querySelectorAll('.dividends-group-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-brand-teal', 'text-white')
            btn.classList.add('bg-gray-200', 'text-gray-700')
        })
        document.getElementById(`dividends-group-${groupBy}`).classList.remove('bg-gray-200', 'text-gray-700')
        document.getElementById(`dividends-group-${groupBy}`).classList.add('active', 'bg-brand-teal', 'text-white')
        
        document.querySelectorAll('.dividends-period-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-brand-teal', 'text-white')
            btn.classList.add('bg-gray-200', 'text-gray-700')
        })
        document.getElementById(`dividends-period-${period}`).classList.remove('bg-gray-200', 'text-gray-700')
        document.getElementById(`dividends-period-${period}`).classList.add('active', 'bg-brand-teal', 'text-white')
        
        // Update summary
        document.getElementById('dividends-total').textContent = '$' + (data.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        const totalCount = data.data.reduce((sum, item) => sum + (item.dividend_count || 0), 0)
        document.getElementById('dividends-count').textContent = totalCount + ' payment' + (totalCount !== 1 ? 's' : '')
        
        // Update table header
        const headerCol1 = document.getElementById('dividends-header-col1')
        if (groupBy === 'account') {
            headerCol1.innerHTML = '<i class="fas fa-building mr-2"></i>Account'
        } else {
            headerCol1.innerHTML = '<i class="fas fa-chart-line mr-2"></i>Stock'
        }
        
        // Update table body
        const tbody = document.getElementById('dividends-table-body')
        tbody.innerHTML = ''
        
        if (data.data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="px-4 py-8 text-center text-gray-400">
                        <i class="fas fa-coins text-4xl mb-2"></i>
                        <p>No dividend payments found for this period</p>
                    </td>
                </tr>
            `
            return
        }
        
        data.data.forEach((item, index) => {
            const row = document.createElement('tr')
            row.className = 'border-b border-gray-100 hover:bg-gray-50 transition'
            
            if (groupBy === 'account') {
                row.innerHTML = `
                    <td class="px-4 py-3">
                        <div class="flex items-center">
                            <i class="fas fa-building text-brand-teal mr-3"></i>
                            <div>
                                <div class="font-semibold text-gray-800">${item.account_name}</div>
                                <div class="text-xs text-gray-500">${item.account_type}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">${item.dividend_count}</span>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <span class="font-bold text-brand-gold">$${(item.total_dividends || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </td>
                `
            } else {
                row.innerHTML = `
                    <td class="px-4 py-3">
                        <div class="flex items-center">
                            <i class="fas fa-chart-line text-brand-teal mr-3"></i>
                            <div>
                                <div class="font-semibold text-gray-800">${item.ticker}</div>
                                ${item.company_name ? `<div class="text-xs text-gray-500">${item.company_name}</div>` : ''}
                            </div>
                        </div>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">${item.dividend_count}</span>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <span class="font-bold text-brand-gold">$${(item.total_dividends || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </td>
                `
            }
            
            tbody.appendChild(row)
        })
        
    } catch (error) {
        console.error('Error loading dividends report:', error)
        if (error.response?.status === 401) {
            showNotification('Session expired. Please log in again.', 'error')
            logout()
        } else {
            showNotification('Failed to load dividends report: ' + (error.response?.data?.error || error.message), 'error')
        }
    }
}

function getCurrentDividendGroupBy() {
    const activeBtn = document.querySelector('.dividends-group-btn.active')
    return activeBtn.id.replace('dividends-group-', '')
}

function getCurrentDividendPeriod() {
    const activeBtn = document.querySelector('.dividends-period-btn.active')
    return activeBtn.id.replace('dividends-period-', '')
}

function switchHoldingsView(view) {
    currentHoldingsView = view
    
    // Update button styles
    const accountBtn = document.getElementById('holdings-by-account-btn')
    const portfolioBtn = document.getElementById('holdings-by-portfolio-btn')
    
    if (view === 'account') {
        accountBtn.className = 'px-4 py-2 bg-brand-teal text-white rounded font-semibold hover:bg-brand-teal-dark transition'
        portfolioBtn.className = 'px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300 transition'
    } else {
        accountBtn.className = 'px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300 transition'
        portfolioBtn.className = 'px-4 py-2 bg-brand-teal text-white rounded font-semibold hover:bg-brand-teal-dark transition'
    }
    
    // Re-render holdings
    renderHoldingsByView()
}

function renderHoldingsByView() {
    if (!positionAnalysisData) return
    
    let holdings
    if (currentHoldingsView === 'account') {
        // Show top 10 by account (already in response)
        holdings = positionAnalysisData.topHoldings
    } else {
        // Aggregate by ticker across all accounts for portfolio view
        const aggregated = new Map()
        positionAnalysisData.allPositions.forEach(pos => {
            if (aggregated.has(pos.ticker)) {
                const existing = aggregated.get(pos.ticker)
                // Accumulate total cost (cost basis per share × quantity)
                const totalCost = existing.costBasis * existing.quantity
                const additionalCost = pos.costBasis * pos.quantity
                
                existing.quantity += pos.quantity
                existing.value += pos.value
                existing.weight += pos.weight
                
                // Recalculate weighted average cost basis per share
                existing.costBasis = (totalCost + additionalCost) / existing.quantity
                
                // Track unique accounts
                if (!existing.accounts.includes(pos.accountType)) {
                    existing.accounts.push(pos.accountType)
                }
            } else {
                aggregated.set(pos.ticker, {
                    ticker: pos.ticker,
                    companyName: pos.companyName,
                    quantity: pos.quantity,
                    avgPrice: pos.value / pos.quantity, // Recalculate avg price
                    costBasis: pos.costBasis, // Already per share from backend
                    value: pos.value,
                    weight: pos.weight,
                    accounts: [pos.accountType]
                })
            }
        })
        
        // After aggregation, determine accountType display
        aggregated.forEach((holding, ticker) => {
            if (holding.accounts.length > 1) {
                holding.accountType = 'Multiple'
            } else {
                holding.accountType = holding.accounts[0]
            }
        })
        
        // Sort by value and take top 10
        holdings = Array.from(aggregated.values())
            .sort((a, b) => b.value - a.value)
            .slice(0, 10)
    }
    
    updateTopHoldingsTable(holdings)
}

function updatePositionMetrics(summary) {
    // Total Positions
    const totalPosEl = document.getElementById('pos-total-positions')
    if (totalPosEl) {
        totalPosEl.textContent = summary.totalPositions
    }
    
    // Top 5 Concentration
    const top5El = document.getElementById('pos-top5-concentration')
    if (top5El) {
        top5El.textContent = `${summary.top5Concentration.toFixed(1)}%`
        // Color code based on concentration
        if (summary.top5Concentration > 60) {
            top5El.className = 'text-2xl font-bold text-red-600'
        } else if (summary.top5Concentration > 40) {
            top5El.className = 'text-2xl font-bold text-orange-600'
        } else {
            top5El.className = 'text-2xl font-bold text-green-600'
        }
    }
    
    // Diversification Score
    const divEl = document.getElementById('pos-diversification')
    if (divEl) {
        divEl.textContent = summary.diversificationScore.toFixed(0)
        // Color code based on score
        if (summary.diversificationScore > 75) {
            divEl.className = 'text-2xl font-bold text-green-600'
        } else if (summary.diversificationScore > 50) {
            divEl.className = 'text-2xl font-bold text-blue-600'
        } else {
            divEl.className = 'text-2xl font-bold text-orange-600'
        }
    }
    
    // Largest Position
    const largestEl = document.getElementById('pos-largest')
    if (largestEl) {
        largestEl.textContent = `${summary.largestPosition.toFixed(1)}%`
        // Color code based on size
        if (summary.largestPosition > 20) {
            largestEl.className = 'text-2xl font-bold text-red-600'
        } else if (summary.largestPosition > 10) {
            largestEl.className = 'text-2xl font-bold text-orange-600'
        } else {
            largestEl.className = 'text-2xl font-bold text-purple-600'
        }
    }
}

function updateTopHoldingsTable(holdings) {
    const tbody = document.getElementById('top-holdings-table')
    if (!tbody) return
    
    tbody.innerHTML = ''
    
    if (holdings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-500">No open positions</td></tr>'
        return
    }
    
    holdings.forEach((holding, index) => {
        const row = document.createElement('tr')
        row.className = 'border-b border-gray-100 hover:bg-gray-50'
        
        // Rank badge
        let rankBadge = `<span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-semibold">${index + 1}</span>`
        if (index === 0) {
            rankBadge = `<span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-sm font-semibold"><i class="fas fa-crown mr-1"></i>1</span>`
        } else if (index === 1) {
            rankBadge = `<span class="px-2 py-1 bg-gray-300 text-gray-700 rounded text-sm font-semibold">2</span>`
        } else if (index === 2) {
            rankBadge = `<span class="px-2 py-1 bg-orange-200 text-orange-700 rounded text-sm font-semibold">3</span>`
        }
        
        // Weight bar
        const weightBarWidth = Math.min(holding.weight, 100)
        const weightColor = holding.weight > 20 ? 'bg-red-500' : holding.weight > 10 ? 'bg-orange-500' : 'bg-green-500'
        
        // Account display (handle portfolio view)
        let accountDisplay
        if (holding.accountType === 'Multiple') {
            accountDisplay = `<span class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">Multiple Accounts</span>`
        } else {
            accountDisplay = `<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">${holding.accountType}</span>`
        }
        
        row.innerHTML = `
            <td class="px-4 py-3 text-center">
                ${rankBadge}
            </td>
            <td class="px-4 py-3">
                <span class="font-bold text-brand-teal">${holding.ticker}</span>
            </td>
            <td class="px-4 py-3">
                <span class="text-gray-800">${holding.companyName}</span>
            </td>
            <td class="px-4 py-3 text-right font-semibold">
                ${holding.quantity.toLocaleString()}
            </td>
            <td class="px-4 py-3 text-right">
                $${holding.avgPrice.toFixed(2)}
            </td>
            <td class="px-4 py-3 text-right font-semibold text-gray-700">
                $${holding.costBasis.toFixed(2)}
            </td>
            <td class="px-4 py-3 text-right font-bold text-blue-600">
                $${holding.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                    <span class="font-bold">${holding.weight.toFixed(2)}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 mt-1">
                    <div class="${weightColor} h-2 rounded-full" style="width: ${weightBarWidth}%"></div>
                </div>
            </td>
            <td class="px-4 py-3">
                ${accountDisplay}
            </td>
        `
        
        tbody.appendChild(row)
    })
}

function renderSectorAllocationChart(sectorData) {
    const chartElement = document.getElementById('sector-allocation-chart')
    if (!chartElement) return
    
    // Destroy existing chart
    if (positionCharts.sector) {
        positionCharts.sector.destroy()
    }
    
    if (sectorData.length === 0) {
        chartElement.innerHTML = '<div class="text-center text-gray-500 py-8"><i class="fas fa-chart-pie text-4xl mb-2"></i><p>No sector data available</p></div>'
        return
    }
    
    const options = {
        series: sectorData.map(s => s.weight),
        chart: {
            type: 'donut',
            height: 350
        },
        labels: sectorData.map(s => s.sector),
        colors: ['#14b8a6', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#6366f1', '#ec4899', '#84cc16', '#f97316'],
        plotOptions: {
            pie: {
                donut: {
                    size: '65%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total Sectors',
                            formatter: function () {
                                return sectorData.length
                            }
                        }
                    }
                }
            }
        },
        dataLabels: {
            enabled: true,
            formatter: function(val) {
                return val.toFixed(1) + '%'
            }
        },
        legend: {
            position: 'bottom',
            horizontalAlign: 'center'
        },
        tooltip: {
            y: {
                formatter: function(val) {
                    return val.toFixed(2) + '%'
                }
            }
        }
    }
    
    positionCharts.sector = new ApexCharts(chartElement, options)
    positionCharts.sector.render()
}

function renderAccountAllocationChart(accountData) {
    const chartElement = document.getElementById('account-allocation-chart')
    if (!chartElement) return
    
    // Destroy existing chart
    if (positionCharts.account) {
        positionCharts.account.destroy()
    }
    
    if (accountData.length === 0) {
        chartElement.innerHTML = '<div class="text-center text-gray-500 py-8"><i class="fas fa-chart-pie text-4xl mb-2"></i><p>No account data available</p></div>'
        return
    }
    
    const options = {
        series: accountData.map(a => a.weight),
        chart: {
            type: 'donut',
            height: 350
        },
        labels: accountData.map(a => a.accountType),
        colors: ['#004F59', '#C9B25F', '#14b8a6', '#8b5cf6'],
        plotOptions: {
            pie: {
                donut: {
                    size: '65%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total Accounts',
                            formatter: function () {
                                return accountData.length
                            }
                        }
                    }
                }
            }
        },
        dataLabels: {
            enabled: true,
            formatter: function(val) {
                return val.toFixed(1) + '%'
            }
        },
        legend: {
            position: 'bottom',
            horizontalAlign: 'center'
        },
        tooltip: {
            y: {
                formatter: function(val) {
                    return val.toFixed(2) + '%'
                }
            }
        }
    }
    
    positionCharts.account = new ApexCharts(chartElement, options)
    positionCharts.account.render()
}

function updateSectorBreakdownTable(sectorData) {
    const tbody = document.getElementById('sector-breakdown-table')
    if (!tbody) return
    
    tbody.innerHTML = ''
    
    if (sectorData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">No sector data available</td></tr>'
        return
    }
    
    sectorData.forEach(sector => {
        const row = document.createElement('tr')
        row.className = 'border-b border-gray-100 hover:bg-gray-50'
        
        // Weight bar
        const weightBarWidth = Math.min(sector.weight, 100)
        
        row.innerHTML = `
            <td class="px-4 py-3">
                <span class="font-semibold text-gray-800">${sector.sector}</span>
            </td>
            <td class="px-4 py-3 text-right font-bold text-blue-600">
                $${sector.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td class="px-4 py-3 text-right">
                <span class="font-bold">${sector.weight.toFixed(2)}%</span>
            </td>
            <td class="px-4 py-3 text-center">
                <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">${sector.positions}</span>
            </td>
            <td class="px-4 py-3">
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div class="bg-blue-500 h-2 rounded-full" style="width: ${weightBarWidth}%"></div>
                </div>
            </td>
        `
        
        tbody.appendChild(row)
    })
}

function updateIndustryBreakdownTable(industryData) {
    const tbody = document.getElementById('industry-breakdown-table')
    if (!tbody) return
    
    tbody.innerHTML = ''
    
    if (industryData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-500">No industry data available</td></tr>'
        return
    }
    
    industryData.forEach(industry => {
        const row = document.createElement('tr')
        row.className = 'border-b border-gray-100 hover:bg-gray-50'
        
        row.innerHTML = `
            <td class="px-4 py-3">
                <span class="text-gray-800">${industry.industry}</span>
            </td>
            <td class="px-4 py-3 text-right font-bold text-green-600">
                $${industry.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td class="px-4 py-3 text-right font-bold">
                ${industry.weight.toFixed(2)}%
            </td>
            <td class="px-4 py-3 text-center">
                <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">${industry.positions}</span>
            </td>
        `
        
        tbody.appendChild(row)
    })
}

function updateConcentrationAnalysis(summary) {
    // Top 5 Concentration
    const top5El = document.getElementById('concentration-top5')
    if (top5El) {
        top5El.textContent = `${summary.top5Concentration.toFixed(1)}%`
    }
    
    // Top 10 Concentration
    const top10El = document.getElementById('concentration-top10')
    if (top10El) {
        top10El.textContent = `${summary.top10Concentration.toFixed(1)}%`
    }
    
    // HHI Score
    const hhiEl = document.getElementById('concentration-hhi')
    const hhiLabelEl = document.getElementById('concentration-hhi-label')
    if (hhiEl) {
        hhiEl.textContent = summary.hhi.toFixed(0)
        
        // Update label and color
        if (summary.hhi > 2500) {
            hhiEl.className = 'text-xl font-bold text-red-600'
            if (hhiLabelEl) hhiLabelEl.textContent = 'High concentration'
        } else if (summary.hhi > 1500) {
            hhiEl.className = 'text-xl font-bold text-orange-600'
            if (hhiLabelEl) hhiLabelEl.textContent = 'Moderate concentration'
        } else {
            hhiEl.className = 'text-xl font-bold text-green-600'
            if (hhiLabelEl) hhiLabelEl.textContent = 'Low concentration'
        }
    }
}

// ============================================================================
// RESEARCH MODAL FUNCTIONS
// ============================================================================

// Research API Base URL
const RESEARCH_API = 'https://research-e79.pages.dev'

// Global research state
let currentResearchData = null

// Fetch financials from research site (triggers SEC EDGAR fetch)
async function fetchFinancials(symbol) {
    const btn = document.getElementById('fetch-financials-btn')
    const btnText = btn.querySelector('.btn-text')
    const btnLoading = btn.querySelector('.btn-loading')
    
    // Show loading state
    btn.disabled = true
    btnText.classList.add('hidden')
    btnLoading.classList.remove('hidden')
    
    try {
        // Call research API to fetch financial data from SEC EDGAR
        const response = await axios.post(`${RESEARCH_API}/api/research/fetch/${symbol}`)
        
        if (response.data.success) {
            // Show success message
            btnLoading.classList.add('hidden')
            btn.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Fetched Successfully!'
            btn.classList.remove('bg-amber-600', 'hover:bg-amber-700')
            btn.classList.add('bg-green-600', 'hover:bg-green-700')
            
            // Wait 1 second then open the research modal
            setTimeout(() => {
                openResearchModal(symbol)
            }, 1000)
        } else {
            throw new Error(response.data.error || 'Failed to fetch financials')
        }
    } catch (error) {
        console.error('Error fetching financials:', error)
        
        // Show error
        btnLoading.classList.add('hidden')
        btn.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i>Fetch Failed'
        btn.classList.remove('bg-amber-600', 'hover:bg-amber-700')
        btn.classList.add('bg-red-600', 'hover:bg-red-700')
        
        // Show error message
        const errorMsg = error.response?.data?.error || error.message || 'Failed to fetch financial data'
        alert(`Error: ${errorMsg}`)
        
        // Reset button after 3 seconds
        setTimeout(() => {
            btn.disabled = false
            btn.innerHTML = '<i class="fas fa-download mr-2"></i><span class="btn-text">Fetch Financials</span><span class="btn-loading hidden"><i class="fas fa-spinner fa-spin"></i> Fetching...</span>'
            btn.classList.remove('bg-red-600', 'hover:bg-red-700')
            btn.classList.add('bg-amber-600', 'hover:bg-amber-700')
        }, 3000)
    }
}

// Open research modal for a specific symbol
async function openResearchModal(symbol) {
    const modal = document.getElementById('research-modal')
    const modalTitle = document.getElementById('research-modal-title')
    const loadingEl = document.getElementById('research-loading')
    const errorEl = document.getElementById('research-error')
    const errorMessageEl = document.getElementById('research-error-message')
    
    // Close company details modal if open
    const companyModal = document.querySelector('.fixed.inset-0.bg-black.bg-opacity-50')
    if (companyModal) {
        companyModal.remove()
    }
    
    // Show modal
    modal.classList.remove('hidden')
    
    // Show loading state
    loadingEl.classList.remove('hidden')
    errorEl.classList.add('hidden')
    document.querySelectorAll('.research-tab-content').forEach(el => el.classList.add('hidden'))
    
    // Update title
    modalTitle.innerHTML = `
        <i class="fas fa-spinner fa-spin mr-2"></i>Loading ${symbol}...
    `
    
    try {
        // Fetch company data from research API
        const response = await axios.get(`${RESEARCH_API}/api/research/company/${symbol}`, {
            validateStatus: function (status) {
                // Accept 404 as valid status (company doesn't exist yet)
                return (status >= 200 && status < 300) || status === 404
            }
        })
        
        // Check if it was a 404 before trying to use the data
        if (response.status === 404) {
            throw { response: { status: 404 }, message: 'Company not found' }
        }
        
        currentResearchData = response.data
        
        // Update title
        modalTitle.innerHTML = `
            <i class="fas fa-chart-bar mr-2"></i>${symbol} - ${response.data.company.name || 'N/A'}
        `
        
        // Hide loading
        loadingEl.classList.add('hidden')
        
        // Render all tabs
        renderResearchIncomeTab(currentResearchData)
        renderResearchBalanceTab(currentResearchData)
        renderResearchCashFlowTab(currentResearchData)
        
        // Show income tab by default
        switchResearchTab('income')
        
    } catch (error) {
        console.error('Error loading research data:', error)
        
        // Show error
        loadingEl.classList.add('hidden')
        errorEl.classList.remove('hidden')
        
        if (error.response?.status === 404) {
            errorMessageEl.textContent = `Company ${symbol} not found in research database`
        } else {
            errorMessageEl.textContent = error.message || 'Failed to load company data'
        }
        
        modalTitle.innerHTML = `
            <i class="fas fa-exclamation-circle mr-2"></i>Error Loading ${symbol}
        `
    }
}

// Close research modal
function closeResearchModal() {
    document.getElementById('research-modal').classList.add('hidden')
    currentResearchData = null
}

// Switch between research tabs
function switchResearchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.research-tab').forEach(tab => {
        tab.classList.remove('active', 'text-teal-600', 'bg-white', 'border-teal-600')
        tab.classList.add('text-gray-600', 'border-transparent')
    })
    
    // Find and activate the correct tab by matching the onclick attribute
    document.querySelectorAll('.research-tab').forEach(tab => {
        if (tab.getAttribute('onclick')?.includes(`'${tabName}'`)) {
            tab.classList.remove('text-gray-600', 'border-transparent')
            tab.classList.add('active', 'text-teal-600', 'bg-white', 'border-teal-600')
        }
    })
    
    // Update tab content
    document.querySelectorAll('.research-tab-content').forEach(content => {
        content.classList.add('hidden')
    })
    document.getElementById(`research-${tabName}-tab`).classList.remove('hidden')
}

// Render Income Statement Tab
function renderResearchIncomeTab(data) {
    const container = document.getElementById('research-income-tab')
    const statements = data.financials.income_statements || []
    
    if (statements.length === 0) {
        container.innerHTML = '<div class="text-center py-12 text-gray-600">No income statement data available</div>'
        return
    }
    
    const years = statements.map(s => s.fiscal_year).sort((a, b) => b - a).slice(0, 10)
    
    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="min-w-full border border-gray-200">
                <thead>
                    <tr class="bg-teal-700 text-white">
                        <th class="px-4 py-2 text-left sticky left-0 bg-teal-700">Metric</th>
                        ${years.map(year => `<th class="px-4 py-2 text-right">${year}</th>`).join('')}
                    </tr>
                </thead>
                <tbody class="bg-white">
                    ${renderResearchMetricRow('Revenue', statements, years, 'revenue', true)}
                    ${renderResearchMetricRow('Cost of Revenue', statements, years, 'cost_of_revenue', true)}
                    ${renderResearchMetricRow('Gross Profit', statements, years, 'gross_profit', true)}
                    ${renderResearchMetricRow('Operating Income', statements, years, 'operating_income', true)}
                    ${renderResearchMetricRow('EBITDA', statements, years, 'ebitda', true)}
                    ${renderResearchMetricRow('Net Income', statements, years, 'net_income', true)}
                    ${renderResearchMetricRow('EPS (Basic)', statements, years, 'eps', false)}
                    ${renderResearchMetricRow('EPS (Diluted)', statements, years, 'eps_diluted', false)}
                    ${renderResearchMetricRow('Shares Outstanding', statements, years, 'weighted_average_shares', false, true)}
                </tbody>
            </table>
        </div>
    `
}

// Render Balance Sheet Tab
function renderResearchBalanceTab(data) {
    const container = document.getElementById('research-balance-tab')
    const statements = data.financials.balance_sheets || []
    
    if (statements.length === 0) {
        container.innerHTML = '<div class="text-center py-12 text-gray-600">No balance sheet data available</div>'
        return
    }
    
    const years = statements.map(s => s.fiscal_year).sort((a, b) => b - a).slice(0, 10)
    
    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="min-w-full border border-gray-200">
                <thead>
                    <tr class="bg-teal-700 text-white">
                        <th class="px-4 py-2 text-left sticky left-0 bg-teal-700">Metric</th>
                        ${years.map(year => `<th class="px-4 py-2 text-right">${year}</th>`).join('')}
                    </tr>
                </thead>
                <tbody class="bg-white">
                    <tr class="bg-teal-100"><th colspan="${years.length + 1}" class="px-4 py-2 text-center font-bold">ASSETS</th></tr>
                    ${renderResearchMetricRow('Total Assets', statements, years, 'total_assets', true)}
                    ${renderResearchMetricRow('Current Assets', statements, years, 'current_assets', true)}
                    ${renderResearchMetricRow('Cash & Equivalents', statements, years, 'cash_and_equivalents', true)}
                    ${renderResearchMetricRow('Accounts Receivable', statements, years, 'accounts_receivable', true)}
                    ${renderResearchMetricRow('Inventory', statements, years, 'inventory', true)}
                    ${renderResearchMetricRow('Property, Plant & Equipment', statements, years, 'property_plant_equipment', true)}
                    <tr class="bg-orange-100"><th colspan="${years.length + 1}" class="px-4 py-2 text-center font-bold">LIABILITIES</th></tr>
                    ${renderResearchMetricRow('Total Liabilities', statements, years, 'total_liabilities', true)}
                    ${renderResearchMetricRow('Current Liabilities', statements, years, 'current_liabilities', true)}
                    ${renderResearchMetricRow('Accounts Payable', statements, years, 'accounts_payable', true)}
                    ${renderResearchMetricRow('Short-term Debt', statements, years, 'short_term_debt', true)}
                    ${renderResearchMetricRow('Long-term Debt', statements, years, 'long_term_debt', true)}
                    ${renderResearchMetricRow('Total Debt', statements, years, 'total_debt', true)}
                    <tr class="bg-yellow-100"><th colspan="${years.length + 1}" class="px-4 py-2 text-center font-bold">EQUITY</th></tr>
                    ${renderResearchMetricRow('Total Stockholders Equity', statements, years, 'total_stockholders_equity', true)}
                    ${renderResearchMetricRow('Retained Earnings', statements, years, 'retained_earnings', true)}
                    ${renderResearchMetricRow('Shares Outstanding', statements, years, 'shares_outstanding', false, true)}
                </tbody>
            </table>
        </div>
    `
}

// Render Cash Flow Tab
function renderResearchCashFlowTab(data) {
    const container = document.getElementById('research-cashflow-tab')
    const statements = data.financials.cash_flow_statements || []
    
    if (statements.length === 0) {
        container.innerHTML = '<div class="text-center py-12 text-gray-600">No cash flow data available</div>'
        return
    }
    
    const years = statements.map(s => s.fiscal_year).sort((a, b) => b - a).slice(0, 10)
    
    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="min-w-full border border-gray-200">
                <thead>
                    <tr class="bg-teal-700 text-white">
                        <th class="px-4 py-2 text-left sticky left-0 bg-teal-700">Metric</th>
                        ${years.map(year => `<th class="px-4 py-2 text-right">${year}</th>`).join('')}
                    </tr>
                </thead>
                <tbody class="bg-white">
                    ${renderResearchMetricRow('Operating Cash Flow', statements, years, 'operating_cash_flow', true)}
                    ${renderResearchMetricRow('Capital Expenditure', statements, years, 'capital_expenditure', true)}
                    ${renderResearchMetricRow('Free Cash Flow', statements, years, 'free_cash_flow', true)}
                    ${renderResearchMetricRow('Investing Cash Flow', statements, years, 'investing_cash_flow', true)}
                    ${renderResearchMetricRow('Financing Cash Flow', statements, years, 'financing_cash_flow', true)}
                    ${renderResearchMetricRow('Dividend Payments', statements, years, 'dividend_payments', true)}
                    ${renderResearchMetricRow('Stock Repurchases', statements, years, 'stock_repurchases', true)}
                </tbody>
            </table>
        </div>
    `
}

// Helper: Render metric row
function renderResearchMetricRow(label, statements, years, field, isCurrency, isShares = false) {
    const values = years.map(year => {
        const statement = statements.find(s => s.fiscal_year === year)
        const value = statement ? statement[field] : null
        
        if (value === null || value === undefined) {
            return '<td class="px-4 py-2 text-right border-t">-</td>'
        }
        
        if (isShares) {
            return `<td class="px-4 py-2 text-right border-t">${formatResearchShares(value)}</td>`
        } else if (isCurrency) {
            return `<td class="px-4 py-2 text-right border-t">${formatResearchCurrency(value)}</td>`
        } else {
            return `<td class="px-4 py-2 text-right border-t">${formatResearchNumber(value, 2)}</td>`
        }
    })
    
    return `
        <tr class="hover:bg-gray-50">
            <th class="px-4 py-2 text-left font-semibold border-t sticky left-0 bg-gray-50">${label}</th>
            ${values.join('')}
        </tr>
    `
}

// Helper: Format currency
function formatResearchCurrency(value) {
    if (!value && value !== 0) return '-'
    const num = parseFloat(value)
    if (isNaN(num)) return '-'
    
    const billions = num / 1_000_000_000
    if (Math.abs(billions) >= 1) {
        return `$${billions.toFixed(2)}B`
    }
    
    const millions = num / 1_000_000
    return `$${millions.toFixed(2)}M`
}

// Helper: Format shares
function formatResearchShares(value) {
    if (!value && value !== 0) return '-'
    const num = parseFloat(value)
    if (isNaN(num)) return '-'
    
    const billions = num / 1_000_000_000
    if (Math.abs(billions) >= 1) {
        return `${billions.toFixed(2)}B`
    }
    
    const millions = num / 1_000_000
    return `${millions.toFixed(2)}M`
}

// Helper: Format number
function formatResearchNumber(value, decimals = 2) {
    if (!value && value !== 0) return '-'
    const num = parseFloat(value)
    if (isNaN(num)) return '-'
    return num.toFixed(decimals)
}

console.log('[RESEARCH] Research modal functions loaded')

// =============================================================================
// MONTHLY INCOME REPORT
// =============================================================================

// Initialize Monthly Income report - populate dropdowns and load current month
async function initializeMonthlyIncome() {
    try {
        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth() + 1 // 1-12
        
        // Populate year dropdown (current year and 2 years back)
        const yearSelect = document.getElementById('monthly-income-year')
        yearSelect.innerHTML = ''
        for (let year = currentYear; year >= currentYear - 2; year--) {
            const option = document.createElement('option')
            option.value = year
            option.textContent = year
            if (year === currentYear) option.selected = true
            yearSelect.appendChild(option)
        }
        
        // Populate month dropdown
        const monthSelect = document.getElementById('monthly-income-month')
        monthSelect.innerHTML = ''
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December']
        for (let m = 1; m <= 12; m++) {
            const option = document.createElement('option')
            option.value = m
            option.textContent = monthNames[m - 1]
            if (m === currentMonth) option.selected = true
            monthSelect.appendChild(option)
        }
        
        // Populate account tabs
        await populateMonthlyIncomeAccountTabs()
        
        // Load current month data
        await loadMonthlyIncome()
        
    } catch (error) {
        console.error('Error initializing monthly income report:', error)
        showNotification('Failed to initialize monthly income report', 'error')
    }
}

// Populate account filter tabs
async function populateMonthlyIncomeAccountTabs() {
    try {
        console.log('Loading monthly income account tabs...')
        // Get user's accounts
        const response = await api.get('/api/accounts')
        console.log('Accounts API response:', response.data)
        const accounts = response.data.accounts || response.data
        console.log('Accounts array:', accounts)
        
        const tabsContainer = document.getElementById('monthly-income-account-tabs')
        console.log('Tabs container found:', !!tabsContainer)
        let html = `
            <!-- ALL tab -->
            <button onclick="selectMonthlyIncomeAccount(null)" 
                    data-account-id="all"
                    class="monthly-income-account-tab px-4 py-2 font-semibold text-gray-600 hover:text-brand-teal border-b-2 border-transparent transition-colors">
                ALL
            </button>
        `
        
        // Add tab for each account
        accounts.forEach(account => {
            html += `
                <button onclick="selectMonthlyIncomeAccount(${account.id})"
                        data-account-id="${account.id}"
                        class="monthly-income-account-tab px-4 py-2 font-semibold text-gray-600 hover:text-brand-teal border-b-2 border-transparent transition-colors whitespace-nowrap">
                    ${account.account_name}
                </button>
            `
        })
        
        tabsContainer.innerHTML = html
        
        // Set ALL as active by default
        selectMonthlyIncomeAccount(null)
        
    } catch (error) {
        console.error('Error loading accounts for monthly income tabs:', error)
    }
}

// Select account tab
function selectMonthlyIncomeAccount(accountId) {
    // Update active tab styling
    document.querySelectorAll('.monthly-income-account-tab').forEach(tab => {
        tab.classList.remove('text-brand-teal', 'border-brand-teal')
        tab.classList.add('text-gray-600', 'border-transparent')
    })
    
    const selector = accountId ? `[data-account-id="${accountId}"]` : '[data-account-id="all"]'
    const activeTab = document.querySelector(`.monthly-income-account-tab${selector}`)
    if (activeTab) {
        activeTab.classList.remove('text-gray-600', 'border-transparent')
        activeTab.classList.add('text-brand-teal', 'border-brand-teal')
    }
    
    // Store selected account ID
    window.selectedMonthlyIncomeAccountId = accountId
    
    // Reload data
    loadMonthlyIncome()
}

// Load monthly income data for selected month/year
async function loadMonthlyIncome() {
    try {
        const year = document.getElementById('monthly-income-year').value
        const month = document.getElementById('monthly-income-month').value
        
        if (!year || !month) {
            document.getElementById('monthly-income-content').innerHTML = `
                <p class="text-center text-gray-500 py-8">Select a month to view income details</p>
            `
            return
        }
        
        // Show loading state
        document.getElementById('monthly-income-content').innerHTML = `
            <div class="flex justify-center items-center py-12">
                <i class="fas fa-spinner fa-spin text-4xl text-brand-teal"></i>
            </div>
        `
        
        // Build URL with account filter if selected
        const accountId = window.selectedMonthlyIncomeAccountId
        let url = `/api/reports/monthly-income?year=${year}&month=${month}`
        if (accountId) {
            url += `&account_id=${accountId}`
        }
        
        // Fetch data from API
        const response = await api.get(url)
        const data = response.data
        
        // Render the report
        renderMonthlyIncomeReport(data)
        
    } catch (error) {
        console.error('Error loading monthly income:', error)
        document.getElementById('monthly-income-content').innerHTML = `
            <div class="text-center text-red-600 py-8">
                <i class="fas fa-exclamation-triangle text-4xl mb-4"></i>
                <p>Failed to load monthly income data</p>
            </div>
        `
        showNotification('Failed to load monthly income data', 'error')
    }
}

// Render the complete monthly income report
function renderMonthlyIncomeReport(data) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December']
    const monthName = monthNames[data.month - 1]
    
    let html = `
        <div class="space-y-8">
            <!-- Header -->
            <div class="bg-gradient-to-r from-teal-50 to-blue-50 p-6 rounded-lg border border-teal-200">
                <h4 class="text-xl font-bold text-gray-800 mb-2">
                    <i class="fas fa-calendar-alt mr-2 text-teal-600"></i>
                    ${monthName} ${data.year} Income Summary
                </h4>
                <p class="text-sm text-gray-600">Period: ${data.startDate} to ${data.endDate}</p>
            </div>
    `
    
    // Calculate grand totals
    let grandTotal = 0
    
    // STOCK INVESTMENTS SECTION
    html += renderStockInvestmentsSection(data.stockInvestments)
    grandTotal += calculateStockInvestmentsTotal(data.stockInvestments)
    
    // OPTION TRADES SECTION
    html += renderOptionTradesSection(data.optionTrades)
    grandTotal += calculateOptionTradesTotal(data.optionTrades)
    
    // GRAND TOTAL
    html += `
            <!-- Grand Total -->
            <div class="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border-2 border-green-300">
                <div class="flex justify-between items-center">
                    <h4 class="text-2xl font-bold text-gray-800">
                        <i class="fas fa-trophy mr-2 text-yellow-500"></i>
                        Total Income for ${monthName} ${data.year}
                    </h4>
                    <div class="text-3xl font-bold ${grandTotal >= 0 ? 'text-green-600' : 'text-red-600'}">
                        ${formatCurrency(grandTotal)}
                    </div>
                </div>
            </div>
        </div>
    `
    
    document.getElementById('monthly-income-content').innerHTML = html
}

// Render Stock Investments section
function renderStockInvestmentsSection(stockInvestments) {
    let html = `
        <div class="bg-white rounded-lg shadow-md overflow-hidden">
            <div class="bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-4">
                <h4 class="text-xl font-bold text-white">
                    <i class="fas fa-chart-line mr-2"></i>Stock Investments
                </h4>
            </div>
            <div class="p-6 space-y-6">
    `
    
    // Dividend ETFs
    html += renderStrategySubsection('Dividend ETFs', '💰', 'green', stockInvestments.dividendETFs)
    
    // Stockpiling
    html += renderStrategySubsection('Stockpiling', '📦', 'blue', stockInvestments.stockpiling)
    
    // Wheel
    html += renderStrategySubsection('Wheel Strategy', '🎯', 'purple', stockInvestments.wheel)
    
    // Stock Investments Total
    const stockTotal = calculateStockInvestmentsTotal(stockInvestments)
    html += `
                <div class="border-t-2 border-gray-300 pt-4 mt-6">
                    <div class="flex justify-between items-center">
                        <h5 class="text-lg font-bold text-gray-800">Stock Investments Total</h5>
                        <div class="text-2xl font-bold ${stockTotal >= 0 ? 'text-green-600' : 'text-red-600'}">
                            ${formatCurrency(stockTotal)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
    
    return html
}

// Render a single strategy subsection (for stocks)
function renderStrategySubsection(title, icon, color, strategyData) {
    const { closedPL, coveredCalls, dividends } = strategyData
    
    // Calculate strategy total
    const closedTotal = closedPL.results?.reduce((sum, item) => sum + parseFloat(item.profit_loss || 0), 0) || 0
    const callsTotal = coveredCalls.results?.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0) || 0
    const divsTotal = dividends.results?.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0) || 0
    const strategyTotal = closedTotal + callsTotal + divsTotal
    
    if (strategyTotal === 0) {
        return `
            <div class="mb-6">
                <h5 class="text-lg font-semibold text-gray-700 mb-2">
                    <span class="text-2xl mr-2">${icon}</span>${title}
                </h5>
                <p class="text-sm text-gray-500 ml-10">No income this month</p>
            </div>
        `
    }
    
    let html = `
        <div class="mb-6">
            <div class="flex justify-between items-center mb-3">
                <h5 class="text-lg font-semibold text-gray-700">
                    <span class="text-2xl mr-2">${icon}</span>${title}
                </h5>
                <div class="text-lg font-bold ${strategyTotal >= 0 ? 'text-green-600' : 'text-red-600'}">
                    ${formatCurrency(strategyTotal)}
                </div>
            </div>
            <div class="ml-10 space-y-4">
    `
    
    // Closed P/L
    if (closedPL.results && closedPL.results.length > 0) {
        html += `
                <div>
                    <h6 class="text-sm font-semibold text-gray-600 mb-2">Closed Positions</h6>
                    <div class="overflow-x-auto">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-3 py-2 text-left font-medium text-gray-700">Ticker</th>
                                    <th class="px-3 py-2 text-right font-medium text-gray-700">P/L</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">
        `
        closedPL.results.forEach(item => {
            const pl = parseFloat(item.profit_loss || 0)
            html += `
                                <tr>
                                    <td class="px-3 py-2 text-left font-medium">${item.ticker}</td>
                                    <td class="px-3 py-2 text-right font-semibold ${pl >= 0 ? 'text-green-600' : 'text-red-600'}">
                                        ${formatCurrency(pl)}
                                    </td>
                                </tr>
            `
        })
        html += `
                                <tr class="bg-gray-50 font-bold">
                                    <td class="px-3 py-2 text-left">Subtotal</td>
                                    <td class="px-3 py-2 text-right ${closedTotal >= 0 ? 'text-green-600' : 'text-red-600'}">
                                        ${formatCurrency(closedTotal)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
        `
    }
    
    // Covered Calls
    if (coveredCalls.results && coveredCalls.results.length > 0) {
        html += `
                <div>
                    <h6 class="text-sm font-semibold text-gray-600 mb-2">Covered Calls</h6>
                    <div class="overflow-x-auto">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-3 py-2 text-left font-medium text-gray-700">Ticker</th>
                                    <th class="px-3 py-2 text-right font-medium text-gray-700">Premium</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">
        `
        coveredCalls.results.forEach(item => {
            const amount = parseFloat(item.amount || 0)
            html += `
                                <tr>
                                    <td class="px-3 py-2 text-left font-medium">${item.ticker}</td>
                                    <td class="px-3 py-2 text-right font-semibold ${amount >= 0 ? 'text-green-600' : 'text-red-600'}">
                                        ${formatCurrency(amount)}
                                    </td>
                                </tr>
            `
        })
        html += `
                                <tr class="bg-gray-50 font-bold">
                                    <td class="px-3 py-2 text-left">Subtotal</td>
                                    <td class="px-3 py-2 text-right ${callsTotal >= 0 ? 'text-green-600' : 'text-red-600'}">
                                        ${formatCurrency(callsTotal)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
        `
    }
    
    // Dividends
    if (dividends.results && dividends.results.length > 0) {
        html += `
                <div>
                    <h6 class="text-sm font-semibold text-gray-600 mb-2">Dividends</h6>
                    <div class="overflow-x-auto">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-3 py-2 text-left font-medium text-gray-700">Ticker</th>
                                    <th class="px-3 py-2 text-right font-medium text-gray-700">Amount</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">
        `
        dividends.results.forEach(item => {
            const amount = parseFloat(item.amount || 0)
            html += `
                                <tr>
                                    <td class="px-3 py-2 text-left font-medium">${item.ticker}</td>
                                    <td class="px-3 py-2 text-right font-semibold text-green-600">
                                        ${formatCurrency(amount)}
                                    </td>
                                </tr>
            `
        })
        html += `
                                <tr class="bg-gray-50 font-bold">
                                    <td class="px-3 py-2 text-left">Subtotal</td>
                                    <td class="px-3 py-2 text-right text-green-600">
                                        ${formatCurrency(divsTotal)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
        `
    }
    
    html += `
            </div>
        </div>
    `
    
    return html
}

// Render Option Trades section
function renderOptionTradesSection(optionTrades) {
    let html = `
        <div class="bg-white rounded-lg shadow-md overflow-hidden">
            <div class="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4">
                <h4 class="text-xl font-bold text-white">
                    <i class="fas fa-layer-group mr-2"></i>Option Trades
                </h4>
            </div>
            <div class="p-6 space-y-6">
    `
    
    // Short Puts - Wheel
    html += renderOptionStrategySubsection('Short Puts (Wheel)', '🎯', optionTrades.shortPutsWheel)
    
    // Short Puts - Stockpiling
    html += renderOptionStrategySubsection('Short Puts (Stockpiling)', '📦', optionTrades.shortPutsStockpiling)
    
    // Short Puts - Long Term
    html += renderOptionStrategySubsection('Short Puts (Long Term)', '📅', optionTrades.shortPutsLongTerm)
    
    // 0DTE SPX Trades (no ticker breakdown)
    const dtePL = parseFloat(optionTrades.dteTrades?.profitLoss || 0)
    const dteCount = parseInt(optionTrades.dteTrades?.tradeCount || 0)
    
    if (dteCount > 0) {
        html += `
                <div class="mb-6">
                    <div class="flex justify-between items-center mb-3">
                        <h5 class="text-lg font-semibold text-gray-700">
                            <span class="text-2xl mr-2">⚡</span>0DTE SPX Trades
                        </h5>
                        <div class="text-lg font-bold ${dtePL >= 0 ? 'text-green-600' : 'text-red-600'}">
                            ${formatCurrency(dtePL)}
                        </div>
                    </div>
                    <div class="ml-10">
                        <p class="text-sm text-gray-600">Total trades: ${dteCount}</p>
                    </div>
                </div>
        `
    } else {
        html += `
                <div class="mb-6">
                    <h5 class="text-lg font-semibold text-gray-700 mb-2">
                        <span class="text-2xl mr-2">⚡</span>0DTE SPX Trades
                    </h5>
                    <p class="text-sm text-gray-500 ml-10">No trades this month</p>
                </div>
        `
    }
    
    // Option Trades Total
    const optionsTotal = calculateOptionTradesTotal(optionTrades)
    html += `
                <div class="border-t-2 border-gray-300 pt-4 mt-6">
                    <div class="flex justify-between items-center">
                        <h5 class="text-lg font-bold text-gray-800">Option Trades Total</h5>
                        <div class="text-2xl font-bold ${optionsTotal >= 0 ? 'text-green-600' : 'text-red-600'}">
                            ${formatCurrency(optionsTotal)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
    
    return html
}

// Render a single option strategy subsection
function renderOptionStrategySubsection(title, icon, trades) {
    if (!trades || !trades.results || trades.results.length === 0) {
        return `
            <div class="mb-6">
                <h5 class="text-lg font-semibold text-gray-700 mb-2">
                    <span class="text-2xl mr-2">${icon}</span>${title}
                </h5>
                <p class="text-sm text-gray-500 ml-10">No closed trades this month</p>
            </div>
        `
    }
    
    const total = trades.results.reduce((sum, item) => sum + parseFloat(item.profit_loss || 0), 0)
    
    let html = `
        <div class="mb-6">
            <div class="flex justify-between items-center mb-3">
                <h5 class="text-lg font-semibold text-gray-700">
                    <span class="text-2xl mr-2">${icon}</span>${title}
                </h5>
                <div class="text-lg font-bold ${total >= 0 ? 'text-green-600' : 'text-red-600'}">
                    ${formatCurrency(total)}
                </div>
            </div>
            <div class="ml-10">
                <div class="overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-3 py-2 text-left font-medium text-gray-700">Ticker</th>
                                <th class="px-3 py-2 text-right font-medium text-gray-700">P/L</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
    `
    
    trades.results.forEach(item => {
        const pl = parseFloat(item.profit_loss || 0)
        html += `
                            <tr>
                                <td class="px-3 py-2 text-left font-medium">${item.ticker}</td>
                                <td class="px-3 py-2 text-right font-semibold ${pl >= 0 ? 'text-green-600' : 'text-red-600'}">
                                    ${formatCurrency(pl)}
                                </td>
                            </tr>
        `
    })
    
    html += `
                            <tr class="bg-gray-50 font-bold">
                                <td class="px-3 py-2 text-left">Subtotal</td>
                                <td class="px-3 py-2 text-right ${total >= 0 ? 'text-green-600' : 'text-red-600'}">
                                    ${formatCurrency(total)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `
    
    return html
}

// Calculate total for stock investments
function calculateStockInvestmentsTotal(stockInvestments) {
    let total = 0
    
    // Dividend ETFs
    total += stockInvestments.dividendETFs.closedPL.results?.reduce((sum, item) => sum + parseFloat(item.profit_loss || 0), 0) || 0
    total += stockInvestments.dividendETFs.coveredCalls.results?.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0) || 0
    total += stockInvestments.dividendETFs.dividends.results?.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0) || 0
    
    // Stockpiling
    total += stockInvestments.stockpiling.closedPL.results?.reduce((sum, item) => sum + parseFloat(item.profit_loss || 0), 0) || 0
    total += stockInvestments.stockpiling.coveredCalls.results?.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0) || 0
    total += stockInvestments.stockpiling.dividends.results?.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0) || 0
    
    // Wheel
    total += stockInvestments.wheel.closedPL.results?.reduce((sum, item) => sum + parseFloat(item.profit_loss || 0), 0) || 0
    total += stockInvestments.wheel.coveredCalls.results?.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0) || 0
    total += stockInvestments.wheel.dividends.results?.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0) || 0
    
    return total
}

// Calculate total for option trades
function calculateOptionTradesTotal(optionTrades) {
    let total = 0
    
    total += optionTrades.shortPutsWheel.results?.reduce((sum, item) => sum + parseFloat(item.profit_loss || 0), 0) || 0
    total += optionTrades.shortPutsStockpiling.results?.reduce((sum, item) => sum + parseFloat(item.profit_loss || 0), 0) || 0
    total += optionTrades.shortPutsLongTerm.results?.reduce((sum, item) => sum + parseFloat(item.profit_loss || 0), 0) || 0
    total += parseFloat(optionTrades.dteTrades?.profitLoss || 0)
    
    return total
}

