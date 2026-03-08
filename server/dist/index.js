"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
require("./env");
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const upload_1 = require("./routes/upload");
const transcribe_1 = require("./routes/transcribe");
const summarize_1 = require("./routes/summarize");
const export_1 = require("./routes/export");
const errorHandler_1 = require("./middleware/errorHandler");
const rateLimiter_1 = require("./middleware/rateLimiter");
const fileManager_1 = require("./services/fileManager");
const app = (0, express_1.default)();
exports.app = app;
const PORT = process.env.PORT || 3001;
app.use((0, helmet_1.default)({
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
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use((0, rateLimiter_1.createRateLimiter)());
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
});
// Process routes accept base64-encoded chunks (~1.33MB each after encoding, limit gives headroom)
// Uses its own generous rate limit (5000 req/15min) instead of the global 100 req/15min
app.use('/api/process', (0, rateLimiter_1.createUploadRateLimiter)(), express_1.default.json({ limit: '2mb' }), upload_1.processRouter);
// Global JSON parser for all other routes
app.use(express_1.default.json({ limit: '1mb' }));
app.use('/api/transcribe', transcribe_1.transcribeRouter);
app.use('/api/summarize', summarize_1.summarizeRouter);
app.use('/api/export', export_1.exportRouter);
app.use(errorHandler_1.errorHandler);
// ── Self-contained SPA served from an API path ──────────────────────
// The platform proxy caches GET responses aggressively, so we use a two-stage
// approach: (1) a tiny bootstrapper HTML page, and (2) the real app code
// delivered via POST (proxies don't cache POST responses).
const clientDist = path_1.default.resolve(__dirname, '../../client/dist');
function loadBundleAssets() {
    // Always read from disk — avoids serving stale UI after deploys
    const html = fs_1.default.readFileSync(path_1.default.join(clientDist, 'index.html'), 'utf-8');
    const jsMatch = html.match(/src="\/assets\/(index-[^"]+\.js)"/);
    const cssMatch = html.match(/href="\/assets\/(index-[^"]+\.css)"/);
    const js = jsMatch ? fs_1.default.readFileSync(path_1.default.join(clientDist, 'assets', jsMatch[1]), 'utf-8') : '';
    const css = cssMatch ? fs_1.default.readFileSync(path_1.default.join(clientDist, 'assets', cssMatch[1]), 'utf-8') : '';
    return { js, css };
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
app.use(express_1.default.static(clientDist, { index: false }));
// All other routes redirect to /api/spa
app.get('*', (_req, res) => { res.redirect(302, '/api/go'); });
async function start() {
    await (0, fileManager_1.ensureUploadDir)();
    // Clean up stale uploads every 30 minutes
    const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
    const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
    setInterval(() => {
        (0, fileManager_1.cleanupStaleUploads)(MAX_AGE_MS).catch((err) => {
            console.error('Cleanup failed:', err);
        });
    }, CLEANUP_INTERVAL_MS);
    const server = app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
    // Graceful shutdown — finish in-flight requests before exiting
    function shutdown(signal) {
        console.log(`${signal} received, shutting down gracefully...`);
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
        // Force exit if shutdown takes too long
        setTimeout(() => { process.exit(1); }, 10000).unref();
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
start().catch(console.error);
//# sourceMappingURL=index.js.map