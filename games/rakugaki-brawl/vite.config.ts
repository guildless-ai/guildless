import { defineConfig } from 'vite';

// Relative base so the built index.html also loads from file:// inside Electron.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900 },
});
