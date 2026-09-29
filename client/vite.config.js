import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React app calls /api and /socket.io on its own origin;
// Vite forwards them to the Express server (no CORS issues, one URL to open).
const API_TARGET = process.env.VITE_PROXY_TARGET || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: true },
    },
  },
});
