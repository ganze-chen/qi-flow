import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    // Required for camera access on non-localhost
    https: false,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
});
