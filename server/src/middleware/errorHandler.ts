import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { ApiErrorResponse } from '../types';

/* eslint-disable @typescript-eslint/no-unused-vars */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction,
): void {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  console.error('Error:', err.message);

  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File too large', details: err.message });
      return;
    }
    res.status(400).json({ error: 'Upload error', details: err.message });
    return;
  }

  const statusCode = (err as { statusCode?: number }).statusCode || 500;
  const response: ApiErrorResponse = { error: err.message || 'Internal server error' };

  if (process.env.NODE_ENV === 'development') {
    response.details = err.stack;
  }

  res.status(statusCode).json(response);
}
