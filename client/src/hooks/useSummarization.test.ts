import { renderHook, act } from '@testing-library/react';
import { useSummarization } from './useSummarization';

vi.mock('../services/api', () => ({
  requestSummarization: vi.fn(),
}));

import { requestSummarization } from '../services/api';

const mockRequestSummarization = vi.mocked(requestSummarization);

describe('useSummarization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useSummarization());
    expect(result.current.summary).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets isLoading during summarization', async () => {
    let resolveReq: (value: unknown) => void;
    mockRequestSummarization.mockImplementation(
      () => new Promise((resolve) => { resolveReq = resolve; }),
    );

    const { result } = renderHook(() => useSummarization());

    let summarizePromise: Promise<void>;
    act(() => {
      summarizePromise = result.current.summarize('job-1');
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveReq!({
        id: 'sum-1',
        transcriptionId: 'job-1',
        summary: 'A concise summary.',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      await summarizePromise!;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.summary).toEqual(
      expect.objectContaining({ summary: 'A concise summary.' }),
    );
  });

  it('returns summary on success', async () => {
    const mockResult = {
      id: 'sum-1',
      transcriptionId: 'job-1',
      summary: 'A concise summary.',
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    mockRequestSummarization.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useSummarization());

    await act(async () => {
      await result.current.summarize('job-1');
    });

    expect(result.current.summary).toEqual(mockResult);
    expect(result.current.error).toBeNull();
  });

  it('sets error on failure', async () => {
    mockRequestSummarization.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useSummarization());

    await act(async () => {
      await result.current.summarize('job-1');
    });

    expect(result.current.error).toBe('API error');
    expect(result.current.summary).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('handles non-Error thrown values', async () => {
    mockRequestSummarization.mockRejectedValue('string error');

    const { result } = renderHook(() => useSummarization());

    await act(async () => {
      await result.current.summarize('job-1');
    });

    expect(result.current.error).toBe('Summarization failed');
  });

  it('clears error on new summarization attempt', async () => {
    mockRequestSummarization.mockRejectedValueOnce(new Error('First error'));
    mockRequestSummarization.mockResolvedValueOnce({
      id: 'sum-1',
      transcriptionId: 'job-1',
      summary: 'Success.',
      createdAt: '2025-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useSummarization());

    await act(async () => {
      await result.current.summarize('job-1');
    });
    expect(result.current.error).toBe('First error');

    await act(async () => {
      await result.current.summarize('job-1');
    });
    expect(result.current.error).toBeNull();
    expect(result.current.summary?.summary).toBe('Success.');
  });
});
