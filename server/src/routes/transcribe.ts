import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fsPromises from 'fs/promises';
import { uploadExists, getUploadDir, isValidUploadId } from '../services/fileManager';
import { convertToLinear16, getConvertedPath, probeAudioMeta } from '../services/audioProcessor';
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

      if (!isValidUploadId(uploadId)) {
        res.status(400).json({ error: 'Invalid uploadId format' });
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

// Shared status handler — used by both GET and POST
async function handleStatusRequest(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const job = getTranscriptionJob(req.params.id);
    const method = req.method;
    console.log(`[STATUS] ${method} /${req.params.id}/status → ${job ? job.status : '404'} (progress: ${job?.progress?.percent ?? '-'}%)`);
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
}

// GET for backward compat (old client code), POST for new code (proxy-safe)
transcribeRouter.get('/:id/status', handleStatusRequest);
transcribeRouter.post('/:id/status', handleStatusRequest);

// 4 MB threshold — files larger than this go to Path C (MP3 chunking)
// and don't need WAV conversion at all
const LARGE_FILE_THRESHOLD = 4_000_000;

async function processTranscription(jobId: string, uploadId: string): Promise<void> {
  updateTranscriptionJob(jobId, {
    status: 'processing',
    progress: { percent: 0, currentStep: 'Analyzing audio...' },
  });

  const uploadDir = path.join(getUploadDir(), uploadId);
  const inputPath = path.join(uploadDir, 'original.mp3');

  // Progress callback — updates the job store so the polling endpoint returns live progress
  const onProgress: OnProgressCallback = (report) => {
    updateTranscriptionJob(jobId, { progress: report });
  };

  const CHUNK_SECONDS = 45;
  const mp3Size = (await fsPromises.stat(inputPath)).size;

  // Always probe the MP3 for duration first — needed for both paths
  const probedMeta = await probeAudioMeta(inputPath);
  let durationSeconds = probedMeta.durationSeconds;

  // If duration is unknown, estimate from file size (128 kbps assumption)
  if (durationSeconds <= 0) {
    durationSeconds = (mp3Size * 8) / 128000;
    console.warn(`[transcribe] Duration unknown from probe — estimating ${durationSeconds.toFixed(0)}s from file size`);
  }

  let segments;
  if (mp3Size > LARGE_FILE_THRESHOLD || durationSeconds > CHUNK_SECONDS) {
    // Large or long file — skip WAV conversion, send MP3 chunks directly
    const estimatedChunks = Math.ceil(durationSeconds / CHUNK_SECONDS);

    updateTranscriptionJob(jobId, {
      progress: { percent: 5, currentStep: 'Starting transcription...', chunksTotal: estimatedChunks, chunksCompleted: 0 },
    });

    segments = await transcribe(inputPath, probedMeta.sampleRateHertz, durationSeconds, inputPath, onProgress);
  } else {
    // Small + short file — convert to WAV (might fit inline as Path A or B)
    updateTranscriptionJob(jobId, {
      progress: { percent: 0, currentStep: 'Converting audio...' },
    });

    const audioMeta = await convertToLinear16(inputPath, uploadDir);
    // Prefer the WAV-probed duration if it's valid; otherwise keep the MP3 probe
    const wavDuration = audioMeta.durationSeconds > 0 ? audioMeta.durationSeconds : durationSeconds;

    updateTranscriptionJob(jobId, {
      progress: { percent: 10, currentStep: 'Starting transcription...', chunksTotal: 1, chunksCompleted: 0 },
    });

    const convertedPath = getConvertedPath(uploadDir);
    segments = await transcribe(convertedPath, audioMeta.sampleRateHertz, wavDuration, inputPath, onProgress);
  }

  const fullText = segments.map((s) => s.text).join(' ');

  updateTranscriptionJob(jobId, {
    status: 'completed',
    progress: { percent: 100, currentStep: 'Complete' },
    segments,
    fullText,
  });
}
