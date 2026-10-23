import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const API_PORT = Number(process.env.API_PORT || 5000);

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Screens see the shared lists (payment modes, metals, statuses…) with their names in the app's language.
    alias: [{ find: /^@jerp\/shared$/, replacement: fileURLToPath(new URL('./src/i18n/shared.js', import.meta.url)) }],
  },
  optimizeDeps: {
    // Look through every page at start-up, so all libraries (icons included) are prepared at once. Otherwise opening
    // a page for the first time can make Vite re-prepare them, and an open tab fails with "Failed to fetch dynamically
    // imported module" until it is reloaded.
    entries: ['index.html', 'src/**/*.{js,jsx}'],
  },
  server: {
    // Listen on every network interface, so phones on the same Wi-Fi can open http://<this-pc-ip>:5173.
    host: true,
    port: 5173,
    // Prepare the first screen's code as soon as the server starts, so the first page load does not wait for it.
    warmup: { clientFiles: ['./src/main.jsx', './src/app.jsx', './src/layouts/AppLayout.jsx', './src/features/home/HomePage.jsx', './src/features/auth/LoginPage.jsx'] },
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
