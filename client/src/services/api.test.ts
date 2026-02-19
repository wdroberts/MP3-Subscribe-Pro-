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

// Mock XMLHttpRequest for uploadFile tests
function createMockXHR() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const uploadListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  const xhr = {
    open: vi.fn(),
    send: vi.fn(),
    setRequestHeader: vi.fn(),
    status: 200,
    responseText: '',
    upload: {
      addEventListener: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        uploadListeners[event] = uploadListeners[event] || [];
        uploadListeners[event].push(cb);
      }),
    },
    addEventListener: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    // helpers to trigger events from tests
    _triggerUpload(event: string, data: unknown) {
      (uploadListeners[event] || []).forEach((cb) => cb(data));
    },
    _trigger(event: string) {
      (listeners[event] || []).forEach((cb) => cb());
    },
  };
  return xhr;
}

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

  describe('uploadFile', () => {
    let mockXHR: ReturnType<typeof createMockXHR>;

    beforeEach(() => {
      mockXHR = createMockXHR();
      vi.stubGlobal('XMLHttpRequest', vi.fn(() => mockXHR));
    });

    it('sends file to /api/upload via XHR', async () => {
      const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });
      const onProgress = vi.fn();

      const uploadResult = {
        id: 'upload-1',
        filename: 'test.mp3',

        mimeType: 'audio/mpeg',
        sizeBytes: 5,
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      // Trigger load event after send is called
      mockXHR.send.mockImplementation(() => {
        mockXHR.status = 201;
        mockXHR.responseText = JSON.stringify(uploadResult);
        mockXHR._trigger('load');
      });

      const result = await uploadFile(file, onProgress);
      expect(mockXHR.open).toHaveBeenCalledWith('POST', '/api/upload');
      expect(result).toEqual(uploadResult);
    });

    it('reports upload progress', async () => {
      const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });
      const onProgress = vi.fn();

      mockXHR.send.mockImplementation(() => {
        // Simulate progress event
        mockXHR._triggerUpload('progress', { lengthComputable: true, loaded: 50, total: 100 });
        mockXHR._triggerUpload('progress', { lengthComputable: true, loaded: 100, total: 100 });
        // Then complete
        mockXHR.status = 200;
        mockXHR.responseText = JSON.stringify({ id: 'up-1', filename: 'test.mp3', mimeType: 'audio/mpeg', sizeBytes: 5, createdAt: '' });
        mockXHR._trigger('load');
      });

      await uploadFile(file, onProgress);
      expect(onProgress).toHaveBeenCalledWith(50);
      expect(onProgress).toHaveBeenCalledWith(100);
    });

    it('does not report progress when not lengthComputable', async () => {
      const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });
      const onProgress = vi.fn();

      mockXHR.send.mockImplementation(() => {
        mockXHR._triggerUpload('progress', { lengthComputable: false, loaded: 0, total: 0 });
        mockXHR.status = 200;
        mockXHR.responseText = JSON.stringify({ id: 'up-1', filename: 'test.mp3', mimeType: 'audio/mpeg', sizeBytes: 5, createdAt: '' });
        mockXHR._trigger('load');
      });

      await uploadFile(file, onProgress);
      expect(onProgress).not.toHaveBeenCalled();
    });

    it('rejects with error message from response on non-2xx status', async () => {
      const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });

      mockXHR.send.mockImplementation(() => {
        mockXHR.status = 400;
        mockXHR.responseText = JSON.stringify({ error: 'File too large' });
        mockXHR._trigger('load');
      });

      await expect(uploadFile(file, vi.fn())).rejects.toThrow('File too large');
    });

    it('rejects with default message when response has no error field', async () => {
      const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });

      mockXHR.send.mockImplementation(() => {
        mockXHR.status = 500;
        mockXHR.responseText = JSON.stringify({});
        mockXHR._trigger('load');
      });

      await expect(uploadFile(file, vi.fn())).rejects.toThrow('Upload failed');
    });

    it('rejects with network error on XHR error event', async () => {
      const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });

      mockXHR.send.mockImplementation(() => {
        mockXHR._trigger('error');
      });

      await expect(uploadFile(file, vi.fn())).rejects.toThrow('Network error during upload');
    });

    it('sets Authorization header when token exists', async () => {
      localStorageMock.setItem('mp3_auth_token', 'my-token');
      const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });

      mockXHR.send.mockImplementation(() => {
        mockXHR.status = 200;
        mockXHR.responseText = JSON.stringify({ id: 'up-1', filename: 'test.mp3', mimeType: 'audio/mpeg', sizeBytes: 5, createdAt: '' });
        mockXHR._trigger('load');
      });

      await uploadFile(file, vi.fn());
      expect(mockXHR.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer my-token');
    });

    it('does not set Authorization header when no token', async () => {
      const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });

      mockXHR.send.mockImplementation(() => {
        mockXHR.status = 200;
        mockXHR.responseText = JSON.stringify({ id: 'up-1', filename: 'test.mp3', mimeType: 'audio/mpeg', sizeBytes: 5, createdAt: '' });
        mockXHR._trigger('load');
      });

      await uploadFile(file, vi.fn());
      expect(mockXHR.setRequestHeader).not.toHaveBeenCalled();
    });
  });
});
