import { Router, Request, Response, NextFunction } from 'express';
import { getTranscriptionJob } from '../services/jobStore';
import { toSrt, toTimestampedText } from '../utils/formatters';

export const exportRouter = Router();

exportRouter.get(
  '/:id/:format',
  async (req: Request<{ id: string; format: string }>, res: Response, next: NextFunction) => {
    try {
      const { id, format } = req.params;

      const transcription = getTranscriptionJob(id);
      if (!transcription) {
        res.status(404).json({ error: 'Transcription not found' });
        return;
      }

      if (transcription.status !== 'completed') {
        res.status(400).json({ error: 'Transcription is not yet completed' });
        return;
      }

      switch (format) {
        case 'txt': {
          const text = toTimestampedText(transcription.segments);
          res.setHeader('Content-Type', 'text/plain');
          res.setHeader('Content-Disposition', 'attachment; filename="transcription.txt"');
          res.send(text);
          break;
        }
        case 'srt': {
          const srt = toSrt(transcription.segments);
          res.setHeader('Content-Type', 'application/x-subrip');
          res.setHeader('Content-Disposition', 'attachment; filename="transcription.srt"');
          res.send(srt);
          break;
        }
        case 'json': {
          res.setHeader('Content-Disposition', 'attachment; filename="transcription.json"');
          res.json(transcription);
          break;
        }
        default:
          res.status(400).json({ error: 'Invalid format. Use txt, srt, or json.' });
      }
    } catch (err) {
      next(err);
    }
  },
);
