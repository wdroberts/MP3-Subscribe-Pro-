import { getExportUrl, startTranscription, pollTranscriptionStatus, requestSummarization, uploadFile } from './api';

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

// Mock FileReader for blobToBase64
class MockFileReader {
  onload: ((e: { target: { result: string } }) => void) | null = null;
  onerror: ((err: Error) => void) | null = null;
  result: string = '';
  readAsDataURL(_blob: Blob) {
    this.result = 'data:application/octet-stream;base64,AAAA';
    if (this.onload) this.onload({ target: { result: this.result } });
  }
}
vi.stubGlobal('FileReader', MockFileReader);

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
        status: 404,
        text: () => Promise.resolve(JSON.stringify({ error: 'Upload not found' })),
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
        status: 404,
        text: () => Promise.resolve(JSON.stringify({ error: 'Not found' })),
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
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ error: 'Summarization failed' })),
      });

      await expect(requestSummarization('bad-id')).rejects.toThrow('Summarization failed');
    });
  });

  describe('uploadFile (chunked)', () => {
    it('sends chunked upload via /api/process/* endpoints', async () => {
      const file = new File(['audio-data-here'], 'test.mp3', { type: 'audio/mpeg' });
      const onProgress = vi.fn();

      // Mock init
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sessionId: 'sess-123' }),
      });

      // Mock chunk (file is small so only 1 chunk)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ idx: 0, done: 1, total: 1 }),
      });

      // Mock finalize
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'upload-1',
          filename: 'test.mp3',
          mimeType: 'audio/mpeg',
          sizeBytes: 15,
          createdAt: '2025-01-01T00:00:00.000Z',
        }),
      });

      const result = await uploadFile(file, onProgress);

      // Verify init call
      expect(mockFetch.mock.calls[0][0]).toBe('/api/process/init');
      // Verify chunk call
      expect(mockFetch.mock.calls[1][0]).toBe('/api/process/chunk');
      // Verify finalize call
      expect(mockFetch.mock.calls[2][0]).toBe('/api/process/finalize');
      expect(result.id).toBe('upload-1');
      expect(onProgress).toHaveBeenCalled();
    });

    it('rejects with prefixed error on server error', async () => {
      const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });

      // Provide error responses for all retry attempts (1 initial + 3 retries)
      for (let i = 0; i < 4; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve(JSON.stringify({ error: 'Server error' })),
        });
      }

      await expect(uploadFile(file, vi.fn())).rejects.toThrow('[/api/process/init] Server error');
    }, 15000);
  });
});
