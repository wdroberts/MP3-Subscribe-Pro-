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
import { createRateLimiter, createUploadRateLimiter } from './middleware/rateLimiter';
import { ensureUploadDir, cleanupStaleUploads } from './services/fileManager';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(cors());
app.use(createRateLimiter());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Process routes accept base64-encoded chunks (~1.33MB each after encoding, limit gives headroom)
// Uses its own generous rate limit (5000 req/15min) instead of the global 100 req/15min
app.use('/api/process', createUploadRateLimiter(), express.json({ limit: '2mb' }), processRouter);

// Global JSON parser for all other routes
app.use(express.json({ limit: '1mb' }));

app.use('/api/transcribe', transcribeRouter);
app.use('/api/summarize', summarizeRouter);
app.use('/api/export', exportRouter);

app.use(errorHandler);

// ── Self-contained SPA served from an API path ──────────────────────
// The platform proxy caches GET responses aggressively, so we use a two-stage
// approach: (1) a tiny bootstrapper HTML page, and (2) the real app code
// delivered via POST (proxies don't cache POST responses).
const clientDist = path.resolve(__dirname, '../../client/dist');
let cachedJs = '';
let cachedCss = '';

function loadBundleAssets(): { js: string; css: string } {
  // In production, cache. In dev, always re-read.
  if (cachedJs && process.env.NODE_ENV === 'production') return { js: cachedJs, css: cachedCss };

  const html = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf-8');
  const jsMatch = html.match(/src="\/assets\/(index-[^"]+\.js)"/);
  const cssMatch = html.match(/href="\/assets\/(index-[^"]+\.css)"/);

  cachedJs = jsMatch ? fs.readFileSync(path.join(clientDist, 'assets', jsMatch[1]), 'utf-8') : '';
  cachedCss = cssMatch ? fs.readFileSync(path.join(clientDist, 'assets', cssMatch[1]), 'utf-8') : '';
  return { js: cachedJs, css: cachedCss };
}

// Tiny bootstrapper — even if the proxy caches this HTML, it just loads fresh
// code via POST on every page load.  The bootstrapper itself never changes.
const bootstrapperHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>MP3 Transcribe Pro</title>
</head>
<body>
<div id="root"><p style="font-family:system-ui;text-align:center;margin-top:40vh">Loading app&hellip;</p></div>
<script>
(async()=>{
  try{
    const r=await fetch('/api/bundle',{method:'POST'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const{css,js}=await r.json();
    const s=document.createElement('style');s.textContent=css;document.head.appendChild(s);
    const b=new Blob([js],{type:'application/javascript'});
    const u=URL.createObjectURL(b);
    const sc=document.createElement('script');sc.type='module';sc.src=u;document.body.appendChild(sc);
  }catch(e){
    document.getElementById('root').innerHTML='<p style="color:red;font-family:system-ui;text-align:center;margin-top:40vh">Failed to load app: '+e.message+'</p>';
  }
})();
</script>
</body>
</html>`;

// POST /api/bundle — returns JS+CSS as JSON. POST is never cached by proxies.
app.post('/api/bundle', (_req, res) => {
  const { js, css } = loadBundleAssets();
  res.json({ js, css });
});

// GET /api/go — the bootstrapper page (safe to cache — it just loads via POST)
app.get('/api/go', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(bootstrapperHtml);
});

// Legacy endpoints redirect to the new bootstrapper
app.get('/api/app', (_req, res) => { res.redirect(302, '/api/go'); });
app.get('/api/spa', (_req, res) => { res.redirect(302, '/api/go'); });

// Static assets still available as fallback
app.use(express.static(clientDist, { index: false }));
// All other routes redirect to /api/spa
app.get('*', (_req, res) => { res.redirect(302, '/api/go'); });

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
