

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Simple password hashing (in production, use proper bcrypt)
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password)
  return passwordHash === hash
}

// Simple JWT generation (using Web Crypto API)
export async function generateToken(payload: any): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const signature = btoa(`${header}.${body}.secret`)
  return `${header}.${body}.${signature}`
}

// Verify JWT token
function verifyToken(token: string): any | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    return payload
  } catch {
    return null
  }
}

// Helper function to fetch and cache exchange rates
export async function fetchAndCacheExchangeRate(DB: any, month: number, year: number) {
  try {
    // Use the /v4/latest/ endpoint which returns current rates
    // Note: This API doesn't support historical rates on the free tier
    // For monthly tracking, we cache the rate when first accessed for that month
    // Use Bank of Canada's official exchange rate API (free, no API key needed)
    const response = await fetch(`https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1`, {
      headers: {
        'User-Agent': 'GenerationalInvesting/1.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('Bank of Canada API status:', response.status, response.statusText);
    
    if (!response.ok) {
      const text = await response.text();
      console.error('Bank of Canada API error response:', text.substring(0, 200));
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    console.log('Bank of Canada API response:', { 
      success: !!data, 
      hasObservations: !!data?.observations,
      observationCount: data?.observations?.length,
      latestRate: data?.observations?.[0]?.FXUSDCAD?.v
    });
    
    // Bank of Canada returns data in format: { observations: [{ d: "2026-02-26", FXUSDCAD: { v: "1.3688" } }] }
    if (data && data.observations && data.observations.length > 0 && data.observations[0].FXUSDCAD?.v) {
      const usdToCad = parseFloat(data.observations[0].FXUSDCAD.v);
      const cadToUsd = 1 / usdToCad;
      const rateDate = data.observations[0].d;
      
      // Cache the rate (use INSERT OR IGNORE to avoid duplicate errors)
      await DB.prepare(`
        INSERT OR IGNORE INTO exchange_rates (month, year, usd_to_cad, cad_to_usd)
        VALUES (?, ?, ?, ?)
      `).bind(month, year, usdToCad, cadToUsd).run();
      
      console.log(`✅ Exchange rate cached for ${month}/${year}: ${usdToCad} USD to CAD (from Bank of Canada, date: ${rateDate})`);
    } else {
      // Use fallback rate
      const defaultRate = 1.35;
      await DB.prepare(`
        INSERT OR IGNORE INTO exchange_rates (month, year, usd_to_cad, cad_to_usd)
        VALUES (?, ?, ?, ?)
      `).bind(month, year, defaultRate, 1 / defaultRate).run();
      
      console.log(`⚠️ Fallback exchange rate cached for ${month}/${year}: ${defaultRate} USD to CAD (API data missing)`);
    }
  } catch (error) {
    console.error('❌ Error fetching and caching exchange rate:', error);
    
    // On error, cache fallback rate
    try {
      const defaultRate = 1.35;
      await DB.prepare(`
        INSERT OR IGNORE INTO exchange_rates (month, year, usd_to_cad, cad_to_usd)
        VALUES (?, ?, ?, ?)
      `).bind(month, year, defaultRate, 1 / defaultRate).run();
      
      console.log(`⚠️ Fallback exchange rate cached for ${month}/${year}: ${defaultRate} USD to CAD (after error)`);
    } catch (insertError) {
      console.error('❌ Error caching fallback rate:', insertError);
    }
  }
}

// Auth middleware
export async function authMiddleware(c: any, next: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  
  const token = authHeader.substring(7)
  const payload = verifyToken(token)
  
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401)
  }
  
  c.set('userId', payload.userId)
  await next()
}
