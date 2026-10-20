import { verifyToken } from './auth'

// Longest free-text note a research request may carry (it is read by the research agent).
export const MAX_USER_NOTES = 5000

// Tickers look like AAPL, BRK.B, BRK-B, FTN.TO. Anything else never reaches the queue.
export function isValidTicker(ticker: string): boolean {
  return /^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(ticker)
}

// Constant-time string comparison, so a wrong token can't be found out one character at a time.
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

// For the research routes the website and the research machine both use:
// accepts a signed site login token (the website) OR the research ingest token (the SER8).
export async function researchAccessMiddleware(c: any, next: any) {
  const header = c.req.header('Authorization')
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = header.substring(7)
  const ingest = c.env.RESEARCH_INGEST_TOKEN
  if (ingest && safeEqual(token, ingest)) {
    await next()
    return
  }
  if (c.env.JWT_SECRET) {
    const payload = await verifyToken(token, c.env.JWT_SECRET)
    if (payload) {
      c.set('userId', payload.userId)
      await next()
      return
    }
  }
  return c.json({ error: 'Invalid token' }, 401)
}
