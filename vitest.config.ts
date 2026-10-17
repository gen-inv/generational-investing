import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so the Cloudflare/Hono build plugins don't load during tests.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})