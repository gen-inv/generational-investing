import { Hono } from 'hono'
import { hashPassword, verifyPassword, generateToken, fetchAndCacheExchangeRate, authMiddleware } from '../lib/auth'
import type { Bindings } from '../types'

export const routes = new Hono<{ Bindings: Bindings }>()

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

routes.post('/api/auth/register', async (c) => {
  try {
    const { email, password, name } = await c.req.json()
    const { DB } = c.env;
    
    if (!email || !password || !name) {
      return c.json({ error: 'All fields are required' }, 400)
    }
    
    const passwordHash = await hashPassword(password)
    
    const result = await DB.prepare(`
      INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)
    `).bind(email, passwordHash, name).run()
    
    const token = await generateToken({ userId: result.meta.last_row_id, email }, c.env.JWT_SECRET as string)
    
    // Fetch and cache current month's exchange rate on registration
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    console.log(`Checking exchange rate cache for ${currentMonth}/${currentYear}`);
    
    // Check if we already have this month's rate cached
    const cached = await DB.prepare(`
      SELECT id FROM exchange_rates 
      WHERE month = ? AND year = ?
    `).bind(currentMonth, currentYear).first();
    
    if (!cached) {
      console.log('Exchange rate not cached, fetching now...');
      // Fetch and cache synchronously (this happens once per month, so it's acceptable)
      await fetchAndCacheExchangeRate(DB, currentMonth, currentYear);
    } else {
      console.log('Exchange rate already cached');
    }
    
    return c.json({ 
      token, 
      user: { id: result.meta.last_row_id, email, name }
    })
  } catch (error: any) {
    console.error('REGISTER ERROR:', error.message, error.stack)
    if (error.message.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'Email already exists' }, 400)
    }
    return c.json({ error: 'Registration failed', detail: error.message }, 500)
  }
})

routes.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json()
    const { DB } = c.env;
    
    const user = await DB.prepare(`
      SELECT id, email, password_hash, name FROM users WHERE email = ?
    `).bind(email).first()
    
    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }
    
    const isValid = await verifyPassword(password, user.password_hash as string)
    
    if (!isValid) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }
    
    const token = await generateToken({ userId: user.id, email: user.email }, c.env.JWT_SECRET as string)
    
    // Fetch and cache current month's exchange rate on login
    // This happens once per month, so it's acceptable to await
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    console.log(`Checking exchange rate cache for ${currentMonth}/${currentYear}`);
    
    // Check if we already have this month's rate cached
    const cached = await DB.prepare(`
      SELECT id FROM exchange_rates 
      WHERE month = ? AND year = ?
    `).bind(currentMonth, currentYear).first();
    
    if (!cached) {
      console.log('Exchange rate not cached, fetching now...');
      // Fetch and cache synchronously (this happens once per month, so it's acceptable)
      await fetchAndCacheExchangeRate(DB, currentMonth, currentYear);
    } else {
      console.log('Exchange rate already cached');
    }
    
    return c.json({ 
      token, 
      user: { id: user.id, email: user.email, name: user.name }
    })
  } catch (error) {
    return c.json({ error: 'Login failed' }, 500)
  }
})

// ============================================================================
// USER PROFILE ROUTES
// ============================================================================

// Get current user profile
routes.get('/api/user/profile', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { DB } = c.env;
    
    const user = await DB.prepare(`
      SELECT id, email, name, created_at, updated_at 
      FROM users 
      WHERE id = ?
    `).bind(userId).first()
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }
    
    return c.json(user)
  } catch (error) {
    console.error('Get profile error:', error)
    return c.json({ error: 'Failed to get profile' }, 500)
  }
})

// Update user profile
routes.put('/api/user/profile', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { name, email } = await c.req.json()
    const { DB } = c.env;
    
    if (!name && !email) {
      return c.json({ error: 'Name or email is required' }, 400)
    }
    
    // If email is being updated, check if it's already taken by another user
    if (email) {
      const existingUser = await DB.prepare(`
        SELECT id FROM users WHERE email = ? AND id != ?
      `).bind(email, userId).first()
      
      if (existingUser) {
        return c.json({ error: 'Email already in use' }, 400)
      }
    }
    
    // Build update query dynamically based on provided fields
    let query = 'UPDATE users SET updated_at = CURRENT_TIMESTAMP'
    const params: any[] = []
    
    if (name) {
      query += ', name = ?'
      params.push(name)
    }
    
    if (email) {
      query += ', email = ?'
      params.push(email)
    }
    
    query += ' WHERE id = ?'
    params.push(userId)
    
    await DB.prepare(query).bind(...params).run()
    
    // Fetch updated user
    const updatedUser = await DB.prepare(`
      SELECT id, email, name, created_at, updated_at 
      FROM users 
      WHERE id = ?
    `).bind(userId).first()
    
    return c.json(updatedUser)
  } catch (error) {
    console.error('Update profile error:', error)
    return c.json({ error: 'Failed to update profile' }, 500)
  }
})

// Change password
routes.put('/api/user/password', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')
    const { current_password, new_password } = await c.req.json()
    const { DB } = c.env;
    
    if (!current_password || !new_password) {
      return c.json({ error: 'Current and new password are required' }, 400)
    }
    
    if (new_password.length < 6) {
      return c.json({ error: 'New password must be at least 6 characters' }, 400)
    }
    
    // Verify current password
    const user = await DB.prepare(`
      SELECT id, password_hash FROM users WHERE id = ?
    `).bind(userId).first()
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }
    
    const isValid = await verifyPassword(current_password, user.password_hash as string)
    
    if (!isValid) {
      return c.json({ error: 'Current password is incorrect' }, 401)
    }
    
    // Hash new password and update
    const newPasswordHash = await hashPassword(new_password)
    
    await DB.prepare(`
      UPDATE users 
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(newPasswordHash, userId).run()
    
    return c.json({ message: 'Password updated successfully' })
  } catch (error) {
    console.error('Change password error:', error)
    return c.json({ error: 'Failed to change password' }, 500)
  }
})
