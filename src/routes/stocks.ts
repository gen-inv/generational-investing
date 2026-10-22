import { Hono } from 'hono'
import { loadRealizedSells, sumRealized } from '../lib/stock-pl'
import { previewSellEdit } from '../lib/sell-edit'
import { costBasisPerShare } from '../lib/cost-basis'
import { holdingPosition } from '../lib/stock-close'
import { optionPL } from '../lib/calc'
import { syncCoveredCallAdjustment } from '../lib/cc-adjustment'
import { authMiddleware } from '../lib/auth'
import type { Bindings } from '../types'

export const routes = new Hono<{ Bindings: Bindings }>()

// ============================================================================
// STOCK TRADES ROUTES
// ============================================================================

routes.get('/api/stocks', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const isOpen = c.req.query('open')
  const isClosed = c.req.query('closed')
  const { DB } = c.env
  
  let query = `
    SELECT 
      sh.*,
      a.account_name,
      a.account_type,
      c.ticker as company_ticker,
      c.company_name,
      (SELECT COALESCE(SUM(amount), 0) 
       FROM cost_basis_adjustments cba
       WHERE cba.holding_id = sh.id AND adjustment_type IN ('DIVIDEND', 'COVERED_CALL', 'SELLING_PUT')) as total_adjustments,
      (SELECT MIN(expiration_date)
       FROM option_trades
       WHERE user_id = sh.user_id 
         AND ticker = sh.ticker 
         AND account_id = sh.account_id
         AND strategy_type = 'COVERED_CALL' 
         AND is_open = 1) as nearest_cc_expiration
    FROM stock_holdings sh
    LEFT JOIN accounts a ON sh.account_id = a.id
    LEFT JOIN companies c ON sh.company_id = c.id
    WHERE sh.user_id = ?
  `
  let params = [userId]
  
  if (isOpen !== undefined) {
    query += ' AND sh.is_open = ?'
    params.push(isOpen === 'true' ? 1 : 0)
  } else if (isClosed !== undefined) {
    query += ' AND sh.is_open = ?'
    params.push(isClosed === 'true' ? 0 : 1)
  }
  
  query += ' ORDER BY sh.opened_date DESC'
  
  const stmt = DB.prepare(query)
  const stocks = await stmt.bind(...params).all()
  
  // Realized P/L per SELL (partial sells included), grouped by holding
  const realizedByHolding = new Map<number, number>()
  const sellCountByHolding = new Map<number, number>()
  for (const sell of await loadRealizedSells(DB, userId)) {
    realizedByHolding.set(sell.holding_id, (realizedByHolding.get(sell.holding_id) || 0) + sell.realized_pl)
    sellCountByHolding.set(sell.holding_id, (sellCountByHolding.get(sell.holding_id) || 0) + 1)
  }

  // Calculate avg price, cost basis, P/L, and covered call status for each holding
  const enhancedStocks = await Promise.all(stocks.results.map(async (stock: any) => {
    const avgPrice = stock.average_price
    // Realized P/L from sells: lifetime total for a closed holding, partial sells so far for an open one
    const realizedPL = realizedByHolding.has(stock.id) ? realizedByHolding.get(stock.id)! : null
    // Premiums/dividends AND the result of shares already sold (a loss raises it, a gain lowers it) -- see lib/cost-basis.ts
    const costBasis = costBasisPerShare(avgPrice, stock.total_shares, stock.total_adjustments, realizedPL || 0)
    const profitLoss = stock.is_open === 0 ? realizedPL : null

    // Calculate days until covered call expiration
    let ccStatus = null
    let daysUntilExpiration = null
    
    if (stock.nearest_cc_expiration) {
      const expDate = new Date(stock.nearest_cc_expiration)
      const today = new Date()
      daysUntilExpiration = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysUntilExpiration <= 14) {
        ccStatus = 'urgent' // Red - expires within 14 days
      } else {
        ccStatus = 'active' // Orange - expires beyond 14 days
      }
    }
    
    // Check for missing dividends using the same logic as the missing-dividends endpoint
    let hasMissingDividends = false
    let missingDividendCount = 0
    
    if (stock.is_open === 1) {
      // Get date range
      const startDate = stock.opened_date
      const endDate = new Date().toISOString().split('T')[0]
      
      // Get repository dividends for this ticker in date range
      const repoDivs = await DB.prepare(`
        SELECT id, ex_date, pay_date, amount FROM dividend_repository
        WHERE ticker = ? AND ex_date >= ? AND ex_date <= ? AND status = 'active'
      `).bind(stock.ticker, startDate, endDate).all()
      
      if (repoDivs.results && repoDivs.results.length > 0) {
        // Get recorded dividends
        const recordedDivs = await DB.prepare(`
          SELECT amount, adjustment_date, notes FROM cost_basis_adjustments
          WHERE holding_id = ? AND adjustment_type = 'DIVIDEND'
        `).bind(stock.id).all()
        
        // Get transactions to calculate shares
        const txns = await DB.prepare(`
          SELECT transaction_date, transaction_type, shares
          FROM stock_transactions
          WHERE holding_id = ?
          ORDER BY transaction_date ASC
        `).bind(stock.id).all()
        
        const getSharesOnDate = (targetDate: string) => {
          // If no transactions exist, use total_shares from stock_holdings as fallback
          if (!txns.results || txns.results.length === 0) {
            // Use total_shares for all dates >= opened_date
            if (targetDate >= stock.opened_date) {
              return stock.total_shares || 0
            }
            return 0
          }
          
          // Calculate shares from transactions
          let shares = 0
          for (const tx of (txns.results || [])) {
            const t = tx as any
            if (t.transaction_date <= targetDate) {
              shares += t.transaction_type === 'BUY' ? t.shares : -t.shares
            }
          }
          return shares
        }
        
        const datesWithinDays = (d1: string, d2: string, days: number) => {
          const diff = Math.abs(new Date(d1).getTime() - new Date(d2).getTime())
          return Math.ceil(diff / (1000 * 60 * 60 * 24)) <= days
        }
        
        const isDivRecorded = (repoDiv: any, sharesHeld: number) => {
          for (const rec of (recordedDivs.results || [])) {
            const r = rec as any
            
            // Match 1: Exact ex_date from notes
            const exMatch = r.notes?.match(/Ex-date: (\d{4}-\d{2}-\d{2})/)
            if (exMatch && exMatch[1] === repoDiv.ex_date) return true
            
            // Match 2: Exact pay_date match (user entered accurate dividend)
            // Don't require amount match since user may have entered actual amount
            if (repoDiv.pay_date && r.adjustment_date === repoDiv.pay_date) {
              return true
            }
            
            // Match 3: Amount + date proximity
            let perShareRec = r.amount / sharesHeld
            const accountType = stock.account_type || 'RRSP'
            if (accountType === 'Cash' || accountType === 'TFSA') {
              perShareRec = perShareRec / 0.8
            }
            const perShareRepo = repoDiv.amount
            const amtMatch = Math.abs(perShareRec - perShareRepo) < 0.0001
            
            // Check if adjustment_date is within 3 days of pay_date OR ex_date
            let dateMatch = false
            if (repoDiv.pay_date) {
              dateMatch = datesWithinDays(r.adjustment_date, repoDiv.pay_date, 3)
            }
            if (!dateMatch) {
              dateMatch = datesWithinDays(r.adjustment_date, repoDiv.ex_date, 3)
            }
            
            if (amtMatch && dateMatch) return true
          }
          return false
        }
        
        // Count missing dividends
        for (const div of repoDivs.results) {
          const d = div as any
          const sharesHeld = getSharesOnDate(d.ex_date)
          if (sharesHeld > 0 && !isDivRecorded(d, sharesHeld)) {
            missingDividendCount++
          }
        }
        
        hasMissingDividends = missingDividendCount > 0
      }
    }
    
    return {
      ...stock,
      // Map new field names to old field names for backwards compatibility
      price: avgPrice,
      quantity: stock.total_shares,
      trade_date: stock.opened_date,
      avg_price: avgPrice,
      cost_basis: costBasis,
      profit_loss: profitLoss,
      realized_pl: realizedPL,
      sell_count: sellCountByHolding.get(stock.id) || 0,
      cc_status: ccStatus,
      cc_expiration: stock.nearest_cc_expiration,
      days_until_cc_expiration: daysUntilExpiration,
      has_missing_dividends: hasMissingDividends,
      missing_dividend_count: missingDividendCount
    }
  }))
  
  return c.json(enhancedStocks)
})

// Closed Trades report rows: one row per SELL (partial and full), each with its own realized P/L.
// Registered before '/api/stocks/:id' so "closed-trades" is not treated as a holding id.
routes.get('/api/stocks/closed-trades', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env
    const accountId = c.req.query('account_id')
    const from = c.req.query('from')
    const to = c.req.query('to')

    const sells = await loadRealizedSells(DB, userId, {
      accountId: accountId ? parseInt(accountId) : undefined,
      from: from || undefined,
      to: to || undefined
    })

    const rows: any[] = sells.map(s => ({
      id: s.holding_id,
      transaction_id: s.transaction_id,
      ticker: s.ticker,
      opened_date: s.opened_date,
      closed_date: s.sell_date,
      total_shares: s.shares,
      average_price: s.avg_cost,
      sell_price: s.sell_price,
      account_id: s.account_id,
      account_name: s.account_name,
      account_type: s.account_type,
      buy_commission: s.buy_commission,
      sell_commission: s.sell_commission,
      profit_loss: s.realized_pl,
      shares_remaining: s.shares_remaining,
      is_partial: !s.is_full_close,
      holding_is_open: s.holding_is_open,
      warning: s.warning || null
    }))

    // Closed holdings with no SELL transaction at all (legacy data): keep them visible, P/L unknown
    if (!from && !to) {
      const orphans = await DB.prepare(`
        SELECT sh.id, sh.ticker, sh.opened_date, sh.closed_date, sh.total_shares, sh.average_price,
               sh.account_id, a.account_name, a.account_type
        FROM stock_holdings sh
        LEFT JOIN accounts a ON sh.account_id = a.id
        WHERE sh.user_id = ? AND sh.is_open = 0
          ${accountId ? 'AND sh.account_id = ?' : ''}
          AND NOT EXISTS (
            SELECT 1 FROM stock_transactions st
            WHERE st.holding_id = sh.id AND st.transaction_type = 'SELL'
          )
      `).bind(userId, ...(accountId ? [parseInt(accountId)] : [])).all()

      for (const o of (orphans.results || []) as any[]) {
        rows.push({
          id: o.id,
          transaction_id: null,
          ticker: o.ticker,
          opened_date: o.opened_date,
          closed_date: o.closed_date,
          total_shares: o.total_shares,
          average_price: o.average_price,
          sell_price: null,
          account_id: o.account_id,
          account_name: o.account_name,
          account_type: o.account_type,
          buy_commission: 0,
          sell_commission: 0,
          profit_loss: null,
          shares_remaining: 0,
          is_partial: false,
          holding_is_open: false,
          warning: 'Closed without a recorded sell transaction'
        })
      }
      rows.sort((a, b) => String(b.closed_date || '').localeCompare(String(a.closed_date || '')))
    }

    return c.json(rows)
  } catch (error) {
    console.error('Closed trades error:', error)
    return c.json({ error: 'Failed to fetch closed trades' }, 500)
  }
})

// Get single stock holding with transaction details
routes.get('/api/stocks/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Get holding details
    const holding = await DB.prepare(`
      SELECT 
        sh.*,
        a.account_name,
        a.account_type,
        c.ticker as company_ticker,
        c.company_name
      FROM stock_holdings sh
      LEFT JOIN accounts a ON sh.account_id = a.id
      LEFT JOIN companies c ON sh.company_id = c.id
      WHERE sh.id = ? AND sh.user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Stock holding not found' }, 404)
    }
    
    // Get all transactions for this holding
    const transactions = await DB.prepare(`
      SELECT * FROM stock_transactions
      WHERE holding_id = ?
      ORDER BY transaction_date ASC
    `).bind(holdingId).all()
    
    // Realized P/L for every SELL (average cost at the time of sale, buy commissions
    // attributed pro rata). Dividends/premiums are separate income, not part of a sell's P/L.
    const sells = await loadRealizedSells(DB, userId, { holdingId: Number(holdingId) })
    const sellById = new Map(sells.map(s => [s.transaction_id, s]))
    const realizedPL = sells.length > 0 ? sumRealized(sells) : null

    // Lifetime P/L is only reported once the position is closed; open positions report realized_pl
    let profitLoss = holding.is_open === 0 ? realizedPL : null
    let closePrice = null
    let closeCommission = null
    let closeDate = null

    if (holding.is_open === 0) {
      // Closing details come from the final SELL (latest by date, then id)
      const finalSell = [...sells].sort((a, b) =>
        a.sell_date !== b.sell_date
          ? (a.sell_date < b.sell_date ? -1 : 1)
          : a.transaction_id - b.transaction_id
      ).pop()
      if (finalSell) {
        closePrice = finalSell.sell_price
        closeCommission = finalSell.sell_commission
        closeDate = finalSell.sell_date
      }
    }

    // Attach realized P/L to each SELL row for the Share Ownership History table
    const transactionsWithPL = transactions.results.map((tx: any) => {
      const s = sellById.get(tx.id)
      return s
        ? { ...tx, avg_cost: s.avg_cost, realized_pl: s.realized_pl, shares_remaining: s.shares_remaining }
        : tx
    })

    // Get the first transaction to determine trade_type
    const firstTransaction = transactions.results[0] as any
    const tradeType = firstTransaction?.transaction_type || 'BUY'
    
    // Return holding with transaction details mapped to old field names
    return c.json({
      ...holding,
      // Map new field names to old field names for backwards compatibility
      id: holding.id,
      price: holding.average_price,
      quantity: holding.total_shares,
      trade_date: holding.opened_date,
      trade_type: tradeType,
      commission: firstTransaction?.commission || 0,
      avg_price: holding.average_price,
      profit_loss: profitLoss,
      realized_pl: realizedPL,
      close_date: closeDate,
      close_price: closePrice,
      close_commission: closeCommission,
      closed_date: holding.closed_date,
      transactions: transactionsWithPL
    })
  } catch (error) {
    console.error('Get stock error:', error)
    return c.json({ error: 'Failed to fetch stock' }, 500)
  }
})

routes.post('/api/stocks', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Validation
    if (!data.company_id) {
      return c.json({ error: 'Company is required' }, 400)
    }
    
    if (!data.account_id) {
      return c.json({ error: 'Account is required' }, 400)
    }
    
    if (!data.ticker || !data.trade_type || !data.quantity || !data.price || !data.trade_date) {
      return c.json({ error: 'Missing required fields' }, 400)
    }
    
    // Verify company belongs to user
    const company = await DB.prepare(`
      SELECT id FROM companies WHERE id = ? AND user_id = ?
    `).bind(data.company_id, userId).first()
    
    if (!company) {
      return c.json({ error: 'Company not found' }, 404)
    }
    
    // Verify account belongs to user and get account_type
    const account = await DB.prepare(`
      SELECT id, account_type FROM accounts WHERE id = ? AND user_id = ?
    `).bind(data.account_id, userId).first()
    
    if (!account) {
      return c.json({ error: 'Account not found' }, 404)
    }
    
    // Check if holding exists for this ticker + account
    const holding = await DB.prepare(`
      SELECT * FROM stock_holdings 
      WHERE user_id = ? AND ticker = ? AND account_id = ? AND is_open = 1
    `).bind(userId, data.ticker, data.account_id).first()
    
    let holdingId
    const quantity = parseInt(data.quantity)
    const price = parseFloat(data.price)
    const commission = parseFloat(data.commission || 0)
    
    if (holding) {
      // Update existing holding
      holdingId = holding.id
      const currentShares = holding.total_shares
      const currentAvg = holding.average_price
      
      if (data.trade_type === 'BUY') {
        // Add to position - recalculate weighted average
        const newTotalShares = currentShares + quantity
        const newAvgPrice = ((currentShares * currentAvg) + (quantity * price)) / newTotalShares
        
        await DB.prepare(`
          UPDATE stock_holdings 
          SET total_shares = ?, average_price = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(newTotalShares, newAvgPrice, holdingId).run()
      } else if (data.trade_type === 'SELL') {
        // Remove from position - keep same average price
        const newTotalShares = currentShares - quantity
        
        if (newTotalShares < 0) {
          return c.json({ error: 'Cannot sell more shares than you own' }, 400)
        }
        
        if (newTotalShares === 0) {
          // Close the holding
          await DB.prepare(`
            UPDATE stock_holdings 
            SET total_shares = 0, is_open = 0, closed_date = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(data.trade_date, holdingId).run()
        } else {
          // Reduce shares
          await DB.prepare(`
            UPDATE stock_holdings 
            SET total_shares = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(newTotalShares, holdingId).run()
        }
      }
    } else {
      // Create new holding (first purchase)
      if (data.trade_type !== 'BUY') {
        return c.json({ error: 'Cannot sell without an open position' }, 400)
      }
      
      const result = await DB.prepare(`
        INSERT INTO stock_holdings (
          user_id, company_id, ticker, account_id, total_shares, average_price, is_open, opened_date, strategy_type
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).bind(
        userId,
        data.company_id,
        data.ticker,
        data.account_id,
        quantity,
        price,
        data.trade_date,
        data.strategy_type || 'STOCKPILING'
      ).run()
      
      holdingId = result.meta.last_row_id
    }
    
    // Create transaction record
    const txResult = await DB.prepare(`
      INSERT INTO stock_transactions (
        user_id, holding_id, transaction_type, shares, price_per_share, 
        transaction_date, commission, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      holdingId,
      data.trade_type,
      quantity,
      price,
      data.trade_date,
      commission,
      data.notes || null
    ).run()
    
    return c.json({ 
      id: holdingId,
      transaction_id: txResult.meta.last_row_id,
      ...data,
      is_open: true
    }, 201)
  } catch (error) {
    console.error('Create stock trade error:', error)
    return c.json({ error: 'Failed to create stock trade' }, 500)
  }
})

// DEPRECATED: This endpoint is deprecated. Use POST /api/stocks for new transactions
// and PUT /api/stocks/:id/close for closing positions.
// This endpoint is kept for backward compatibility with legacy stock_trades table data.
routes.put('/api/stocks/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // First check if this is a stock_holdings record (new system)
    const holding = await DB.prepare(`
      SELECT * FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()
    
    if (holding) {
      // Update stock_holdings record - allow updating strategy_type
      if (data.strategy_type) {
        await DB.prepare(`
          UPDATE stock_holdings 
          SET strategy_type = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?
        `).bind(data.strategy_type, tradeId, userId).run()
      }
      
      return c.json({ success: true })
    }
    
    // If not found in stock_holdings, try legacy stock_trades table
    const trade = await DB.prepare(`
      SELECT id FROM stock_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()
    
    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    // Verify company belongs to user
    if (data.company_id) {
      const company = await DB.prepare(`
        SELECT id FROM companies WHERE id = ? AND user_id = ?
      `).bind(data.company_id, userId).first()
      
      if (!company) {
        return c.json({ error: 'Company not found' }, 404)
      }
    }
    
    // Verify account belongs to user
    if (data.account_id) {
      const account = await DB.prepare(`
        SELECT id FROM accounts WHERE id = ? AND user_id = ?
      `).bind(data.account_id, userId).first()
      
      if (!account) {
        return c.json({ error: 'Account not found' }, 404)
      }
    }
    
    await DB.prepare(`
      UPDATE stock_trades SET
        company_id = ?,
        ticker = ?,
        trade_type = ?,
        quantity = ?,
        price = ?,
        account_id = ?,
        trade_date = ?,
        commission = ?,
        close_date = ?,
        close_price = ?,
        close_commission = ?,
        notes = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      data.company_id,
      data.ticker,
      data.trade_type,
      data.quantity,
      data.price,
      data.account_id,
      data.trade_date,
      data.commission || 0,
      data.close_date || null,
      data.close_price || null,
      data.close_commission || null,
      data.notes || null,
      tradeId,
      userId
    ).run()
    
    // Recalculate profit_loss and is_open if close fields are provided
    if (data.close_date && data.close_price !== null && data.close_price !== undefined) {
      const openCommission = data.commission || 0
      const closeCommission = data.close_commission || 0
      const totalShares = data.quantity
      const openPrice = data.price
      const closePrice = data.close_price
      
      // Calculate P/L: (Close Price - Open Price) * Shares - Commissions
      const profitLoss = (closePrice - openPrice) * totalShares - openCommission - closeCommission
      
      await DB.prepare(`
        UPDATE stock_trades SET
          profit_loss = ?,
          is_open = 0
        WHERE id = ? AND user_id = ?
      `).bind(profitLoss, tradeId, userId).run()
    } else if (!data.close_date) {
      // If close_date is removed, mark as open
      await DB.prepare(`
        UPDATE stock_trades SET
          profit_loss = NULL,
          is_open = 1
        WHERE id = ? AND user_id = ?
      `).bind(tradeId, userId).run()
      await DB.prepare(`
        UPDATE stock_trades SET
          profit_loss = NULL,
          is_open = 1
        WHERE id = ? AND user_id = ?
      `).bind(tradeId, userId).run()
    }
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Update stock trade error:', error)
    return c.json({ error: 'Failed to update stock trade' }, 500)
  }
})

// What closing this position would sell: shares held now, average cost, and buy commissions not yet
// carried by an earlier partial sell (same replay the close itself uses), plus open covered calls.
routes.get('/api/stocks/:id/close-preview', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    const holding = await DB.prepare(`
      SELECT sh.id, sh.ticker, sh.account_id, sh.opened_date, sh.is_open, a.account_name, a.account_type
      FROM stock_holdings sh
      LEFT JOIN accounts a ON sh.account_id = a.id
      WHERE sh.id = ? AND sh.user_id = ?
    `).bind(holdingId, userId).first() as any
    if (!holding) return c.json({ error: 'Stock holding not found' }, 404)

    const txs = await DB.prepare(`
      SELECT id, transaction_type, shares, price_per_share, transaction_date, commission
      FROM stock_transactions WHERE holding_id = ?
    `).bind(holdingId).all()
    const position = holdingPosition((txs.results || []) as any[])

    const adj = await DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM cost_basis_adjustments
      WHERE holding_id = ? AND adjustment_type IN ('DIVIDEND', 'COVERED_CALL', 'SELLING_PUT')
    `).bind(holdingId).first() as any
    const cc = await DB.prepare(`
      SELECT COUNT(*) as n FROM option_trades
      WHERE user_id = ? AND ticker = ? AND account_id = ? AND strategy_type = 'COVERED_CALL' AND is_open = 1
    `).bind(userId, holding.ticker, holding.account_id).first() as any

    return c.json({
      id: holding.id,
      ticker: holding.ticker,
      account_name: holding.account_name,
      account_type: holding.account_type,
      opened_date: holding.opened_date,
      is_open: holding.is_open,
      ...position,
      total_adjustments: adj?.total || 0,
      open_covered_calls: cc?.n || 0
    })
  } catch (error) {
    console.error('Close preview error:', error)
    return c.json({ error: 'Failed to load close preview' }, 500)
  }
})

routes.put('/api/stocks/:id/close', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Verify holding belongs to user and is open
    const holding = await DB.prepare(`
      SELECT * FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Stock holding not found' }, 404)
    }
    
    if (holding.is_open === 0) {
      return c.json({ error: 'Position is already closed' }, 400)
    }
    
    // Create a SELL transaction for the full position
    const sellTransaction = await DB.prepare(`
      INSERT INTO stock_transactions 
        (user_id, holding_id, transaction_type, shares, price_per_share, transaction_date, commission, notes)
      VALUES (?, ?, 'SELL', ?, ?, ?, ?, ?)
    `).bind(
      userId,
      holdingId,
      holding.total_shares,
      data.close_price,
      data.close_date,
      data.commission || 0,
      'Position closed'
    ).run()
    
    // Calculate P/L for THIS sell only: (sell price - average cost) x shares, less the sell
    // commission and the matching share of buy commissions. Earlier partial sells already
    // carry their own P/L, and dividends/premiums are separate income.
    const holdingSells = await loadRealizedSells(DB, userId, { holdingId: Number(holdingId) })
    const thisSell = holdingSells.find(s => s.transaction_id === sellTransaction.meta.last_row_id)

    const heldShares = Number((holding as any).total_shares)
    const saleProceeds = data.close_price * heldShares
    const costBasis = (thisSell ? thisSell.avg_cost : Number((holding as any).average_price)) * heldShares
    const openingCommissions = thisSell ? thisSell.buy_commission : 0
    const closingCommission = data.commission || 0
    const profitLoss = thisSell
      ? thisSell.realized_pl
      : saleProceeds - costBasis - openingCommissions - closingCommission

    // Close the holding
    await DB.prepare(`
      UPDATE stock_holdings SET
        is_open = 0,
        closed_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      data.close_date,
      holdingId,
      userId
    ).run()
    
    return c.json({ 
      success: true, 
      message: 'Position closed successfully', 
      profit_loss: profitLoss,
      sale_proceeds: saleProceeds,
      cost_basis: costBasis,
      total_commissions: openingCommissions + closingCommission
    })
  } catch (error) {
    console.error('Close stock position error:', error)
    return c.json({ error: 'Failed to close stock position' }, 500)
  }
})

// Edit one SELL (date, price, commission). P/L is always replayed from the transactions, so saving
// the corrected sell re-books realized P/L everywhere. Shares and sells created by an option
// assignment are not editable here.
routes.put('/api/stocks/:id/sells/:txId', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = Number(c.req.param('id'))
    const txId = Number(c.req.param('txId'))
    const data = await c.req.json()
    const { DB } = c.env

    const holding = await DB.prepare(`SELECT * FROM stock_holdings WHERE id = ? AND user_id = ?`).bind(holdingId, userId).first() as any
    if (!holding) return c.json({ error: 'Stock holding not found' }, 404)

    const txs = await DB.prepare(`
      SELECT id, holding_id, transaction_type, shares, price_per_share, transaction_date, commission, option_trade_id
      FROM stock_transactions WHERE holding_id = ?
    `).bind(holdingId).all()
    const rows = (txs.results || []) as any[]
    const target = rows.find(t => t.id === txId)
    if (target && target.option_trade_id) {
      return c.json({ error: 'This sale came from an option assignment; edit the option trade instead' }, 409)
    }

    const preview = previewSellEdit(rows, txId, {
      date: data.transaction_date, price: data.price_per_share, commission: data.commission
    })
    if (!preview.ok) return c.json({ error: preview.error }, preview.status)

    await DB.prepare(`UPDATE stock_transactions SET transaction_date = ?, price_per_share = ?, commission = ? WHERE id = ? AND holding_id = ?`)
      .bind(data.transaction_date, Number(data.price_per_share), Number(data.commission) || 0, txId, holdingId).run()

    // A closed holding's closed date follows its latest sale.
    if (holding.is_open === 0) {
      const latest = preview.sells.reduce((d, s) => (s.sell_date > d ? s.sell_date : d), '')
      if (latest) await DB.prepare(`UPDATE stock_holdings SET closed_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`).bind(latest, holdingId, userId).run()
    }

    return c.json({ success: true, realized_pl: preview.sell.realized_pl, total_realized_pl: preview.totalRealized })
  } catch (error) {
    console.error('Edit stock sell error:', error)
    return c.json({ error: 'Failed to update sell' }, 500)
  }
})

routes.put('/api/stocks/:id/reopen', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT * FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    if (holding.is_open === 1) {
      return c.json({ error: 'Position is already open' }, 400)
    }
    
    // Delete only the FINAL SELL (the one that closed the position). Earlier partial sells are
    // real history with their own realized P/L and must survive a re-open.
    // User may need to reopen for various reasons: adding dividends, fixing data, etc.
    const finalSell = await DB.prepare(`
      SELECT id FROM stock_transactions
      WHERE holding_id = ? AND transaction_type = 'SELL'
      ORDER BY transaction_date DESC, id DESC
      LIMIT 1
    `).bind(holdingId).first() as any

    if (finalSell) {
      await DB.prepare(`DELETE FROM stock_transactions WHERE id = ?`).bind(finalSell.id).run()
    }

    // A position closed by selling down to 0 has total_shares = 0: restore it from the
    // remaining transactions (buys minus the earlier partial sells).
    let restoredShares: number | null = null
    if (Number(holding.total_shares) === 0) {
      const net = await DB.prepare(`
        SELECT COALESCE(SUM(CASE WHEN transaction_type = 'BUY' THEN shares ELSE -shares END), 0) as net_shares
        FROM stock_transactions
        WHERE holding_id = ?
      `).bind(holdingId).first() as any
      if (net && net.net_shares > 0) restoredShares = net.net_shares
    }

    // Re-open the holding
    await DB.prepare(`
      UPDATE stock_holdings SET
        is_open = 1,
        closed_date = NULL,
        total_shares = COALESCE(?, total_shares),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(restoredShares, holdingId, userId).run()
    
    return c.json({ success: true, message: 'Position re-opened successfully' })
  } catch (error) {
    console.error('Re-open stock holding error:', error)
    return c.json({ error: 'Failed to re-open stock position' }, 500)
  }
})

routes.delete('/api/stocks/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Delete all transactions for this holding (CASCADE will handle this in DB)
    // But we'll do it explicitly for clarity
    await DB.prepare(`
      DELETE FROM stock_transactions WHERE holding_id = ?
    `).bind(holdingId).run()
    
    // Delete any cost basis adjustments
    await DB.prepare(`
      DELETE FROM cost_basis_adjustments WHERE holding_id = ?
    `).bind(holdingId).run()
    
    // Delete the holding itself
    await DB.prepare(`
      DELETE FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Delete stock holding error:', error)
    return c.json({ error: 'Failed to delete stock holding' }, 500)
  }
})

// Get cost basis adjustments for a stock holding
routes.get('/api/stocks/:id/cost-basis-adjustments', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Get all cost basis adjustments
    const adjustments = await DB.prepare(`
      SELECT * FROM cost_basis_adjustments
      WHERE holding_id = ?
      ORDER BY adjustment_date DESC
    `).bind(holdingId).all()
    
    return c.json(adjustments.results || [])
  } catch (error) {
    console.error('Get cost basis adjustments error:', error)
    return c.json({ error: 'Failed to fetch cost basis adjustments' }, 500)
  }
})

// Get assignment history (short puts that created this stock position)
routes.get('/api/stocks/:id/assignment-history', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT id, ticker, company_id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first() as any
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Find option trades that were assigned to create stock for this holding
    // These are Short Put options that:
    // 1. Match the company_id
    // 2. Are closed (is_open = 0)
    // 3. Have close_price = 0 (indicating assignment)
    // 4. Have notes containing "ASSIGNED"
    const assignments = await DB.prepare(`
      SELECT 
        ot.*,
        cba.amount as premium_adjustment,
        cba.adjustment_date
      FROM option_trades ot
      LEFT JOIN cost_basis_adjustments cba 
        ON cba.holding_id = ? 
        AND cba.adjustment_type = 'SELLING_PUT'
        AND cba.notes LIKE '%' || ot.quantity || ' contract%'
      WHERE ot.user_id = ?
        AND ot.company_id = ?
        AND ot.is_open = 0
        AND ot.close_price = 0
        AND (ot.strategy_type = 'SELLING_PUT' OR ot.strategy_type = 'SELLING_PUT_WHEEL' OR ot.strategy_type = 'SELLING_PUT_LONG_TERM')
        AND (ot.notes LIKE '%ASSIGNED%' OR ot.notes LIKE '%assigned%')
      ORDER BY ot.close_date DESC
    `).bind(holdingId, userId, holding.company_id).all()
    
    return c.json(assignments.results || [])
  } catch (error) {
    console.error('Get assignment history error:', error)
    return c.json({ error: 'Failed to fetch assignment history' }, 500)
  }
})

// ============================================================================
// STOCK TRADE - DIVIDENDS & COVERED CALLS
// ============================================================================

// Get dividend history for a stock trade
routes.get('/api/stocks/:id/dividends', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Get dividend adjustments
    const dividends = await DB.prepare(`
      SELECT * FROM cost_basis_adjustments
      WHERE holding_id = ? AND adjustment_type = 'DIVIDEND'
      ORDER BY adjustment_date DESC
    `).bind(holdingId).all()
    
    return c.json(dividends.results || [])
  } catch (error) {
    console.error('Get dividends error:', error)
    return c.json({ error: 'Failed to fetch dividends' }, 500)
  }
})

// Get missing dividends from dividend repository
routes.get('/api/stocks/:id/missing-dividends', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Get holding details including ticker, account, opened/closed dates, and total_shares
    const holding = await DB.prepare(`
      SELECT 
        sh.id, sh.user_id, sh.opened_date, sh.closed_date,
        sh.ticker, sh.total_shares, a.account_type
      FROM stock_holdings sh
      JOIN accounts a ON sh.account_id = a.id
      WHERE sh.id = ? AND sh.user_id = ?
    `).bind(holdingId, userId).first() as any
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    console.log('[DEBUG] Missing dividends request:', {
      holdingId,
      ticker: holding.ticker,
      accountType: holding.account_type,
      openedDate: holding.opened_date,
      closedDate: holding.closed_date
    })
    
    // Determine date range for dividend matching
    const startDate = holding.opened_date
    const endDate = holding.closed_date || new Date().toISOString().split('T')[0]
    
    console.log('[DEBUG] Date range for dividends:', { startDate, endDate })
    
    // Get all dividends from repository for this ticker in date range
    const repositoryDividends = await DB.prepare(`
      SELECT * FROM dividend_repository
      WHERE ticker = ? 
        AND ex_date >= ? 
        AND ex_date <= ?
        AND status = 'active'
      ORDER BY ex_date DESC
    `).bind(holding.ticker, startDate, endDate).all()
    
    console.log('[DEBUG] Repository dividends found:', repositoryDividends.results?.length || 0)
    
    // Get already recorded dividends with amount and date for smarter matching
    const recordedDividends = await DB.prepare(`
      SELECT amount, adjustment_date, notes FROM cost_basis_adjustments
      WHERE holding_id = ? AND adjustment_type = 'DIVIDEND'
    `).bind(holdingId).all()
    
    console.log('[DEBUG] Already recorded dividends:', recordedDividends.results?.length || 0)
    
    // Helper function to check if dates are within N days of each other
    const datesWithinDays = (date1: string, date2: string, days: number): boolean => {
      const d1 = new Date(date1)
      const d2 = new Date(date2)
      const diffTime = Math.abs(d2.getTime() - d1.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      return diffDays <= days
    }
    
    // Helper function to check if a dividend is already recorded
    const isDividendRecorded = (repoDiv: any, sharesHeld: number): boolean => {
      // Calculate what the total amount would be (with withholding if applicable)
      let expectedAmount = repoDiv.amount * sharesHeld
      if (holding.account_type === 'Cash' || holding.account_type === 'TFSA') {
        expectedAmount = expectedAmount * 0.8 // Apply 20% withholding
      }
      
      for (const recorded of (recordedDividends.results || [])) {
        const rec = recorded as any
        
        // Extract ex_date from notes
        const exDateMatch = rec.notes?.match(/Ex-date: (\d{4}-\d{2}-\d{2})/)
        const recordedExDate = exDateMatch ? exDateMatch[1] : null
        
        // Match 1: Exact ex_date match from notes
        if (recordedExDate && recordedExDate === repoDiv.ex_date) {
          console.log('[DEBUG] Match via exact ex_date:', repoDiv.ex_date)
          return true
        }
        
        // Match 2: Exact pay_date match (user entered accurate dividend)
        // Don't require amount match since user may have entered actual amount
        // vs our estimated withholding calculation
        if (repoDiv.pay_date && rec.adjustment_date === repoDiv.pay_date) {
          console.log('[DEBUG] Match via exact pay_date:', {
            adjustmentDate: rec.adjustment_date,
            payDate: repoDiv.pay_date,
            note: 'Ignoring amount mismatch - user may have accurate amount'
          })
          return true
        }
        
        // Match 3: Per-share amount match + date proximity
        // Need to reverse withholding tax to get original per-share amount
        let perShareRecorded = rec.amount / sharesHeld
        if (holding.account_type === 'Cash' || holding.account_type === 'TFSA') {
          perShareRecorded = perShareRecorded / 0.8 // Reverse the 20% withholding
        }
        const perShareRepo = repoDiv.amount
        
        // Check if per-share amounts are very close (within 0.0001)
        const amountMatch = Math.abs(perShareRecorded - perShareRepo) < 0.0001
        
        // Check if adjustment_date is close to pay_date OR ex_date (within 3 days)
        let dateMatch = false
        
        // Check against pay_date if it exists (within 3 days, not exact)
        if (repoDiv.pay_date) {
          dateMatch = datesWithinDays(rec.adjustment_date, repoDiv.pay_date, 3)
          if (dateMatch) {
            console.log('[DEBUG] Date match via pay_date (within 3 days):', {
              adjustmentDate: rec.adjustment_date,
              payDate: repoDiv.pay_date
            })
          }
        }
        
        // Also check against ex_date if pay_date didn't match
        if (!dateMatch) {
          dateMatch = datesWithinDays(rec.adjustment_date, repoDiv.ex_date, 3)
          if (dateMatch) {
            console.log('[DEBUG] Date match via ex_date (within 3 days):', {
              adjustmentDate: rec.adjustment_date,
              exDate: repoDiv.ex_date
            })
          }
        }
        
        if (amountMatch && dateMatch) {
          console.log('[DEBUG] Found match via amount+date proximity:', {
            repoExDate: repoDiv.ex_date,
            recordedAdjDate: rec.adjustment_date,
            perShareMatch: perShareRecorded.toFixed(4) + ' ≈ ' + perShareRepo.toFixed(4)
          })
          return true
        } else if (amountMatch || dateMatch) {
          // Log near-misses for debugging
          console.log('[DEBUG] Near miss:', {
            amountMatch,
            dateMatch,
            perShareRecorded: perShareRecorded.toFixed(4),
            perShareRepo: perShareRepo.toFixed(4),
            adjustmentDate: rec.adjustment_date,
            exDate: repoDiv.ex_date,
            payDate: repoDiv.pay_date
          })
        }
      }
      
      return false
    }
    
    // Get all stock transactions to calculate shares held on each ex_date
    const transactions = await DB.prepare(`
      SELECT transaction_date, transaction_type, shares
      FROM stock_transactions
      WHERE holding_id = ?
      ORDER BY transaction_date ASC
    `).bind(holdingId).all()
    
    // Calculate shares held on a given date based on transaction history
    const getSharesHeldOnDate = (targetDate: string) => {
      // CRITICAL: We MUST have transaction history to calculate accurate share ownership
      // Using current total_shares for all historical dates is WRONG
      // Example: If you bought 100 shares in Jan, then bought 100 more in March,
      // a February dividend should only use 100 shares, not 200!
      if (!transactions.results || transactions.results.length === 0) {
        console.warn(`[DIVIDEND] No transaction history for holding ${holdingId}. Cannot calculate historical share ownership.`)
        return 0  // Return 0 instead of using current total_shares
      }
      
      // Calculate shares from transaction history
      let sharesHeld = 0
      for (const tx of (transactions.results || [])) {
        const txData = tx as any
        if (txData.transaction_date <= targetDate) {
          if (txData.transaction_type === 'BUY') {
            sharesHeld += txData.shares
          } else if (txData.transaction_type === 'SELL') {
            sharesHeld -= txData.shares
          }
        }
      }
      return sharesHeld
    }
    
    // Filter out already recorded dividends and calculate missing ones
    const missingDividends = []
    for (const div of (repositoryDividends.results || [])) {
      const dividend = div as any
      
      // Calculate shares held on ex_date first (needed for matching)
      const sharesHeld = getSharesHeldOnDate(dividend.ex_date)
      
      // Skip if no shares held on that date
      if (sharesHeld <= 0) {
        continue
      }
      
      // Skip if already recorded (using smart matching)
      if (isDividendRecorded(dividend, sharesHeld)) {
        continue
      }
      
      // Calculate total amount
      let totalAmount = dividend.amount * sharesHeld
      
      // Apply withholding tax for CASH and TFSA accounts
      let withholdingNote = ''
      if (holding.account_type === 'Cash' || holding.account_type === 'TFSA') {
        totalAmount = totalAmount * 0.8 // Reduce by 20%
        withholdingNote = ' (20% withholding tax applied)'
      }
      
      missingDividends.push({
        id: dividend.id,
        ticker: dividend.ticker,
        ex_date: dividend.ex_date,
        pay_date: dividend.pay_date,
        amount_per_share: dividend.amount,
        shares_held: sharesHeld,
        total_amount: totalAmount,
        frequency: dividend.frequency,
        withholding_note: withholdingNote,
        account_type: holding.account_type
      })
    }
    
    console.log('[DEBUG] Missing dividends to return:', missingDividends.length)
    console.log('[DEBUG] Missing dividends detail:', missingDividends)
    
    return c.json(missingDividends)
  } catch (error) {
    console.error('Get missing dividends error:', error)
    return c.json({ error: 'Failed to fetch missing dividends' }, 500)
  }
})

// Record a dividend payment
routes.post('/api/stocks/:id/dividends', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Validation
    if (!data.amount || !data.payment_date) {
      return c.json({ error: 'Amount and payment date are required' }, 400)
    }
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Insert dividend adjustment
    const result = await DB.prepare(`
      INSERT INTO cost_basis_adjustments (
        user_id, holding_id, adjustment_type, amount, adjustment_date, notes
      ) VALUES (?, ?, 'DIVIDEND', ?, ?, ?)
    `).bind(
      userId,
      holdingId,
      data.amount,
      data.payment_date,
      data.notes || null
    ).run()
    
    return c.json({
      id: result.meta.last_row_id,
      message: 'Dividend recorded successfully'
    })
  } catch (error) {
    console.error('Record dividend error:', error)
    return c.json({ error: 'Failed to record dividend' }, 500)
  }
})

// Add a missing dividend from repository
routes.post('/api/stocks/:id/add-missing-dividend', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Validation
    if (!data.dividend_repo_id || !data.total_amount || !data.ex_date) {
      return c.json({ error: 'Missing required fields' }, 400)
    }
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT sh.id, c.ticker 
      FROM stock_holdings sh
      JOIN companies c ON sh.company_id = c.id
      WHERE sh.id = ? AND sh.user_id = ?
    `).bind(holdingId, userId).first() as any
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Get dividend details from repository
    const dividend = await DB.prepare(`
      SELECT * FROM dividend_repository WHERE id = ?
    `).bind(data.dividend_repo_id).first() as any
    
    if (!dividend) {
      return c.json({ error: 'Dividend not found in repository' }, 404)
    }
    
    // Verify ticker matches
    if (dividend.ticker !== holding.ticker) {
      return c.json({ error: 'Dividend ticker does not match holding' }, 400)
    }
    
    // Build notes with ex_date for tracking (stored for matching logic)
    // Format today's date as MM/DD/YYYY
    const today = new Date()
    const addedDate = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`
    
    // Simple note for display, but include ex_date for duplicate detection
    const notes = `Added ${addedDate}. Ex-date: ${data.ex_date}`
    
    // Use pay_date if provided, otherwise use ex_date
    const adjustmentDate = data.pay_date || data.ex_date
    
    // Insert dividend adjustment
    const result = await DB.prepare(`
      INSERT INTO cost_basis_adjustments (
        user_id, holding_id, adjustment_type, amount, adjustment_date, notes
      ) VALUES (?, ?, 'DIVIDEND', ?, ?, ?)
    `).bind(
      userId,
      holdingId,
      data.total_amount,
      adjustmentDate,
      notes
    ).run()
    
    return c.json({
      id: result.meta.last_row_id,
      message: 'Dividend added successfully'
    })
  } catch (error) {
    console.error('Add missing dividend error:', error)
    return c.json({ error: 'Failed to add dividend' }, 500)
  }
})

// Get covered call history for a stock trade
routes.get('/api/stocks/:id/covered-calls', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Verify holding belongs to user and get account info
    const holding = await DB.prepare(`
      SELECT sh.id, sh.ticker, sh.account_id, a.account_name, a.account_type
      FROM stock_holdings sh
      LEFT JOIN accounts a ON sh.account_id = a.id
      WHERE sh.id = ? AND sh.user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Get covered calls for this ticker AND specific account_id only
    // Also get account info for display
    // Filter by account_id to prevent cross-account showing (important for multiple Cash/RRSP accounts)
    const coveredCalls = await DB.prepare(`
      SELECT 
        ot.*,
        a.account_name,
        a.account_type as account_type_name
      FROM option_trades ot
      LEFT JOIN accounts a ON ot.account_id = a.id
      WHERE ot.user_id = ? AND ot.ticker = ? AND ot.account_id = ? AND ot.strategy_type = 'COVERED_CALL'
      ORDER BY ot.trade_date DESC
    `).bind(userId, holding.ticker, holding.account_id).all()
    
    return c.json(coveredCalls.results || [])
  } catch (error) {
    console.error('Get covered calls error:', error)
    return c.json({ error: 'Failed to fetch covered calls' }, 500)
  }
})

// Diagnostic endpoint: Get all covered calls for a ticker (regardless of account_id)
routes.get('/api/stocks/:id/all-covered-calls', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Get holding info
    const holding = await DB.prepare(`
      SELECT sh.id, sh.ticker, sh.account_id, a.account_name as holding_account_name
      FROM stock_holdings sh
      LEFT JOIN accounts a ON sh.account_id = a.id
      WHERE sh.id = ? AND sh.user_id = ?
    `).bind(holdingId, userId).first() as any
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Get ALL covered calls for this ticker (any account)
    const allCoveredCalls = await DB.prepare(`
      SELECT 
        ot.*,
        a.account_name as cc_account_name,
        a.account_type as cc_account_type,
        CASE 
          WHEN ot.account_id = ? THEN 1 
          ELSE 0 
        END as matches_holding
      FROM option_trades ot
      LEFT JOIN accounts a ON ot.account_id = a.id
      WHERE ot.user_id = ? AND ot.ticker = ? AND ot.strategy_type = 'COVERED_CALL'
      ORDER BY matches_holding DESC, ot.trade_date DESC
    `).bind(holding.account_id, userId, holding.ticker).all()
    
    return c.json({
      holding_info: {
        id: holding.id,
        ticker: holding.ticker,
        account_id: holding.account_id,
        account_name: holding.holding_account_name
      },
      covered_calls: allCoveredCalls.results || []
    })
  } catch (error) {
    console.error('Get all covered calls error:', error)
    return c.json({ error: 'Failed to fetch covered calls' }, 500)
  }
})

// Link a covered call to a stock holding (update account_id)
routes.put('/api/covered-calls/:ccId/link-to-holding/:holdingId', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const ccId = c.req.param('ccId')
    const holdingId = c.req.param('holdingId')
    const { DB } = c.env
    
    // Verify covered call belongs to user
    const coveredCall = await DB.prepare(`
      SELECT * FROM option_trades 
      WHERE id = ? AND user_id = ? AND strategy_type = 'COVERED_CALL'
    `).bind(ccId, userId).first() as any
    
    if (!coveredCall) {
      return c.json({ error: 'Covered call not found' }, 404)
    }
    
    // Verify holding belongs to user
    const holding = await DB.prepare(`
      SELECT sh.id, sh.ticker, sh.account_id, a.account_type
      FROM stock_holdings sh
      LEFT JOIN accounts a ON sh.account_id = a.id
      WHERE sh.id = ? AND sh.user_id = ?
    `).bind(holdingId, userId).first() as any
    
    if (!holding) {
      return c.json({ error: 'Stock holding not found' }, 404)
    }
    
    // Verify ticker matches
    if (coveredCall.ticker !== holding.ticker) {
      return c.json({ 
        error: `Ticker mismatch: Covered call is for ${coveredCall.ticker}, holding is for ${holding.ticker}` 
      }, 400)
    }
    
    // Update covered call's account_id and account_type to match holding
    await DB.prepare(`
      UPDATE option_trades 
      SET account_id = ?, account_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(holding.account_id, holding.account_type, ccId).run()
    
    return c.json({ 
      success: true,
      message: `Covered call ${ccId} linked to holding ${holdingId} (account: ${holding.account_id})`
    })
  } catch (error) {
    console.error('Link covered call error:', error)
    return c.json({ error: 'Failed to link covered call' }, 500)
  }
})

// Record a covered call
routes.post('/api/stocks/:id/covered-calls', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Validation
    if (!data.strike_price || !data.premium || !data.quantity || !data.expiration_date || !data.trade_date) {
      return c.json({ error: 'All fields are required' }, 400)
    }
    
    // Verify holding belongs to user and get details
    const holding = await DB.prepare(`
      SELECT id, ticker, total_shares, company_id, account_id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first()
    
    if (!holding) {
      return c.json({ error: 'Holding not found' }, 404)
    }
    
    // Verify user has enough shares (need 100 shares per contract)
    const sharesNeeded = data.quantity * 100
    if (holding.total_shares < sharesNeeded) {
      return c.json({ 
        error: `Insufficient shares. Need ${sharesNeeded} shares, have ${holding.total_shares}` 
      }, 400)
    }
    
    // Get account_type from accounts table
    const account = await DB.prepare(`
      SELECT account_type FROM accounts WHERE id = ?
    `).bind(holding.account_id).first()
    
    // Insert covered call as an option trade with account_id for proper association
    const optionResult = await DB.prepare(`
      INSERT INTO option_trades (
        user_id, company_id, ticker, strategy_type, strike_price, premium, quantity,
        expiration_date, account_type, account_id, trade_date, is_open, commission, notes
      ) VALUES (?, ?, ?, 'COVERED_CALL', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      userId,
      holding.company_id,
      holding.ticker,
      data.strike_price,
      data.premium,
      data.quantity,
      data.expiration_date,
      account?.account_type,
      holding.account_id,  // Store account_id for proper association
      data.trade_date,
      data.commission || 0,
      data.notes || null
    ).run()
    
    // NOTE: Cost basis adjustment is NOT created when opening a covered call
    // It will be created when the covered call is closed, using the actual net P/L
    
    return c.json({
      id: optionResult.meta.last_row_id,
      message: 'Covered call recorded successfully'
    })
  } catch (error) {
    console.error('Record covered call error:', error)
    return c.json({ error: 'Failed to record covered call' }, 500)
  }
})

// Close a covered call
routes.put('/api/covered-calls/:id/close', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const ccId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Verify covered call belongs to user and get details
    const cc = await DB.prepare(`
      SELECT ot.*
      FROM option_trades ot
      WHERE ot.id = ? AND ot.user_id = ? AND ot.strategy_type = 'COVERED_CALL'
    `).bind(ccId, userId).first()
    
    if (!cc) {
      return c.json({ error: 'Covered call not found' }, 404)
    }
    
    if (cc.is_open === 0) {
      return c.json({ error: 'Covered call is already closed' }, 400)
    }
    
    // Calculate profit/loss
    const openCommission = parseFloat(cc.commission) || 0
    // Support both 'close_commission' and 'commission' in request body for backward compatibility
    const closeCommission = parseFloat(data.close_commission || data.commission) || 0
    const openPremium = parseFloat(cc.premium)
    const closePremium = parseFloat(data.close_price) || 0
    const contracts = parseInt(cc.quantity)
    
    const profitLoss = optionPL({ strategy: 'COVERED_CALL', contracts, open: { premium: openPremium }, close: { close_price: closePremium }, openCommission, closeCommission })
    
    // Close the covered call
    await DB.prepare(`
      UPDATE option_trades SET
        is_open = 0,
        close_date = ?,
        close_price = ?,
        close_commission = ?,
        profit_loss = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      data.close_date || new Date().toISOString().split('T')[0],
      data.close_price || 0,
      closeCommission,
      profitLoss,
      ccId,
      userId
    ).run()
    
    // The covered call's P/L becomes (or updates) its one cost-basis adjustment
    await syncCoveredCallAdjustment(DB, userId, ccId)
    
    return c.json({ 
      success: true, 
      message: 'Covered call closed successfully',
      profit_loss: profitLoss 
    })
  } catch (error) {
    console.error('Close covered call error:', error)
    return c.json({ error: 'Failed to close covered call' }, 500)
  }
})

// Edit a covered call
routes.put('/api/covered-calls/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const ccId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Verify covered call belongs to user
    const cc = await DB.prepare(`
      SELECT id FROM option_trades 
      WHERE id = ? AND user_id = ? AND strategy_type = 'COVERED_CALL'
    `).bind(ccId, userId).first()
    
    if (!cc) {
      return c.json({ error: 'Covered call not found' }, 404)
    }
    
    // If holding_id is provided, update account_id to match the holding's account
    // This fixes any existing covered calls with incorrect or NULL account_id
    let accountIdToSet = null
    if (data.holding_id) {
      const holding = await DB.prepare(`
        SELECT account_id FROM stock_holdings WHERE id = ? AND user_id = ?
      `).bind(data.holding_id, userId).first()
      
      if (holding) {
        accountIdToSet = holding.account_id
      }
    }
    
    // Update the covered call (including account_id if we have it)
    if (accountIdToSet !== null) {
      await DB.prepare(`
        UPDATE option_trades SET
          strike_price = ?,
          premium = ?,
          quantity = ?,
          expiration_date = ?,
          trade_date = ?,
          commission = ?,
          close_date = ?,
          close_price = ?,
          close_commission = ?,
          notes = ?,
          account_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).bind(
        data.strike_price,
        data.premium,
        data.quantity,
        data.expiration_date,
        data.trade_date,
        data.commission || 0,
        data.close_date || null,
        data.close_price ?? null,
        data.close_commission || null,
        data.notes || null,
        accountIdToSet,
        ccId,
        userId
      ).run()
    } else {
      // No holding_id provided, update without changing account_id
      await DB.prepare(`
        UPDATE option_trades SET
          strike_price = ?,
          premium = ?,
          quantity = ?,
          expiration_date = ?,
          trade_date = ?,
          commission = ?,
          close_date = ?,
          close_price = ?,
          close_commission = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).bind(
        data.strike_price,
        data.premium,
        data.quantity,
        data.expiration_date,
        data.trade_date,
        data.commission || 0,
        data.close_date || null,
        data.close_price ?? null,
        data.close_commission || null,
        data.notes || null,
        ccId,
        userId
      ).run()
    }
    
    // Recalculate profit_loss and is_open if close fields are provided
    if (data.close_date && data.close_price !== null && data.close_price !== undefined) {
      const openCommission = parseFloat(data.commission) || 0
      const closeCommission = parseFloat(data.close_commission) || 0
      const openPremium = parseFloat(data.premium)
      const closePremium = parseFloat(data.close_price)
      const contracts = parseInt(data.quantity)
      
      const profitLoss = optionPL({ strategy: 'COVERED_CALL', contracts, open: { premium: openPremium }, close: { close_price: closePremium }, openCommission, closeCommission })
      
      await DB.prepare(`
        UPDATE option_trades SET
          profit_loss = ?,
          is_open = 0
        WHERE id = ? AND user_id = ?
      `).bind(profitLoss, ccId, userId).run()
    } else if (!data.close_date) {
      // If close_date is removed, mark as open and clear P/L
      await DB.prepare(`
        UPDATE option_trades SET
          profit_loss = NULL,
          is_open = 1
        WHERE id = ? AND user_id = ?
      `).bind(ccId, userId).run()
    }
    
    await syncCoveredCallAdjustment(DB, userId, ccId)
    
    return c.json({ success: true, message: 'Covered call updated successfully' })
  } catch (error) {
    console.error('Edit covered call error:', error)
    return c.json({ error: 'Failed to edit covered call' }, 500)
  }
})

// Get details of a specific covered call
routes.get('/api/covered-calls/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const ccId = c.req.param('id')
    const { DB } = c.env
    
    const cc = await DB.prepare(`
      SELECT ot.*, c.company_name 
      FROM option_trades ot
      LEFT JOIN companies c ON ot.company_id = c.id
      WHERE ot.id = ? AND ot.user_id = ? AND ot.strategy_type = 'COVERED_CALL'
    `).bind(ccId, userId).first()
    
    if (!cc) {
      return c.json({ error: 'Covered call not found' }, 404)
    }
    
    return c.json(cc)
  } catch (error) {
    console.error('Get covered call error:', error)
    return c.json({ error: 'Failed to fetch covered call' }, 500)
  }
})

// Get stock purchase history for a specific stock (all buys/sells for that ticker+account)
routes.get('/api/stocks/:id/purchase-history', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const holdingId = c.req.param('id')
    const { DB } = c.env
    
    // Get the holding to extract ticker and account_id
    const holding = await DB.prepare(`
      SELECT id, ticker, account_id FROM stock_holdings WHERE id = ? AND user_id = ?
    `).bind(holdingId, userId).first() as any
    
    if (!holding) {
      return c.json({ error: 'Stock holding not found' }, 404)
    }
    
    // Get all transactions for this holding
    const transactions = await DB.prepare(`
      SELECT 
        st.id,
        st.transaction_type as trade_type,
        st.shares as quantity,
        st.price_per_share as price,
        st.transaction_date as trade_date,
        st.commission,
        st.notes,
        st.option_trade_id,
        a.account_name,
        1 as is_open
      FROM stock_transactions st
      LEFT JOIN accounts a ON a.id = ?
      WHERE st.holding_id = ?
      ORDER BY st.transaction_date DESC, st.id DESC
    `).bind(holding.account_id, holdingId).all()

    // Attach each SELL's realized P/L (average cost at the time of sale, pro-rata buy commissions)
    const sells = await loadRealizedSells(DB, userId, { holdingId: Number(holdingId) })
    const sellById = new Map(sells.map(s => [s.transaction_id, s]))
    const rows = (transactions.results || []).map((tx: any) => {
      const s = sellById.get(tx.id)
      return s
        ? { ...tx, avg_cost: s.avg_cost, realized_pl: s.realized_pl, shares_remaining: s.shares_remaining }
        : tx
    })

    return c.json(rows)
  } catch (error) {
    console.error('Get purchase history error:', error)
    return c.json({ error: 'Failed to fetch purchase history' }, 500)
  }
})
