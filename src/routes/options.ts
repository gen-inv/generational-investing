import { Hono } from 'hono'
import { optionPL, assignmentPL, grossPremium as calcGrossPremium, splitOptionCommission } from '../lib/calc'
import { syncCoveredCallAdjustment } from '../lib/cc-adjustment'
import { syncPutAssignment } from '../lib/put-assignment'
import type { PutAssignmentChange } from '../lib/put-assignment'
import { authMiddleware } from '../lib/auth'
import type { Bindings } from '../types'

export const routes = new Hono<{ Bindings: Bindings }>()

// ============================================================================
// OPTION TRADES ROUTES
// ============================================================================

// ---- Multi-leg option helpers -------------------------------------------
// Leg n is stored in strike_price[_n] / premium[_n] / close_price[_n].
// Spreads: leg1 = short, leg2 = long.  Iron condor: short call, long call, short put, long put.
const LEG_KEYS: Record<string, string[][]> = {
  CREDIT_SPREAD: [['short_strike', 'short_premium'], ['long_strike', 'long_premium']],
  DEBIT_SPREAD: [['short_strike', 'short_premium'], ['long_strike', 'long_premium']],
  IRON_CONDOR: [
    ['short_call_strike', 'short_call_premium'], ['long_call_strike', 'long_call_premium'],
    ['short_put_strike', 'short_put_premium'], ['long_put_strike', 'long_put_premium']
  ]
}
const LEG_STRIKE_COLS = ['strike_price', 'strike_price_2', 'strike_price_3', 'strike_price_4']
const LEG_PREMIUM_COLS = ['premium', 'premium_2', 'premium_3', 'premium_4']

// Form payload (short_strike, long_premium, ...) -> DB columns. Mutates data.
// Returns an error message, or null. Payloads without leg fields pass through untouched.
function applyLegFields(data: any): string | null {
  const legs = LEG_KEYS[data.strategy_type]
  if (!legs) return null
  if (!legs.some(([s, p]) => data[s] !== undefined || data[p] !== undefined)) return null
  for (let i = 0; i < legs.length; i++) {
    const [sKey, pKey] = legs[i]
    const strike = data[sKey] == null || data[sKey] === '' ? NaN : Number(data[sKey])
    const prem = data[pKey] == null || data[pKey] === '' ? NaN : Number(data[pKey])
    if (!Number.isFinite(strike) || strike <= 0) return `Strike is required for leg ${i + 1} (${sKey})`
    if (!Number.isFinite(prem) || prem < 0) return `Premium is required for leg ${i + 1} (${pKey})`
    data[LEG_STRIKE_COLS[i]] = strike
    data[LEG_PREMIUM_COLS[i]] = prem
  }
  return null
}

// DB row -> row plus the per-leg names the frontend reads (short_strike, long_premium, ...).
function expandLegFields(row: any): any {
  const legs = LEG_KEYS[row.strategy_type]
  if (!legs) return row
  const out = { ...row }
  legs.forEach(([sKey, pKey], i) => {
    out[sKey] = row[LEG_STRIKE_COLS[i]]
    out[pKey] = row[LEG_PREMIUM_COLS[i]]
  })
  return out
}

routes.get('/api/options', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const isOpen = c.req.query('open')
  const isClosed = c.req.query('closed')
  
  let query = `
    SELECT 
      ot.*,
      a.account_name,
      a.account_type as account_type_name
    FROM option_trades ot
    LEFT JOIN accounts a ON ot.account_id = a.id
    WHERE ot.user_id = ?
  `
  let params = [userId]
  
  if (isOpen !== undefined) {
    query += ' AND ot.is_open = ?'
    params.push(isOpen === 'true' ? 1 : 0)
  } else if (isClosed !== undefined) {
    query += ' AND ot.is_open = ?'
    params.push(isClosed === 'true' ? 0 : 1)
  }
  
  // Order by close_date for closed trades, trade_date for open/all trades
  if (isClosed === 'true') {
    query += ' ORDER BY ot.close_date DESC, ot.trade_date DESC'
  } else {
    query += ' ORDER BY ot.trade_date DESC'
  }
  
  const stmt = c.env.DB.prepare(query)
  const options = await stmt.bind(...params).all()
  
  return c.json((options.results as any[]).map(expandLegFields))
})

routes.post('/api/options', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const data = await c.req.json()
    const { DB } = c.env
    
    const legError = applyLegFields(data)
    if (legError) {
      return c.json({ error: legError }, 400)
    }

    // Validation
    if (!data.company_id) {
      return c.json({ error: 'Company is required' }, 400)
    }
    
    if (!data.account_id) {
      return c.json({ error: 'Account is required' }, 400)
    }
    
    if (!data.ticker || !data.strategy_type || !data.strike_price || !data.premium || 
        !data.quantity || !data.expiration_date || !data.trade_date) {
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
    `).bind(data.account_id, userId).first() as any
    
    if (!account) {
      return c.json({ error: 'Account not found' }, 404)
    }
  
    const result = await DB.prepare(`
      INSERT INTO option_trades (
        user_id, company_id, account_id, ticker, strategy_type, strike_price,
        strike_price_2, strike_price_3, strike_price_4, premium, premium_2, premium_3, premium_4, quantity,
        expiration_date, account_type, trade_date, commission, is_open, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      data.company_id,
      data.account_id,
      data.ticker,
      data.strategy_type,
      data.strike_price,
      data.strike_price_2 || null,
      data.strike_price_3 || null,
      data.strike_price_4 || null,
      data.premium,
      data.premium_2 ?? null,
      data.premium_3 ?? null,
      data.premium_4 ?? null,
      data.quantity,
      data.expiration_date,
      account.account_type,  // Get from accounts table
      data.trade_date,
      data.commission || 0,
      data.is_open !== undefined ? (data.is_open ? 1 : 0) : 1,
      data.notes || null
    ).run()
    
    return c.json({ 
      id: result.meta.last_row_id,
      ...data,
      account_type: account.account_type,
      is_open: data.is_open !== undefined ? data.is_open : true
    }, 201)
  } catch (error) {
    console.error('Create option trade error:', error)
    return c.json({ error: 'Failed to create option trade' }, 500)
  }
})

routes.put('/api/options/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    const legError = applyLegFields(data)
    if (legError) {
      return c.json({ error: legError }, 400)
    }

    // First, get the existing trade data
    const existingTrade = await DB.prepare(`
      SELECT * FROM option_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first() as any
    
    if (!existingTrade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    // If account_id is provided, fetch account_type
    let accountType = data.account_type !== undefined ? data.account_type : existingTrade.account_type
    if (data.account_id) {
      const account = await DB.prepare(`
        SELECT account_type FROM accounts WHERE id = ? AND user_id = ?
      `).bind(data.account_id, userId).first() as any
      
      if (account) {
        accountType = account.account_type
      }
    }
    
    // An assigned short put owns a stock purchase and a premium adjustment: check the edit can be applied before changing anything
    const putMergedStrategy = data.strategy_type !== undefined ? data.strategy_type : existingTrade.strategy_type
    const putMergedClose = data.close_date !== undefined ? data.close_date : existingTrade.close_date
    const putMergedClosePrice = data.close_price !== undefined ? data.close_price : existingTrade.close_price
    const putCloses = !!(putMergedClose && putMergedClosePrice !== null && putMergedClosePrice !== undefined)
    const putReopens = !putCloses && !data.close_date
    const putStillPut = putMergedStrategy === 'SELLING_PUT' || putMergedStrategy === 'SELLING_PUT_WHEEL'
    const putChange: PutAssignmentChange = (putReopens || !putStillPut) ? { kind: 'undo' } : { kind: 'keep', option: {
      quantity: data.quantity !== undefined ? data.quantity : existingTrade.quantity,
      strike_price: data.strike_price !== undefined ? data.strike_price : existingTrade.strike_price,
      premium: data.premium !== undefined ? data.premium : existingTrade.premium,
      commission: data.commission !== undefined ? data.commission : (existingTrade.commission || 0),
      close_date: putMergedClose
    } }
    const putCheck = await syncPutAssignment(DB, userId, tradeId, putChange, 'check')
    if (!putCheck.ok) return c.json({ error: putCheck.error }, 409)

    // Build UPDATE query with only provided fields (PATCH-style)
    // D1 doesn't accept undefined, so use null as fallback
    await DB.prepare(`
      UPDATE option_trades SET
        ticker = ?, strategy_type = ?, strike_price = ?,
        strike_price_2 = ?, strike_price_3 = ?, strike_price_4 = ?,
        premium = ?, premium_2 = ?, premium_3 = ?, premium_4 = ?, quantity = ?, expiration_date = ?,
        account_type = ?, account_id = ?, trade_date = ?, commission = ?,
        close_date = ?, close_price = ?, close_price_2 = ?, close_price_3 = ?, close_price_4 = ?,
        close_commission = ?,
        notes = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      data.ticker !== undefined ? data.ticker : existingTrade.ticker,
      data.strategy_type !== undefined ? data.strategy_type : existingTrade.strategy_type,
      data.strike_price !== undefined ? data.strike_price : existingTrade.strike_price,
      data.strike_price_2 !== undefined ? data.strike_price_2 : (existingTrade.strike_price_2 ?? null),
      data.strike_price_3 !== undefined ? data.strike_price_3 : (existingTrade.strike_price_3 ?? null),
      data.strike_price_4 !== undefined ? data.strike_price_4 : (existingTrade.strike_price_4 ?? null),
      data.premium !== undefined ? data.premium : existingTrade.premium,
      data.premium_2 !== undefined ? data.premium_2 : (existingTrade.premium_2 ?? null),
      data.premium_3 !== undefined ? data.premium_3 : (existingTrade.premium_3 ?? null),
      data.premium_4 !== undefined ? data.premium_4 : (existingTrade.premium_4 ?? null),
      data.quantity !== undefined ? data.quantity : existingTrade.quantity,
      data.expiration_date !== undefined ? data.expiration_date : existingTrade.expiration_date,
      accountType,
      data.account_id !== undefined ? data.account_id : (existingTrade.account_id ?? null),
      data.trade_date !== undefined ? data.trade_date : existingTrade.trade_date,
      data.commission !== undefined ? data.commission : (existingTrade.commission ?? 0),
      data.close_date !== undefined ? data.close_date : (existingTrade.close_date ?? null),
      data.close_price !== undefined ? data.close_price : (existingTrade.close_price ?? null),
      data.close_price_2 !== undefined ? data.close_price_2 : (existingTrade.close_price_2 ?? null),
      data.close_price_3 !== undefined ? data.close_price_3 : (existingTrade.close_price_3 ?? null),
      data.close_price_4 !== undefined ? data.close_price_4 : (existingTrade.close_price_4 ?? null),
      data.close_commission !== undefined ? data.close_commission : (existingTrade.close_commission ?? null),
      data.notes !== undefined ? data.notes : (existingTrade.notes ?? null),
      tradeId,
      userId
    ).run()
    
    // Merge data with existing trade for calculations
    const mergedData = {
      ticker: data.ticker !== undefined ? data.ticker : existingTrade.ticker,
      strategy_type: data.strategy_type !== undefined ? data.strategy_type : existingTrade.strategy_type,
      strike_price: data.strike_price !== undefined ? data.strike_price : existingTrade.strike_price,
      strike_price_2: data.strike_price_2 !== undefined ? data.strike_price_2 : existingTrade.strike_price_2,
      strike_price_3: data.strike_price_3 !== undefined ? data.strike_price_3 : existingTrade.strike_price_3,
      strike_price_4: data.strike_price_4 !== undefined ? data.strike_price_4 : existingTrade.strike_price_4,
      premium: data.premium !== undefined ? data.premium : existingTrade.premium,
      premium_2: data.premium_2 !== undefined ? data.premium_2 : existingTrade.premium_2,
      premium_3: data.premium_3 !== undefined ? data.premium_3 : existingTrade.premium_3,
      premium_4: data.premium_4 !== undefined ? data.premium_4 : existingTrade.premium_4,
      quantity: data.quantity !== undefined ? data.quantity : existingTrade.quantity,
      commission: data.commission !== undefined ? data.commission : (existingTrade.commission || 0),
      close_date: data.close_date !== undefined ? data.close_date : existingTrade.close_date,
      close_price: data.close_price !== undefined ? data.close_price : existingTrade.close_price,
      close_price_2: data.close_price_2 !== undefined ? data.close_price_2 : existingTrade.close_price_2,
      close_price_3: data.close_price_3 !== undefined ? data.close_price_3 : existingTrade.close_price_3,
      close_price_4: data.close_price_4 !== undefined ? data.close_price_4 : existingTrade.close_price_4,
      close_commission: data.close_commission !== undefined ? data.close_commission : existingTrade.close_commission
    }
    
    // Recalculate profit_loss and is_open if close fields are provided
    if (mergedData.close_date && mergedData.close_price !== null && mergedData.close_price !== undefined) {
      const openCommission = mergedData.commission || 0
      const closeCommission = mergedData.close_commission || 0
      const contracts = mergedData.quantity
      const strategyType = mergedData.strategy_type
      
      const profitLoss = optionPL({
        strategy: strategyType,
        contracts,
        open: { premium: mergedData.premium, premium_2: mergedData.premium_2, premium_3: mergedData.premium_3, premium_4: mergedData.premium_4 },
        close: { close_price: mergedData.close_price, close_price_2: mergedData.close_price_2, close_price_3: mergedData.close_price_3, close_price_4: mergedData.close_price_4 },
        openCommission, closeCommission
      })
      
      await DB.prepare(`
        UPDATE option_trades SET
          profit_loss = ?,
          is_open = 0
        WHERE id = ? AND user_id = ?
      `).bind(profitLoss, tradeId, userId).run()
    } else if (!data.close_date) {
      // If close_date is removed, mark as open
      await DB.prepare(`
        UPDATE option_trades SET
          profit_loss = NULL,
          is_open = 1
        WHERE id = ? AND user_id = ?
      `).bind(tradeId, userId).run()
    }
    
    if (mergedData.strategy_type === 'COVERED_CALL') await syncCoveredCallAdjustment(DB, userId, tradeId)
    await syncPutAssignment(DB, userId, tradeId, putChange, 'apply')
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Update option trade error:', error)
    return c.json({ error: 'Failed to update option trade' }, 500)
  }
})

// Close some contracts of an open option position. The closed contracts become their own closed trade (with close date,
// close prices and P/L); the open trade keeps the rest and its share of the opening commission.
routes.post('/api/options/:id/reduce', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env

    const t = await DB.prepare(`SELECT * FROM option_trades WHERE id = ? AND user_id = ?`).bind(tradeId, userId).first() as any
    if (!t) return c.json({ error: 'Option trade not found' }, 404)
    if (!t.is_open) return c.json({ error: 'Option trade is already closed' }, 400)
    if (t.strategy_type === 'COVERED_CALL') return c.json({ error: 'Covered calls are closed from the stock details' }, 400)

    const contracts = Number(data.contracts)
    if (!Number.isInteger(contracts) || contracts < 1) return c.json({ error: 'Contracts to close must be a whole number of at least 1' }, 400)
    if (contracts >= t.quantity) return c.json({ error: 'Cannot close all contracts here. Use Close Position instead' }, 400)
    if (!data.close_date) return c.json({ error: 'Close date is required' }, 400)

    const legCount = t.strategy_type === 'IRON_CONDOR' ? 4 : (t.strategy_type === 'CREDIT_SPREAD' || t.strategy_type === 'DEBIT_SPREAD') ? 2 : 1
    const keys = ['close_price', 'close_price_2', 'close_price_3', 'close_price_4']
    const closes: Array<number | null> = []
    for (let i = 0; i < 4; i++) {
      if (i >= legCount) { closes.push(null); continue }
      const raw = data[keys[i]]
      const v = raw === null || raw === undefined || raw === '' ? NaN : Number(raw)
      if (!Number.isFinite(v) || v < 0) return c.json({ error: 'A close price is required for every leg' }, 400)
      closes.push(v)
    }
    const closeCommission = Math.max(0, Number(data.close_commission) || 0)

    const split = splitOptionCommission(t.quantity, t.commission, contracts)
    const profitLoss = optionPL({
      strategy: t.strategy_type, contracts,
      open: { premium: t.premium, premium_2: t.premium_2, premium_3: t.premium_3, premium_4: t.premium_4 },
      close: { close_price: closes[0], close_price_2: closes[1], close_price_3: closes[2], close_price_4: closes[3] },
      openCommission: split.closedCommission, closeCommission
    })

    const results = await DB.batch([
      DB.prepare(`
        INSERT INTO option_trades (
          user_id, company_id, account_id, ticker, strategy_type, strike_price, strike_price_2, strike_price_3, strike_price_4,
          premium, premium_2, premium_3, premium_4, quantity, expiration_date, account_type, trade_date, commission,
          is_open, close_date, close_price, close_price_2, close_price_3, close_price_4, close_commission, profit_loss, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId, t.company_id, t.account_id ?? null, t.ticker, t.strategy_type, t.strike_price, t.strike_price_2 ?? null, t.strike_price_3 ?? null, t.strike_price_4 ?? null,
        t.premium, t.premium_2 ?? null, t.premium_3 ?? null, t.premium_4 ?? null, contracts, t.expiration_date, t.account_type, t.trade_date, split.closedCommission,
        data.close_date, closes[0], closes[1], closes[2], closes[3], closeCommission, profitLoss, t.notes ?? null
      ),
      DB.prepare(`UPDATE option_trades SET quantity = ?, commission = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`)
        .bind(split.remainingContracts, split.remainingCommission, tradeId, userId)
    ])

    return c.json({ success: true, closed_id: results[0].meta.last_row_id, remaining_contracts: split.remainingContracts, profit_loss: profitLoss })
  } catch (error) {
    console.error('Reduce option position error:', error)
    return c.json({ error: 'Failed to reduce position' }, 500)
  }
})

routes.put('/api/options/:id/reopen', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const tradeId = c.req.param('id')
    const { DB } = c.env
    
    // Verify trade belongs to user
    const trade = await DB.prepare(`
      SELECT id, is_open FROM option_trades WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).first()
    
    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    if (trade.is_open === 1) {
      return c.json({ error: 'Trade is already open' }, 400)
    }
    
    // An assigned short put owns a stock purchase and a premium adjustment: make sure they can be reversed before changing anything
    const putCheck = await syncPutAssignment(DB, userId, tradeId, { kind: 'undo' }, 'check')
    if (!putCheck.ok) return c.json({ error: putCheck.error }, 409)

    // Re-open the trade and clear closing data
    await DB.prepare(`
      UPDATE option_trades SET
        is_open = 1,
        close_date = NULL,
        close_price = NULL,
        close_price_2 = NULL,
        close_price_3 = NULL,
        close_price_4 = NULL,
        close_commission = NULL,
        profit_loss = NULL
      WHERE id = ? AND user_id = ?
    `).bind(tradeId, userId).run()
    
    await syncCoveredCallAdjustment(DB, userId, tradeId)
    await syncPutAssignment(DB, userId, tradeId, { kind: 'undo' }, 'apply')
    
    return c.json({ success: true, message: 'Trade re-opened successfully' })
  } catch (error) {
    console.error('Re-open option trade error:', error)
    return c.json({ error: 'Failed to re-open option trade' }, 500)
  }
})

routes.delete('/api/options/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const tradeId = c.req.param('id')

  // an assigned short put owns a stock purchase and a premium adjustment: refuse if they cannot be reversed
  const putCheck = await syncPutAssignment(c.env.DB, userId, tradeId, { kind: 'undo' }, 'check')
  if (!putCheck.ok) return c.json({ error: putCheck.error }, 409)

  await c.env.DB.prepare(`
    DELETE FROM option_trades WHERE id = ? AND user_id = ?
  `).bind(tradeId, userId).run()
  // a deleted covered call takes its cost-basis adjustment with it; a deleted assigned put takes its shares and premium adjustment
  await syncCoveredCallAdjustment(c.env.DB, userId, tradeId)
  await syncPutAssignment(c.env.DB, userId, tradeId, { kind: 'undo' }, 'apply')

  return c.json({ success: true })
})

// Assign stock position from short put option
routes.post('/api/options/:id/assign', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const optionId = c.req.param('id')
    const data = await c.req.json()
    const { DB } = c.env
    
    // Fetch the option trade
    const option = await DB.prepare(`
      SELECT ot.*, c.ticker as company_ticker
      FROM option_trades ot
      JOIN companies c ON ot.company_id = c.id
      WHERE ot.id = ? AND ot.user_id = ?
    `).bind(optionId, userId).first() as any
    
    if (!option) {
      return c.json({ error: 'Option trade not found' }, 404)
    }
    
    // Use the company's ticker, not the option's ticker (which may be outdated)
    const ticker = option.company_ticker || option.ticker
    
    // Validate this is a short put strategy
    if (option.strategy_type !== 'SELLING_PUT' && option.strategy_type !== 'SELLING_PUT_WHEEL') {
      return c.json({ error: 'Assignment is only available for Short Put strategies' }, 400)
    }
    
    // Validate option is still open
    if (!option.is_open) {
      return c.json({ error: 'Option is already closed' }, 400)
    }
    
    // Validate assignment date
    if (!data.assignment_date) {
      return c.json({ error: 'Assignment date is required' }, 400)
    }
    
    // Calculate stock details
    const shares = option.quantity * 100
    const strikePrice = parseFloat(option.strike_price)
    
    // Determine strategy type based on option strategy
    const strategyType = option.strategy_type === 'SELLING_PUT_WHEEL' ? 'WHEEL' : 'STOCKPILING'
    
    // Start transaction: Close option and create stock position
    // 1. Close the option with $0 close price (assignment = max profit for short put)
    // When assigned: you keep all the premium collected (minus commission)
    const grossPremium = calcGrossPremium(option.premium, option.quantity)
    const openCommission = parseFloat(option.commission || 0)
    const profitLoss = assignmentPL({ premium: option.premium, contracts: option.quantity, openCommission }) // premium collected minus commission paid
    
    await DB.prepare(`
      UPDATE option_trades
      SET is_open = 0,
          close_date = ?,
          close_price = 0,
          close_commission = 0,
          profit_loss = ?,
          notes = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      data.assignment_date,
      profitLoss,
      option.notes ? `${option.notes}\n\nASSIGNED: ${data.notes || 'Stock position created from assignment'}` : `ASSIGNED: ${data.notes || 'Stock position created from assignment'}`,
      optionId,
      userId
    ).run()
    
    // 2. Check if stock holding already exists for this ticker + account
    const existingHolding = await DB.prepare(`
      SELECT id, total_shares, average_price 
      FROM stock_holdings 
      WHERE user_id = ? AND company_id = ? AND account_id = ? AND is_open = 1
    `).bind(userId, option.company_id, option.account_id).first() as any
    
    let holdingId: number
    
    if (existingHolding) {
      // Update existing holding with new shares
      const totalShares = existingHolding.total_shares + shares
      const totalCost = (existingHolding.total_shares * existingHolding.average_price) + (shares * strikePrice)
      const newAvgPrice = totalCost / totalShares
      
      await DB.prepare(`
        UPDATE stock_holdings
        SET total_shares = ?,
            average_price = ?,
            strategy_type = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).bind(totalShares, newAvgPrice, strategyType, existingHolding.id, userId).run()
      
      holdingId = existingHolding.id
    } else {
      // Create new stock holding
      const holdingResult = await DB.prepare(`
        INSERT INTO stock_holdings (
          user_id, company_id, ticker, account_id, total_shares, average_price, 
          is_open, opened_date, strategy_type, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).bind(
        userId,
        option.company_id,
        ticker,
        option.account_id,
        shares,
        strikePrice,
        data.assignment_date,
        strategyType,
        data.notes || 'Created from option assignment'
      ).run()
      
      holdingId = holdingResult.meta.last_row_id as number
    }
    
    // 3. Create stock transaction record
    await DB.prepare(`
      INSERT INTO stock_transactions (
        user_id, holding_id, transaction_type, shares, price_per_share,
        transaction_date, commission, notes, option_trade_id
      ) VALUES (?, ?, 'BUY', ?, ?, ?, 0, ?, ?)
    `).bind(
      userId,
      holdingId,
      shares,
      strikePrice,
      data.assignment_date,
      `Assigned from option: ${shares} shares @ $${strikePrice}`,
      optionId
    ).run()
    
    // 4. Create cost basis adjustment for premium collected
    // Premium reduces the cost basis - this is the key advantage of the Wheel strategy
    // Cost basis adjustment = (Premium per share * contracts * 100) - commission paid
    // Note: grossPremium and openCommission already calculated above
    const netProceeds = grossPremium - openCommission // Net proceeds after commission
    
    await DB.prepare(`
      INSERT INTO cost_basis_adjustments (
        user_id, holding_id, adjustment_type, amount, adjustment_date, notes, option_trade_id
      ) VALUES (?, ?, 'SELLING_PUT', ?, ?, ?, ?)
    `).bind(
      userId,
      holdingId,
      netProceeds,
      data.assignment_date,
      `Premium from assigned ${option.strategy_type === 'SELLING_PUT_WHEEL' ? 'Wheel' : 'Stockpiling'} put: ${option.quantity} contract(s) @ $${option.premium}/share = $${grossPremium.toFixed(2)}${openCommission > 0 ? ` - $${openCommission.toFixed(2)} commission = $${netProceeds.toFixed(2)}` : ''}`,
      optionId
    ).run()
    
    return c.json({ 
      success: true,
      message: 'Stock position assigned successfully',
      option_closed: true,
      stock_created: true,
      shares: shares,
      price: strikePrice,
      strategy_type: strategyType,
      premium_adjustment: netProceeds,
      gross_premium: grossPremium,
      commission: openCommission
    })
    
  } catch (error) {
    console.error('Assignment error:', error)
    return c.json({ error: 'Failed to assign stock position' }, 500)
  }
})
