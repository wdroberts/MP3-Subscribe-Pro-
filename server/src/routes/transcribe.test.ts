import express from 'express';
import request from 'supertest';
import { transcribeRouter } from './transcribe';
import * as fileManager from '../services/fileManager';
import * as jobStore from '../services/jobStore';

jest.mock('../services/fileManager');
jest.mock('../services/audioProcessor');
jest.mock('../services/speechToText');
jest.mock('../services/jobStore');

const mockedUploadExists = jest.mocked(fileManager.uploadExists);
const mockedCreateJob = jest.mocked(jobStore.createTranscriptionJob);
const mockedGetJob = jest.mocked(jobStore.getTranscriptionJob);

const app = express();
app.use(express.json());
app.use('/api/transcribe', transcribeRouter);

describe('transcribe routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /', () => {
    it('returns 400 when uploadId is missing', async () => {
      const res = await request(app).post('/api/transcribe').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('uploadId is required');
    });

    it('returns 400 when uploadId is not a string', async () => {
      const res = await request(app).post('/api/transcribe').send({ uploadId: 42 });
      expect(res.status).toBe(400);
    });

    it('returns 404 when upload does not exist', async () => {
      mockedUploadExists.mockResolvedValue(false);
      const res = await request(app).post('/api/transcribe').send({ uploadId: 'missing' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Upload not found');
    });

    it('returns 202 and creates a job when upload exists', async () => {
      mockedUploadExists.mockResolvedValue(true);
      mockedCreateJob.mockReturnValue({
        id: 'job-123',
        uploadId: 'upload-1',
        segments: [],
        fullText: '',
        status: 'pending',
        createdAt: '2025-01-01T00:00:00.000Z',
      });

      const res = await request(app).post('/api/transcribe').send({ uploadId: 'upload-1' });
      expect(res.status).toBe(202);
      expect(res.body.id).toBe('job-123');
      expect(res.body.status).toBe('pending');
    });
  });

  describe('GET /:id/status', () => {
    it('returns 404 when job does not exist', async () => {
      mockedGetJob.mockReturnValue(undefined);
      const res = await request(app).get('/api/transcribe/nonexistent/status');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Transcription job not found');
    });

    it('returns full job when status is completed', async () => {
      mockedGetJob.mockReturnValue({
        id: 'job-1',
        uploadId: 'up-1',
        segments: [{ index: 0, startTime: 0, endTime: 1, text: 'Hello.' }],
        fullText: 'Hello.',
        status: 'completed',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      const res = await request(app).get('/api/transcribe/job-1/status');
      expect(res.status).toBe(200);
      expect(res.body.segments).toHaveLength(1);
      expect(res.body.fullText).toBe('Hello.');
    });

    it('returns partial info when status is processing', async () => {
      mockedGetJob.mockReturnValue({
        id: 'job-1',
        uploadId: 'up-1',
        segments: [],
        fullText: '',
        status: 'processing',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      const res = await request(app).get('/api/transcribe/job-1/status');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('processing');
      expect(res.body.segments).toBeUndefined();
    });

    it('returns error info when status is failed', async () => {
      mockedGetJob.mockReturnValue({
        id: 'job-1',
        uploadId: 'up-1',
        segments: [],
        fullText: '',
        status: 'failed',
        error: 'Something went wrong',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      const res = await request(app).get('/api/transcribe/job-1/status');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('failed');
      expect(res.body.error).toBe('Something went wrong');
    });
  });
});
