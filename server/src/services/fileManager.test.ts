import fs from 'fs/promises';
import path from 'path';
import {
  getUploadDir,
  ensureUploadDir,
  uploadExists,
  cleanupUpload,
  cleanupStaleUploads,
} from './fileManager';

jest.mock('fs/promises');
jest.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

const mockedFs = jest.mocked(fs);
const UPLOAD_DIR = process.env.UPLOAD_DIR || './tmp/uploads';

describe('fileManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUploadDir', () => {
    it('returns the upload directory', () => {
      expect(getUploadDir()).toBe(UPLOAD_DIR);
    });
  });

  describe('ensureUploadDir', () => {
    it('creates the upload directory recursively', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      await ensureUploadDir();
      expect(mockedFs.mkdir).toHaveBeenCalledWith(UPLOAD_DIR, { recursive: true });
    });
  });

  describe('uploadExists', () => {
    it('returns true when file is accessible', async () => {
      mockedFs.access.mockResolvedValue(undefined);
      const exists = await uploadExists('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(exists).toBe(true);
    });

    it('returns false when file is not accessible', async () => {
      mockedFs.access.mockRejectedValue(new Error('ENOENT'));
      const exists = await uploadExists('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(exists).toBe(false);
    });

    it('returns false for invalid uploadId', async () => {
      const exists = await uploadExists('../../etc');
      expect(exists).toBe(false);
      expect(mockedFs.access).not.toHaveBeenCalled();
    });
  });

  describe('cleanupUpload', () => {
    it('removes the upload directory', async () => {
      mockedFs.rm.mockResolvedValue(undefined);
      await cleanupUpload('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(mockedFs.rm).toHaveBeenCalledWith(
        path.join(UPLOAD_DIR, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
        { recursive: true, force: true },
      );
    });

    it('throws for invalid uploadId', async () => {
      await expect(cleanupUpload('../../etc')).rejects.toThrow('Invalid upload ID');
      expect(mockedFs.rm).not.toHaveBeenCalled();
    });
  });

  describe('cleanupStaleUploads', () => {
    it('removes directories older than maxAgeMs', async () => {
      const now = Date.now();
      mockedFs.readdir.mockResolvedValue([
        { name: 'old-upload', isDirectory: () => true },
        { name: 'new-upload', isDirectory: () => true },
        { name: 'some-file.txt', isDirectory: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      mockedFs.stat.mockImplementation(async (p) => {
        if (String(p).includes('old-upload')) {
          return { mtimeMs: now - 10000 } as Awaited<ReturnType<typeof fs.stat>>;
        }
        return { mtimeMs: now - 100 } as Awaited<ReturnType<typeof fs.stat>>;
      });

      mockedFs.rm.mockResolvedValue(undefined);

      await cleanupStaleUploads(5000);

      expect(mockedFs.rm).toHaveBeenCalledTimes(1);
      expect(mockedFs.rm).toHaveBeenCalledWith(
        path.join(UPLOAD_DIR, 'old-upload'),
        { recursive: true, force: true },
      );
    });

    it('handles ENOENT when upload dir does not exist', async () => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockedFs.readdir.mockRejectedValue(err);
      await expect(cleanupStaleUploads(5000)).resolves.toBeUndefined();
    });

    it('rethrows non-ENOENT errors', async () => {
      const err = Object.assign(new Error('EPERM'), { code: 'EPERM' });
      mockedFs.readdir.mockRejectedValue(err);
      await expect(cleanupStaleUploads(5000)).rejects.toThrow('EPERM');
    });
  });
});
