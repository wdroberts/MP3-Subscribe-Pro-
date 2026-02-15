import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { saveUpload, cleanupUpload } from '../services/fileManager';
import { validateMp3 } from '../services/audioProcessor';

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10)) * 1024 * 1024;

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
  limits: { fileSize: MAX_FILE_SIZE },
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
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const result = await saveUpload(req.file);

      // Validate the file is actually audio using ffprobe
      const isValid = await validateMp3(result.filepath);
      if (!isValid) {
        await cleanupUpload(result.id);
        res.status(400).json({
          error: 'File is not a valid audio file',
          details: 'The uploaded file could not be recognized as audio. Ensure it is a valid MP3 file and not a renamed file of another format.',
        });
        return;
      }

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);
