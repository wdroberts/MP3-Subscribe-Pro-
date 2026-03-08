import { useState } from 'react';
import { TranscriptionResult, TranscriptionProgress } from '../types/index.ts';
import { formatTimestamp } from '../utils/formatTime.ts';
import { diagnoseUpload, DiagnoseResult } from '../services/api.ts';

interface TranscriptionProps {
  transcription: TranscriptionResult | null;
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  error: string | null;
  progress: TranscriptionProgress | null;
  elapsedSeconds: number;
  uploadId?: string;
}

function formatElapsed(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

export default function Transcription({ transcription, status, error, progress, elapsedSeconds, uploadId }: TranscriptionProps) {
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<DiagnoseResult | null>(null);
  const [diagnoseError, setDiagnoseError] = useState<string | null>(null);

  const handleDiagnose = async () => {
    if (!uploadId) return;
    setDiagnosing(true);
    setDiagnoseError(null);
    try {
      const result = await diagnoseUpload(uploadId);
      setDiagnosis(result);
    } catch (err) {
      setDiagnoseError(err instanceof Error ? err.message : 'Diagnose failed');
    } finally {
      setDiagnosing(false);
    }
  };

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

      {status === 'failed' && error && (
        <>
          <div className="error-message">{error}</div>
          <div style={{ marginTop: '1rem' }}>
            <button
              className="reset-btn"
              onClick={handleDiagnose}
              disabled={diagnosing || !uploadId}
              style={{ fontSize: '0.9rem' }}
            >
              {diagnosing ? 'Analyzing...' : 'Diagnose File'}
            </button>
            {!uploadId && <p style={{ marginTop: '0.5rem', color: '#999', fontSize: '0.85rem' }}>Upload ID unavailable — cannot diagnose</p>}
            {diagnoseError && <p className="error-message" style={{ marginTop: '0.5rem' }}>{diagnoseError}</p>}
            {diagnosis && (
                <div style={{ marginTop: '1rem', textAlign: 'left', background: '#f5f5f5', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', overflowX: 'auto' }}>
                  <h3 style={{ margin: '0 0 0.5rem' }}>File Analysis</h3>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <tbody>
                      <tr><td style={{ padding: '4px 8px', fontWeight: 600 }}>Size</td><td style={{ padding: '4px 8px' }}>{diagnosis.file.sizeMB} MB</td></tr>
                      <tr><td style={{ padding: '4px 8px', fontWeight: 600 }}>Duration</td><td style={{ padding: '4px 8px' }}>{diagnosis.ffprobe.duration != null ? `${Number(diagnosis.ffprobe.duration).toFixed(1)}s` : 'unknown'}</td></tr>
                      <tr><td style={{ padding: '4px 8px', fontWeight: 600 }}>Format</td><td style={{ padding: '4px 8px' }}>{diagnosis.ffprobe.formatLongName ?? diagnosis.ffprobe.formatName ?? 'unknown'}</td></tr>
                      <tr><td style={{ padding: '4px 8px', fontWeight: 600 }}>Bit Rate</td><td style={{ padding: '4px 8px' }}>{diagnosis.ffprobe.bitRate ? `${(Number(diagnosis.ffprobe.bitRate) / 1000).toFixed(0)} kbps` : 'unknown'}</td></tr>
                      {diagnosis.streams.map((s, i) => (
                        <tr key={i}><td style={{ padding: '4px 8px', fontWeight: 600 }}>Stream {i}</td><td style={{ padding: '4px 8px' }}>{s.codecName} {s.codecType} — {s.sampleRate}Hz, {s.channels}ch</td></tr>
                      ))}
                      <tr><td style={{ padding: '4px 8px', fontWeight: 600 }}>Would Chunk</td><td style={{ padding: '4px 8px' }}>{diagnosis.analysis.wouldChunk ? `Yes (${diagnosis.analysis.estimatedChunks} chunks)` : 'No (inline)'}</td></tr>
                      <tr><td style={{ padding: '4px 8px', fontWeight: 600 }}>Our Duration</td><td style={{ padding: '4px 8px' }}>{diagnosis.ourProbe.durationSeconds.toFixed(1)}s</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </>
      )}

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
