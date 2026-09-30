import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In dev, the bot's studio server (npm start at the repo root) provides the API.
// The server's write endpoints only accept its own Host/Origin (anti DNS-rebinding),
// so the proxy presents itself as the server: changeOrigin rewrites Host, and the
// Origin header (sent by browsers on PUT/POST) is rewritten to match.
const API_TARGET = 'http://127.0.0.1:4477';
const proxied = {
  target: API_TARGET,
  changeOrigin: true,
  configure: (proxy: { on: (ev: 'proxyReq', cb: (req: { getHeader: (n: string) => unknown; setHeader: (n: string, v: string) => void }) => void) => void }) => {
    proxy.on('proxyReq', req => {
      if (req.getHeader('origin')) req.setHeader('origin', API_TARGET);
    });
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': proxied,
      '/events': proxied,
    },
  },
});
