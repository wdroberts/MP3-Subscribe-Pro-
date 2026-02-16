import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import { uploadExists, getUploadDir } from '../services/fileManager';
import { convertToLinear16, getConvertedPath } from '../services/audioProcessor';
import { transcribe } from '../services/speechToText';
import {
  createTranscriptionJob,
  updateTranscriptionJob,
  getTranscriptionJob,
} from '../services/jobStore';
import { createStrictRateLimiter } from '../middleware/rateLimiter';

export const transcribeRouter = Router();

transcribeRouter.post(
  '/',
  createStrictRateLimiter(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uploadId } = req.body;

      if (!uploadId || typeof uploadId !== 'string') {
        res.status(400).json({ error: 'uploadId is required' });
        return;
      }

      const exists = await uploadExists(uploadId);
      if (!exists) {
        res.status(404).json({ error: 'Upload not found' });
        return;
      }

      const job = createTranscriptionJob(uploadId);

      // Kick off async processing
      processTranscription(job.id, uploadId).catch((err) => {
        console.error('Transcription processing error:', err);
        updateTranscriptionJob(job.id, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      });

      res.status(202).json({ id: job.id, status: job.status });
    } catch (err) {
      next(err);
    }
  },
);

transcribeRouter.get(
  '/:id/status',
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const job = getTranscriptionJob(req.params.id);
      if (!job) {
        res.status(404).json({ error: 'Transcription job not found' });
        return;
      }

      if (job.status === 'completed') {
        res.json(job);
      } else {
        res.json({ id: job.id, status: job.status, error: job.error });
      }
    } catch (err) {
      next(err);
    }
  },
);

async function processTranscription(jobId: string, uploadId: string): Promise<void> {
  updateTranscriptionJob(jobId, { status: 'processing' });

  const uploadDir = path.join(getUploadDir(), uploadId);
  const inputPath = path.join(uploadDir, 'original.mp3');

  // Convert to LINEAR16
  const audioMeta = await convertToLinear16(inputPath, uploadDir);

  // Transcribe — pass both the converted WAV and original MP3
  const convertedPath = getConvertedPath(uploadDir);
  const segments = await transcribe(convertedPath, audioMeta.sampleRateHertz, audioMeta.durationSeconds, inputPath);

  const fullText = segments.map((s) => s.text).join(' ');

  updateTranscriptionJob(jobId, {
    status: 'completed',
    segments,
    fullText,
  });
}
