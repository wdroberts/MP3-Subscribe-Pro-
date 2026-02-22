import './env';
import express from 'express';
import path from 'path';
import fs from 'fs';
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

// ── Self-contained SPA served from an API path ──────────────────────
// The platform proxy caches all static paths (/, /app, /assets/*) but
// passes /api/* through to our server.  So we inline ALL JS + CSS into
// a single HTML response on /api/spa.  Nothing external to cache.
const clientDist = path.resolve(__dirname, '../../client/dist');
let inlineSpaHtml: string | null = null;

function buildInlineSpa(): string {
  if (inlineSpaHtml) return inlineSpaHtml;

  // Read the built index.html to find asset filenames
  const html = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf-8');

  // Extract JS and CSS filenames from the HTML
  const jsMatch = html.match(/src="\/assets\/(index-[^"]+\.js)"/);
  const cssMatch = html.match(/href="\/assets\/(index-[^"]+\.css)"/);

  let jsContent = '';
  let cssContent = '';

  if (jsMatch) {
    jsContent = fs.readFileSync(path.join(clientDist, 'assets', jsMatch[1]), 'utf-8');
  }
  if (cssMatch) {
    cssContent = fs.readFileSync(path.join(clientDist, 'assets', cssMatch[1]), 'utf-8');
  }

  // Build a completely self-contained HTML page — no external requests needed
  inlineSpaHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>MP3 Transcribe Pro</title>
<style>${cssContent}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${jsContent}</script>
</body>
</html>`;

  return inlineSpaHtml;
}

// THE endpoint — proxy can't cache /api/* paths
app.get('/api/spa', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(buildInlineSpa());
});

// Static assets still available as fallback
app.use(express.static(clientDist, { index: false }));
// All other routes redirect to /api/spa
app.get('*', (_req, res) => { res.redirect(302, '/api/spa'); });

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
