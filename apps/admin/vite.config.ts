import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the SPA calls /api/*, forwarded to the API without the prefix. Same origin keeps the session cookie simple and CSRF-safe.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:4000', rewrite: (p) => p.replace(/^\/api/, '') } } },
});
