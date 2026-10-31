import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  // `npm run dev` (port 5173) talks to the API server (`npm start`, port 3000)
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
