import express from 'express';
import request from 'supertest';
import { uploadRouter } from './upload';
import * as fileManager from '../services/fileManager';
import * as audioProcessor from '../services/audioProcessor';

jest.mock('../services/fileManager');
jest.mock('../services/audioProcessor');

const mockedSaveUpload = jest.mocked(fileManager.saveUpload);
const mockedCleanupUpload = jest.mocked(fileManager.cleanupUpload);
const mockedValidateMp3 = jest.mocked(audioProcessor.validateMp3);

const app = express();
app.use('/api/upload', uploadRouter);

describe('upload routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when no file is uploaded', async () => {
    const res = await request(app).post('/api/upload');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file uploaded');
  });

  it('returns 201 with upload result on valid MP3 upload', async () => {
    const mockResult = {
      id: 'upload-123',
      filename: 'test.mp3',
      filepath: '/tmp/uploads/upload-123/original.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 100,
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    mockedSaveUpload.mockResolvedValue(mockResult);
    mockedValidateMp3.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.alloc(100, 0xff), {
        filename: 'test.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('upload-123');
    expect(res.body.filename).toBe('test.mp3');
    expect(mockedSaveUpload).toHaveBeenCalled();
    expect(mockedValidateMp3).toHaveBeenCalledWith(mockResult.filepath);
  });

  it('returns 400 and cleans up when file is not valid audio', async () => {
    const mockResult = {
      id: 'upload-456',
      filename: 'fake.mp3',
      filepath: '/tmp/uploads/upload-456/original.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 100,
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    mockedSaveUpload.mockResolvedValue(mockResult);
    mockedValidateMp3.mockResolvedValue(false);
    mockedCleanupUpload.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.alloc(100, 0xff), {
        filename: 'fake.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('File is not a valid audio file');
    expect(mockedCleanupUpload).toHaveBeenCalledWith('upload-456');
  });

  it('rejects non-MP3 MIME types via multer fileFilter', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.alloc(100, 0xff), {
        filename: 'test.wav',
        contentType: 'audio/wav',
      });

    // Multer rejects before handler — results in 500 from the unhandled error
    // or 400 depending on error handler. The key assertion: saveUpload was not called
    expect(mockedSaveUpload).not.toHaveBeenCalled();
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('accepts audio/mp3 MIME type', async () => {
    const mockResult = {
      id: 'upload-789',
      filename: 'test.mp3',
      filepath: '/tmp/uploads/upload-789/original.mp3',
      mimeType: 'audio/mp3',
      sizeBytes: 100,
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    mockedSaveUpload.mockResolvedValue(mockResult);
    mockedValidateMp3.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.alloc(100, 0xff), {
        filename: 'test.mp3',
        contentType: 'audio/mp3',
      });

    expect(res.status).toBe(201);
    expect(mockedSaveUpload).toHaveBeenCalled();
  });
});
