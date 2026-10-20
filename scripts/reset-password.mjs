// Reset a user's password from the backend (e.g. a forgotten password and no access to the account's email).
//   node scripts/reset-password.mjs her-email@example.com            (prompts for the new password, hidden)
//   node scripts/reset-password.mjs her-email@example.com --local    (local D1 instead of production)
// The password is hashed here (same SHA-256 the app uses) and only the hash reaches the database.
import crypto from 'crypto'
import { spawnSync } from 'child_process'

const email = process.argv[2]
if (!email || email.startsWith('--')) { console.error('Usage: node scripts/reset-password.mjs <email> [--local] [--db webapp-production]'); process.exit(1) }
const dbIdx = process.argv.indexOf('--db')
const db = dbIdx > -1 ? process.argv[dbIdx + 1] : 'webapp-production'
const target = process.argv.includes('--local') ? '--local' : '--remote'

function askHidden(prompt) {
  return new Promise(resolve => {
    process.stdout.write(prompt)
    const stdin = process.stdin; let buf = ''
    if (stdin.isTTY) stdin.setRawMode(true)
    stdin.resume(); stdin.setEncoding('utf8')
    const onData = ch => {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') { if (stdin.isTTY) stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); return resolve(buf) }
        if (c === '\u0003') process.exit(1)
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1); else buf += c
      }
    }
    stdin.on('data', onData)
  })
}

const pw = await askHidden('New password: ')
const again = await askHidden('Repeat it:     ')
if (!pw || pw !== again) { console.error('Passwords are empty or do not match. Nothing changed.'); process.exit(1) }
const hash = crypto.createHash('sha256').update(pw, 'utf8').digest('hex')
const sqlEmail = email.replace(/'/g, "''")
const run = sql => spawnSync('npx', ['wrangler', 'd1', 'execute', db, target, '--command', sql, '--json'], { encoding: 'utf8', shell: process.platform === 'win32' })

const found = run(`SELECT id FROM users WHERE email = '${sqlEmail}'`)
let rows = []
try { rows = JSON.parse(found.stdout)[0].results } catch { /* handled below */ }
if (rows.length !== 1) { console.error(rows.length === 0 ? `No user with email ${email}.` : 'More than one match; nothing changed.'); process.exit(1) }
const r = run(`UPDATE users SET password_hash = '${hash}', updated_at = CURRENT_TIMESTAMP WHERE id = ${Number(rows[0].id)}`)
if (r.status !== 0) { console.error('Update failed:', (r.stderr || r.stdout || '').slice(0, 300)); process.exit(1) }
console.log(`Password updated for ${email}.`)
