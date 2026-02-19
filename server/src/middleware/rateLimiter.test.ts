import { createRateLimiter, createStrictRateLimiter } from './rateLimiter';

describe('rateLimiter', () => {
  it('createRateLimiter returns a middleware function', () => {
    const limiter = createRateLimiter();
    expect(typeof limiter).toBe('function');
  });

  it('createStrictRateLimiter returns a middleware function', () => {
    const limiter = createStrictRateLimiter();
    expect(typeof limiter).toBe('function');
  });
});
