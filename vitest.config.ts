import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tools/**/*.test.ts'],
    exclude: ['**/*.browser.test.ts', '**/node_modules/**', '**/dist/**'],
    testTimeout: 10_000,
  },
});
