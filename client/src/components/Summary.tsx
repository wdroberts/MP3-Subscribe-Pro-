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
      <h2>Summary</h2>

      {!summary && !isLoading && (
        <button className="upload-btn" onClick={handleSummarize} disabled={isLoading}>
          Generate Summary
        </button>
      )}

      {isLoading && (
        <div className="loading-indicator">
          <div className="spinner" />
          <p>Generating summary...</p>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {summary && <div className="summary-text">{summary.summary}</div>}
    </div>
  );
}
