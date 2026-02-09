import { formatTimestamp, toSrt, toTimestampedText } from './formatters';
import { TranscriptionSegment } from '../types';

describe('formatTimestamp', () => {
  it('formats zero seconds', () => {
    expect(formatTimestamp(0)).toBe('00:00:00');
  });

  it('formats seconds only', () => {
    expect(formatTimestamp(45)).toBe('00:00:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimestamp(125)).toBe('00:02:05');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatTimestamp(3661)).toBe('01:01:01');
  });

  it('formats with milliseconds when includeMilli is true', () => {
    expect(formatTimestamp(1.5, true)).toBe('00:00:01,500');
  });

  it('formats fractional seconds with milliseconds', () => {
    expect(formatTimestamp(62.123, true)).toBe('00:01:02,123');
  });
});

describe('toSrt', () => {
  const segments: TranscriptionSegment[] = [
    { index: 0, startTime: 1, endTime: 4.5, text: 'First sentence.' },
    { index: 1, startTime: 4.5, endTime: 8.2, text: 'Second sentence.' },
  ];

  it('generates valid SRT format', () => {
    const srt = toSrt(segments);
    expect(srt).toContain('1\n00:00:01,000 --> 00:00:04,500\nFirst sentence.');
    expect(srt).toContain('2\n00:00:04,500 --> 00:00:08,200\nSecond sentence.');
  });

  it('separates entries with blank lines', () => {
    const srt = toSrt(segments);
    expect(srt).toContain('\n\n');
  });

  it('handles empty segments', () => {
    expect(toSrt([])).toBe('');
  });
});

describe('toTimestampedText', () => {
  const segments: TranscriptionSegment[] = [
    { index: 0, startTime: 0, endTime: 3, text: 'Hello world.' },
    { index: 1, startTime: 3, endTime: 6, text: 'Goodbye world.' },
  ];

  it('generates timestamped text', () => {
    const text = toTimestampedText(segments);
    expect(text).toBe('[00:00:00] Hello world.\n[00:00:03] Goodbye world.');
  });

  it('handles empty segments', () => {
    expect(toTimestampedText([])).toBe('');
  });
});
