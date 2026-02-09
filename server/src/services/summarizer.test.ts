import { chunkText } from './summarizer';

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    const text = 'This is a short text.';
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('returns multiple chunks for long text', () => {
    const text = 'A'.repeat(7000);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('each chunk is within the max size', () => {
    const text = 'Word. '.repeat(1000);
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(3600); // some tolerance for sentence breaks
    }
  });

  it('handles text exactly at the limit', () => {
    const text = 'A'.repeat(3500);
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
  });
});
