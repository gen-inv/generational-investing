import { describe, it, expect } from 'vitest'
import { generateToken, verifyToken } from './auth'

const SECRET = 'unit-test-secret-0123456789abcdef'
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')

describe('signed login tokens', () => {
  it('round-trips and carries the user id, with iat/exp 30 days apart', async () => {
    const t = await generateToken({ userId: 7, email: 'a@b.c' }, SECRET)
    const p = await verifyToken(t, SECRET)
    expect(p).toMatchObject({ userId: 7, email: 'a@b.c' })
    expect(p.exp - p.iat).toBe(30 * 24 * 60 * 60)
    expect(t.split('.').length).toBe(3)
  })
  it('rejects the old home-made format (signature = base64 of "header.body.secret")', async () => {
    const h = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), b = btoa(JSON.stringify({ userId: 1, email: 'x' }))
    expect(await verifyToken(`${h}.${b}.${btoa(`${h}.${b}.secret`)}`, SECRET)).toBeNull()
  })
  it('rejects a tampered payload, a different secret, alg none, garbage, and an empty token', async () => {
    const t = await generateToken({ userId: 7, email: 'a@b.c' }, SECRET)
    const [h, , s] = t.split('.')
    expect(await verifyToken(`${h}.${b64({ userId: 1, email: 'a@b.c', exp: 9999999999 })}.${s}`, SECRET)).toBeNull()
    expect(await verifyToken(t, 'another-secret-0123456789abcdef')).toBeNull()
    expect(await verifyToken(`${b64({ alg: 'none', typ: 'JWT' })}.${b64({ userId: 1, exp: 9999999999 })}.`, SECRET)).toBeNull()
    expect(await verifyToken('not-a-token', SECRET)).toBeNull()
    expect(await verifyToken('', SECRET)).toBeNull()
  })
  it('rejects an expired token', async () => {
    expect(await verifyToken(await generateToken({ userId: 7 }, SECRET, -5), SECRET)).toBeNull()
  })
  it('rejects a token with no user id, and verification with a missing secret fails closed', async () => {
    expect(await verifyToken(await generateToken({ email: 'x' }, SECRET), SECRET)).toBeNull()
    const t = await generateToken({ userId: 7 }, SECRET)
    expect(await verifyToken(t, '')).toBeNull()
    await expect(generateToken({ userId: 7 }, '')).rejects.toThrow('JWT_SECRET')
    await expect(generateToken({ userId: 7 }, 'short')).rejects.toThrow('JWT_SECRET')
  })
  it('handles non-ASCII in the payload', async () => {
    const p = await verifyToken(await generateToken({ userId: 3, email: 'rené@exämple.com' }, SECRET), SECRET)
    expect(p.email).toBe('rené@exämple.com')
  })
})
