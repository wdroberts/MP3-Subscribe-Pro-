import express from 'express';
import request from 'supertest';
import { exportRouter } from './export';
import * as jobStore from '../services/jobStore';

jest.mock('../services/jobStore');

const mockedGetJob = jest.mocked(jobStore.getTranscriptionJob);

const app = express();
app.use(express.json());
app.use('/api/export', exportRouter);

const completedJob = {
  id: 'job-1',
  uploadId: 'upload-1',
  segments: [
    { index: 0, startTime: 0, endTime: 2.5, text: 'Hello world.' },
    { index: 1, startTime: 2.5, endTime: 5.0, text: 'Second sentence.' },
  ],
  fullText: 'Hello world. Second sentence.',
  status: 'completed' as const,
  createdAt: '2025-01-01T00:00:00.000Z',
};

describe('export routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 when job does not exist', async () => {
    mockedGetJob.mockReturnValue(undefined);
    const res = await request(app).get('/api/export/nonexistent/txt');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Transcription not found');
  });

  it('returns 400 when transcription is not completed', async () => {
    mockedGetJob.mockReturnValue({ ...completedJob, status: 'processing', segments: [], fullText: '' });
    const res = await request(app).get('/api/export/job-1/txt');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Transcription is not yet completed');
  });

  it('exports as txt with proper headers', async () => {
    mockedGetJob.mockReturnValue(completedJob);
    const res = await request(app).get('/api/export/job-1/txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toContain('transcription.txt');
    expect(res.text).toContain('Hello world.');
  });

  it('exports as srt with proper headers', async () => {
    mockedGetJob.mockReturnValue(completedJob);
    const res = await request(app).get('/api/export/job-1/srt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-subrip');
    expect(res.headers['content-disposition']).toContain('transcription.srt');
    expect(res.text).toContain('-->');
  });

  it('exports as json with proper headers', async () => {
    mockedGetJob.mockReturnValue(completedJob);
    const res = await request(app).get('/api/export/job-1/json');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('transcription.json');
    expect(res.body.segments).toHaveLength(2);
  });

  it('returns 400 for invalid format', async () => {
    mockedGetJob.mockReturnValue(completedJob);
    const res = await request(app).get('/api/export/job-1/pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid format');
  });
});
