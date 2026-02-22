import rateLimit from 'express-rate-limit';

export function createRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    skip: (req) => req.path.startsWith('/api/process'),
  });
}

export function createUploadRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5000, // ~300 MB worth of 64KB chunks
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Upload rate limit exceeded, please try again later' },
  });
}

export function createStrictRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });
}
