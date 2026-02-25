import express from 'express';
import request from 'supertest';
import { summarizeRouter } from './summarize';
import * as jobStore from '../services/jobStore';
import * as summarizer from '../services/summarizer';

jest.mock('../services/jobStore');
jest.mock('../services/summarizer');

const mockedGetJob = jest.mocked(jobStore.getTranscriptionJob);
const mockedSummarize = jest.mocked(summarizer.summarize);

const app = express();
app.use(express.json());
app.use('/api/summarize', summarizeRouter);

const JOB_UUID = 'a0000000-0000-4000-8000-000000000001';
const UPLOAD_UUID = 'b0000000-0000-4000-8000-000000000001';

describe('summarize routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when transcriptionId is missing', async () => {
    const res = await request(app).post('/api/summarize').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('transcriptionId is required');
  });

  it('returns 400 when transcriptionId is not a string', async () => {
    const res = await request(app).post('/api/summarize').send({ transcriptionId: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('transcriptionId is required');
  });

  it('returns 400 when transcriptionId is not a valid UUID', async () => {
    const res = await request(app).post('/api/summarize').send({ transcriptionId: 'nonexistent' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid transcriptionId format');
  });

  it('returns 404 when transcription job is not found', async () => {
    mockedGetJob.mockReturnValue(undefined);
    const res = await request(app).post('/api/summarize').send({ transcriptionId: JOB_UUID });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Transcription not found');
  });

  it('returns 400 when transcription is not completed', async () => {
    mockedGetJob.mockReturnValue({
      id: JOB_UUID,
      uploadId: UPLOAD_UUID,
      segments: [],
      fullText: '',
      status: 'processing',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    const res = await request(app).post('/api/summarize').send({ transcriptionId: JOB_UUID });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Transcription is not yet completed');
  });

  it('returns summary for completed transcription', async () => {
    mockedGetJob.mockReturnValue({
      id: JOB_UUID,
      uploadId: UPLOAD_UUID,
      segments: [],
      fullText: 'Some long text to summarize.',
      status: 'completed',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    mockedSummarize.mockResolvedValue('A summary of the text.');

    const res = await request(app).post('/api/summarize').send({ transcriptionId: JOB_UUID });
    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('A summary of the text.');
    expect(res.body.transcriptionId).toBe(JOB_UUID);
    expect(res.body.createdAt).toBeDefined();
  });
});
