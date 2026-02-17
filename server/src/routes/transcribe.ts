import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import { uploadExists, getUploadDir } from '../services/fileManager';
import { convertToLinear16, getConvertedPath } from '../services/audioProcessor';
import { transcribe, OnProgressCallback } from '../services/speechToText';
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
        res.json({ id: job.id, status: job.status, error: job.error, progress: job.progress });
      }
    } catch (err) {
      next(err);
    }
  },
);

async function processTranscription(jobId: string, uploadId: string): Promise<void> {
  updateTranscriptionJob(jobId, {
    status: 'processing',
    progress: { percent: 0, currentStep: 'Converting audio...' },
  });

  const uploadDir = path.join(getUploadDir(), uploadId);
  const inputPath = path.join(uploadDir, 'original.mp3');

  // Convert to LINEAR16
  const audioMeta = await convertToLinear16(inputPath, uploadDir);

  updateTranscriptionJob(jobId, {
    progress: { percent: 10, currentStep: 'Audio converted. Starting transcription...' },
  });

  // Progress callback — updates the job store so the polling endpoint returns live progress
  const onProgress: OnProgressCallback = (report) => {
    updateTranscriptionJob(jobId, { progress: report });
  };

  // Transcribe — pass both the converted WAV and original MP3
  const convertedPath = getConvertedPath(uploadDir);
  const segments = await transcribe(convertedPath, audioMeta.sampleRateHertz, audioMeta.durationSeconds, inputPath, onProgress);

  const fullText = segments.map((s) => s.text).join(' ');

  updateTranscriptionJob(jobId, {
    status: 'completed',
    progress: { percent: 100, currentStep: 'Complete' },
    segments,
    fullText,
  });
}
