import { Hono } from 'hono'
import { authMiddleware } from '../lib/auth'
import type { Bindings } from '../types'

export const routes = new Hono<{ Bindings: Bindings }>()

// ============================================================================
// DAILY TRADE CONFIG ROUTES
// ============================================================================

// Get user's daily trade configuration
routes.get('/api/daily-trade/config', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c

    const result = await env.DB.prepare(`
      SELECT * FROM daily_trade_config WHERE user_id = ?
    `).bind(userId).first()

    if (!result) {
      // Return default configuration if none exists
      return c.json({
        max_contract_limit: 25,
        rolling_profit_window: 50,
        enable_profit_sizing_default: false,
        enable_position_sizing: false,
        position_sizing_type: 'profit',
        account_max_loss_percent: 4.00,
        target_premium_min: 10.00,
        target_premium_max: 15.00,
        guideline_delta: -0.10,
        strike_width: 5,
        default_contracts: 1,
        profit_target_percent: 50,
        atm_proximity_limit: 30,
        time_exit: '14:00:00',
        default_account_id: null
      })
    }

    return c.json(result)
  } catch (error) {
    console.error('Error fetching daily trade config:', error)
    return c.json({ error: 'Failed to fetch configuration' }, 500)
  }
})

// Save or update user's daily trade configuration
routes.post('/api/daily-trade/config', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const data = await c.req.json()

    // Check if config exists
    const existing = await env.DB.prepare(`
      SELECT id FROM daily_trade_config WHERE user_id = ?
    `).bind(userId).first()

    if (existing) {
      // Update existing config
      await env.DB.prepare(`
        UPDATE daily_trade_config SET
          max_contract_limit = ?,
          rolling_profit_window = ?,
          enable_profit_sizing_default = ?,
          enable_position_sizing = ?,
          position_sizing_type = ?,
          account_max_loss_percent = ?,
          target_premium_min = ?,
          target_premium_max = ?,
          guideline_delta = ?,
          strike_width = ?,
          default_contracts = ?,
          profit_target_percent = ?,
          atm_proximity_limit = ?,
          time_exit = ?,
          default_account_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).bind(
        data.max_contract_limit,
        data.rolling_profit_window,
        data.enable_profit_sizing_default ? 1 : 0,
        data.enable_position_sizing ? 1 : 0,
        data.position_sizing_type || 'profit',
        data.account_max_loss_percent || 4.00,
        data.target_premium_min,
        data.target_premium_max,
        data.guideline_delta || -0.10,
        data.strike_width,
        data.default_contracts,
        data.profit_target_percent,
        data.atm_proximity_limit,
        data.time_exit,
        data.default_account_id || null,
        userId
      ).run()
    } else {
      // Insert new config
      await env.DB.prepare(`
        INSERT INTO daily_trade_config (
          user_id,
          max_contract_limit,
          rolling_profit_window,
          enable_profit_sizing_default,
          enable_position_sizing,
          position_sizing_type,
          account_max_loss_percent,
          target_premium_min,
          target_premium_max,
          guideline_delta,
          strike_width,
          default_contracts,
          profit_target_percent,
          atm_proximity_limit,
          time_exit,
          default_account_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId,
        data.max_contract_limit,
        data.rolling_profit_window,
        data.enable_profit_sizing_default ? 1 : 0,
        data.enable_position_sizing ? 1 : 0,
        data.position_sizing_type || 'profit',
        data.account_max_loss_percent || 4.00,
        data.target_premium_min,
        data.target_premium_max,
        data.guideline_delta || -0.10,
        data.strike_width,
        data.default_contracts,
        data.profit_target_percent,
        data.atm_proximity_limit,
        data.time_exit,
        data.default_account_id || null
      ).run()
    }

    return c.json({ success: true, message: 'Configuration saved successfully' })
  } catch (error) {
    console.error('Error saving daily trade config:', error)
    return c.json({ error: 'Failed to save configuration' }, 500)
  }
})

// Reset configuration to defaults
routes.post('/api/daily-trade/config/reset', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c

    await env.DB.prepare(`
      DELETE FROM daily_trade_config WHERE user_id = ?
    `).bind(userId).run()

    return c.json({ 
      success: true, 
      message: 'Configuration reset to defaults',
      config: {
        max_contract_limit: 25,
        rolling_profit_window: 50,
        enable_position_sizing: false,
        position_sizing_type: 'profit',
        account_max_loss_percent: 4.00,
        target_premium_min: 10.00,
        target_premium_max: 15.00,
        strike_width: 5,
        default_contracts: 1,
        profit_target_percent: 50,
        atm_proximity_limit: 30,
        time_exit: '14:00:00',
        default_account_id: null
      }
    })
  } catch (error) {
    console.error('Error resetting daily trade config:', error)
    return c.json({ error: 'Failed to reset configuration' }, 500)
  }
})

// ============================================================================
// DAILY TRADES ROUTES
// ============================================================================

// Get all daily trades for user (with optional filters)
routes.get('/api/daily-trades', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const date = c.req.query('date') // Optional: filter by specific date
    const isOpen = c.req.query('is_open') // Optional: filter by open/closed

    let query = `
      SELECT dt.*, a.account_name 
      FROM daily_trades dt
      LEFT JOIN accounts a ON dt.account_id = a.id
      WHERE dt.user_id = ?
    `
    const params = [userId]

    if (date) {
      query += ` AND dt.trade_date = ?`
      params.push(date)
    }

    if (isOpen !== undefined) {
      query += ` AND dt.is_open = ?`
      params.push(isOpen === 'true' ? 1 : 0)
    }

    query += ` ORDER BY dt.trade_date DESC, dt.entry_time DESC`

    const result = await env.DB.prepare(query).bind(...params).all()

    return c.json({ trades: result.results || [] })
  } catch (error) {
    console.error('Error fetching daily trades:', error)
    return c.json({ error: 'Failed to fetch trades' }, 500)
  }
})

// Get today's daily trades
routes.get('/api/daily-trades/today', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const today = new Date().toISOString().split('T')[0]

    const result = await env.DB.prepare(`
      SELECT dt.*, a.account_name 
      FROM daily_trades dt
      LEFT JOIN accounts a ON dt.account_id = a.id
      WHERE dt.user_id = ? AND dt.trade_date = ?
      ORDER BY dt.entry_time DESC
    `).bind(userId, today).all()

    return c.json({ trades: result.results || [] })
  } catch (error) {
    console.error('Error fetching today trades:', error)
    return c.json({ error: 'Failed to fetch today trades' }, 500)
  }
})

// Create new daily trade
routes.post('/api/daily-trades', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const data = await c.req.json()

    // Get default account if not provided
    let accountId = data.account_id
    if (!accountId) {
      const config = await env.DB.prepare(`
        SELECT default_account_id FROM daily_trade_config WHERE user_id = ?
      `).bind(userId).first() as any
      accountId = config?.default_account_id || null
    }

    const result = await env.DB.prepare(`
      INSERT INTO daily_trades (
        user_id, account_id, trade_date, entry_time, strategy_type, contracts, strike_width,
        call_enabled, call_short_strike, call_total_credit,
        put_enabled, put_short_strike, put_total_credit,
        spx_entry_price, vix_entry_price, total_credit, commission, notes, is_open
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      userId,
      accountId,
      data.trade_date,
      data.entry_time,
      data.strategy_type,
      data.contracts,
      data.strike_width || 5,
      data.call_enabled ? 1 : 0,
      data.call_short_strike || null,
      data.call_total_credit || null,
      data.put_enabled ? 1 : 0,
      data.put_short_strike || null,
      data.put_total_credit || null,
      data.spx_entry_price || null,
      data.vix_entry_price || null,
      data.total_credit,
      data.commission || 0,
      data.notes || null
    ).run()

    return c.json({ 
      success: true, 
      id: result.meta.last_row_id,
      message: 'Trade entered successfully' 
    }, 201)
  } catch (error) {
    console.error('Error creating daily trade:', error)
    return c.json({ error: 'Failed to create trade' }, 500)
  }
})

// Update a daily trade
routes.put('/api/daily-trades/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const tradeId = c.req.param('id')
    const data = await c.req.json()

    // Check if exit data is provided (for closed trades)
    let updateQuery = `
      UPDATE daily_trades SET
        trade_date = ?,
        entry_time = ?,
        strategy_type = ?,
        contracts = ?,
        strike_width = ?,
        call_enabled = ?,
        call_short_strike = ?,
        call_total_credit = ?,
        put_enabled = ?,
        put_short_strike = ?,
        put_total_credit = ?,
        spx_entry_price = ?,
        vix_entry_price = ?,
        total_credit = ?,
        commission = ?,
        notes = ?`
    
    const bindings: any[] = [
      data.trade_date,
      data.entry_time,
      data.strategy_type || 'IRON_CONDOR',
      data.contracts,
      data.strike_width || 5,
      data.call_enabled ? 1 : 0,
      data.call_short_strike || null,
      data.call_total_credit || 0,
      data.put_enabled ? 1 : 0,
      data.put_short_strike || null,
      data.put_total_credit || 0,
      data.spx_entry_price || null,
      data.vix_entry_price || null,
      data.total_credit || 0,
      data.commission || 1.30,
      data.notes || null
    ]
    
    // Add exit fields if provided
    if (data.exit_time !== undefined) {
      updateQuery += `,
        exit_time = ?,
        total_debit = ?,
        close_commission = ?,
        profit_loss = ?,
        exit_reason = ?`
      
      bindings.push(
        data.exit_time || null,
        data.total_debit || 0,
        data.close_commission || 0,
        data.profit_loss || 0,
        data.exit_reason || 'MANUAL'
      )
    }
    
    updateQuery += `,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`
    
    bindings.push(tradeId, userId)
    
    await env.DB.prepare(updateQuery).bind(...bindings).run()

    return c.json({ 
      success: true,
      message: 'Trade updated successfully' 
    })
  } catch (error) {
    console.error('Error updating daily trade:', error)
    return c.json({ error: 'Failed to update trade' }, 500)
  }
})

// Close a daily trade
routes.post('/api/daily-trades/:id/close', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const tradeId = c.req.param('id')
    const data = await c.req.json()

    // First get the trade to calculate P/L
    const trade = await env.DB.prepare(`
      SELECT * FROM daily_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()

    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }

    // Calculate profit/loss
    const exitCost = data.exit_cost || 0
    
    const entryCredit = trade.total_credit * trade.contracts * 100
    const exitDebit = exitCost * trade.contracts * 100
    const entryCommission = trade.commission || 0
    const closeCommission = data.close_commission || 0
    
    const profitLoss = entryCredit - exitDebit - entryCommission - closeCommission

    // Handle notes - append close notes if provided
    let updatedNotes = trade.notes || ''
    if (data.notes && data.notes.trim() !== '') {
      updatedNotes = updatedNotes + '\n' + 'Close: ' + data.notes
    }

    // Map exit reason to database-compatible value
    // EXPIRED_WORTHLESS is shown in UI but stored as MANUAL for DB constraint compatibility
    let exitReason = data.exit_reason || 'MANUAL'
    if (exitReason === 'EXPIRED_WORTHLESS') {
      exitReason = 'MANUAL'
    }

    const result = await env.DB.prepare(`
      UPDATE daily_trades SET
        exit_time = ?,
        total_debit = ?,
        close_commission = ?,
        profit_loss = ?,
        exit_reason = ?,
        is_open = 0,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      data.exit_time,
      exitCost,
      closeCommission,
      profitLoss,
      exitReason,
      updatedNotes,
      tradeId,
      userId
    ).run()
    
    if (!result.success) {
      throw new Error('Database update failed')
    }

    return c.json({ 
      success: true, 
      profit_loss: profitLoss,
      message: 'Trade closed successfully' 
    })
  } catch (error) {
    console.error('Error closing daily trade:', error)
    console.error('Error message:', error.message)
    return c.json({ error: 'Failed to close trade', details: error.message }, 500)
  }
})

// Delete a daily trade
routes.delete('/api/daily-trades/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const tradeId = c.req.param('id')

    await env.DB.prepare(`
      DELETE FROM daily_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).run()

    return c.json({ success: true, message: 'Trade deleted successfully' })
  } catch (error) {
    console.error('Error deleting daily trade:', error)
    return c.json({ error: 'Failed to delete trade' }, 500)
  }
})

// Reopen a closed daily trade (clears exit information)
routes.put('/api/daily-trades/:id/reopen', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const tradeId = c.req.param('id')

    // Verify trade belongs to user and is currently closed
    const trade = await env.DB.prepare(`
      SELECT id, is_open FROM daily_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()

    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }

    if ((trade as any).is_open === 1) {
      return c.json({ error: 'Trade is already open' }, 400)
    }

    // Reopen the trade by clearing exit information
    await env.DB.prepare(`
      UPDATE daily_trades SET
        is_open = 1,
        exit_time = NULL,
        exit_reason = NULL,
        total_debit = NULL,
        profit_loss = NULL,
        close_commission = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).run()

    return c.json({ success: true, message: 'Trade reopened successfully' })
  } catch (error) {
    console.error('Error reopening daily trade:', error)
    return c.json({ error: 'Failed to reopen trade' }, 500)
  }
})

// Get performance statistics
routes.get('/api/daily-trades/stats', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const period = c.req.query('period') || 'all' // all, rolling, month, year
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')) : 50

    let query = `
      SELECT 
        COUNT(*) as total_trades,
        SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
        AVG(CASE WHEN profit_loss > 0 THEN profit_loss ELSE NULL END) as avg_win,
        AVG(CASE WHEN profit_loss < 0 THEN profit_loss ELSE NULL END) as avg_loss,
        SUM(profit_loss) as net_pl,
        AVG(profit_loss) as avg_pl,
        MAX(profit_loss) as best_trade,
        MIN(profit_loss) as worst_trade
      FROM daily_trades
      WHERE user_id = ? AND is_open = 0
    `
    const params = [userId]

    if (period === 'rolling') {
      // For rolling window, use a subquery to get the last N trades
      query = `
        SELECT 
          COUNT(*) as total_trades,
          SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
          AVG(CASE WHEN profit_loss > 0 THEN profit_loss ELSE NULL END) as avg_win,
          AVG(CASE WHEN profit_loss < 0 THEN profit_loss ELSE NULL END) as avg_loss,
          SUM(profit_loss) as net_pl,
          AVG(profit_loss) as avg_pl,
          MAX(profit_loss) as best_trade,
          MIN(profit_loss) as worst_trade
        FROM (
          SELECT profit_loss 
          FROM daily_trades 
          WHERE user_id = ? AND is_open = 0 
          ORDER BY trade_date DESC, entry_time DESC 
          LIMIT ?
        )
      `
      params.length = 0 // Clear params array
      params.push(userId, limit) // Push both userId and limit
    } else if (period === 'month') {
      query += ` AND strftime('%Y-%m', trade_date) = strftime('%Y-%m', 'now')`
    } else if (period === 'year') {
      query += ` AND strftime('%Y', trade_date) = strftime('%Y', 'now')`
    }

    const result = await env.DB.prepare(query).bind(...params).first()

    // Get best trade date
    let bestTradeQuery = `
      SELECT trade_date, entry_time 
      FROM daily_trades 
      WHERE user_id = ? AND is_open = 0 AND profit_loss = ?
    `
    if (period === 'rolling') {
      bestTradeQuery = `
        SELECT trade_date, entry_time 
        FROM (
          SELECT trade_date, entry_time, profit_loss 
          FROM daily_trades 
          WHERE user_id = ? AND is_open = 0 
          ORDER BY trade_date DESC, entry_time DESC 
          LIMIT ?
        )
        WHERE profit_loss = ?
      `
    } else if (period === 'month') {
      bestTradeQuery += ` AND strftime('%Y-%m', trade_date) = strftime('%Y-%m', 'now')`
    } else if (period === 'year') {
      bestTradeQuery += ` AND strftime('%Y', trade_date) = strftime('%Y', 'now')`
    }
    bestTradeQuery += ` LIMIT 1`

    // Get worst trade date
    let worstTradeQuery = `
      SELECT trade_date, entry_time 
      FROM daily_trades 
      WHERE user_id = ? AND is_open = 0 AND profit_loss = ?
    `
    if (period === 'rolling') {
      worstTradeQuery = `
        SELECT trade_date, entry_time 
        FROM (
          SELECT trade_date, entry_time, profit_loss 
          FROM daily_trades 
          WHERE user_id = ? AND is_open = 0 
          ORDER BY trade_date DESC, entry_time DESC 
          LIMIT ?
        )
        WHERE profit_loss = ?
      `
    } else if (period === 'month') {
      worstTradeQuery += ` AND strftime('%Y-%m', trade_date) = strftime('%Y-%m', 'now')`
    } else if (period === 'year') {
      worstTradeQuery += ` AND strftime('%Y', trade_date) = strftime('%Y', 'now')`
    }
    worstTradeQuery += ` LIMIT 1`

    let bestTradeDate = null
    let worstTradeDate = null

    if (result.best_trade !== null) {
      const bestTradeParams = period === 'rolling' 
        ? [userId, limit, result.best_trade]
        : [userId, result.best_trade]
      const bestTradeResult = await env.DB.prepare(bestTradeQuery).bind(...bestTradeParams).first()
      if (bestTradeResult) {
        bestTradeDate = bestTradeResult.trade_date
      }
    }

    if (result.worst_trade !== null) {
      const worstTradeParams = period === 'rolling'
        ? [userId, limit, result.worst_trade]
        : [userId, result.worst_trade]
      const worstTradeResult = await env.DB.prepare(worstTradeQuery).bind(...worstTradeParams).first()
      if (worstTradeResult) {
        worstTradeDate = worstTradeResult.trade_date
      }
    }

    const winRate = result.total_trades > 0 
      ? ((result.winning_trades / result.total_trades) * 100).toFixed(1)
      : 0

    return c.json({ 
      ...result,
      win_rate: winRate,
      best_trade_date: bestTradeDate,
      worst_trade_date: worstTradeDate
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return c.json({ error: 'Failed to fetch statistics' }, 500)
  }
})

// Get chart data for P/L trend visualization
routes.get('/api/daily-trades/chart-data', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c
    const period = c.req.query('period') || 'all'
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')) : 50

    let query = `
      SELECT 
        id,
        trade_date,
        entry_time,
        exit_time,
        strategy_type,
        contracts,
        total_credit,
        profit_loss
      FROM daily_trades
      WHERE user_id = ? AND is_open = 0
    `
    const params = [userId]

    if (period === 'rolling') {
      // For rolling window, get the last N trades
      query += ` ORDER BY trade_date DESC, entry_time DESC LIMIT ?`
      params.push(limit)
    } else if (period === 'month') {
      query += ` AND strftime('%Y-%m', trade_date) = strftime('%Y-%m', 'now')
                 ORDER BY trade_date ASC, entry_time ASC`
    } else if (period === 'year') {
      query += ` AND strftime('%Y', trade_date) = strftime('%Y', 'now')
                 ORDER BY trade_date ASC, entry_time ASC`
    } else {
      // All time
      query += ` ORDER BY trade_date ASC, entry_time ASC`
    }

    const result = await env.DB.prepare(query).bind(...params).all()
    
    // For rolling period, reverse the array to show oldest to newest
    const trades = period === 'rolling' ? result.results.reverse() : result.results

    return c.json({ trades })
  } catch (error) {
    console.error('Error fetching chart data:', error)
    return c.json({ error: 'Failed to fetch chart data' }, 500)
  }
})

// Get day of week statistics
routes.get('/api/daily-trades/day-stats', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { env } = c

    const query = `
      SELECT 
        CASE CAST(strftime('%w', trade_date) AS INTEGER)
          WHEN 0 THEN 'Sunday'
          WHEN 1 THEN 'Monday'
          WHEN 2 THEN 'Tuesday'
          WHEN 3 THEN 'Wednesday'
          WHEN 4 THEN 'Thursday'
          WHEN 5 THEN 'Friday'
          WHEN 6 THEN 'Saturday'
        END as day_name,
        CAST(strftime('%w', trade_date) AS INTEGER) as day_num,
        COUNT(*) as total_trades,
        SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
        SUM(profit_loss) as net_pl,
        AVG(profit_loss) as avg_pl,
        MAX(profit_loss) as best_trade,
        MIN(profit_loss) as worst_trade
      FROM daily_trades
      WHERE user_id = ? AND is_open = 0
      GROUP BY day_num, day_name
      ORDER BY day_num
    `

    const result = await env.DB.prepare(query).bind(userId).all()

    // Calculate win rates and format data
    const dayStats = result.results.map(day => {
      const winRate = day.total_trades > 0 
        ? ((day.winning_trades / day.total_trades) * 100).toFixed(1)
        : 0
      
      return {
        ...day,
        win_rate: winRate
      }
    })

    return c.json({ days: dayStats })
  } catch (error) {
    console.error('Error fetching day stats:', error)
    return c.json({ error: 'Failed to fetch day statistics' }, 500)
  }
})
