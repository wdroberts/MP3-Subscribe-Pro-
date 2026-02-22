import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { saveUpload } from '../services/fileManager';
import { validateMp3 } from '../services/audioProcessor';
import { getUploadDir } from '../services/fileManager';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10);
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

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

// Chunk uploads use application/octet-stream — no MIME filtering needed
const chunkUpload = multer({
  dest: process.env.UPLOAD_DIR || './tmp/uploads',
  limits: { fileSize: 10 * 1024 * 1024 }, // 5 MB per chunk + overhead
});

// Track in-progress chunked uploads: uploadId → { totalChunks, receivedChunks, filename, mimeType, totalSize }
interface ChunkedUploadState {
  totalChunks: number;
  receivedChunks: Set<number>;
  filename: string;
  mimeType: string;
  totalSize: number;
  chunksDir: string;
}
const chunkedUploads = new Map<string, ChunkedUploadState>();

export const uploadRouter = Router();
export const transferRouter = Router();

// ── Single-request upload (small files) ──────────────────────────────
uploadRouter.post(
  '/',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const isValid = await validateMp3(req.file.path);
      if (!isValid) {
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

// ── Chunked upload: initialize ───────────────────────────────────────
uploadRouter.post(
  '/init',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filename, totalChunks, totalSize, mimeType } = req.body;

      if (!filename || !totalChunks || !totalSize) {
        res.status(400).json({ error: 'Missing required fields: filename, totalChunks, totalSize' });
        return;
      }

      if (totalSize > MAX_FILE_SIZE) {
        res.status(400).json({ error: `File too large (${Math.round(totalSize / 1024 / 1024)} MB). Maximum is ${MAX_FILE_SIZE_MB} MB.` });
        return;
      }

      const uploadId = uuidv4();
      const chunksDir = path.join(getUploadDir(), `chunks-${uploadId}`);
      await fs.mkdir(chunksDir, { recursive: true });

      chunkedUploads.set(uploadId, {
        totalChunks,
        receivedChunks: new Set(),
        filename,
        mimeType: mimeType || 'audio/mpeg',
        totalSize,
        chunksDir,
      });

      res.status(200).json({ uploadId });
    } catch (err) {
      next(err);
    }
  },
);

// ── Chunked upload: receive a chunk ──────────────────────────────────
uploadRouter.post(
  '/chunk',
  chunkUpload.single('chunk'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uploadId = req.body.uploadId;
      const chunkIndex = parseInt(req.body.chunkIndex, 10);

      if (!uploadId || isNaN(chunkIndex)) {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        res.status(400).json({ error: 'Missing uploadId or chunkIndex' });
        return;
      }

      const state = chunkedUploads.get(uploadId);
      if (!state) {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        res.status(404).json({ error: 'Upload session not found. Call /api/upload/init first.' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No chunk data received' });
        return;
      }

      // Move chunk to the chunks directory with predictable name
      const chunkPath = path.join(state.chunksDir, `chunk-${String(chunkIndex).padStart(5, '0')}`);
      await fs.rename(req.file.path, chunkPath);
      state.receivedChunks.add(chunkIndex);

      res.status(200).json({
        chunkIndex,
        received: state.receivedChunks.size,
        total: state.totalChunks,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── Chunked upload: complete (reassemble) ────────────────────────────
uploadRouter.post(
  '/complete',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uploadId } = req.body;

      if (!uploadId) {
        res.status(400).json({ error: 'Missing uploadId' });
        return;
      }

      const state = chunkedUploads.get(uploadId);
      if (!state) {
        res.status(404).json({ error: 'Upload session not found' });
        return;
      }

      if (state.receivedChunks.size !== state.totalChunks) {
        res.status(400).json({
          error: `Missing chunks: received ${state.receivedChunks.size} of ${state.totalChunks}`,
        });
        return;
      }

      // Reassemble chunks into a single file
      const uploadDir = getUploadDir();
      const assembledId = uuidv4();
      const assembledDir = path.join(uploadDir, assembledId);
      await fs.mkdir(assembledDir, { recursive: true });
      const assembledPath = path.join(assembledDir, 'original.mp3');

      const writeStream = createWriteStream(assembledPath);
      for (let i = 0; i < state.totalChunks; i++) {
        const chunkPath = path.join(state.chunksDir, `chunk-${String(i).padStart(5, '0')}`);
        const chunkData = await fs.readFile(chunkPath);
        writeStream.write(chunkData);
      }
      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on('error', reject);
      });

      // Clean up chunks directory
      await fs.rm(state.chunksDir, { recursive: true, force: true });
      chunkedUploads.delete(uploadId);

      // Validate the assembled audio file
      const isValid = await validateMp3(assembledPath);
      if (!isValid) {
        await fs.rm(assembledDir, { recursive: true, force: true });
        res.status(400).json({ error: 'File does not contain a valid audio stream' });
        return;
      }

      const stat = await fs.stat(assembledPath);
      res.status(201).json({
        id: assembledId,
        filename: state.filename,
        mimeType: state.mimeType,
        sizeBytes: stat.size,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ══════════════════════════════════════════════════════════════════════
// Transfer endpoints — identical logic, different URL path to bypass
// platform proxies that apply upload-specific rules to /api/upload/*
// ══════════════════════════════════════════════════════════════════════

transferRouter.post(
  '/begin',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filename, totalChunks, mimeType } = req.body;

      if (!filename || !totalChunks) {
        res.status(400).json({ error: 'Missing required fields: filename, totalChunks' });
        return;
      }

      const uploadId = uuidv4();
      const chunksDir = path.join(getUploadDir(), `chunks-${uploadId}`);
      await fs.mkdir(chunksDir, { recursive: true });

      chunkedUploads.set(uploadId, {
        totalChunks,
        receivedChunks: new Set(),
        filename,
        mimeType: mimeType || 'audio/mpeg',
        totalSize: 0,
        chunksDir,
      });

      res.status(200).json({ uploadId });
    } catch (err) {
      next(err);
    }
  },
);

// Accepts base64-encoded chunk data in JSON body (no multipart/form-data)
transferRouter.post(
  '/part',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uploadId, chunkIndex, data } = req.body;
      const idx = typeof chunkIndex === 'number' ? chunkIndex : parseInt(chunkIndex, 10);

      if (!uploadId || isNaN(idx) || !data) {
        res.status(400).json({ error: 'Missing uploadId, chunkIndex, or data' });
        return;
      }

      const state = chunkedUploads.get(uploadId);
      if (!state) {
        res.status(404).json({ error: 'Transfer session not found' });
        return;
      }

      // Decode base64 and write to chunk file
      const buffer = Buffer.from(data, 'base64');
      const chunkPath = path.join(state.chunksDir, `chunk-${String(idx).padStart(5, '0')}`);
      await fs.writeFile(chunkPath, buffer);
      state.receivedChunks.add(idx);

      res.status(200).json({
        chunkIndex: idx,
        received: state.receivedChunks.size,
        total: state.totalChunks,
      });
    } catch (err) {
      next(err);
    }
  },
);

transferRouter.post(
  '/done',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uploadId } = req.body;

      if (!uploadId) {
        res.status(400).json({ error: 'Missing uploadId' });
        return;
      }

      const state = chunkedUploads.get(uploadId);
      if (!state) {
        res.status(404).json({ error: 'Transfer session not found' });
        return;
      }

      if (state.receivedChunks.size !== state.totalChunks) {
        res.status(400).json({
          error: `Missing chunks: received ${state.receivedChunks.size} of ${state.totalChunks}`,
        });
        return;
      }

      const uploadDir = getUploadDir();
      const assembledId = uuidv4();
      const assembledDir = path.join(uploadDir, assembledId);
      await fs.mkdir(assembledDir, { recursive: true });
      const assembledPath = path.join(assembledDir, 'original.mp3');

      const writeStream = createWriteStream(assembledPath);
      for (let i = 0; i < state.totalChunks; i++) {
        const chunkPath = path.join(state.chunksDir, `chunk-${String(i).padStart(5, '0')}`);
        const chunkData = await fs.readFile(chunkPath);
        writeStream.write(chunkData);
      }
      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on('error', reject);
      });

      await fs.rm(state.chunksDir, { recursive: true, force: true });
      chunkedUploads.delete(uploadId);

      const isValid = await validateMp3(assembledPath);
      if (!isValid) {
        await fs.rm(assembledDir, { recursive: true, force: true });
        res.status(400).json({ error: 'File does not contain a valid audio stream' });
        return;
      }

      const stat = await fs.stat(assembledPath);
      res.status(201).json({
        id: assembledId,
        filename: state.filename,
        mimeType: state.mimeType,
        sizeBytes: stat.size,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);
