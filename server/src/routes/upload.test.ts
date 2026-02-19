import express from 'express';
import request from 'supertest';
import { uploadRouter } from './upload';
import * as fileManager from '../services/fileManager';
import * as audioProcessor from '../services/audioProcessor';

jest.mock('../services/fileManager');
jest.mock('../services/audioProcessor');

const mockedSaveUpload = jest.mocked(fileManager.saveUpload);
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
      mimeType: 'audio/mpeg',
      sizeBytes: 100,
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    mockedValidateMp3.mockResolvedValue(true);
    mockedSaveUpload.mockResolvedValue(mockResult);

    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.alloc(100, 0xff), {
        filename: 'test.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('upload-123');
    expect(res.body.filename).toBe('test.mp3');
    expect(mockedValidateMp3).toHaveBeenCalled();
    expect(mockedSaveUpload).toHaveBeenCalled();
  });

  it('rejects non-audio MIME types via multer fileFilter', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.alloc(100, 0xff), {
        filename: 'test.txt',
        contentType: 'text/plain',
      });

    // Multer rejects before handler — saveUpload should not be called
    expect(mockedSaveUpload).not.toHaveBeenCalled();
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('accepts audio/mp3 MIME type', async () => {
    const mockResult = {
      id: 'upload-789',
      filename: 'test.mp3',
      mimeType: 'audio/mp3',
      sizeBytes: 100,
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    mockedValidateMp3.mockResolvedValue(true);
    mockedSaveUpload.mockResolvedValue(mockResult);

    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.alloc(100, 0xff), {
        filename: 'test.mp3',
        contentType: 'audio/mp3',
      });

    expect(res.status).toBe(201);
    expect(mockedSaveUpload).toHaveBeenCalled();
  });

  it('returns 400 when file fails audio validation', async () => {
    mockedValidateMp3.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.alloc(100, 0xff), {
        filename: 'test.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('File does not contain a valid audio stream');
    expect(mockedSaveUpload).not.toHaveBeenCalled();
  });
});
