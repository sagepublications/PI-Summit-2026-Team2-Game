import { defineConfig } from 'vite';

// VITE_BASE lets CI deploy under a sub-path (GitHub Pages: /<repo-name>/).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
