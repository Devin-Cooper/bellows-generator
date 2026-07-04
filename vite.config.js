/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import license from 'rollup-plugin-license';
import { resolve, dirname } from 'node:path';

/**
 * Vitest runs in jsdom mode transforms `new URL(path, import.meta.url)` via
 * Vite's asset-URL plugin, which resolves the path to a project-root-relative
 * absolute path (e.g. "/src/style.css") and passes the jsdom document URL as
 * the base. Because file: URLs treat the first segment as the authority, the
 * result is `file:///src/style.css` instead of the correct absolute file URL.
 *
 * This pre-transform plugin rewrites the pattern to `new URL("file:///abs")`
 * before Vite's plugin sees it, so readFileSync() gets a usable file: URL.
 */
const fixTestImportMetaUrl = {
  name: 'fix-test-new-url-import-meta',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('/tests/') || !code.includes('import.meta.url')) return null;
    const dir = dirname(id);
    let changed = false;
    const out = code.replace(
      /new URL\(['"`]([^'"`]+)['"`],\s*import\.meta\.url\)/g,
      (_m, rel) => { changed = true; return `new URL(${JSON.stringify('file://' + resolve(dir, rel))})`; },
    );
    return changed ? { code: out, map: null } : null;
  },
};

// Conditional base: absolute repo path under GitHub Pages on build, root in dev.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/bellows-generator/' : '/',
  plugins: [
    fixTestImportMetaUrl,
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
  },
}));
