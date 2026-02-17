import { TranscriptionResult, TranscriptionProgress } from '../types/index.ts';
import { formatTimestamp } from '../utils/formatTime.ts';

interface TranscriptionProps {
  transcription: TranscriptionResult | null;
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  error: string | null;
  progress: TranscriptionProgress | null;
}

export default function Transcription({ transcription, status, error, progress }: TranscriptionProps) {
  if (status === 'idle') return null;

  return (
    <div className="transcription-section">
      <h2>Transcription</h2>

      {(status === 'pending' || status === 'processing') && (
        <div className="loading-indicator">
          <div className="spinner" />
          {progress ? (
            <div className="transcription-progress">
              <div className="transcription-progress-bar">
                <div
                  className="transcription-progress-fill"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <p className="transcription-progress-label">
                {progress.currentStep}
                <span className="transcription-progress-percent">{progress.percent}%</span>
              </p>
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
