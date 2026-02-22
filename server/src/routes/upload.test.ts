import express from 'express';
import request from 'supertest';
import { processRouter } from './upload';
import * as audioProcessor from '../services/audioProcessor';
import * as fileManager from '../services/fileManager';

jest.mock('../services/audioProcessor');
jest.mock('../services/fileManager');

const mockedGetUploadDir = jest.mocked(fileManager.getUploadDir);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api/process', processRouter);

describe('process routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetUploadDir.mockReturnValue('/tmp/test-uploads');
  });

  it('returns 400 when init is missing fields', async () => {
    const res = await request(app)
      .post('/api/process/init')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required fields');
  });

  it('returns sessionId on valid init request', async () => {
    const res = await request(app)
      .post('/api/process/init')
      .send({ name: 'test.mp3', parts: 1, kind: 'audio/mpeg' });
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeDefined();
  });

  it('returns 400 when chunk is missing fields', async () => {
    const res = await request(app)
      .post('/api/process/chunk')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing sessionId');
  });

  it('returns 404 when chunk references unknown session', async () => {
    const res = await request(app)
      .post('/api/process/chunk')
      .send({ sessionId: 'nonexistent', idx: 0, payload: 'AAAA' });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Session not found');
  });

  it('returns 400 when finalize is missing sessionId', async () => {
    const res = await request(app)
      .post('/api/process/finalize')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing sessionId');
  });

  it('returns 404 when finalize references unknown session', async () => {
    const res = await request(app)
      .post('/api/process/finalize')
      .send({ sessionId: 'nonexistent' });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Session not found');
  });
});
