import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { validateMp3 } from '../services/audioProcessor';
import { getUploadDir } from '../services/fileManager';

// Track in-progress chunked uploads
interface ChunkedUploadState {
  totalChunks: number;
  receivedChunks: Set<number>;
  filename: string;
  mimeType: string;
  chunksDir: string;
}
const chunkedUploads = new Map<string, ChunkedUploadState>();

export const transferRouter = Router();

// ── Transfer: initialize ─────────────────────────────────────────────
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
        chunksDir,
      });

      res.status(200).json({ uploadId });
    } catch (err) {
      next(err);
    }
  },
);

// ── Transfer: receive a chunk (base64 JSON, no multipart) ────────────
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

// ── Transfer: complete (reassemble chunks) ───────────────────────────
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
