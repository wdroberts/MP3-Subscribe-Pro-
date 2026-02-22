import './env';
import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { transferRouter } from './routes/upload';
import { transcribeRouter } from './routes/transcribe';
import { summarizeRouter } from './routes/summarize';
import { exportRouter } from './routes/export';
import { errorHandler } from './middleware/errorHandler';
import { createRateLimiter } from './middleware/rateLimiter';
import { ensureUploadDir, cleanupStaleUploads } from './services/fileManager';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(createRateLimiter());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Transfer routes accept base64 chunks — 512KB raw ≈ 700KB base64
app.use('/api/transfer', express.json({ limit: '1mb' }), transferRouter);

// Global JSON parser for all other routes
app.use(express.json({ limit: '1mb' }));

app.use('/api/transcribe', transcribeRouter);
app.use('/api/summarize', summarizeRouter);
app.use('/api/export', exportRouter);

app.use(errorHandler);

// Serve the production-built client
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist, {
  index: false, // Don't auto-serve index.html — we handle it with cache-busting redirect below
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  },
}));
// Cache-bust: redirect bare / to /?_v=<timestamp> so CDN/proxy treats it as a new URL
app.get('/', (req, res) => {
  if (!req.query._v) {
    res.redirect(302, `/?_v=${Date.now()}`);
    return;
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(clientDist, 'index.html'));
});
// SPA fallback: serve index.html for any non-API route
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(clientDist, 'index.html'));
});

async function start() {
  await ensureUploadDir();

  // Clean up stale uploads every 30 minutes
  const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
  const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
  setInterval(() => {
    cleanupStaleUploads(MAX_AGE_MS).catch((err) => {
      console.error('Cleanup failed:', err);
    });
  }, CLEANUP_INTERVAL_MS);

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);

export { app };
