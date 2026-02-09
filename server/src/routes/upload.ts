import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { saveUpload, cleanupUpload } from '../services/fileManager';
import { validateMp3 } from '../services/audioProcessor';

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10)) * 1024 * 1024;

const upload = multer({
  dest: process.env.UPLOAD_DIR || './tmp/uploads',
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/mp3') {
      cb(null, true);
    } else {
      cb(new Error('Only MP3 files are allowed'));
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

      // Validate the file is actually audio
      const isValid = await validateMp3(result.filepath);
      if (!isValid) {
        await cleanupUpload(result.id);
        res.status(400).json({ error: 'File is not a valid audio file' });
        return;
      }

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);
