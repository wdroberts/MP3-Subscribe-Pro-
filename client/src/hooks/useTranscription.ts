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
// If progress percent doesn't change for this long, warn the user
const STALL_WARN_MS = 60_000;

export function useTranscription(): UseTranscriptionReturn {
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [status, setStatus] = useState<TranscriptionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPercentRef = useRef<number>(-1);
  const lastChangeRef = useRef<number>(Date.now());
  const stallWarnedRef = useRef<boolean>(false);

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
      lastPercentRef.current = -1;
      lastChangeRef.current = Date.now();
      stallWarnedRef.current = false;

      try {
        const { id } = await apiStartTranscription(uploadId);

        pollRef.current = setInterval(async () => {
          try {
            const result = await pollTranscriptionStatus(id);

            if (result.progress) {
              // Track whether progress is actually advancing
              if (result.progress.percent !== lastPercentRef.current) {
                lastPercentRef.current = result.progress.percent;
                lastChangeRef.current = Date.now();
                stallWarnedRef.current = false;
              }

              // If stuck at the same percent for too long, annotate the step
              const stalledMs = Date.now() - lastChangeRef.current;
              if (stalledMs > STALL_WARN_MS && !stallWarnedRef.current) {
                stallWarnedRef.current = true;
                setProgress({
                  ...result.progress,
                  currentStep: `${result.progress.currentStep} (waiting on cloud API...)`,
                });
              } else {
                setProgress(result.progress);
              }
            }

            if (result.status === 'completed') {
              setTranscription(result);
              setProgress({ percent: 100, currentStep: 'Complete' });
              stopPolling();
              // Brief delay so user sees the 100% bar before it disappears
              setTimeout(() => {
                setStatus('completed');
                setProgress(null);
              }, 800);
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
