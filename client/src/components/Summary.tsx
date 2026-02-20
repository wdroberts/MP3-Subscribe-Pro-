import { useSummarization } from '../hooks/useSummarization.ts';

interface SummaryProps {
  transcriptionId: string;
}

export default function Summary({ transcriptionId }: SummaryProps) {
  const { summarize, summary, isLoading, error } = useSummarization();

  const handleSummarize = () => {
    summarize(transcriptionId);
  };

  return (
    <div className="summary-section">
      <h2>Analysis</h2>

      {!summary && !isLoading && (
        <button className="upload-btn" onClick={handleSummarize} disabled={isLoading}>
          Extract Key Points
        </button>
      )}

      {isLoading && (
        <div className="loading-indicator">
          <div className="spinner" />
          <p>Extracting key points...</p>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {summary && <div className="summary-text">{summary.summary}</div>}
    </div>
  );
}
