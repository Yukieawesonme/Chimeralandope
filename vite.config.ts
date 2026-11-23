import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@graphics': path.resolve(__dirname, 'src/graphics'),
      '@save': path.resolve(__dirname, 'src/save'),
      '@world': path.resolve(__dirname, 'src/world'),
      '@entities': path.resolve(__dirname, 'src/entities'),
      '@combat': path.resolve(__dirname, 'src/combat'),
      '@building': path.resolve(__dirname, 'src/building'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@assets': path.resolve(__dirname, 'src/assets'),
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          vendor: ['zod'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 3000,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  optimizeDeps: {
    include: ['three', 'zod'],
  },
});