import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Guards against API keys / secrets creeping back into the source. Keys belong in Cloudflare secrets or .env.
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name) && !/\.bak-/.test(e.name)) out.push(p)
  }
  return out
}
const roots = [path.resolve(__dirname), path.resolve(__dirname, '../public/static'), path.resolve(__dirname, '../scripts')].filter(fs.existsSync)
const PATTERNS: [string, RegExp][] = [
  ['key/secret/token assigned a long literal', /(api[_-]?key|api[_-]?token|secret|token|password)\w*['"]?\s*[:=]\s*['"][A-Za-z0-9._\-]{16,}['"]/i],
  ['secret with a built-in default', /\|\|\s*['"][^'"]*(secret|key|token)[^'"]*['"]/i],
  ['bare 32+ character key-like literal', /['"][A-Za-z0-9]{32,}['"]/]
]

// Deliberate fake values used by the smoke test to prove a wrong password is refused.
const ALLOWED = /not-a-real-password/

describe('no secrets in source', () => {
  const files = roots.flatMap(r => walk(r)).filter(f => !f.endsWith('calc.js'))
  it('scans the source files', () => { expect(files.length).toBeGreaterThan(20) })
  for (const [label, re] of PATTERNS) {
    it(`no ${label}`, () => {
      const hits: string[] = []
      for (const f of files) fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => { if (re.test(line) && !ALLOWED.test(line)) hits.push(`${path.relative(process.cwd(), f)}:${i + 1}`) })
      expect(hits).toEqual([])
    })
  }
})
