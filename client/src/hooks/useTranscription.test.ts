import { renderHook, act } from '@testing-library/react';
import { useTranscription } from './useTranscription';

vi.mock('../services/api', () => ({
  startTranscription: vi.fn(),
  pollTranscriptionStatus: vi.fn(),
}));

import { startTranscription, pollTranscriptionStatus } from '../services/api';

const mockStartTranscription = vi.mocked(startTranscription);
const mockPollStatus = vi.mocked(pollTranscriptionStatus);

describe('useTranscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useTranscription());
    expect(result.current.transcription).toBeNull();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('sets status to pending when starting transcription', async () => {
    mockStartTranscription.mockResolvedValue({ id: 'job-1', status: 'pending' });

    const { result } = renderHook(() => useTranscription());

    await act(async () => {
      await result.current.startTranscription('upload-1');
    });

    expect(result.current.status).toBe('pending');
    expect(mockStartTranscription).toHaveBeenCalledWith('upload-1');
  });

  it('sets error when startTranscription API fails', async () => {
    mockStartTranscription.mockRejectedValue(new Error('Upload not found'));

    const { result } = renderHook(() => useTranscription());

    await act(async () => {
      await result.current.startTranscription('bad-id');
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Upload not found');
  });

  it('handles non-Error thrown values from startTranscription', async () => {
    mockStartTranscription.mockRejectedValue('string error');

    const { result } = renderHook(() => useTranscription());

    await act(async () => {
      await result.current.startTranscription('bad-id');
    });

    expect(result.current.error).toBe('Failed to start transcription');
  });

  it('polls and updates status to completed', async () => {
    mockStartTranscription.mockResolvedValue({ id: 'job-1', status: 'pending' });
    mockPollStatus.mockResolvedValue({
      id: 'job-1',
      uploadId: 'upload-1',
      segments: [{ index: 0, startTime: 0, endTime: 1, text: 'Hello.' }],
      fullText: 'Hello.',
      status: 'completed',
      createdAt: '2025-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useTranscription());

    await act(async () => {
      await result.current.startTranscription('upload-1');
    });

    // Advance the timer to trigger polling
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Advance past the 800ms delay before status changes to 'completed'
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.transcription?.fullText).toBe('Hello.');
  });

  it('polls and updates status to failed', async () => {
    mockStartTranscription.mockResolvedValue({ id: 'job-1', status: 'pending' });
    mockPollStatus.mockResolvedValue({
      id: 'job-1',
      uploadId: 'upload-1',
      segments: [],
      fullText: '',
      status: 'failed',
      error: 'Audio too noisy',
      createdAt: '2025-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useTranscription());

    await act(async () => {
      await result.current.startTranscription('upload-1');
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Audio too noisy');
  });

  it('updates status during processing polls', async () => {
    mockStartTranscription.mockResolvedValue({ id: 'job-1', status: 'pending' });
    mockPollStatus.mockResolvedValue({
      id: 'job-1',
      uploadId: 'upload-1',
      segments: [],
      fullText: '',
      status: 'processing',
      createdAt: '2025-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useTranscription());

    await act(async () => {
      await result.current.startTranscription('upload-1');
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.status).toBe('processing');
  });

  it('retries on transient poll errors and fails after max retries', async () => {
    mockStartTranscription.mockResolvedValue({ id: 'job-1', status: 'pending' });
    mockPollStatus.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTranscription());

    await act(async () => {
      await result.current.startTranscription('upload-1');
    });

    // First poll fires immediately (setTimeout(poll, 0)), then each failure
    // schedules the next with exponential backoff: 3s, 6s, 12s, 15s (capped).
    // Need to advance through all 30 failures (MAX_POLL_FAILURES).
    for (let i = 0; i < 30; i++) {
      await act(async () => {
        vi.advanceTimersByTime(15_000); // max backoff is 15s
      });
    }

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toContain('Lost connection to server');
  });
});
