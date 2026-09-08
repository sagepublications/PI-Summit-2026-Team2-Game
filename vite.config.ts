import { defineConfig } from 'vite';

// Relative base: asset URLs are emitted as "./assets/…", so the same build works
// at the domain root, under a /<repo>/ project path on github.io, or anywhere
// else it is copied. Set VITE_BASE only if a specific absolute base is required.
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
