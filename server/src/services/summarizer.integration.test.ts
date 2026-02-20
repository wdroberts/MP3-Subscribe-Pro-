// Test the summarize function with mocked fetch

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Set API key so the real summarizer path is used
process.env.OPENAI_API_KEY = 'sk-test_key_for_testing';

import { summarize } from './summarizer';

function mockFetchResponse(text: string) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: text } }] }),
  };
}

describe('summarize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the full transcript to OpenAI in a single call', async () => {
    mockFetch.mockResolvedValue(mockFetchResponse('**Key Points:**\n\n- Point one.'));

    const result = await summarize('A transcript to analyze.');
    expect(result).toBe('**Key Points:**\n\n- Point one.');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.openai.com'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('A transcript to analyze.'),
      }),
    );
  });

  it('uses the extraction system prompt', async () => {
    mockFetch.mockResolvedValue(mockFetchResponse('result'));

    await summarize('Some text.');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('Key Points');
    expect(body.messages[0].content).toContain('Action Items');
    expect(body.messages[0].content).toContain('People Mentioned');
  });

  it('sends transcript as the user message without a prefix', async () => {
    mockFetch.mockResolvedValue(mockFetchResponse('result'));

    await summarize('The actual transcript content.');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[1].content).toBe('The actual transcript content.');
  });

  it('falls back to extractive output when OpenAI fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await summarize('This is a sentence that is long enough. Another long sentence here. A third one for good measure. Fourth sentence in the text. Fifth sentence to have enough.');
    expect(result).toContain('**Key Points:**');
    expect(result).toContain('**Action Items:**');
    expect(result).toContain('**People Mentioned:**');
  });

  it('requests 1024 max tokens', async () => {
    mockFetch.mockResolvedValue(mockFetchResponse('result'));

    await summarize('Text.');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(1024);
  });
});
