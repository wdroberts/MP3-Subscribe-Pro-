import { Router, Request, Response, NextFunction } from 'express';
import { getTranscriptionJob } from '../services/jobStore';
import { summarize } from '../services/summarizer';
import { createStrictRateLimiter } from '../middleware/rateLimiter';

export const summarizeRouter = Router();

summarizeRouter.post(
  '/',
  createStrictRateLimiter(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { transcriptionId } = req.body;

      if (!transcriptionId || typeof transcriptionId !== 'string') {
        res.status(400).json({ error: 'transcriptionId is required' });
        return;
      }

      const transcription = getTranscriptionJob(transcriptionId);
      if (!transcription) {
        res.status(404).json({ error: 'Transcription not found' });
        return;
      }

      if (transcription.status !== 'completed') {
        res.status(400).json({ error: 'Transcription is not yet completed' });
        return;
      }

      const summary = await summarize(transcription.fullText);

      res.json({
        id: transcriptionId,
        transcriptionId,
        summary,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);
