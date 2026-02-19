import express from 'express';
import request from 'supertest';
import { transcribeRouter } from './transcribe';
import * as fileManager from '../services/fileManager';
import * as audioProcessor from '../services/audioProcessor';
import * as speechToText from '../services/speechToText';
import * as jobStore from '../services/jobStore';
import fsPromises from 'fs/promises';

jest.mock('../services/fileManager');
jest.mock('../services/audioProcessor');
jest.mock('../services/speechToText');
jest.mock('../services/jobStore');

const mockedUploadExists = jest.mocked(fileManager.uploadExists);
const mockedGetUploadDir = jest.mocked(fileManager.getUploadDir);
const mockedCreateJob = jest.mocked(jobStore.createTranscriptionJob);
const mockedUpdateJob = jest.mocked(jobStore.updateTranscriptionJob);
const mockedGetJob = jest.mocked(jobStore.getTranscriptionJob);
const mockedConvertToLinear16 = jest.mocked(audioProcessor.convertToLinear16);
const mockedGetConvertedPath = jest.mocked(audioProcessor.getConvertedPath);
const mockedProbeAudioMeta = jest.mocked(audioProcessor.probeAudioMeta);
const mockedTranscribe = jest.mocked(speechToText.transcribe);

const app = express();
app.use(express.json());
app.use('/api/transcribe', transcribeRouter);

// Helper to wait for async fire-and-forget processing
function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('transcribe routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // Default: small file (under 4MB threshold) so tests use the WAV conversion path
    jest.spyOn(fsPromises, 'stat').mockResolvedValue({ size: 100_000 } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
      mockedGetUploadDir.mockReturnValue('/tmp/uploads');
      mockedCreateJob.mockReturnValue({
        id: 'job-123',
        uploadId: 'upload-1',
        segments: [],
        fullText: '',
        status: 'pending',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      // Mock the async processing chain so it doesn't error
      mockedConvertToLinear16.mockResolvedValue({ sampleRateHertz: 16000, durationSeconds: 30 });
      mockedGetConvertedPath.mockReturnValue('/tmp/uploads/upload-1/audio.wav');
      mockedTranscribe.mockResolvedValue([]);

      const res = await request(app).post('/api/transcribe').send({ uploadId: 'upload-1' });
      expect(res.status).toBe(202);
      expect(res.body.id).toBe('job-123');
      expect(res.body.status).toBe('pending');
    });
  });

  describe('POST / processTranscription (async background)', () => {
    it('processes transcription successfully and updates job to completed', async () => {
      mockedUploadExists.mockResolvedValue(true);
      mockedGetUploadDir.mockReturnValue('/tmp/uploads');
      mockedCreateJob.mockReturnValue({
        id: 'job-1',
        uploadId: 'upload-1',
        segments: [],
        fullText: '',
        status: 'pending',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      mockedConvertToLinear16.mockResolvedValue({ sampleRateHertz: 16000, durationSeconds: 30 });
      mockedGetConvertedPath.mockReturnValue('/tmp/uploads/upload-1/audio.wav');
      mockedTranscribe.mockResolvedValue([
        { index: 0, startTime: 0, endTime: 2, text: 'Hello world.' },
        { index: 1, startTime: 2, endTime: 4, text: 'Good morning.' },
      ]);

      await request(app).post('/api/transcribe').send({ uploadId: 'upload-1' });

      // Wait for the fire-and-forget promise to resolve
      await flushPromises();

      // Should set processing first, then completed
      expect(mockedUpdateJob).toHaveBeenCalledWith('job-1', {
        status: 'processing',
        progress: { percent: 0, currentStep: 'Analyzing audio...' },
      });
      expect(mockedUpdateJob).toHaveBeenCalledWith('job-1', {
        status: 'completed',
        progress: { percent: 100, currentStep: 'Complete' },
        segments: [
          { index: 0, startTime: 0, endTime: 2, text: 'Hello world.' },
          { index: 1, startTime: 2, endTime: 4, text: 'Good morning.' },
        ],
        fullText: 'Hello world. Good morning.',
      });
    });

    it('calls convertToLinear16 with correct paths', async () => {
      mockedUploadExists.mockResolvedValue(true);
      mockedGetUploadDir.mockReturnValue('/data/uploads');
      mockedCreateJob.mockReturnValue({
        id: 'job-2',
        uploadId: 'up-abc',
        segments: [],
        fullText: '',
        status: 'pending',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      mockedConvertToLinear16.mockResolvedValue({ sampleRateHertz: 16000, durationSeconds: 10 });
      mockedGetConvertedPath.mockReturnValue('/data/uploads/up-abc/audio.wav');
      mockedTranscribe.mockResolvedValue([]);

      await request(app).post('/api/transcribe').send({ uploadId: 'up-abc' });
      await flushPromises();

      expect(mockedConvertToLinear16).toHaveBeenCalledWith(
        '/data/uploads/up-abc/original.mp3',
        '/data/uploads/up-abc',
      );
      expect(mockedTranscribe).toHaveBeenCalledWith(
        '/data/uploads/up-abc/audio.wav',
        16000,
        10,
        '/data/uploads/up-abc/original.mp3',
        expect.any(Function),
      );
    });

    it('updates job to failed when convertToLinear16 throws', async () => {
      mockedUploadExists.mockResolvedValue(true);
      mockedGetUploadDir.mockReturnValue('/tmp/uploads');
      mockedCreateJob.mockReturnValue({
        id: 'job-3',
        uploadId: 'upload-1',
        segments: [],
        fullText: '',
        status: 'pending',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      mockedConvertToLinear16.mockRejectedValue(new Error('ffmpeg crashed'));

      await request(app).post('/api/transcribe').send({ uploadId: 'upload-1' });
      await flushPromises();

      expect(mockedUpdateJob).toHaveBeenCalledWith('job-3', {
        status: 'failed',
        error: 'ffmpeg crashed',
      });
    });

    it('updates job to failed when transcribe throws', async () => {
      mockedUploadExists.mockResolvedValue(true);
      mockedGetUploadDir.mockReturnValue('/tmp/uploads');
      mockedCreateJob.mockReturnValue({
        id: 'job-4',
        uploadId: 'upload-1',
        segments: [],
        fullText: '',
        status: 'pending',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      mockedConvertToLinear16.mockResolvedValue({ sampleRateHertz: 16000, durationSeconds: 30 });
      mockedGetConvertedPath.mockReturnValue('/tmp/uploads/upload-1/audio.wav');
      mockedTranscribe.mockRejectedValue(new Error('Google API quota exceeded'));

      await request(app).post('/api/transcribe').send({ uploadId: 'upload-1' });
      await flushPromises();

      expect(mockedUpdateJob).toHaveBeenCalledWith('job-4', {
        status: 'failed',
        error: 'Google API quota exceeded',
      });
    });

    it('handles non-Error thrown values in processTranscription', async () => {
      mockedUploadExists.mockResolvedValue(true);
      mockedGetUploadDir.mockReturnValue('/tmp/uploads');
      mockedCreateJob.mockReturnValue({
        id: 'job-5',
        uploadId: 'upload-1',
        segments: [],
        fullText: '',
        status: 'pending',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      mockedConvertToLinear16.mockRejectedValue('string error');

      await request(app).post('/api/transcribe').send({ uploadId: 'upload-1' });
      await flushPromises();

      expect(mockedUpdateJob).toHaveBeenCalledWith('job-5', {
        status: 'failed',
        error: 'Unknown error',
      });
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
