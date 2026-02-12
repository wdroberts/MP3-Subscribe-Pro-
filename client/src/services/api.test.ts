import { getExportUrl, startTranscription, pollTranscriptionStatus, requestSummarization } from './api';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('api service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  describe('getExportUrl', () => {
    it('returns correct URL for txt format', () => {
      expect(getExportUrl('job-1', 'txt')).toBe('/api/export/job-1/txt');
    });

    it('returns correct URL for srt format', () => {
      expect(getExportUrl('job-1', 'srt')).toBe('/api/export/job-1/srt');
    });

    it('returns correct URL for json format', () => {
      expect(getExportUrl('job-1', 'json')).toBe('/api/export/job-1/json');
    });
  });

  describe('startTranscription', () => {
    it('sends POST to /api/transcribe with uploadId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'job-1', status: 'pending' }),
      });

      const result = await startTranscription('upload-1');
      expect(mockFetch).toHaveBeenCalledWith('/api/transcribe', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ uploadId: 'upload-1' }),
      }));
      expect(result).toEqual({ id: 'job-1', status: 'pending' });
    });

    it('throws when response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Upload not found' }),
      });

      await expect(startTranscription('bad-id')).rejects.toThrow('Upload not found');
    });

    it('includes auth header when token exists', async () => {
      localStorageMock.setItem('mp3_auth_token', 'my-token');
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'job-1', status: 'pending' }),
      });

      await startTranscription('upload-1');
      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders['Authorization']).toBe('Bearer my-token');
    });
  });

  describe('pollTranscriptionStatus', () => {
    it('sends GET to /api/transcribe/:id/status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'job-1', status: 'processing' }),
      });

      const result = await pollTranscriptionStatus('job-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/transcribe/job-1/status',
        expect.objectContaining({ headers: expect.any(Object) }),
      );
      expect(result.status).toBe('processing');
    });

    it('throws when response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      await expect(pollTranscriptionStatus('bad-id')).rejects.toThrow('Not found');
    });
  });

  describe('requestSummarization', () => {
    it('sends POST to /api/summarize', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'sum-1', summary: 'A summary.' }),
      });

      const result = await requestSummarization('job-1');
      expect(mockFetch).toHaveBeenCalledWith('/api/summarize', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ transcriptionId: 'job-1' }),
      }));
      expect(result.summary).toBe('A summary.');
    });

    it('throws when response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Summarization failed' }),
      });

      await expect(requestSummarization('bad-id')).rejects.toThrow('Summarization failed');
    });
  });
});
