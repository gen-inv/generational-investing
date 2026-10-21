import type { Bindings } from './types'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import researchApp from './research-api'
import { routes as discoveryRoutes } from './routes/discovery'
import { authMiddleware } from './lib/auth'
import { routes as authRoutes } from './routes/auth'
import { routes as companiesRoutes } from './routes/companies'
import { routes as accountsRoutes } from './routes/accounts'
import { routes as stocksRoutes } from './routes/stocks'
import { routes as optionsRoutes } from './routes/options'
import { routes as dailyTradesRoutes } from './routes/daily-trades'
import { routes as reportsRoutes } from './routes/reports'
import { routes as dividendsRoutes } from './routes/dividends'
import { routes as frontendRoutes } from './routes/frontend'
export { scheduled } from './scheduled'

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './' }))

// Prune needs a site login (JWT); reads stay public. authMiddleware is a hoisted function declaration.
app.use('/api/research/:ticker/notes/*', async (c, next) => {
  if (c.req.method === 'GET' || c.req.method === 'OPTIONS') return next()
  return authMiddleware(c, next)
})

// Discovery routes first: researchApp has a catch-all GET /:ticker that would otherwise swallow /discovery.
app.route('/api/research/discovery', discoveryRoutes)
app.route('/api/research', researchApp)

// Route modules, mounted in the same order the routes were originally declared.
app.route('/', authRoutes)
app.route('/', companiesRoutes)
app.route('/', accountsRoutes)
app.route('/', stocksRoutes)
app.route('/', optionsRoutes)
app.route('/', dailyTradesRoutes)
app.route('/', reportsRoutes)
app.route('/', dividendsRoutes)
app.route('/', frontendRoutes)

export default app
