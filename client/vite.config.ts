import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** In dev mode, redirect /api/spa to / so the same URL works everywhere */
function spaRedirect(): Plugin {
  return {
    name: 'spa-redirect',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/api/spa') {
          req.url = '/';
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), spaRedirect()],
  server: {
    open: '/',
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
