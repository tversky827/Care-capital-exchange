import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    // The acceptance test walks a full deal lifecycle end to end.
    testTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname),
      // These modules only exist inside the Next.js runtime. Aliasing them lets
      // the service layer be exercised directly, which is what the acceptance
      // test needs in order to drive the real workflow rather than mock it.
      'server-only': path.resolve(import.meta.dirname, 'tests/helpers/empty.ts'),
      'next/cache': path.resolve(import.meta.dirname, 'tests/helpers/next-cache.ts'),
      'next/headers': path.resolve(import.meta.dirname, 'tests/helpers/next-headers.ts'),
    },
  },
})
