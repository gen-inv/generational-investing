// Pushes the secrets in .env (or .dev.vars) to Cloudflare Pages so production uses the same values.
//   node scripts/push-secrets.mjs               (reads .env, project name from wrangler.jsonc/.toml)
//   node scripts/push-secrets.mjs --project my-pages-project --file .env
// Values are sent to wrangler on stdin (never on the command line) and are not printed.
import fs from 'fs'
import { spawnSync } from 'child_process'

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : def }
const file = arg('file', fs.existsSync('.env') ? '.env' : '.dev.vars')
if (!fs.existsSync(file)) { console.error(`No ${file} found. Copy .env.example to .env and fill it in first.`); process.exit(1) }

function projectName() {
  const fromArg = arg('project'); if (fromArg) return fromArg
  for (const f of ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']) {
    if (!fs.existsSync(f)) continue
    const m = fs.readFileSync(f, 'utf8').match(/"?name"?\s*[:=]\s*"([^"]+)"/)
    if (m) return m[1]
  }
  return null
}
const project = projectName()
if (!project) { console.error('Could not find the Pages project name. Pass --project <name>.'); process.exit(1) }

const vars = []
for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
  if (!m || line.trim().startsWith('#')) continue
  let v = m[2]; if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1)
  if (v && !/^(changeme|your[-_ ]|xxx)/i.test(v)) vars.push([m[1], v])
}
if (!vars.length) { console.error(`No filled-in values found in ${file}.`); process.exit(1) }

let failed = 0
for (const [name, value] of vars) {
  const r = spawnSync('npx', ['wrangler', 'pages', 'secret', 'put', name, '--project-name', project], { input: value + '\n', encoding: 'utf8', shell: process.platform === 'win32' })
  if (r.status === 0) console.log(`set ${name}`)
  else { failed++; console.error(`FAILED ${name}: ${(r.stderr || r.stdout || '').split('\n').slice(0, 3).join(' ')}`) }
}
console.log(failed ? `\n${failed} secret(s) failed.` : `\nPushed ${vars.length} secret(s) to project "${project}". They apply to the next deployment: run npm run deploy.`)
process.exit(failed ? 1 : 0)
