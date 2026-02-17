import { useState, useCallback, useRef } from 'react';
import { startTranscription as apiStartTranscription, pollTranscriptionStatus } from '../services/api.ts';
import { TranscriptionResult, TranscriptionProgress } from '../types/index.ts';

type TranscriptionStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed';

interface UseTranscriptionReturn {
  startTranscription: (uploadId: string) => Promise<void>;
  transcription: TranscriptionResult | null;
  status: TranscriptionStatus;
  error: string | null;
  progress: TranscriptionProgress | null;
}

const POLL_INTERVAL_MS = 2000;

export function useTranscription(): UseTranscriptionReturn {
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [status, setStatus] = useState<TranscriptionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startTranscription = useCallback(
    async (uploadId: string) => {
      stopPolling();
      setTranscription(null);
      setError(null);
      setProgress(null);
      setStatus('pending');

      try {
        const { id } = await apiStartTranscription(uploadId);

        pollRef.current = setInterval(async () => {
          try {
            const result = await pollTranscriptionStatus(id);

            if (result.progress) {
              setProgress(result.progress);
            }

            if (result.status === 'completed') {
              setTranscription(result);
              setStatus('completed');
              setProgress(null);
              stopPolling();
            } else if (result.status === 'failed') {
              setError(result.error || 'Transcription failed');
              setStatus('failed');
              setProgress(null);
              stopPolling();
            } else {
              setStatus(result.status as TranscriptionStatus);
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Polling failed');
            setStatus('failed');
            setProgress(null);
            stopPolling();
          }
        }, POLL_INTERVAL_MS);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start transcription');
        setStatus('failed');
      }
    },
    [stopPolling],
  );

  return { startTranscription, transcription, status, error, progress };
}
