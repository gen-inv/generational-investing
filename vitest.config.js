import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30 seconds per test
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '.wrangler/',
        'tests/',
        '*.config.*',
      ]
    },
    // Run tests sequentially to avoid database conflicts
    poolOptions: {
      threads: {
        singleThread: true
      }
    }
  }
})
