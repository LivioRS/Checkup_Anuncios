import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@/lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});