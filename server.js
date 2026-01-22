// FastComet-compatible Node.js server entry point
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import app from './src/index-mysql'
import 'dotenv/config'

const port = parseInt(process.env.PORT || '3000')

console.log(`🚀 Generational Investing Server Starting...`)
console.log(`📡 Port: ${port}`)
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
console.log(`💾 Database: ${process.env.DB_NAME}`)

serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0'
})

console.log(`✅ Server running at http://0.0.0.0:${port}`)
