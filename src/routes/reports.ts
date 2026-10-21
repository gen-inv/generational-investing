import { Hono } from 'hono'
import { loadRealizedSells, sumRealized } from '../lib/stock-pl'
import { costBasisPerShare } from '../lib/cost-basis'
import { optionPL } from '../lib/calc'
import { getRates } from '../lib/fx'
import { authMiddleware } from '../lib/auth'
import type { Bindings } from '../types'

export const routes = new Hono<{ Bindings: Bindings }>()

// ============================================================================
// REPORTS DASHBOARD - NEW TAB-BASED REPORTS
// ============================================================================

// Portfolio Overview Report
routes.get('/api/reports/portfolio-overview', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const currentYear = new Date().getFullYear()
    
    // Get current account balances
    const { results: accounts } = await DB.prepare(`
      SELECT id, account_name, account_type, balance_cad, balance_usd, default_currency
      FROM accounts
      WHERE user_id = ?
    `).bind(userId).all()
    
    // Calculate total value
    let totalValueCAD = 0
    let totalValueUSD = 0
    const accountData = []
    
    for (const account of accounts as any[]) {
      // Sum both CAD and USD balances
      const cadBalance = account.balance_cad || 0
      const usdBalance = account.balance_usd || 0
      
      totalValueCAD += cadBalance
      totalValueUSD += usdBalance
      
      // For account breakdown chart, use the default currency balance
      const balance = account.default_currency === 'CAD' ? cadBalance : usdBalance
      accountData.push({
        name: account.account_name,
        value: balance
      })
    }
    
    // Get exchange rate for conversion
    const currentMonth = new Date().getMonth() + 1
    const rates = await getRates(DB, currentMonth, currentYear)
    
    const usdToCad = rates.usd_to_cad
    const cadToUsd = rates.cad_to_usd
    
    // Store original values
    const originalCAD = totalValueCAD
    const originalUSD = totalValueUSD
    
    // Calculate total in CAD (CAD + USD converted to CAD)
    totalValueCAD = originalCAD + (originalUSD * usdToCad)
    // Calculate total in USD (USD + CAD converted to USD)
    totalValueUSD = originalUSD + (originalCAD * cadToUsd)
    
    const totalValue = totalValueUSD // Keep for backward compatibility

    
    // Get YTD P/L from all closed trades
    // Stock P/L = realized P/L of every SELL (partial sells included), not the legacy stock_trades table
    const allStockSells = await loadRealizedSells(DB, userId)
    const stockPL = {
      total_pl: sumRealized(allStockSells.filter(s => s.sell_date.startsWith(`${currentYear}`)))
    }

    const optionPL = await DB.prepare(`
      SELECT COALESCE(SUM(profit_loss), 0) as total_pl
      FROM option_trades
      WHERE user_id = ? AND is_open = 0 AND close_date LIKE ?
    `).bind(userId, `${currentYear}%`).first() as any
    
    const dailyPL = await DB.prepare(`
      SELECT COALESCE(SUM(profit_loss), 0) as total_pl
      FROM daily_trades
      WHERE user_id = ? AND is_open = 0 AND strftime('%Y', trade_date) = ?
    `).bind(userId, currentYear.toString()).first() as any
    
    // Get YTD dividends
    const dividends = await DB.prepare(`
      SELECT COALESCE(SUM(cba.amount), 0) as total_dividends
      FROM cost_basis_adjustments cba
      WHERE cba.user_id = ?
      AND cba.adjustment_type = 'DIVIDEND'
      AND cba.adjustment_date LIKE ?
    `).bind(userId, `${currentYear}%`).first() as any
    
    const ytdPL = (stockPL?.total_pl || 0) + (optionPL?.total_pl || 0) + (dailyPL?.total_pl || 0) + (dividends?.total_dividends || 0)
    const ytdPercentage = totalValue > 0 ? (ytdPL / totalValue) * 100 : 0
    
    // Get trade statistics
    const closedTrades = await DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as wins,
        AVG(profit_loss) as avg_pl,
        MAX(profit_loss) as best_trade
      FROM (
        SELECT profit_loss FROM option_trades WHERE user_id = ? AND is_open = 0
        UNION ALL
        SELECT profit_loss FROM daily_trades WHERE user_id = ? AND is_open = 0
      )
    `).bind(userId, userId).first() as any

    // Fold the stock sells (one trade per SELL) into the option/daily statistics
    const sellPLs = allStockSells.map(s => s.realized_pl)
    const otherCount = closedTrades?.total || 0
    const totalTrades = otherCount + sellPLs.length
    const winningTrades = (closedTrades?.wins || 0) + sellPLs.filter(p => p > 0).length
    const combinedAvgPL = totalTrades > 0
      ? (((closedTrades?.avg_pl || 0) * otherCount) + sellPLs.reduce((a, b) => a + b, 0)) / totalTrades
      : 0
    const combinedBestTrade = Math.max(
      closedTrades?.best_trade ?? -Infinity,
      ...(sellPLs.length ? sellPLs : [-Infinity])
    )
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0
    
    // Generate monthly P/L data (last 12 months)
    const monthlyPL = []
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date()
      date.setMonth(date.getMonth() - i)
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      const monthStr = month.toString().padStart(2, '0')
      
      const monthlyStockPL = {
        pl: sumRealized(allStockSells.filter(s => s.sell_date.startsWith(`${year}-${monthStr}`)))
      }

      const monthlyOptionPL = await DB.prepare(`
        SELECT COALESCE(SUM(profit_loss), 0) as pl
        FROM option_trades
        WHERE user_id = ? AND is_open = 0 AND close_date LIKE ?
      `).bind(userId, `${year}-${monthStr}%`).first() as any
      
      const monthlyDailyPL = await DB.prepare(`
        SELECT COALESCE(SUM(profit_loss), 0) as pl
        FROM daily_trades
        WHERE user_id = ? AND is_open = 0 AND strftime('%Y-%m', trade_date) = ?
      `).bind(userId, `${year}-${monthStr}`).first() as any
      
      const monthlyDividends = await DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as pl
        FROM cost_basis_adjustments
        WHERE user_id = ? AND adjustment_type = 'DIVIDEND' AND adjustment_date LIKE ?
      `).bind(userId, `${year}-${monthStr}%`).first() as any
      
      const totalMonthlyPL = (monthlyStockPL?.pl || 0) + (monthlyOptionPL?.pl || 0) + (monthlyDailyPL?.pl || 0) + (monthlyDividends?.pl || 0)
      
      monthlyPL.push({
        month: monthNames[month - 1],
        pl: totalMonthlyPL
      })
    }
    
    // Generate portfolio value history - get actual available data based on timeframe
    const timeframe = c.req.query('timeframe') || '12months'
    let limit = 12
    let whereClause = 'WHERE user_id = ?'
    
    if (timeframe === 'ytd') {
      whereClause = `WHERE user_id = ? AND year = ${currentYear}`
      limit = 12
    } else if (timeframe === 'all') {
      limit = 999 // Get all available data
    }
    
    // Query to get USD and CAD totals separately for each month
    const { results: availableMonths } = await DB.prepare(`
      SELECT 
        year, 
        month,
        SUM(CASE WHEN currency = 'USD' THEN balance ELSE balance * exchange_rate_to_usd END) as total_usd,
        SUM(CASE WHEN currency = 'CAD' THEN balance ELSE balance * exchange_rate_to_cad END) as total_cad,
        MAX(exchange_rate_to_cad) as usd_to_cad,
        MAX(exchange_rate_to_usd) as cad_to_usd
      FROM account_balance_history
      ${whereClause}
      GROUP BY year, month
      ORDER BY year DESC, month DESC
      LIMIT ${limit}
    `).bind(userId).all() as any
    
    // Build portfolio value array from available data
    const portfolioValue = []
    
    if (availableMonths && availableMonths.length > 0) {
      // We have historical data - use it (reverse to show oldest to newest)
      for (let i = availableMonths.length - 1; i >= 0; i--) {
        const record = availableMonths[i]
        const usdToCad = record.usd_to_cad || 1.35
        
        portfolioValue.push({
          date: `${monthNames[record.month - 1]} ${record.year}`,
          valueUSD: record.total_usd || 0,
          valueCAD: record.total_cad || 0,
          exchangeRate: usdToCad
        })
      }
    } else {
      // No historical data - generate placeholder months with current value
      for (let i = 11; i >= 0; i--) {
        const date = new Date()
        date.setMonth(date.getMonth() - i)
        const year = date.getFullYear()
        const month = date.getMonth() + 1
        
        portfolioValue.push({
          date: `${monthNames[month - 1]} ${year}`,
          valueUSD: totalValueUSD,
          valueCAD: totalValueCAD,
          exchangeRate: usdToCad
        })
      }
    }
    
    return c.json({
      metrics: {
        totalValue,
        totalValueCAD,
        totalValueUSD,
        ytdPL,
        ytdPercentage,
        winRate,
        totalTrades,
        winningTrades,
        avgPL: combinedAvgPL || 0,
        bestTrade: Number.isFinite(combinedBestTrade) ? combinedBestTrade : 0
      },
      accounts: accountData,
      monthlyPL,
      portfolioValue
    })
    
  } catch (error: any) {
    console.error('Portfolio overview error:', error)
    console.error('Error stack:', error.stack)
    console.error('Error message:', error.message)
    return c.json({ error: 'Failed to generate portfolio overview', details: error.message }, 500)
  }
})

// ============================================================================
// P/L REPORTING ROUTES
// ============================================================================

routes.get('/api/reports/pl', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const year = c.req.query('year')
  const month = c.req.query('month')
  
  // Stock P/L = realized P/L of each SELL (partial and full), grouped by month and account type
  const stockSells = await loadRealizedSells(c.env.DB, userId)
  const stockGroups = new Map<string, { year: string, month: string, account_type: string | null, total: number }>()
  for (const s of stockSells) {
    const sellYear = s.sell_date.slice(0, 4)
    const sellMonth = s.sell_date.slice(5, 7)
    if (year && sellYear !== year) continue
    if (month && sellMonth !== month.padStart(2, '0')) continue
    const key = `${sellYear}-${sellMonth}|${s.account_type}`
    const group = stockGroups.get(key) || { year: sellYear, month: sellMonth, account_type: s.account_type, total: 0 }
    group.total += s.realized_pl
    stockGroups.set(key, group)
  }
  const stockPL = {
    results: [...stockGroups.values()].sort((a, b) =>
      `${a.year}-${a.month}`.localeCompare(`${b.year}-${b.month}`)
    )
  }

  // Get option trades P/L
  let optionQuery = `
    SELECT 
      strftime('%Y', trade_date) as year,
      strftime('%m', trade_date) as month,
      account_type,
      strategy_type,
      SUM(
        CASE
          WHEN strategy_type IN ('CREDIT_SPREAD', 'DEBIT_SPREAD')
            THEN (premium - COALESCE(premium_2, 0))
          WHEN strategy_type = 'IRON_CONDOR'
            THEN (premium - COALESCE(premium_2, 0) + COALESCE(premium_3, 0) - COALESCE(premium_4, 0))
          ELSE premium
        END * quantity * 100
      ) as total_premium,
      SUM(CASE WHEN profit_loss IS NOT NULL THEN profit_loss ELSE 0 END) as realized_pl
    FROM option_trades
    WHERE user_id = ?
  `
  
  const optionParams = [userId]
  
  if (year) {
    optionQuery += ` AND strftime('%Y', trade_date) = ?`
    optionParams.push(year)
  }
  
  if (month) {
    optionQuery += ` AND strftime('%m', trade_date) = ?`
    optionParams.push(month.padStart(2, '0'))
  }
  
  optionQuery += ` GROUP BY year, month, account_type, strategy_type`
  
  const optionPL = await c.env.DB.prepare(optionQuery).bind(...optionParams).all()
  
  return c.json({
    stocks: stockPL.results,
    options: optionPL.results
  })
})

// P/L Summary Report - detailed breakdown by asset type, account type, and time period
routes.get('/api/reports/pl-summary', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const period = c.req.query('period') || 'ytd' // mtd, qtd, ytd, 12months, all
    
    console.log(`P/L Summary request: userId=${userId}, period=${period}`)
    
    // Calculate date range based on period
    const now = new Date()
    let startDate = ''
    
    switch (period) {
      case 'mtd':
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        break
      case 'qtd':
        const quarter = Math.floor(now.getMonth() / 3)
        const quarterStartMonth = quarter * 3 + 1
        startDate = `${now.getFullYear()}-${String(quarterStartMonth).padStart(2, '0')}-01`
        break
      case 'ytd':
        startDate = `${now.getFullYear()}-01-01`
        break
      case '12months':
        const last12Months = new Date(now)
        last12Months.setMonth(last12Months.getMonth() - 12)
        startDate = last12Months.toISOString().split('T')[0]
        break
      case 'all':
        startDate = '1900-01-01'
        break
    }
    
    console.log(`Date range: startDate=${startDate}`)
    
    // Realized stock P/L: one row per SELL (partial and full), each with its own P/L
    console.log('Fetching realized stock sells...')
    const realizedSells = await loadRealizedSells(DB, userId, { from: startDate })
    const stockTrades = realizedSells.map(s => ({
      profit_loss: s.realized_pl,
      close_date: s.sell_date,
      account_type: s.account_type || 'Unknown',
      asset_type: 'Stocks'
    }))
    console.log(`Stock sells fetched and calculated: ${stockTrades.length}`)
    
    // Get option trades
    console.log('Fetching option trades...')
    const optionTrades = await DB.prepare(`
      SELECT 
        ot.profit_loss,
        ot.close_date,
        ot.account_type,
        'Options' as asset_type
      FROM option_trades ot
      WHERE ot.user_id = ?
        AND ot.is_open = 0
        AND ot.close_date IS NOT NULL
        AND ot.close_date >= ?
        AND ot.profit_loss IS NOT NULL
      ORDER BY ot.close_date DESC
    `).bind(userId, startDate).all()
    console.log(`Option trades fetched: ${optionTrades.results.length}`)
    
    // Get daily trades
    console.log('Fetching daily trades...')
    const dailyTrades = await DB.prepare(`
      SELECT 
        dt.profit_loss,
        dt.trade_date as close_date,
        COALESCE(a.account_type, 'Unknown') as account_type,
        'Daily Trades' as asset_type
      FROM daily_trades dt
      LEFT JOIN accounts a ON dt.account_id = a.id
      WHERE dt.user_id = ?
        AND dt.trade_date >= ?
        AND dt.profit_loss IS NOT NULL
      ORDER BY dt.trade_date DESC
    `).bind(userId, startDate).all()
    console.log(`Daily trades fetched: ${dailyTrades.results.length}`)
    
    // Get dividends
    console.log('Fetching dividends...')
    const dividends = await DB.prepare(`
      SELECT 
        cba.amount as profit_loss,
        cba.adjustment_date as close_date,
        COALESCE(a.account_type, 'Unknown') as account_type,
        'Dividends' as asset_type
      FROM cost_basis_adjustments cba
      INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
      INNER JOIN accounts a ON sh.account_id = a.id
      WHERE cba.user_id = ?
        AND cba.adjustment_type = 'DIVIDEND'
        AND cba.adjustment_date >= ?
      ORDER BY cba.adjustment_date DESC
    `).bind(userId, startDate).all()
    console.log(`Dividends fetched: ${dividends.results.length}`)
    
    // Combine all trades
    const allTrades = [
      ...stockTrades,
      ...optionTrades.results,
      ...dailyTrades.results,
      ...dividends.results
    ]
    
    // Calculate overall metrics
    const totalPL = allTrades.reduce((sum, t: any) => sum + (t.profit_loss || 0), 0)
    const totalTrades = allTrades.length
    const winningTrades = allTrades.filter((t: any) => t.profit_loss > 0).length
    const losingTrades = allTrades.filter((t: any) => t.profit_loss < 0).length
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0
    const avgTrade = totalTrades > 0 ? totalPL / totalTrades : 0
    const bestTrade = allTrades.length > 0 ? Math.max(...allTrades.map((t: any) => t.profit_loss || 0)) : 0
    const worstTrade = allTrades.length > 0 ? Math.min(...allTrades.map((t: any) => t.profit_loss || 0)) : 0
    
    // Group by asset type
    const byAssetType: any = {}
    allTrades.forEach((trade: any) => {
      const assetType = trade.asset_type
      if (!byAssetType[assetType]) {
        byAssetType[assetType] = {
          trades: [],
          totalPL: 0,
          totalTrades: 0,
          wins: 0,
          losses: 0
        }
      }
      byAssetType[assetType].trades.push(trade)
      byAssetType[assetType].totalPL += trade.profit_loss || 0
      byAssetType[assetType].totalTrades += 1
      if (trade.profit_loss > 0) byAssetType[assetType].wins += 1
      if (trade.profit_loss < 0) byAssetType[assetType].losses += 1
    })
    
    // Format asset type data
    const assetTypeData = Object.keys(byAssetType).map(type => ({
      name: type,
      pl: byAssetType[type].totalPL,
      trades: byAssetType[type].totalTrades,
      wins: byAssetType[type].wins,
      losses: byAssetType[type].losses,
      winRate: byAssetType[type].totalTrades > 0 
        ? (byAssetType[type].wins / byAssetType[type].totalTrades) * 100 
        : 0
    }))
    
    // Group by account type
    const byAccountType: any = {}
    allTrades.forEach((trade: any) => {
      const accountType = trade.account_type || 'Unknown'
      if (!byAccountType[accountType]) {
        byAccountType[accountType] = {
          trades: [],
          totalPL: 0,
          totalTrades: 0,
          wins: 0,
          losses: 0
        }
      }
      byAccountType[accountType].trades.push(trade)
      byAccountType[accountType].totalPL += trade.profit_loss || 0
      byAccountType[accountType].totalTrades += 1
      if (trade.profit_loss > 0) byAccountType[accountType].wins += 1
      if (trade.profit_loss < 0) byAccountType[accountType].losses += 1
    })
    
    // Format account type data
    const accountTypeData = Object.keys(byAccountType).map(type => ({
      name: type,
      pl: byAccountType[type].totalPL,
      trades: byAccountType[type].totalTrades,
      wins: byAccountType[type].wins,
      losses: byAccountType[type].losses,
      winRate: byAccountType[type].totalTrades > 0 
        ? (byAccountType[type].wins / byAccountType[type].totalTrades) * 100 
        : 0
    }))
    
    // Group by month for trend chart
    const byMonth: any = {}
    allTrades.forEach((trade: any) => {
      if (!trade.close_date) return
      const monthKey = trade.close_date.substring(0, 7) // YYYY-MM
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = 0
      }
      byMonth[monthKey] += trade.profit_loss || 0
    })
    
    // Format monthly data
    const monthlyData = Object.keys(byMonth)
      .sort()
      .map(month => ({
        month,
        pl: byMonth[month]
      }))
    
    console.log(`P/L Summary result: ${totalTrades} trades, $${totalPL.toFixed(2)} total P/L`)
    console.log(`Asset types: ${assetTypeData.length}, Account types: ${accountTypeData.length}, Months: ${monthlyData.length}`)
    
    return c.json({
      summary: {
        totalPL,
        totalTrades,
        winningTrades,
        losingTrades,
        winRate,
        avgTrade,
        bestTrade,
        worstTrade
      },
      byAssetType: assetTypeData,
      byAccountType: accountTypeData,
      monthlyTrend: monthlyData
    })
  } catch (error) {
    console.error('P/L Summary error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error: error
    })
    return c.json({ 
      error: 'Failed to generate P/L summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})
// Strategy Analysis Report - comprehensive strategy performance comparison
routes.get('/api/reports/strategy-analysis', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const period = c.req.query('period') || 'ytd'
    
    console.log(`Strategy Analysis request: userId=${userId}, period=${period}`)
    
    // Calculate date range
    const now = new Date()
    let startDate = ''
    
    switch (period) {
      case 'ytd':
        startDate = `${now.getFullYear()}-01-01`
        break
      case '12months':
        const last12Months = new Date(now)
        last12Months.setMonth(last12Months.getMonth() - 12)
        startDate = last12Months.toISOString().split('T')[0]
        break
      case 'all':
        startDate = '1900-01-01'
        break
    }
    
    // Get all closed trades with strategy information
    const optionTrades = await DB.prepare(`
      SELECT 
        ot.profit_loss,
        ot.close_date,
        ot.strategy_type,
        ot.commission,
        ot.close_commission
      FROM option_trades ot
      WHERE ot.user_id = ?
        AND ot.is_open = 0
        AND ot.close_date IS NOT NULL
        AND ot.close_date >= ?
        AND ot.profit_loss IS NOT NULL
      ORDER BY ot.close_date ASC
    `).bind(userId, startDate).all()
    
    const dailyTrades = await DB.prepare(`
      SELECT 
        dt.profit_loss,
        dt.trade_date as close_date,
        dt.strategy_type,
        dt.commission
      FROM daily_trades dt
      WHERE dt.user_id = ?
        AND dt.trade_date >= ?
        AND dt.profit_loss IS NOT NULL
      ORDER BY dt.trade_date ASC
    `).bind(userId, startDate).all()
    
    // Combine all trades
    const allTrades = [
      ...optionTrades.results.map((t: any) => ({
        ...t,
        asset_type: 'Options'
      })),
      ...dailyTrades.results.map((t: any) => ({
        ...t,
        asset_type: 'Daily Trades'
      }))
    ]
    
    console.log(`Total trades for analysis: ${allTrades.length}`)
    
    // Group by strategy
    const byStrategy: any = {}
    allTrades.forEach((trade: any) => {
      const strategy = trade.strategy_type || 'Other'
      if (!byStrategy[strategy]) {
        byStrategy[strategy] = {
          trades: [],
          pnl: []
        }
      }
      byStrategy[strategy].trades.push(trade)
      byStrategy[strategy].pnl.push(trade.profit_loss || 0)
    })
    
    // Calculate statistics for each strategy
    const strategyData = Object.keys(byStrategy).map(strategy => {
      const trades = byStrategy[strategy].trades
      const pnl = byStrategy[strategy].pnl
      
      const totalPL = pnl.reduce((sum: number, val: number) => sum + val, 0)
      const wins = pnl.filter((val: number) => val > 0).length
      const losses = pnl.filter((val: number) => val < 0).length
      const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0
      const avgPL = trades.length > 0 ? totalPL / trades.length : 0
      const bestTrade = trades.length > 0 ? Math.max(...pnl) : 0
      const worstTrade = trades.length > 0 ? Math.min(...pnl) : 0
      
      // Calculate Sharpe Ratio (simplified)
      const mean = avgPL
      const variance = pnl.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / (pnl.length || 1)
      const stdDev = Math.sqrt(variance)
      const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0 // Annualized
      
      return {
        strategy,
        trades: trades.length,
        totalPL,
        avgPL,
        wins,
        losses,
        winRate,
        bestTrade,
        worstTrade,
        sharpe
      }
    })
    
    // Calculate overall portfolio metrics
    const allPnl = allTrades.map((t: any) => t.profit_loss || 0)
    const totalPL = allPnl.reduce((sum: number, val: number) => sum + val, 0)
    const totalTrades = allTrades.length
    const wins = allPnl.filter((val: number) => val > 0).length
    const losses = allPnl.filter((val: number) => val < 0).length
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0
    
    // Calculate cumulative returns for drawdown
    let cumPL = 0
    let peak = 0
    let maxDrawdown = 0
    const cumulativeReturns = allTrades.map((trade: any) => {
      cumPL += trade.profit_loss || 0
      if (cumPL > peak) peak = cumPL
      const drawdown = peak > 0 ? ((peak - cumPL) / peak) * 100 : 0
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
      return { date: trade.close_date, cumPL, peak, drawdown }
    })
    
    // Calculate Sharpe Ratio for overall portfolio
    const mean = totalTrades > 0 ? totalPL / totalTrades : 0
    const variance = allPnl.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / (totalTrades || 1)
    const stdDev = Math.sqrt(variance)
    const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0
    
    // Group by month for heatmap
    const byMonth: any = {}
    allTrades.forEach((trade: any) => {
      if (!trade.close_date) return
      const monthKey = trade.close_date.substring(0, 7) // YYYY-MM
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = 0
      }
      byMonth[monthKey] += trade.profit_loss || 0
    })
    
    const monthlyData = Object.keys(byMonth)
      .sort()
      .map(month => ({
        month,
        pl: byMonth[month]
      }))
    
    // Calculate total return percentage (simplified - would need starting capital)
    // Using arbitrary $100k starting capital for demonstration
    const startingCapital = 100000
    const totalReturn = (totalPL / startingCapital) * 100
    
    console.log(`Strategy Analysis complete: ${strategyData.length} strategies, ${totalTrades} trades`)
    
    return c.json({
      overall: {
        totalPL,
        totalReturn,
        totalTrades,
        wins,
        losses,
        winRate,
        sharpe,
        maxDrawdown
      },
      strategies: strategyData,
      monthlyData,
      cumulativeReturns: cumulativeReturns.slice(-100) // Last 100 data points
    })
  } catch (error) {
    console.error('Strategy Analysis error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return c.json({ 
      error: 'Failed to generate strategy analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Performance Analysis endpoint - Portfolio growth, rolling returns, drawdown
routes.get('/api/reports/performance', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const period = c.req.query('period') || 'ytd'
    
    console.log(`Performance Analysis request: userId=${userId}, period=${period}`)
    
    // Calculate date range
    const now = new Date()
    let startDate = ''
    
    switch (period) {
      case 'ytd':
        startDate = `${now.getFullYear()}-01-01`
        break
      case '1year':
        const oneYearAgo = new Date(now)
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
        startDate = oneYearAgo.toISOString().split('T')[0]
        break
      case '3years':
        const threeYearsAgo = new Date(now)
        threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)
        startDate = threeYearsAgo.toISOString().split('T')[0]
        break
      case 'all':
        startDate = '1900-01-01'
        break
    }
    
    // Get account balance history for portfolio value over time
    const balanceHistory = await DB.prepare(`
      SELECT 
        month,
        year,
        SUM(balance_cad + (balance_usd * 1.4)) as total_value
      FROM account_balances
      WHERE user_id = ?
      GROUP BY year, month
      ORDER BY year ASC, month ASC
    `).bind(userId).all()
    
    // Get all closed trades for P/L calculations
    // Realized stock P/L per SELL (partial sells included) instead of the legacy stock_trades table
    const stockSells = await loadRealizedSells(DB, userId, { from: startDate })
    const stockTrades = {
      results: stockSells.map(s => ({
        profit_loss: s.realized_pl,
        close_date: s.sell_date,
        trade_date: s.opened_date || s.sell_date
      }))
    }

    const optionTrades = await DB.prepare(`
      SELECT 
        ot.profit_loss,
        ot.close_date,
        ot.trade_date
      FROM option_trades ot
      WHERE ot.user_id = ?
        AND ot.is_open = 0
        AND ot.close_date IS NOT NULL
        AND ot.close_date >= ?
        AND ot.profit_loss IS NOT NULL
      ORDER BY ot.close_date ASC
    `).bind(userId, startDate).all()
    
    const dailyTrades = await DB.prepare(`
      SELECT 
        dt.profit_loss,
        dt.trade_date as close_date,
        dt.trade_date
      FROM daily_trades dt
      WHERE dt.user_id = ?
        AND dt.trade_date >= ?
        AND dt.profit_loss IS NOT NULL
      ORDER BY dt.trade_date ASC
    `).bind(userId, startDate).all()
    
    const dividends = await DB.prepare(`
      SELECT 
        cba.amount as profit_loss,
        cba.adjustment_date as close_date,
        cba.adjustment_date as trade_date
      FROM cost_basis_adjustments cba
      WHERE cba.user_id = ?
        AND cba.adjustment_type = 'DIVIDEND'
        AND cba.adjustment_date >= ?
      ORDER BY cba.adjustment_date ASC
    `).bind(userId, startDate).all()
    
    // Combine all trades
    const allTrades = [
      ...stockTrades.results,
      ...optionTrades.results,
      ...dailyTrades.results,
      ...dividends.results
    ].sort((a: any, b: any) => {
      const dateA = a.close_date || a.trade_date
      const dateB = b.close_date || b.trade_date
      return dateA.localeCompare(dateB)
    })
    
    console.log(`Total trades for performance: ${allTrades.length}`)
    
    // Calculate cumulative P/L over time for portfolio growth
    let cumulativePL = 0
    let peak = 0
    const portfolioGrowth: any[] = []
    const drawdownData: any[] = []
    
    allTrades.forEach((trade: any) => {
      cumulativePL += trade.profit_loss || 0
      if (cumulativePL > peak) peak = cumulativePL
      
      const drawdownPercent = peak > 0 ? ((peak - cumulativePL) / peak) * 100 : 0
      
      portfolioGrowth.push({
        date: trade.close_date || trade.trade_date,
        value: cumulativePL,
        peak: peak
      })
      
      drawdownData.push({
        date: trade.close_date || trade.trade_date,
        drawdown: -drawdownPercent // Negative for chart display
      })
    })
    
    // Calculate rolling returns (30-day, 90-day, 1-year)
    const rollingReturns: any = {
      daily: [],
      monthly: [],
      quarterly: []
    }
    
    // Group trades by date for daily returns
    const tradesByDate: any = {}
    allTrades.forEach((trade: any) => {
      const date = trade.close_date || trade.trade_date
      if (!tradesByDate[date]) {
        tradesByDate[date] = []
      }
      tradesByDate[date].push(trade.profit_loss || 0)
    })
    
    // Calculate daily returns
    const dates = Object.keys(tradesByDate).sort()
    let runningBalance = 100000 // Starting capital assumption
    
    dates.forEach(date => {
      const dayPL = tradesByDate[date].reduce((sum: number, pl: number) => sum + pl, 0)
      const prevBalance = runningBalance
      runningBalance += dayPL
      const dailyReturn = prevBalance > 0 ? (dayPL / prevBalance) * 100 : 0
      
      rollingReturns.daily.push({
        date,
        return: dailyReturn,
        pl: dayPL
      })
    })
    
    // Calculate 30-day rolling returns
    const rolling30 = []
    for (let i = 29; i < dates.length; i++) {
      const window = dates.slice(i - 29, i + 1)
      const windowPL = window.reduce((sum, d) => {
        return sum + tradesByDate[d].reduce((s: number, pl: number) => s + pl, 0)
      }, 0)
      rolling30.push({
        date: dates[i],
        return: (windowPL / 100000) * 100 // Percentage
      })
    }
    
    // Calculate monthly aggregates
    const byMonth: any = {}
    allTrades.forEach((trade: any) => {
      const date = trade.close_date || trade.trade_date
      const month = date.substring(0, 7) // YYYY-MM
      if (!byMonth[month]) {
        byMonth[month] = { pl: 0, trades: 0 }
      }
      byMonth[month].pl += trade.profit_loss || 0
      byMonth[month].trades++
    })
    
    Object.keys(byMonth).sort().forEach((month, idx) => {
      const startingBalance = 100000 + (idx > 0 ? Object.keys(byMonth).slice(0, idx).reduce((sum, m) => sum + byMonth[m].pl, 0) : 0)
      const monthReturn = startingBalance > 0 ? (byMonth[month].pl / startingBalance) * 100 : 0
      
      rollingReturns.monthly.push({
        month,
        return: monthReturn,
        pl: byMonth[month].pl,
        trades: byMonth[month].trades
      })
    })
    
    // Calculate max drawdown stats
    const maxDrawdown = drawdownData.length > 0 
      ? Math.min(...drawdownData.map((d: any) => d.drawdown))
      : 0
    
    const maxDrawdownDate = drawdownData.length > 0
      ? drawdownData.find((d: any) => d.drawdown === maxDrawdown)?.date
      : null
    
    // Calculate recovery stats
    let inDrawdown = false
    let drawdownStart = null
    let drawdownEnd = null
    let longestDrawdown = 0
    let currentDrawdownDays = 0
    
    drawdownData.forEach((point: any, idx: number) => {
      if (point.drawdown < -0.1 && !inDrawdown) {
        inDrawdown = true
        drawdownStart = point.date
        currentDrawdownDays = 0
      } else if (point.drawdown >= -0.1 && inDrawdown) {
        inDrawdown = false
        drawdownEnd = point.date
        if (currentDrawdownDays > longestDrawdown) {
          longestDrawdown = currentDrawdownDays
        }
        currentDrawdownDays = 0
      }
      
      if (inDrawdown) {
        currentDrawdownDays++
      }
    })
    
    // Summary statistics
    const totalPL = cumulativePL
    const totalReturn = (totalPL / 100000) * 100
    const totalTrades = allTrades.length
    const avgTradeReturn = totalTrades > 0 ? (totalPL / totalTrades / 100000) * 100 : 0
    
    // Volatility (standard deviation of returns)
    const returns = rollingReturns.daily.map((d: any) => d.return)
    const avgReturn = returns.length > 0 ? returns.reduce((sum: number, r: number) => sum + r, 0) / returns.length : 0
    const variance = returns.length > 0 
      ? returns.reduce((sum: number, r: number) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      : 0
    const volatility = Math.sqrt(variance) * Math.sqrt(252) // Annualized
    
    // Sharpe ratio
    const sharpeRatio = volatility > 0 ? (avgReturn * 252) / volatility : 0
    
    console.log(`Performance analysis complete: ${portfolioGrowth.length} data points, max DD: ${maxDrawdown.toFixed(2)}%`)
    
    return c.json({
      summary: {
        totalPL,
        totalReturn,
        totalTrades,
        avgTradeReturn,
        maxDrawdown: -maxDrawdown, // Convert back to positive
        maxDrawdownDate,
        longestDrawdown,
        volatility,
        sharpeRatio
      },
      portfolioGrowth: portfolioGrowth.slice(-365), // Last 365 days max
      drawdownData: drawdownData.slice(-365),
      rollingReturns: {
        rolling30: rolling30.slice(-180), // Last 180 days
        monthly: rollingReturns.monthly
      },
      balanceHistory: balanceHistory.results
    })
  } catch (error) {
    console.error('Performance Analysis error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return c.json({ 
      error: 'Failed to generate performance analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Position Analysis endpoint - Top holdings, sector allocation, concentration
routes.get('/api/reports/positions', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    
    console.log(`Position Analysis request: userId=${userId}`)
    
    // Get all open stock positions with company details from stock_holdings
    const stockPositions = await DB.prepare(`
      SELECT 
        sh.ticker,
        a.account_type,
        sh.total_shares as quantity,
        sh.average_price as avg_price,
        sh.opened_date as trade_date,
        c.company_name,
        c.sector,
        c.industry,
        c.market_cap,
        (sh.total_shares * sh.average_price) as position_value
      FROM stock_holdings sh
      JOIN accounts a ON sh.account_id = a.id
      LEFT JOIN companies c ON sh.company_id = c.id
      WHERE sh.user_id = ?
        AND sh.is_open = 1
      ORDER BY (sh.total_shares * sh.average_price) DESC
    `).bind(userId).all()
    
    console.log(`Found ${stockPositions.results.length} open stock positions`)
    
    // Get current account balances for total portfolio value
    const accounts = await DB.prepare(`
      SELECT 
        account_type,
        balance_cad,
        balance_usd,
        cash_balance_usd
      FROM account_balances
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(userId).all()
    
    // Get latest balance per account type
    const accountMap = new Map()
    accounts.results.forEach((acc: any) => {
      if (!accountMap.has(acc.account_type)) {
        accountMap.set(acc.account_type, acc)
      }
    })
    
    // Calculate total portfolio value using this month's cached USD/CAD rate (same lookup as the dashboard)
    const fxNow = new Date()
    const exchangeRate = (await getRates(DB, fxNow.getMonth() + 1, fxNow.getFullYear())).usd_to_cad
    let totalPortfolioValue = 0
    accountMap.forEach((acc: any) => {
      totalPortfolioValue += (acc.balance_cad || 0) + ((acc.balance_usd || 0) * exchangeRate)
    })
    
    // If no account balances, use sum of position values
    if (totalPortfolioValue === 0) {
      totalPortfolioValue = stockPositions.results.reduce((sum: number, pos: any) => sum + (pos.position_value || 0), 0)
    }
    
    console.log(`Total portfolio value: $${totalPortfolioValue.toFixed(2)}`)
    
    // Calculate position metrics with cost basis adjustments
    const positions = await Promise.all(stockPositions.results.map(async (pos: any) => {
      const value = pos.position_value || 0
      const weight = totalPortfolioValue > 0 ? (value / totalPortfolioValue) * 100 : 0
      
      // Get cost basis adjustments for this position (by ticker and account)
      // Note: We need to get the holding_id first
      const holding = await DB.prepare(`
        SELECT id FROM stock_holdings
        WHERE user_id = ? AND ticker = ? AND account_id = (
          SELECT id FROM accounts WHERE user_id = ? AND account_type = ?
        ) AND is_open = 1
      `).bind(userId, pos.ticker, userId, pos.account_type).first()
      
      let totalAdjustments = 0
      let realizedOnSold = 0
      if (holding) {
        const adjustments = await DB.prepare(`
          SELECT COALESCE(SUM(amount), 0) as total
          FROM cost_basis_adjustments
          WHERE holding_id = ? AND adjustment_type IN ('DIVIDEND', 'COVERED_CALL', 'SELLING_PUT')
        `).bind(holding.id).first()
        totalAdjustments = adjustments?.total || 0
        // Result of shares already sold: a loss raises the cost basis of the shares left, a gain lowers it (lib/cost-basis.ts)
        realizedOnSold = sumRealized(await loadRealizedSells(DB, userId, { holdingId: Number(holding.id) }))
      }
      
      const costBasisPerShareValue = pos.quantity > 0 ? costBasisPerShare(pos.avg_price, pos.quantity, totalAdjustments, realizedOnSold) : 0
      
      return {
        ticker: pos.ticker,
        companyName: pos.company_name || pos.ticker,
        quantity: pos.quantity,
        avgPrice: pos.avg_price,
        costBasis: costBasisPerShareValue,
        value: value,
        weight: weight,
        sector: pos.sector || 'Unknown',
        industry: pos.industry || 'Unknown',
        accountType: pos.account_type,
        tradeDate: pos.trade_date,
        adjustments: totalAdjustments
      }
    }))
    
    // Top holdings (top 10 by value)
    const topHoldings = positions.slice(0, 10)
    
    // Calculate sector allocation
    const sectorMap = new Map()
    positions.forEach(pos => {
      const sector = pos.sector || 'Unknown'
      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, { value: 0, count: 0 })
      }
      const current = sectorMap.get(sector)
      sectorMap.set(sector, {
        value: current.value + pos.value,
        count: current.count + 1
      })
    })
    
    const sectorAllocation = Array.from(sectorMap.entries()).map(([sector, data]: [string, any]) => ({
      sector,
      value: data.value,
      weight: totalPortfolioValue > 0 ? (data.value / totalPortfolioValue) * 100 : 0,
      positions: data.count
    })).sort((a, b) => b.value - a.value)
    
    // Calculate industry allocation (top 10)
    const industryMap = new Map()
    positions.forEach(pos => {
      const industry = pos.industry || 'Unknown'
      if (!industryMap.has(industry)) {
        industryMap.set(industry, { value: 0, count: 0 })
      }
      const current = industryMap.get(industry)
      industryMap.set(industry, {
        value: current.value + pos.value,
        count: current.count + 1
      })
    })
    
    const industryAllocation = Array.from(industryMap.entries()).map(([industry, data]: [string, any]) => ({
      industry,
      value: data.value,
      weight: totalPortfolioValue > 0 ? (data.value / totalPortfolioValue) * 100 : 0,
      positions: data.count
    })).sort((a, b) => b.value - a.value).slice(0, 10)
    
    // Get all accounts to ensure comprehensive allocation
    const allAccounts = await DB.prepare(`
      SELECT DISTINCT account_type
      FROM accounts
      WHERE user_id = ?
      ORDER BY account_type
    `).bind(userId).all()
    
    // Calculate account allocation - include ALL accounts
    const accountAllocationMap = new Map()
    
    // Initialize all accounts with 0 values
    allAccounts.results.forEach((acc: any) => {
      accountAllocationMap.set(acc.account_type, { value: 0, count: 0 })
    })
    
    // Add actual position values
    positions.forEach(pos => {
      const accountType = pos.accountType || 'Unknown'
      if (!accountAllocationMap.has(accountType)) {
        accountAllocationMap.set(accountType, { value: 0, count: 0 })
      }
      const current = accountAllocationMap.get(accountType)
      accountAllocationMap.set(accountType, {
        value: current.value + pos.value,
        count: current.count + 1
      })
    })
    
    const accountAllocation = Array.from(accountAllocationMap.entries()).map(([account, data]: [string, any]) => ({
      accountType: account,
      value: data.value,
      weight: totalPortfolioValue > 0 ? (data.value / totalPortfolioValue) * 100 : 0,
      positions: data.count
    })).sort((a, b) => b.value - a.value)
    
    // Calculate concentration metrics
    const top5Value = positions.slice(0, 5).reduce((sum, pos) => sum + pos.value, 0)
    const top10Value = positions.slice(0, 10).reduce((sum, pos) => sum + pos.value, 0)
    const top5Concentration = totalPortfolioValue > 0 ? (top5Value / totalPortfolioValue) * 100 : 0
    const top10Concentration = totalPortfolioValue > 0 ? (top10Value / totalPortfolioValue) * 100 : 0
    
    // Herfindahl-Hirschman Index (HHI) - measure of concentration
    // 0-1500: low concentration, 1500-2500: moderate, >2500: high concentration
    const hhi = positions.reduce((sum, pos) => sum + Math.pow(pos.weight, 2), 0)
    
    // Calculate diversification score (inverse of concentration)
    const diversificationScore = positions.length > 0 ? Math.min(100, (positions.length / 20) * 100) : 0
    
    // Risk metrics
    const largestPosition = positions.length > 0 ? positions[0].weight : 0
    const avgPositionSize = positions.length > 0 
      ? positions.reduce((sum, pos) => sum + pos.weight, 0) / positions.length 
      : 0
    
    console.log(`Position analysis complete: ${positions.length} positions, top 5 concentration: ${top5Concentration.toFixed(2)}%`)
    
    return c.json({
      summary: {
        totalPositions: positions.length,
        totalValue: totalPortfolioValue,
        top5Concentration,
        top10Concentration,
        hhi,
        diversificationScore,
        largestPosition,
        avgPositionSize
      },
      topHoldings,
      sectorAllocation,
      industryAllocation,
      accountAllocation,
      allPositions: positions
    })
  } catch (error) {
    console.error('Position Analysis error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return c.json({ 
      error: 'Failed to generate position analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Export to CSV endpoint
routes.get('/api/reports/export', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const type = c.req.query('type') || 'stocks'
  const year = c.req.query('year')
  
  let query = ''
  let params = [userId]
  
  if (type === 'stocks') {
    // Export stock holdings with all transactions
    query = `
      SELECT 
        sh.id,
        sh.ticker,
        a.account_type,
        a.account_name,
        sh.total_shares,
        sh.average_price,
        sh.is_open,
        sh.opened_date,
        sh.closed_date,
        sh.notes,
        c.company_name
      FROM stock_holdings sh
      JOIN accounts a ON sh.account_id = a.id
      LEFT JOIN companies c ON sh.company_id = c.id
      WHERE sh.user_id = ?`
    if (year) {
      query += ` AND (strftime('%Y', sh.opened_date) = ? OR strftime('%Y', sh.closed_date) = ?)`
      params.push(year)
      params.push(year)
    }
    query += ` ORDER BY sh.opened_date DESC`
  } else if (type === 'options') {
    query = `SELECT * FROM option_trades WHERE user_id = ?`
    if (year) {
      query += ` AND strftime('%Y', trade_date) = ?`
      params.push(year)
    }
    query += ` ORDER BY trade_date DESC`
  }
  
  const data = await c.env.DB.prepare(query).bind(...params).all()
  
  if (data.results.length === 0) {
    return c.text('No data to export', 404)
  }
  
  // Generate CSV
  const headers = Object.keys(data.results[0])
  let csv = headers.join(',') + '\n'
  
  data.results.forEach((row: any) => {
    const values = headers.map(header => {
      const value = row[header]
      return value !== null && value !== undefined ? `"${value}"` : ''
    })
    csv += values.join(',') + '\n'
  })
  
  return c.text(csv, 200, {
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="${type}_${year || 'all'}.csv"`
  })
})

// Dividends Report - detailed breakdown by account and stock
routes.get('/api/reports/dividends', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const groupBy = c.req.query('groupBy') || 'account' // 'account' or 'stock'
    const period = c.req.query('period') || 'ytd' // 'mtd', 'ytd', 'all'
    
    console.log(`Dividends report request: userId=${userId}, groupBy=${groupBy}, period=${period}`)
    
    // Calculate date range
    const now = new Date()
    let startDate = ''
    
    switch (period) {
      case 'mtd':
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        break
      case 'ytd':
        startDate = `${now.getFullYear()}-01-01`
        break
      case 'all':
        startDate = '1900-01-01'
        break
    }
    
    console.log(`Date range: startDate=${startDate}`)
    
    if (groupBy === 'account') {
      // Group dividends by account
      const dividends = await DB.prepare(`
        SELECT 
          a.account_name,
          a.account_type,
          a.id as account_id,
          COUNT(*) as dividend_count,
          SUM(cba.amount) as total_dividends
        FROM cost_basis_adjustments cba
        INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
        INNER JOIN accounts a ON sh.account_id = a.id
        WHERE cba.user_id = ?
          AND cba.adjustment_type = 'DIVIDEND'
          AND cba.adjustment_date >= ?
        GROUP BY a.id, a.account_name, a.account_type
        ORDER BY total_dividends DESC
      `).bind(userId, startDate).all()
      
      console.log(`Dividends by account fetched: ${dividends.results.length} accounts`)
      
      return c.json({
        groupBy: 'account',
        period,
        data: dividends.results,
        total: dividends.results.reduce((sum: number, d: any) => sum + (d.total_dividends || 0), 0)
      })
    } else {
      // Group dividends by stock
      const dividends = await DB.prepare(`
        SELECT 
          sh.ticker,
          c.company_name,
          sh.id as holding_id,
          COUNT(*) as dividend_count,
          SUM(cba.amount) as total_dividends,
          MIN(cba.adjustment_date) as first_dividend_date,
          MAX(cba.adjustment_date) as last_dividend_date
        FROM cost_basis_adjustments cba
        INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
        LEFT JOIN companies c ON sh.company_id = c.id
        WHERE cba.user_id = ?
          AND cba.adjustment_type = 'DIVIDEND'
          AND cba.adjustment_date >= ?
        GROUP BY sh.id, sh.ticker, c.company_name
        ORDER BY total_dividends DESC
      `).bind(userId, startDate).all()
      
      console.log(`Dividends by stock fetched: ${dividends.results.length} stocks`)
      
      return c.json({
        groupBy: 'stock',
        period,
        data: dividends.results,
        total: dividends.results.reduce((sum: number, d: any) => sum + (d.total_dividends || 0), 0)
      })
    }
  } catch (error) {
    console.error('Error generating dividends report:', error)
    return c.json({
      error: 'Failed to generate dividends report',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Monthly Income Report
routes.get('/api/reports/monthly-income', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const year = c.req.query('year') || new Date().getFullYear().toString()
    const month = c.req.query('month') || (new Date().getMonth() + 1).toString()
    const accountId = c.req.query('account_id') // Optional account filter
    
    // Calculate date range for the month
    const startDate = `${year}-${month.padStart(2, '0')}-01`
    const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1
    const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year)
    const endDate = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`
    
    // Stock Investments Income
    // Dividend ETFs
    const dividendETFsClosedPL = await DB.prepare(`
      SELECT sh.ticker, SUM(st.shares * (st.price_per_share - sh.average_price)) as profit_loss
      FROM stock_transactions st
      INNER JOIN stock_holdings sh ON st.holding_id = sh.id
      WHERE st.user_id = ? AND sh.strategy_type = 'DIVIDEND_ETFS'
        ${accountId ? 'AND sh.account_id = ?' : ''}
        AND st.transaction_type = 'SELL'
        AND st.transaction_date >= ? AND st.transaction_date < ?
      GROUP BY sh.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    const dividendETFsCoveredCalls = await DB.prepare(`
      SELECT ot.ticker, SUM(ot.profit_loss) as amount
      FROM option_trades ot
      INNER JOIN stock_holdings sh ON ot.ticker = sh.ticker AND ot.account_id = sh.account_id
      WHERE ot.user_id = ? AND ot.strategy_type = 'COVERED_CALL'
        AND sh.strategy_type = 'DIVIDEND_ETFS'
        ${accountId ? 'AND ot.account_id = ?' : ''}
        AND ot.is_open = 0 AND ot.close_date >= ? AND ot.close_date < ?
      GROUP BY ot.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    const dividendETFsDividends = await DB.prepare(`
      SELECT sh.ticker, SUM(cba.amount) as amount
      FROM cost_basis_adjustments cba
      INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
      WHERE cba.user_id = ? AND cba.adjustment_type = 'DIVIDEND'
        AND sh.strategy_type = 'DIVIDEND_ETFS'
        ${accountId ? 'AND sh.account_id = ?' : ''}
        AND cba.adjustment_date >= ? AND cba.adjustment_date < ?
      GROUP BY sh.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    // Stockpiling
    const stockpilingClosedPL = await DB.prepare(`
      SELECT sh.ticker, SUM(st.shares * (st.price_per_share - sh.average_price)) as profit_loss
      FROM stock_transactions st
      INNER JOIN stock_holdings sh ON st.holding_id = sh.id
      WHERE st.user_id = ? AND sh.strategy_type = 'STOCKPILING'
        ${accountId ? 'AND sh.account_id = ?' : ''}
        AND st.transaction_type = 'SELL'
        AND st.transaction_date >= ? AND st.transaction_date < ?
      GROUP BY sh.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    const stockpilingCoveredCalls = await DB.prepare(`
      SELECT ot.ticker, SUM(ot.profit_loss) as amount
      FROM option_trades ot
      INNER JOIN stock_holdings sh ON ot.ticker = sh.ticker AND ot.account_id = sh.account_id
      WHERE ot.user_id = ? AND ot.strategy_type = 'COVERED_CALL'
        AND sh.strategy_type = 'STOCKPILING'
        ${accountId ? 'AND ot.account_id = ?' : ''}
        AND ot.is_open = 0 AND ot.close_date >= ? AND ot.close_date < ?
      GROUP BY ot.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    const stockpilingDividends = await DB.prepare(`
      SELECT sh.ticker, SUM(cba.amount) as amount
      FROM cost_basis_adjustments cba
      INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
      WHERE cba.user_id = ? AND cba.adjustment_type = 'DIVIDEND'
        AND sh.strategy_type = 'STOCKPILING'
        ${accountId ? 'AND sh.account_id = ?' : ''}
        AND cba.adjustment_date >= ? AND cba.adjustment_date < ?
      GROUP BY sh.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    // Wheel Stock
    const wheelClosedPL = await DB.prepare(`
      SELECT sh.ticker, SUM(st.shares * (st.price_per_share - sh.average_price)) as profit_loss
      FROM stock_transactions st
      INNER JOIN stock_holdings sh ON st.holding_id = sh.id
      WHERE st.user_id = ? AND sh.strategy_type = 'WHEEL'
        ${accountId ? 'AND sh.account_id = ?' : ''}
        AND st.transaction_type = 'SELL'
        AND st.transaction_date >= ? AND st.transaction_date < ?
      GROUP BY sh.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    const wheelCoveredCalls = await DB.prepare(`
      SELECT ot.ticker, SUM(ot.profit_loss) as amount
      FROM option_trades ot
      INNER JOIN stock_holdings sh ON ot.ticker = sh.ticker AND ot.account_id = sh.account_id
      WHERE ot.user_id = ? AND ot.strategy_type = 'COVERED_CALL'
        AND sh.strategy_type = 'WHEEL'
        ${accountId ? 'AND ot.account_id = ?' : ''}
        AND ot.is_open = 0 AND ot.close_date >= ? AND ot.close_date < ?
      GROUP BY ot.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    const wheelDividends = await DB.prepare(`
      SELECT sh.ticker, SUM(cba.amount) as amount
      FROM cost_basis_adjustments cba
      INNER JOIN stock_holdings sh ON cba.holding_id = sh.id
      WHERE cba.user_id = ? AND cba.adjustment_type = 'DIVIDEND'
        AND sh.strategy_type = 'WHEEL'
        ${accountId ? 'AND sh.account_id = ?' : ''}
        AND cba.adjustment_date >= ? AND cba.adjustment_date < ?
      GROUP BY sh.ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    // Option Trades Income
    // Short Puts (Wheel)
    const shortPutsWheel = await DB.prepare(`
      SELECT ticker, SUM(profit_loss) as profit_loss
      FROM option_trades
      WHERE user_id = ? AND strategy_type = 'SELLING_PUT_WHEEL'
        ${accountId ? 'AND account_id = ?' : ''}
        AND is_open = 0 AND close_date >= ? AND close_date < ?
      GROUP BY ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    // Short Puts (Stockpiling)
    const shortPutsStockpiling = await DB.prepare(`
      SELECT ticker, SUM(profit_loss) as profit_loss
      FROM option_trades
      WHERE user_id = ? AND strategy_type = 'SELLING_PUT'
        ${accountId ? 'AND account_id = ?' : ''}
        AND is_open = 0 AND close_date >= ? AND close_date < ?
      GROUP BY ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    // Short Puts (Long Term)
    const shortPutsLongTerm = await DB.prepare(`
      SELECT ticker, SUM(profit_loss) as profit_loss
      FROM option_trades
      WHERE user_id = ? AND strategy_type = 'SELLING_PUT_LONG_TERM'
        ${accountId ? 'AND account_id = ?' : ''}
        AND is_open = 0 AND close_date >= ? AND close_date < ?
      GROUP BY ticker
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).all()
    
    // 0 DTE SPX Trades
    const dteTrades = await DB.prepare(`
      SELECT SUM(profit_loss) as profit_loss, COUNT(*) as trade_count
      FROM daily_trades
      WHERE user_id = ? AND is_open = 0
        ${accountId ? 'AND account_id = ?' : ''}
        AND trade_date >= ? AND trade_date < ?
    `).bind(userId, ...(accountId ? [parseInt(accountId)] : []), startDate, endDate).first() as any
    
    return c.json({
      year: parseInt(year),
      month: parseInt(month),
      startDate,
      endDate,
      stockInvestments: {
        dividendETFs: {
          closedPL: { results: dividendETFsClosedPL.results || [] },
          coveredCalls: { results: dividendETFsCoveredCalls.results || [] },
          dividends: { results: dividendETFsDividends.results || [] }
        },
        stockpiling: {
          closedPL: { results: stockpilingClosedPL.results || [] },
          coveredCalls: { results: stockpilingCoveredCalls.results || [] },
          dividends: { results: stockpilingDividends.results || [] }
        },
        wheel: {
          closedPL: { results: wheelClosedPL.results || [] },
          coveredCalls: { results: wheelCoveredCalls.results || [] },
          dividends: { results: wheelDividends.results || [] }
        }
      },
      optionTrades: {
        shortPutsWheel: { results: shortPutsWheel.results || [] },
        shortPutsStockpiling: { results: shortPutsStockpiling.results || [] },
        shortPutsLongTerm: { results: shortPutsLongTerm.results || [] },
        dteTrades: {
          profitLoss: dteTrades?.profit_loss || 0,
          tradeCount: dteTrades?.trade_count || 0
        }
      }
    })
  } catch (error) {
    console.error('Error generating monthly income report:', error)
    return c.json({
      error: 'Failed to generate monthly income report',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})
