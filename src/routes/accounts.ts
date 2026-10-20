import { Hono } from 'hono'
import { loadRealizedSells, sumRealized } from '../lib/stock-pl'
import { optionPL } from '../lib/calc'
import { getRates } from '../lib/fx'
import { authMiddleware } from '../lib/auth'
import type { Bindings } from '../types'

export const routes = new Hono<{ Bindings: Bindings }>()

// ============================================================================
// ACCOUNTS ENDPOINTS
// ============================================================================

// Get all accounts for current user
routes.get('/api/accounts', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;

    const { results } = await DB.prepare(`
      SELECT id, account_name, account_type, balance_cad, balance_usd, 
             cash_balance_cad, cash_balance_usd, default_currency, created_at, updated_at
      FROM accounts
      WHERE user_id = ?
      ORDER BY account_type, account_name
    `).bind(userId).all();

    return c.json({ accounts: results });
  } catch (error: any) {
    console.error('Get accounts error:', error);
    return c.json({ error: 'Failed to fetch accounts' }, 500);
  }
});

// Get single account
routes.get('/api/accounts/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const accountId = parseInt(c.req.param('id'));
    const { DB } = c.env;

    const result = await DB.prepare(`
      SELECT id, account_name, account_type, balance_cad, balance_usd, 
             cash_balance_cad, cash_balance_usd, default_currency, created_at, updated_at
      FROM accounts
      WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).first();

    if (!result) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json({ account: result });
  } catch (error: any) {
    console.error('Get account error:', error);
    return c.json({ error: 'Failed to fetch account' }, 500);
  }
});

// Create new account
routes.post('/api/accounts', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;
    const { 
      account_name, 
      account_type, 
      balance_cad = 0, 
      balance_usd = 0, 
      cash_balance_cad = 0,
      cash_balance_usd = 0,
      default_currency = 'CAD'
    } = await c.req.json();

    // Validation
    if (!account_name || !account_type) {
      return c.json({ error: 'Account name and type are required' }, 400);
    }

    // Validate account_type
    const validTypes = ['Cash', 'TFSA', 'RRSP', 'LIRA'];
    if (!validTypes.includes(account_type)) {
      return c.json({ error: 'Invalid account type' }, 400);
    }

    // Validate default_currency
    if (!['CAD', 'USD'].includes(default_currency)) {
      return c.json({ error: 'Invalid currency. Must be CAD or USD' }, 400);
    }

    const result = await DB.prepare(`
      INSERT INTO accounts (
        user_id, account_name, account_type, balance_cad, 
        balance_usd, cash_balance_cad, cash_balance_usd, default_currency
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId, 
      account_name, 
      account_type, 
      balance_cad, 
      balance_usd, 
      cash_balance_cad,
      cash_balance_usd,
      default_currency
    ).run();

    const accountId = result.meta.last_row_id;

    // Save initial balance to history
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Get exchange rates from cache (don't make HTTP call to avoid timeout)
    let rates = { usd_to_cad: 1.35, cad_to_usd: 1 / 1.35 };
    try {
      const cachedRate = await DB.prepare(`
        SELECT usd_to_cad, cad_to_usd 
        FROM exchange_rates 
        WHERE month = ? AND year = ?
      `).bind(currentMonth, currentYear).first();
      
      if (cachedRate) {
        rates = {
          usd_to_cad: cachedRate.usd_to_cad as number,
          cad_to_usd: cachedRate.cad_to_usd as number
        };
        console.log('Using cached exchange rate for account creation');
      } else {
        console.log('No cached rate found, using fallback 1.35');
      }
    } catch (e) {
      console.error('Error reading exchange rate from cache:', e);
      // Use fallback rates
    }

    // Determine balance and currency based on default_currency
    const historyBalance = default_currency === 'CAD' ? balance_cad : balance_usd;
    const historyCash = default_currency === 'CAD' ? cash_balance_cad : cash_balance_usd;

    // Save initial snapshot to history
    try {
      await DB.prepare(`
        INSERT INTO account_balance_history (
          user_id, account_id, balance, cash_balance, currency,
          month, year, exchange_rate_to_usd, exchange_rate_to_cad
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId,
        accountId,
        historyBalance,
        historyCash,
        default_currency,
        currentMonth,
        currentYear,
        rates.cad_to_usd || (1 / rates.usd_to_cad),
        rates.usd_to_cad || 1.35
      ).run();
      console.log(`Initial balance history saved for account ${accountId}`);
    } catch (historyError) {
      console.error('Failed to save initial balance history:', historyError);
      // Don't fail account creation if history save fails
    }

    return c.json({ 
      id: accountId,
      account_name,
      account_type,
      balance_cad,
      balance_usd,
      cash_balance_cad,
      cash_balance_usd,
      default_currency
    }, 201);
  } catch (error: any) {
    console.error('Create account error:', error);
    return c.json({ error: 'Failed to create account' }, 500);
  }
});

// Update account
routes.put('/api/accounts/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const accountId = parseInt(c.req.param('id'));
    const { DB } = c.env;
    const { 
      account_name, 
      account_type, 
      balance_cad, 
      balance_usd, 
      cash_balance_cad,
      cash_balance_usd,
      default_currency
    } = await c.req.json();

    // Validate account_type if provided
    if (account_type !== undefined) {
      const validTypes = ['Cash', 'TFSA', 'RRSP', 'LIRA'];
      if (!validTypes.includes(account_type)) {
        return c.json({ error: 'Invalid account type' }, 400);
      }
    }

    // Validate default_currency if provided
    if (default_currency !== undefined && !['CAD', 'USD'].includes(default_currency)) {
      return c.json({ error: 'Invalid currency. Must be CAD or USD' }, 400);
    }

    // Check ownership
    const existing = await DB.prepare(`
      SELECT * FROM accounts WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).first() as any;

    if (!existing) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Build update with only provided fields
    const updates: string[] = [];
    const values: any[] = [];
    
    if (account_name !== undefined) {
      updates.push('account_name = ?');
      values.push(account_name);
    }
    if (account_type !== undefined) {
      updates.push('account_type = ?');
      values.push(account_type);
    }
    if (balance_cad !== undefined) {
      updates.push('balance_cad = ?');
      values.push(balance_cad);
    }
    if (balance_usd !== undefined) {
      updates.push('balance_usd = ?');
      values.push(balance_usd);
    }
    if (cash_balance_cad !== undefined) {
      updates.push('cash_balance_cad = ?');
      values.push(cash_balance_cad);
    }
    if (cash_balance_usd !== undefined) {
      updates.push('cash_balance_usd = ?');
      values.push(cash_balance_usd);
    }
    if (default_currency !== undefined) {
      updates.push('default_currency = ?');
      values.push(default_currency);
    }
    
    if (updates.length === 0) {
      return c.json({ success: true }); // Nothing to update
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(accountId, userId);

    await DB.prepare(`
      UPDATE accounts
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `).bind(...values).run();

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Update account error:', error);
    return c.json({ error: 'Failed to update account' }, 500);
  }
});

// Delete account
routes.delete('/api/accounts/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const accountId = parseInt(c.req.param('id'));
    const { DB } = c.env;

    // Check if account has any trades
    const tradesCheck = await DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM stock_trades WHERE account_id = ?) as stock_count,
        (SELECT COUNT(*) FROM option_trades WHERE account_id = ?) as option_count
    `).bind(accountId, accountId).first() as any;

    if (tradesCheck.stock_count > 0 || tradesCheck.option_count > 0) {
      return c.json({ 
        error: 'Cannot delete account with existing trades' 
      }, 400);
    }

    // Check ownership and delete
    const result = await DB.prepare(`
      DELETE FROM accounts WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Delete account error:', error);
    return c.json({ error: 'Failed to delete account' }, 500);
  }
})

// Check if account balance can be updated this month
routes.get('/api/accounts/:id/can-update', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const accountId = parseInt(c.req.param('id'));
    const { DB } = c.env;

    // Get current date info
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const currentDay = now.getDate();
    
    // Calculate next month/year
    let targetMonth = currentMonth;
    let targetYear = currentYear;
    
    // Check if we're in the last 5 days of the month (allowing for last trading day flexibility)
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const isLastWeekOfMonth = currentDay >= (daysInMonth - 5);
    
    // If in last week of month, allow updating for next month
    if (isLastWeekOfMonth) {
      targetMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      targetYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    }

    // Check if account exists and belongs to user
    const account = await DB.prepare(`
      SELECT id FROM accounts WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).first();

    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Check if balance was already updated for current month
    const currentMonthHistory = await DB.prepare(`
      SELECT id, created_at FROM account_balance_history
      WHERE account_id = ? AND month = ? AND year = ?
    `).bind(accountId, currentMonth, currentYear).first() as any;

    // Check if balance was already updated for target month (if different)
    let targetMonthHistory = null;
    if (targetMonth !== currentMonth || targetYear !== currentYear) {
      targetMonthHistory = await DB.prepare(`
        SELECT id, created_at FROM account_balance_history
        WHERE account_id = ? AND month = ? AND year = ?
      `).bind(accountId, targetMonth, targetYear).first() as any;
    }

    // If current month already updated
    if (currentMonthHistory && !isLastWeekOfMonth) {
      return c.json({
        canUpdate: false,
        month: currentMonth,
        year: currentYear,
        lastUpdate: currentMonthHistory.created_at,
        message: 'Balance already updated this month'
      });
    }

    // If in last week of month
    if (isLastWeekOfMonth) {
      // Allow update for next month if not already done
      if (targetMonthHistory) {
        return c.json({
          canUpdate: false,
          month: targetMonth,
          year: targetYear,
          lastUpdate: targetMonthHistory.created_at,
          message: `Balance already updated for ${targetMonth}/${targetYear}`
        });
      }
      
      // Can update for next month
      return c.json({
        canUpdate: true,
        month: targetMonth,
        year: targetYear,
        isNextMonth: true,
        message: `Can update balance for next month (${targetMonth}/${targetYear}) - Last week of current month`
      });
    }

    // Regular case - can update current month
    return c.json({
      canUpdate: true,
      month: currentMonth,
      year: currentYear,
      isNextMonth: false,
      message: 'Balance can be updated'
    });
  } catch (error: any) {
    console.error('Check update permission error:', error);
    return c.json({ error: 'Failed to check update permission' }, 500);
  }
})

// Update account balance with monthly restriction and history tracking
routes.put('/api/accounts/:id/balance', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const accountId = parseInt(c.req.param('id'));
    const { DB } = c.env;
    const { balance, cash_balance } = await c.req.json();

    // Get current date info
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();
    const currentDay = now.getDate();
    
    // Calculate target month/year for the update
    let targetMonth = currentMonth;
    let targetYear = currentYear;
    
    // Check if we're in the last 5 days of the month (allowing for last trading day flexibility)
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const isLastWeekOfMonth = currentDay >= (daysInMonth - 5);
    
    // If in last week of month, allow updating for next month
    if (isLastWeekOfMonth) {
      targetMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      targetYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    }

    // Get account details
    const account = await DB.prepare(`
      SELECT id, user_id, default_currency, balance_cad, balance_usd, 
             cash_balance_cad, cash_balance_usd
      FROM accounts
      WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).first() as any;

    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Check if balance was already updated for the target month
    const existingHistory = await DB.prepare(`
      SELECT id FROM account_balance_history
      WHERE account_id = ? AND month = ? AND year = ?
    `).bind(accountId, targetMonth, targetYear).first();

    if (existingHistory) {
      return c.json({ 
        error: `Balance already updated for ${targetMonth}/${targetYear}`,
        canUpdate: false,
        month: targetMonth,
        year: targetYear
      }, 400);
    }

    // Prepare update based on currency
    let updateData: any = {};
    let historyBalance = balance;
    let historyCash = cash_balance;
    let historyCurrency = account.default_currency;

    if (account.default_currency === 'CAD') {
      updateData.balance_cad = balance;
      updateData.cash_balance_cad = cash_balance;
    } else {
      updateData.balance_usd = balance;
      updateData.cash_balance_usd = cash_balance;
    }

    // Update account balances
    await DB.prepare(`
      UPDATE accounts
      SET ${account.default_currency === 'CAD' ? 'balance_cad = ?, cash_balance_cad = ?' : 'balance_usd = ?, cash_balance_usd = ?'},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      balance,
      cash_balance,
      accountId,
      userId
    ).run();

    // Get exchange rates for history using target month/year
    const rateResponse = await fetch(`${c.req.url.split('/api')[0]}/api/exchange-rate?month=${targetMonth}&year=${targetYear}`, {
      headers: { 'Authorization': c.req.header('Authorization') || '' }
    });
    const rates = await rateResponse.json() as any;

    // Save to history with target month/year
    await DB.prepare(`
      INSERT INTO account_balance_history (
        user_id, account_id, balance, cash_balance, currency,
        month, year, exchange_rate_to_usd, exchange_rate_to_cad
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      accountId,
      historyBalance,
      historyCash,
      historyCurrency,
      targetMonth,
      targetYear,
      rates.cad_to_usd || (1 / rates.usd_to_cad),
      rates.usd_to_cad || 1.35
    ).run();

    return c.json({ 
      success: true,
      updated: true,
      month: targetMonth,
      year: targetYear,
      isNextMonth: isLastWeekOfMonth,
      historySaved: true,
      message: isLastWeekOfMonth 
        ? `Balance updated for next month (${targetMonth}/${targetYear})` 
        : `Balance updated for current month (${targetMonth}/${targetYear})`
    });
  } catch (error: any) {
    console.error('Update balance error:', error);
    return c.json({ error: 'Failed to update balance' }, 500);
  }
})

// Get exchange rate for a specific month/year
routes.get('/api/exchange-rate', authMiddleware, async (c) => {
  try {
    const { DB } = c.env;
    const month = parseInt(c.req.query('month') || new Date().getMonth() + 1);
    const year = parseInt(c.req.query('year') || new Date().getFullYear());

    // Check if we have cached rate
    const cached = await DB.prepare(`
      SELECT usd_to_cad, cad_to_usd FROM exchange_rates 
      WHERE month = ? AND year = ?
    `).bind(month, year).first() as any;

    if (cached) {
      return c.json({ 
        usd_to_cad: cached.usd_to_cad, 
        cad_to_usd: cached.cad_to_usd,
        month,
        year,
        cached: true
      });
    }

    // Fetch from API (using exchangerate-api.com free tier)
    // Format date as YYYY-MM-DD (first day of month)
    const dateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    
    try {
      const response = await fetch(`https://api.exchangerate-api.com/v4/history/USD/${dateStr}`);
      const data = await response.json() as any;
      
      if (data && data.rates && data.rates.CAD) {
        const usdToCad = data.rates.CAD;
        const cadToUsd = 1 / usdToCad;
        
        // Cache the rate
        await DB.prepare(`
          INSERT INTO exchange_rates (month, year, usd_to_cad, cad_to_usd)
          VALUES (?, ?, ?, ?)
        `).bind(month, year, usdToCad, cadToUsd).run();
        
        return c.json({ 
          usd_to_cad: usdToCad, 
          cad_to_usd: cadToUsd,
          month,
          year,
          cached: false
        });
      }
    } catch (apiError) {
      console.error('Exchange rate API error:', apiError);
    }
    
    // Fallback to default rate if API fails
    const defaultRate = 1.35; // USD to CAD
    return c.json({ 
      usd_to_cad: defaultRate, 
      cad_to_usd: 1 / defaultRate,
      month,
      year,
      cached: false,
      fallback: true
    });
  } catch (error: any) {
    console.error('Get exchange rate error:', error);
    return c.json({ error: 'Failed to get exchange rate' }, 500);
  }
})

// Save monthly account balance snapshot
routes.post('/api/accounts/:id/snapshot', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const accountId = parseInt(c.req.param('id'));
    const { DB } = c.env;
    
    // Parse request body, default to empty object if body is empty
    let body = {};
    try {
      body = await c.req.json();
    } catch (e) {
      // Empty body is okay, we'll use defaults
    }
    
    // Use provided month/year or default to current month/year
    const now = new Date();
    const month = (body as any).month || (now.getMonth() + 1);
    const year = (body as any).year || now.getFullYear();

    // Get current account details
    const account = await DB.prepare(`
      SELECT id, balance_cad, balance_usd, cash_balance_usd, default_currency
      FROM accounts
      WHERE id = ? AND user_id = ?
    `).bind(accountId, userId).first() as any;

    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Get exchange rates
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const rates = await getRates(DB, currentMonth, currentYear);
    

    // Determine balance and currency based on default_currency
    const balance = account.default_currency === 'USD' ? account.balance_usd : account.balance_cad;
    const cashBalance = account.default_currency === 'USD' ? account.cash_balance_usd : 
                        (account.cash_balance_usd * rates.usd_to_cad);

    // Save snapshot
    const result = await DB.prepare(`
      INSERT OR REPLACE INTO account_balance_history (
        user_id, account_id, balance, cash_balance, currency,
        month, year, exchange_rate_to_usd, exchange_rate_to_cad
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      accountId,
      balance,
      cashBalance,
      account.default_currency,
      month,
      year,
      rates.cad_to_usd,
      rates.usd_to_cad
    ).run();

    return c.json({ success: true, id: result.meta.last_row_id }, 201);
  } catch (error: any) {
    console.error('Save snapshot error:', error);
    return c.json({ error: 'Failed to save balance snapshot' }, 500);
  }
})

// Get dashboard totals with currency conversion
routes.get('/api/dashboard/totals', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;
    const month = parseInt(c.req.query('month') || String(new Date().getMonth() + 1));
    const year = parseInt(c.req.query('year') || String(new Date().getFullYear()));

    // Get all accounts
    const { results: accounts } = await DB.prepare(`
      SELECT id, account_name, account_type, balance_cad, balance_usd, 
             cash_balance_cad, cash_balance_usd, default_currency
      FROM accounts
      WHERE user_id = ?
    `).bind(userId).all();

    // Get exchange rate from cache (should already be cached from login)
    const rates = await getRates(DB, month, year);
    
    const isDefaultRate = rates.is_default;

    // Calculate totals in both currencies
    let totalCAD = 0;
    let totalUSD = 0;
    let totalCashCAD = 0;
    let totalCashUSD = 0;

    (accounts as any[]).forEach(account => {
      if (account.default_currency === 'CAD') {
        const balance = account.balance_cad || 0;
        const cash = account.cash_balance_cad || 0;
        
        totalCAD += balance;
        totalUSD += balance * rates.cad_to_usd;
        totalCashCAD += cash;
        totalCashUSD += cash * rates.cad_to_usd;
      } else {
        const balance = account.balance_usd || 0;
        const cash = account.cash_balance_usd || 0;
        
        totalUSD += balance;
        totalCAD += balance * rates.usd_to_cad;
        totalCashUSD += cash;
        totalCashCAD += cash * rates.usd_to_cad;
      }
    });

    return c.json({
      total_cad: totalCAD,
      total_usd: totalUSD,
      total_cash_cad: totalCashCAD,
      total_cash_usd: totalCashUSD,
      exchange_rate: {
        usd_to_cad: rates.usd_to_cad,
        cad_to_usd: rates.cad_to_usd,
        month,
        year,
        is_default: isDefaultRate,
        source: isDefaultRate ? 'Default Rate' : 'Bank of Canada'
      }
    });
  } catch (error: any) {
    console.error('Get dashboard totals error:', error);
    return c.json({ error: 'Failed to get dashboard totals' }, 500);
  }
})

// Get YTD performance for all accounts
routes.get('/api/dashboard/ytd-performance', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // Get all accounts
    const { results: accounts } = await DB.prepare(`
      SELECT id, account_name, account_type, balance_cad, balance_usd, 
             cash_balance_cad, cash_balance_usd, default_currency
      FROM accounts
      WHERE user_id = ?
    `).bind(userId).all();
    
    console.log('YTD Performance - User ID:', userId, 'Accounts found:', accounts?.length || 0);

    // Get exchange rate
    const rates = await getRates(DB, currentMonth, currentYear);
    

    const accountPerformance = [];
    let totalYTDPL = 0;
    let totalCurrentValue = 0;

    // Realized stock P/L for this year, one row per SELL (partial sells included)
    const ytdSells = await loadRealizedSells(DB, userId, {
      from: `${currentYear}-01-01`,
      to: `${currentYear + 1}-01-01`
    });

    for (const account of accounts as any[]) {
      // YTD realized P/L from stock sells in this account
      const stockPLTotal = sumRealized(ytdSells.filter(s => s.account_id === account.id))

      // Get YTD P/L from closed option trades
      const optionPL = await DB.prepare(`
        SELECT COALESCE(SUM(profit_loss), 0) as total_pl
        FROM option_trades
        WHERE user_id = ?
        AND account_type = ?
        AND is_open = 0
        AND close_date LIKE ?
      `).bind(userId, account.account_type, `${currentYear}%`).first() as any;

      // Get YTD P/L from closed daily trades (0DTE)
      const dailyPL = await DB.prepare(`
        SELECT COALESCE(SUM(profit_loss), 0) as total_pl
        FROM daily_trades
        WHERE user_id = ?
        AND account_id = ?
        AND is_open = 0
        AND strftime('%Y', trade_date) = ?
      `).bind(userId, account.id, currentYear.toString()).first() as any;

      // Get YTD dividends for this account
      // Join with stock_holdings to get the account_id for each dividend
      const dividends = await DB.prepare(`
        SELECT COALESCE(SUM(cba.amount), 0) as total_dividends
        FROM cost_basis_adjustments cba
        INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
        INNER JOIN accounts a ON sh.account_id = a.id
        WHERE cba.user_id = ?
        AND a.account_type = ?
        AND cba.adjustment_type = 'DIVIDEND'
        AND cba.adjustment_date LIKE ?
      `).bind(userId, account.account_type, `${currentYear}%`).first() as any;

      console.log(`YTD Performance for ${account.account_name}:`, {
        stockPL: stockPLTotal,
        optionPL: optionPL?.total_pl || 0,
        dailyPL: dailyPL?.total_pl || 0,
        dividends: dividends?.total_dividends || 0,
        account_id: account.id,
        currentYear
      });

      const ytdPL = stockPLTotal + (optionPL?.total_pl || 0) + (dailyPL?.total_pl || 0) + (dividends?.total_dividends || 0);
      const currentValue = account.default_currency === 'CAD' 
        ? (account.balance_cad || 0) 
        : (account.balance_usd || 0);

      // Calculate YTD RORC (Return on Risk Capital)
      const ytdRORC = currentValue > 0 ? (ytdPL / currentValue) * 100 : 0;

      // Calculate ARORC (Annualized RORC)
      const arorc = currentMonth > 0 ? (ytdRORC * 12) / currentMonth : 0;

      accountPerformance.push({
        account_name: account.account_name,
        account_type: account.account_type,
        currency: account.default_currency,
        current_value: currentValue,
        ytd_pl: ytdPL,
        ytd_rorc: ytdRORC,
        arorc: arorc
      });

      // Convert to common currency for totals (USD)
      const valueInUSD = account.default_currency === 'CAD' 
        ? currentValue * rates.cad_to_usd 
        : currentValue;
      const plInUSD = account.default_currency === 'CAD' 
        ? ytdPL * rates.cad_to_usd 
        : ytdPL;

      totalCurrentValue += valueInUSD;
      totalYTDPL += plInUSD;
    }

    // Calculate portfolio-wide metrics
    const totalYTDRORC = totalCurrentValue > 0 ? (totalYTDPL / totalCurrentValue) * 100 : 0;
    const totalARORC = currentMonth > 0 ? (totalYTDRORC * 12) / currentMonth : 0;

    return c.json({
      accounts: accountPerformance,
      totals: {
        current_value: totalCurrentValue,
        ytd_pl: totalYTDPL,
        ytd_rorc: totalYTDRORC,
        arorc: totalARORC
      }
    });
  } catch (error: any) {
    console.error('Get YTD performance error:', error);
    return c.json({ error: 'Failed to get YTD performance' }, 500);
  }
})

// Get dashboard with currency conversion
routes.get('/api/dashboard', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const { DB } = c.env;
    const month = parseInt(c.req.query('month') || new Date().getMonth() + 1);
    const year = parseInt(c.req.query('year') || new Date().getFullYear());

    // Get all accounts
    const { results: accounts } = await DB.prepare(`
      SELECT id, account_name, account_type, balance_cad, balance_usd, 
             cash_balance_usd, default_currency
      FROM accounts
      WHERE user_id = ?
    `).bind(userId).all();

    // Get exchange rate from cache (should already be cached from login)
    const rates = await getRates(DB, month, year);
    

    // Calculate totals in both currencies
    let totalCAD = 0;
    let totalUSD = 0;

    (accounts as any[]).forEach(account => {
      if (account.default_currency === 'CAD') {
        totalCAD += account.balance_cad || 0;
        totalUSD += (account.balance_cad || 0) * rates.cad_to_usd;
      } else {
        totalUSD += account.balance_usd || 0;
        totalCAD += (account.balance_usd || 0) * rates.usd_to_cad;
      }
    });

    // Get recent trades count
    const tradesCount = await DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM stock_trades WHERE user_id = ?) as stock_count,
        (SELECT COUNT(*) FROM option_trades WHERE user_id = ?) as option_count
    `).bind(userId, userId).first() as any;

    return c.json({
      total_balance_cad: totalCAD,
      total_balance_usd: totalUSD,
      exchange_rate: { usd_to_cad: rates.usd_to_cad, cad_to_usd: rates.cad_to_usd },
      accounts_count: accounts.length,
      stock_trades_count: tradesCount?.stock_count || 0,
      option_trades_count: tradesCount?.option_count || 0,
      accounts: accounts
    });
  } catch (error: any) {
    console.error('Get dashboard error:', error);
    return c.json({ error: 'Failed to fetch dashboard' }, 500);
  }
})
