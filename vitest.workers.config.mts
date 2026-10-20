import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  plugins: [cloudflareTest({ miniflare: { compatibilityDate: '2025-01-01', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB', 'RESEARCH_DB'], bindings: { JWT_SECRET: 'vitest-only-jwt-secret-0123456789abcdef' } } })],
  test: { include: ['test/**/*.test.ts'] },
})