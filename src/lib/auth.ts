

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

// Login tokens: HS256 JWTs signed with the JWT_SECRET secret (Web Crypto), valid for 30 days.
export const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
const textEnc = new TextEncoder()
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlDecode = (s: string) => {
  const std = s.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(std + '='.repeat((4 - (std.length % 4)) % 4)), ch => ch.charCodeAt(0))
}
const jsonPart = (o: unknown) => b64url(textEnc.encode(JSON.stringify(o)))

async function hmacKey(secret: string) {
  if (!secret || secret.length < 16) throw new Error('JWT_SECRET is not configured (set a random secret of at least 16 characters)')
  return crypto.subtle.importKey('raw', textEnc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function generateToken(payload: any, secret: string, ttlSeconds: number = TOKEN_TTL_SECONDS): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const signingInput = jsonPart({ alg: 'HS256', typ: 'JWT' }) + '.' + jsonPart({ ...payload, iat: now, exp: now + ttlSeconds })
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), textEnc.encode(signingInput))
  return signingInput + '.' + b64url(new Uint8Array(sig))
}

// Returns the payload only for a token we signed, that has not expired. Anything else is null.
export async function verifyToken(token: string, secret: string): Promise<any | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])))
    if (header.alg !== 'HS256') return null
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlDecode(parts[2]), textEnc.encode(parts[0] + '.' + parts[1]))
    if (!ok) return null
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])))
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null
    if (payload.userId === undefined || payload.userId === null) return null
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
  if (!c.env.JWT_SECRET) {
    console.error('JWT_SECRET is not configured')
    return c.json({ error: 'Server authentication is not configured' }, 503)
  }
  const payload = await verifyToken(token, c.env.JWT_SECRET)
  
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401)
  }
  
  c.set('userId', payload.userId)
  await next()
}
