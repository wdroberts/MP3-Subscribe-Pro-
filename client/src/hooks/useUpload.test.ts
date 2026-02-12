import { renderHook, act } from '@testing-library/react';
import { useUpload } from './useUpload';

vi.mock('../services/api', () => ({
  uploadFile: vi.fn(),
}));

import { uploadFile } from '../services/api';

const mockUploadFile = vi.mocked(uploadFile);

describe('useUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useUpload());
    expect(result.current.progress).toBe(0);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isUploading).toBe(false);
  });

  it('sets isUploading to true during upload', async () => {
    let resolveUpload: (value: unknown) => void;
    mockUploadFile.mockImplementation(
      () => new Promise((resolve) => { resolveUpload = resolve; }),
    );

    const { result } = renderHook(() => useUpload());
    const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });

    let uploadPromise: Promise<void>;
    act(() => {
      uploadPromise = result.current.upload(file);
    });

    expect(result.current.isUploading).toBe(true);

    await act(async () => {
      resolveUpload!({
        id: 'upload-1',
        filename: 'test.mp3',
        filepath: '/tmp/test.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 1024,
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      await uploadPromise!;
    });

    expect(result.current.isUploading).toBe(false);
    expect(result.current.result).toEqual(expect.objectContaining({ id: 'upload-1' }));
  });

  it('sets error on upload failure', async () => {
    mockUploadFile.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useUpload());
    const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });

    await act(async () => {
      await result.current.upload(file);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.isUploading).toBe(false);
    expect(result.current.result).toBeNull();
  });

  it('handles non-Error thrown values', async () => {
    mockUploadFile.mockRejectedValue('string error');

    const { result } = renderHook(() => useUpload());
    const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });

    await act(async () => {
      await result.current.upload(file);
    });

    expect(result.current.error).toBe('Upload failed');
  });

  it('resets all state', async () => {
    mockUploadFile.mockResolvedValue({
      id: 'upload-1',
      filename: 'test.mp3',
      filepath: '/tmp/test.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 1024,
      createdAt: '2025-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useUpload());
    const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });

    await act(async () => {
      await result.current.upload(file);
    });

    expect(result.current.result).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.progress).toBe(0);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isUploading).toBe(false);
  });
});
