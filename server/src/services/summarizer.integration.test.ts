// Test the summarize function with mocked HfInference

const mockSummarization = jest.fn();
jest.mock('@huggingface/inference', () => ({
  HfInference: jest.fn().mockImplementation(() => ({
    summarization: mockSummarization,
  })),
}));

import { summarize } from './summarizer';

describe('summarize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('summarizes short text in a single chunk', async () => {
    mockSummarization.mockResolvedValue({ summary_text: 'Short summary.' });

    const result = await summarize('A short text to summarize.');
    expect(result).toBe('Short summary.');
    expect(mockSummarization).toHaveBeenCalledTimes(1);
    expect(mockSummarization).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'facebook/bart-large-cnn',
        inputs: 'A short text to summarize.',
      }),
    );
  });

  it('summarizes long text by chunking and combining', async () => {
    mockSummarization.mockResolvedValue({ summary_text: 'Chunk summary.' });

    const longText = 'Word. '.repeat(1000); // Well over 3500 chars
    const result = await summarize(longText);

    // Should be called multiple times (once per chunk)
    expect(mockSummarization.mock.calls.length).toBeGreaterThan(1);
    expect(result).toContain('Chunk summary.');
  });

  it('does a final summarization pass when combined summaries are too long', async () => {
    // Each chunk summary returns 500 chars. With enough chunks (>7), combined > 3500
    let chunkCount = 0;
    mockSummarization.mockImplementation(async ({ inputs }: { inputs: string }) => {
      chunkCount++;
      // If the input looks like combined A-summaries, it's the final pass
      if (inputs.startsWith('A'.repeat(100))) {
        return { summary_text: 'Final combined summary.' };
      }
      return { summary_text: 'A'.repeat(500) };
    });

    // Generate text long enough to produce 8+ chunks (>28000 chars)
    const longText = 'Sentence here. '.repeat(2000);
    const result = await summarize(longText);
    expect(chunkCount).toBeGreaterThan(8); // Enough chunks to trigger final pass
    expect(result).toBe('Final combined summary.');
  });
});
