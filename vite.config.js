import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/release/**', '**/data-src/**', '**/dist/**'] } },
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000, target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
