// Usage: npm run smoke            (checks the live site)
//   SMOKE_URL=https://app.generationalinvesting.ca   (default)
//   SMOKE_EMAIL / SMOKE_PASSWORD  enable the login + read-only API checks
// Exit code 1 if anything fails, so it can gate a deploy or run in CI.
import fs from 'fs'
import path from 'path'
import { runSmoke, summarize } from './smoke-lib.mjs'

const baseUrl = process.env.SMOKE_URL || 'https://app.generationalinvesting.ca'
const readLocal = (assetPath) => {
  const file = path.resolve('public', assetPath.replace(/^\//, ''))
  return fs.existsSync(file) ? fs.readFileSync(file) : null
}
const results = await runSmoke({ baseUrl, readLocal, email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD })
const { failed, text } = summarize(results)
console.log(`Smoke test against ${baseUrl}\n`)
console.log(text)
process.exit(failed ? 1 : 0)
