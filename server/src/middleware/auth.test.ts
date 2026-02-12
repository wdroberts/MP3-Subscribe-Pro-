import { Request, Response, NextFunction } from 'express';

// Mock google-auth-library before importing
const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

import { requireAuth } from './auth';

function createMockReqRes(authHeader?: string) {
  const req = {
    headers: authHeader ? { authorization: authHeader } : {},
  } as Request;
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return { req, res: res as Response };
}

describe('requireAuth', () => {
  const next: NextFunction = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when no authorization header', async () => {
    const { req, res } = createMockReqRes();
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when header does not start with Bearer', async () => {
    const { req, res } = createMockReqRes('Basic abc123');
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
  });

  it('returns 401 when token verification fails', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad token'));
    const { req, res } = createMockReqRes('Bearer invalid-token');
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  it('returns 401 when payload is null', async () => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => null });
    const { req, res } = createMockReqRes('Bearer valid-token');
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
  });

  it('calls next and attaches user when token is valid', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 'user-123', email: 'test@example.com' }),
    });
    const { req, res } = createMockReqRes('Bearer valid-token');
    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect((req as Request & { user: unknown }).user).toEqual({
      id: 'user-123',
      email: 'test@example.com',
    });
  });
});
