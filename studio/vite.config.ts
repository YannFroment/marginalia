import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In dev, the bot's studio server (npm start at the repo root) provides the API.
// The server's write endpoints only accept its own Host/Origin (anti DNS-rebinding),
// so the proxy presents itself as the server: changeOrigin rewrites Host, and the
// Origin header (sent by browsers on PUT/POST) is rewritten to match.
const API_TARGET = 'http://127.0.0.1:4477';
// Vite types the proxy as an EventEmitter from @types/node, which this project does not
// install; this is the only part of it used here.
type ProxyReq = { getHeader: (n: string) => unknown; setHeader: (n: string, v: string) => void };
type ProxyLike = { on: (ev: 'proxyReq', cb: (req: ProxyReq) => void) => void };
const proxied: ProxyOptions = {
  target: API_TARGET,
  changeOrigin: true,
  configure: ((proxy: ProxyLike) => {
    proxy.on('proxyReq', (req) => {
      if (req.getHeader('origin')) req.setHeader('origin', API_TARGET);
    });
  }) as unknown as ProxyOptions['configure'],
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
