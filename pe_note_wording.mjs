// Widens the P/E "n/a" wording to include unavailable EPS reporting data. Run from the repo root:  node pe_note_wording.mjs
import fs from 'fs'
import path from 'path'
const root = process.cwd()
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const misses = []
const count = (s, sub) => s.split(sub).length - 1
const read = rel => {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) { misses.push(rel + ': file not found (run this from the repo root)'); return null }
  const raw = fs.readFileSync(p, 'utf8')
  return { rel, p, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n'), changed: false }
}
const edit = (f, name, oldS, newS, times = 1) => {
  if (!f) return
  if (count(f.text, oldS) === 0 && count(f.text, newS) >= 1) return   // already applied
  const n = count(f.text, oldS)
  if (n !== times) { misses.push(f.rel + ': "' + name + '" matched ' + n + ' times (needs exactly ' + times + ')'); return }
  f.text = f.text.split(oldS).join(newS); f.changed = true
}
const OLD = 'n/a - this happens on loss-making companies (which have no P/E), and non-US companies.'
const NEW = 'n/a - this happens on companies with unavailable EPS reporting data, loss-making companies (which have no P/E), and non-US companies.'

const merge = read('public/static/research-merge.js')
edit(merge, 'modal wording', "'" + OLD + "'", "'" + NEW + "'")
const front = read('src/routes/frontend.ts')
edit(front, 'roster legend', 'there is no range (loss-making, not an SEC filer, or under 3 years of history)',
  'there is no range (unavailable EPS reporting data, loss-making, non-US or not an SEC filer, or under 3 years of history)')
const t1 = read('src/ui/option-modal.test.ts'); edit(t1, 'modal test wording', OLD, NEW)
const t2 = read('src/ui/pe-range.test.ts'); edit(t2, 'helper test wording', OLD, NEW)

if (misses.length) { console.log('NOTHING WRITTEN. Problems:'); misses.forEach(m => console.log('  - ' + m)); process.exit(1) }
const files = [merge, front, t1, t2].filter(f => f && f.changed)
for (const f of files) {
  fs.copyFileSync(f.p, f.p + '.bak-penote-' + stamp)
  fs.writeFileSync(f.p, f.crlf ? f.text.replace(/\n/g, '\r\n') : f.text)
  console.log('updated ' + f.rel)
}
if (!files.length) console.log('Already applied, nothing to do.')
console.log('\nDone. Backups are *.bak-penote-' + stamp + ' (delete them after you commit).')
