import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { uploadRouter } from './routes/upload';
import { transcribeRouter } from './routes/transcribe';
import { summarizeRouter } from './routes/summarize';
import { exportRouter } from './routes/export';
import { errorHandler } from './middleware/errorHandler';
import { createRateLimiter } from './middleware/rateLimiter';
import { ensureUploadDir, cleanupStaleUploads } from './services/fileManager';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(createRateLimiter());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/upload', uploadRouter);
app.use('/api/transcribe', transcribeRouter);
app.use('/api/summarize', summarizeRouter);
app.use('/api/export', exportRouter);

app.use(errorHandler);

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
