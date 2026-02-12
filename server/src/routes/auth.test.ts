import express from 'express';
import request from 'supertest';

// Mock google-auth-library before importing
const mockGenerateAuthUrl = jest.fn();
const mockGetToken = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockSetCredentials = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    generateAuthUrl: mockGenerateAuthUrl,
    getToken: mockGetToken,
    verifyIdToken: mockVerifyIdToken,
    setCredentials: mockSetCredentials,
  })),
}));

import { authRouter } from './auth';

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('auth routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /google/url', () => {
    it('returns the Google OAuth URL', async () => {
      mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/oauth?...');
      const res = await request(app).get('/api/auth/google/url');
      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://accounts.google.com/oauth?...');
    });
  });

  describe('POST /google/callback', () => {
    it('returns 400 when code is missing', async () => {
      const res = await request(app).post('/api/auth/google/callback').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Authorization code is required');
    });

    it('returns 400 when code is not a string', async () => {
      const res = await request(app).post('/api/auth/google/callback').send({ code: 123 });
      expect(res.status).toBe(400);
    });

    it('returns user info and tokens on success', async () => {
      mockGetToken.mockResolvedValue({
        tokens: {
          id_token: 'id-token-123',
          access_token: 'access-token-123',
          refresh_token: 'refresh-token-123',
        },
      });
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'user-1',
          email: 'user@example.com',
          name: 'Test User',
          picture: 'https://example.com/photo.jpg',
        }),
      });

      const res = await request(app)
        .post('/api/auth/google/callback')
        .send({ code: 'auth-code-123' });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('user@example.com');
      expect(res.body.user.name).toBe('Test User');
      expect(res.body.accessToken).toBe('access-token-123');
    });

    it('returns 401 when payload is null', async () => {
      mockGetToken.mockResolvedValue({
        tokens: { id_token: 'id-token', access_token: 'at', refresh_token: 'rt' },
      });
      mockVerifyIdToken.mockResolvedValue({ getPayload: () => null });

      const res = await request(app)
        .post('/api/auth/google/callback')
        .send({ code: 'auth-code-123' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('returns 401 when token exchange fails', async () => {
      mockGetToken.mockRejectedValue(new Error('Invalid code'));

      const res = await request(app)
        .post('/api/auth/google/callback')
        .send({ code: 'bad-code' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication failed');
    });
  });

  describe('GET /verify', () => {
    it('returns 401 when no token provided', async () => {
      const res = await request(app).get('/api/auth/verify');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('returns 401 when token is invalid', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Bad token'));
      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer bad-token');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired token');
    });

    it('returns 401 when payload is null', async () => {
      mockVerifyIdToken.mockResolvedValue({ getPayload: () => null });
      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer some-token');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('returns user info when token is valid', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'user-1',
          email: 'user@example.com',
          name: 'Test User',
          picture: 'https://example.com/photo.jpg',
        }),
      });

      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('user@example.com');
    });
  });
});
