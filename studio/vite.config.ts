import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In dev, the bot's studio server (npm start at the repo root) provides the API.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4477',
      '/events': 'http://127.0.0.1:4477',
    },
  },
});
