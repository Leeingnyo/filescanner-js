import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.unit.test.ts', 'test/integration/**/*.int.test.ts', 'test/e2e/**/*.e2e.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        'dist/**',
        'node_modules/**',
        'test/**',
        'src/**/*.unit.test.ts',
        'src/**/*.test-helpers.ts',
        'src/**/memoryTestHelpers.ts',
        'test/**/*.int.test.ts',
        'test/**/*.e2e.test.ts'
      ],
      all: true
    }
  }
});
