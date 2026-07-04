/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import license from 'rollup-plugin-license';

// Conditional base: absolute repo path under GitHub Pages on build, root in dev.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/bellows-generator/' : '/',
  plugins: [
    license({
      thirdParty: {
        includePrivate: false,
        output: {
          file: 'dist/THIRD_PARTY_NOTICES.md',
        },
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/setup-jsdom.js'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
  },
}));
