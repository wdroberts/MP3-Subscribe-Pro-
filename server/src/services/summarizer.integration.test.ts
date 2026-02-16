// Test the summarize function with mocked fetch

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Set API key so the real summarizer path is used
process.env.HUGGINGFACE_API_KEY = 'hf_test_key_for_testing';

import { summarize } from './summarizer';

function mockFetchResponse(summaryText: string) {
  return {
    ok: true,
    json: async () => [{ summary_text: summaryText }],
  };
}

describe('summarize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('summarizes short text in a single chunk', async () => {
    mockFetch.mockResolvedValue(mockFetchResponse('Short summary.'));

    const result = await summarize('A short text to summarize.');
    expect(result).toBe('Short summary.');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('facebook/bart-large-cnn'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('A short text to summarize.'),
      }),
    );
  });

  it('summarizes long text by chunking and combining', async () => {
    mockFetch.mockResolvedValue(mockFetchResponse('Chunk summary.'));

    const longText = 'Word. '.repeat(1000); // Well over 3500 chars
    const result = await summarize(longText);

    // Should be called multiple times (once per chunk)
    expect(mockFetch.mock.calls.length).toBeGreaterThan(1);
    expect(result).toContain('Chunk summary.');
  });

  it('does a final summarization pass when combined summaries are too long', async () => {
    let chunkCount = 0;
    mockFetch.mockImplementation(async (_url: string, options: { body: string }) => {
      chunkCount++;
      const parsed = JSON.parse(options.body);
      // If the input looks like combined A-summaries, it's the final pass
      if (parsed.inputs.startsWith('A'.repeat(100))) {
        return mockFetchResponse('Final combined summary.');
      }
      return mockFetchResponse('A'.repeat(500));
    });

    // Generate text long enough to produce 8+ chunks (>28000 chars)
    const longText = 'Sentence here. '.repeat(2000);
    const result = await summarize(longText);
    expect(chunkCount).toBeGreaterThan(8); // Enough chunks to trigger final pass
    expect(result).toBe('Final combined summary.');
  });
});
