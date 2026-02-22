import './env';
import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { processRouter } from './routes/upload';
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

// Process routes accept small JSON payloads (~87KB each)
app.use('/api/process', express.json({ limit: '256kb' }), processRouter);

// Global JSON parser for all other routes
app.use(express.json({ limit: '1mb' }));

app.use('/api/transcribe', transcribeRouter);
app.use('/api/summarize', summarizeRouter);
app.use('/api/export', exportRouter);

app.use(errorHandler);

// Serve the production-built client
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist, {
  index: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  },
}));

function sendApp(_req: express.Request, res: express.Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(clientDist, 'index.html'));
}

// Primary entry point — fresh URL the proxy has never cached
app.get('/app', sendApp);
// Redirect root to /app to bypass proxy HTML cache
app.get('/', (_req, res) => { res.redirect(302, '/app'); });
// SPA fallback for client-side routing
app.get('*', sendApp);

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
