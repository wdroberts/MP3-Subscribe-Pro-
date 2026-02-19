import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UploadResult } from '../types';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './tmp/uploads';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUploadId(id: string): boolean {
  return UUID_RE.test(id);
}

export function getUploadDir(): string {
  return UPLOAD_DIR;
}

export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function saveUpload(file: Express.Multer.File): Promise<UploadResult> {
  const id = uuidv4();
  const uploadPath = path.join(UPLOAD_DIR, id);
  await fs.mkdir(uploadPath, { recursive: true });

  const destPath = path.join(uploadPath, 'original.mp3');
  await fs.rename(file.path, destPath);

  return {
    id,
    filename: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    createdAt: new Date().toISOString(),
  };
}

export async function uploadExists(uploadId: string): Promise<boolean> {
  if (!isValidUploadId(uploadId)) return false;
  try {
    await fs.access(path.join(UPLOAD_DIR, uploadId, 'original.mp3'));
    return true;
  } catch {
    return false;
  }
}

export async function cleanupUpload(uploadId: string): Promise<void> {
  if (!isValidUploadId(uploadId)) {
    throw new Error('Invalid upload ID');
  }
  const uploadPath = path.join(UPLOAD_DIR, uploadId);
  await fs.rm(uploadPath, { recursive: true, force: true });
}

export async function cleanupStaleUploads(maxAgeMs: number): Promise<void> {
  try {
    const entries = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(UPLOAD_DIR, entry.name);
      const stat = await fs.stat(dirPath);
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.rm(dirPath, { recursive: true, force: true });
      }
    }
  } catch (err) {
    // Upload dir may not exist yet
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}
