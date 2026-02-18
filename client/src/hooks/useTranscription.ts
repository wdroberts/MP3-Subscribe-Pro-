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
  elapsedSeconds: number;
}

const POLL_INTERVAL_MS = 2000;
// If progress percent doesn't change for this long, warn the user
const STALL_WARN_MS = 60_000;
// Number of consecutive poll failures before giving up
const MAX_POLL_FAILURES = 5;

export function useTranscription(): UseTranscriptionReturn {
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [status, setStatus] = useState<TranscriptionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPercentRef = useRef<number>(-1);
  const lastChangeRef = useRef<number>(Date.now());
  const stallWarnedRef = useRef<boolean>(false);
  const consecutiveFailuresRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  }, []);

  const startTranscription = useCallback(
    async (uploadId: string) => {
      stopPolling();
      setTranscription(null);
      setError(null);
      setProgress({ percent: 0, currentStep: 'Starting transcription...' });
      setStatus('pending');
      setElapsedSeconds(0);
      lastPercentRef.current = -1;
      lastChangeRef.current = Date.now();
      stallWarnedRef.current = false;
      consecutiveFailuresRef.current = 0;
      startTimeRef.current = Date.now();

      try {
        const { id } = await apiStartTranscription(uploadId);
        console.log('[Transcription] Started job:', id);

        // Update elapsed time every second
        elapsedRef.current = setInterval(() => {
          setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);

        // Use recursive setTimeout instead of setInterval to prevent overlapping requests
        const poll = async () => {
          try {
            const result = await pollTranscriptionStatus(id);
            console.log('[poll] result:', { status: result.status, progress: result.progress });
            // Reset failure counter on successful poll
            consecutiveFailuresRef.current = 0;

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
              console.log('[Transcription] Completed');
              setTranscription(result);
              setProgress({ percent: 100, currentStep: 'Complete' });
              stopPolling();
              // Brief delay so user sees the 100% bar before it disappears
              setTimeout(() => {
                setStatus('completed');
                setProgress(null);
              }, 800);
              return; // Don't schedule next poll
            } else if (result.status === 'failed') {
              console.warn('[Transcription] Failed:', result.error);
              setError(result.error || 'Transcription failed');
              setStatus('failed');
              setProgress(null);
              stopPolling();
              return; // Don't schedule next poll
            } else {
              setStatus(result.status as TranscriptionStatus);
            }
          } catch (err) {
            consecutiveFailuresRef.current++;
            const failures = consecutiveFailuresRef.current;
            console.warn(`[Transcription] Poll error (${failures}/${MAX_POLL_FAILURES}):`, err);

            if (failures >= MAX_POLL_FAILURES) {
              console.error('[Transcription] Too many consecutive poll failures, giving up');
              setError(`Lost connection to server after ${failures} retries. Check your network and try again.`);
              setStatus('failed');
              setProgress(null);
              stopPolling();
              return; // Don't schedule next poll
            }
            // Otherwise continue polling — transient network errors are expected for long transcriptions
          }

          // Schedule next poll (only if we haven't returned early above)
          pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        };

        // Fire first poll immediately to get backend progress ASAP
        pollRef.current = setTimeout(poll, 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start transcription');
        setStatus('failed');
      }
    },
    [stopPolling],
  );

  return { startTranscription, transcription, status, error, progress, elapsedSeconds };
}
