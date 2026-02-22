import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Redirect /app → / in dev mode so the same URL works everywhere */
function appRedirect(): Plugin {
  return {
    name: 'app-redirect',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/app' || req.url === '/app/') {
          req.url = '/';
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), appRedirect()],
  server: {
    open: '/app',
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
