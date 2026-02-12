import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { errorHandler } from './errorHandler';

function createMockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

const mockReq = {} as Request;
const mockNext = jest.fn() as NextFunction;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('errorHandler', () => {
  it('handles MulterError LIMIT_FILE_SIZE with 400', () => {
    const err = new MulterError('LIMIT_FILE_SIZE');
    const res = createMockRes();
    errorHandler(err, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'File too large' }),
    );
  });

  it('handles other MulterError with 400', () => {
    const err = new MulterError('LIMIT_UNEXPECTED_FILE');
    const res = createMockRes();
    errorHandler(err, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Upload error' }),
    );
  });

  it('handles generic error with 500', () => {
    const err = new Error('Something broke');
    const res = createMockRes();
    errorHandler(err, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Something broke' }),
    );
  });

  it('uses custom statusCode if set on error', () => {
    const err = Object.assign(new Error('Not found'), { statusCode: 404 });
    const res = createMockRes();
    errorHandler(err, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('includes stack in details when NODE_ENV is development', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const err = new Error('dev error');
    const res = createMockRes();
    errorHandler(err, mockReq, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.stringContaining('dev error') }),
    );
    process.env.NODE_ENV = original;
  });

  it('does not include stack when NODE_ENV is production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = new Error('prod error');
    const res = createMockRes();
    errorHandler(err, mockReq, res, mockNext);
    const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonCall.details).toBeUndefined();
    process.env.NODE_ENV = original;
  });

  it('defaults to Internal server error when message is empty', () => {
    const err = new Error('');
    const res = createMockRes();
    errorHandler(err, mockReq, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Internal server error' }),
    );
  });
});
