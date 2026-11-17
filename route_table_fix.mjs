// Adds the 4 user-preferences routes and the cron refresh route to the expected route list. Run from the repo root.
import fs from 'fs'
const p = 'test/route-table.test.ts'
if (!fs.existsSync(p)) { console.log('NOTHING WRITTEN: ' + p + ' not found (run from the repo root)'); process.exit(1) }
const raw = fs.readFileSync(p, 'utf8'), crlf = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const count = (s, x) => s.split(x).length - 1
const steps = [
  ['user preferences routes',
    '  "PUT /api/user/profile",\n  "PUT /api/user/profile",\n  "PUT /api/user/password",',
    '  "PUT /api/user/profile",\n  "PUT /api/user/profile",\n  "GET /api/user/preferences",\n  "GET /api/user/preferences",\n  "PUT /api/user/preferences",\n  "PUT /api/user/preferences",\n  "PUT /api/user/password",',
    '"GET /api/user/preferences"'],
  ['cron refresh route',
    '  "PUT /api/companies/:id",\n  "PUT /api/companies/:id",\n  "POST /api/companies/:id/fetch-earnings",',
    '  "PUT /api/companies/:id",\n  "PUT /api/companies/:id",\n  "POST /api/cron/refresh-company-data",\n  "POST /api/companies/:id/fetch-earnings",',
    '"POST /api/cron/refresh-company-data"'],
]
const misses = []
for (const [name, o, n, marker] of steps) {
  if (t.includes(marker)) continue            // already applied
  const c = count(t, o)
  if (c !== 1) { misses.push(`"${name}" matched ${c} times (needs exactly 1)`); continue }
  t = t.replace(o, () => n)
}
if (misses.length) { console.log('NOTHING WRITTEN:\n  - ' + misses.join('\n  - ')); process.exit(1) }
if (t === raw.replace(/\r\n/g, '\n')) { console.log('Already applied, nothing to do.'); process.exit(0) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
fs.copyFileSync(p, p + '.bak-routes-' + stamp)
fs.writeFileSync(p, crlf ? t.replace(/\n/g, '\r\n') : t)
console.log('updated ' + p + '\nBackup: ' + p + '.bak-routes-' + stamp + ' (delete it after you commit)')
