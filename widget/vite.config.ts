import { defineConfig } from 'vite';

/**
 * Builds the widget as a single self-executing file (IIFE): dist/widget.js.
 * A customer site embeds it with one tag and no bundler:
 *
 *   <script src="https://<widget-host>/widget.js" data-widget-key="wk_..." async></script>
 */
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'ConvoDesk',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    target: 'es2020',
    sourcemap: true,
    emptyOutDir: true,
  },
});
