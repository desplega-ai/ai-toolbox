import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
    },
  },
  build: {
    rollupOptions: {
      // Native modules must be external - they can't be bundled by Vite.
      // See packageAfterPrune hook in forge.config.ts for how these get included.
      external: [
        'electron',
        'better-sqlite3',
      ],
    },
  },
});
