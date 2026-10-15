import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_PORT = Number(process.env.API_PORT || 5000);

export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on every network interface, so phones on the same Wi-Fi can open http://<this-pc-ip>:5173.
    host: true,
    port: 5173,
    // Prepare the first screen's code as soon as the server starts, so the first page load does not wait for it.
    warmup: { clientFiles: ['./src/main.jsx', './src/layouts/AppLayout.jsx', './src/features/home/HomePage.jsx', './src/features/auth/LoginPage.jsx'] },
    proxy: {
      // The browser only ever talks to this server; API calls go on to the backend on this computer.
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
    },
  },
  preview: {
    host: true,
    port: 4173,
    proxy: {
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
    },
  },
});
