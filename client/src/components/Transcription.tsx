import { TranscriptionResult, TranscriptionProgress } from '../types/index.ts';
import { formatTimestamp } from '../utils/formatTime.ts';

interface TranscriptionProps {
  transcription: TranscriptionResult | null;
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  error: string | null;
  progress: TranscriptionProgress | null;
  elapsedSeconds: number;
}

function formatElapsed(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

export default function Transcription({ transcription, status, error, progress, elapsedSeconds }: TranscriptionProps) {
  console.log('[Transcription] render:', { status, hasProgress: !!progress, percent: progress?.percent });
  if (status === 'idle') return null;

  return (
    <div className="transcription-section">
      <h2>Transcription</h2>

      {(status === 'pending' || status === 'processing') && (
        <div className="loading-indicator">
          <div className="spinner" />
          {progress ? (
            <div className="transcription-progress">
              <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.5rem 0' }}>
                {progress.chunksTotal != null && progress.chunksTotal > 0
                  ? `${progress.chunksCompleted ?? 0} of ${progress.chunksTotal} chunks completed`
                  : progress.currentStep}
              </p>
              <div className="transcription-progress-bar">
                <div
                  className="transcription-progress-fill"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <p className="transcription-progress-label">
                {progress.currentStep} — {progress.percent}%
              </p>
              {elapsedSeconds > 0 && (
                <p className="transcription-elapsed">Elapsed: {formatElapsed(elapsedSeconds)}</p>
              )}
            </div>
          ) : (
            <p>{status === 'pending' ? 'Starting transcription...' : 'Transcribing audio...'}</p>
          )}
        </div>
      )}

      {status === 'failed' && error && <div className="error-message">{error}</div>}

      {status === 'completed' && transcription && (
        <ul className="segment-list">
          {transcription.segments.map((segment) => (
            <li key={segment.index} className="segment">
              <button className="timestamp" title={`Jump to ${formatTimestamp(segment.startTime)}`}>
                [{formatTimestamp(segment.startTime)}]
              </button>
              <span className="segment-text">{segment.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
