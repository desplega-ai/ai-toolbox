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
      external: [
        'electron',
        'better-sqlite3',
        'electron-store',
        'electron-window-state',
        '@anthropic-ai/claude-agent-sdk',
      ],
    },
  },
});
