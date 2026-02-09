import { describe, it, expect } from 'vitest';
import { formatTimestamp, formatFileSize } from './formatTime.ts';

describe('formatTimestamp', () => {
  it('formats zero seconds', () => {
    expect(formatTimestamp(0)).toBe('00:00');
  });

  it('formats seconds only', () => {
    expect(formatTimestamp(45)).toBe('00:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimestamp(125)).toBe('02:05');
  });

  it('includes hours when needed', () => {
    expect(formatTimestamp(3661)).toBe('1:01:01');
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(5242880)).toBe('5.0 MB');
  });
});
