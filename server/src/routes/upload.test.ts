import express from 'express';
import request from 'supertest';
import { transferRouter } from './upload';
import * as audioProcessor from '../services/audioProcessor';
import * as fileManager from '../services/fileManager';

jest.mock('../services/audioProcessor');
jest.mock('../services/fileManager');

const mockedValidateMp3 = jest.mocked(audioProcessor.validateMp3);
const mockedGetUploadDir = jest.mocked(fileManager.getUploadDir);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api/transfer', transferRouter);

describe('transfer routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetUploadDir.mockReturnValue('/tmp/test-uploads');
  });

  it('returns 400 when begin is missing fields', async () => {
    const res = await request(app)
      .post('/api/transfer/begin')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required fields');
  });

  it('returns uploadId on valid begin request', async () => {
    const res = await request(app)
      .post('/api/transfer/begin')
      .send({ filename: 'test.mp3', totalChunks: 1, mimeType: 'audio/mpeg' });
    expect(res.status).toBe(200);
    expect(res.body.uploadId).toBeDefined();
  });

  it('returns 400 when part is missing fields', async () => {
    const res = await request(app)
      .post('/api/transfer/part')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing uploadId');
  });

  it('returns 404 when part references unknown session', async () => {
    const res = await request(app)
      .post('/api/transfer/part')
      .send({ uploadId: 'nonexistent', chunkIndex: 0, data: 'AAAA' });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Transfer session not found');
  });

  it('returns 400 when done is missing uploadId', async () => {
    const res = await request(app)
      .post('/api/transfer/done')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing uploadId');
  });

  it('returns 404 when done references unknown session', async () => {
    const res = await request(app)
      .post('/api/transfer/done')
      .send({ uploadId: 'nonexistent' });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Transfer session not found');
  });
});
