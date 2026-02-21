import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { saveUpload } from '../services/fileManager';
import { validateMp3 } from '../services/audioProcessor';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10);
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
console.log(`[upload] MAX_FILE_SIZE_MB=${MAX_FILE_SIZE_MB}, limit=${MAX_FILE_SIZE} bytes`);

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/x-mpeg',
  'audio/mpeg3',
  'audio/x-mpeg-3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
  'audio/webm',
]);

const upload = multer({
  dest: process.env.UPLOAD_DIR || './tmp/uploads',
  limits: { fileSize: Infinity },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AUDIO_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only audio files are allowed (received ${file.mimetype})`));
    }
  },
});

export const uploadRouter = Router();

uploadRouter.post(
  '/',
  (req: Request, _res: Response, next: NextFunction) => {
    console.log(`[upload] Incoming request: Content-Length=${req.headers['content-length']}, Content-Type=${req.headers['content-type']?.substring(0, 50)}`);
    next();
  },
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const isValid = await validateMp3(req.file.path);
      if (!isValid) {
        const fs = await import('fs/promises');
        await fs.unlink(req.file.path).catch(() => {});
        res.status(400).json({ error: 'File does not contain a valid audio stream' });
        return;
      }

      const result = await saveUpload(req.file);

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);
