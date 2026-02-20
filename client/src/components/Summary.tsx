import { useSummarization } from '../hooks/useSummarization.ts';

interface SummaryProps {
  transcriptionId: string;
}

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++}>
          {listItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(trimmed.slice(2));
      continue;
    }

    flushList();

    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*(.*)$/);
    if (boldMatch) {
      elements.push(
        <h3 key={key++}>
          {boldMatch[1]}
          {boldMatch[2] && <span style={{ fontWeight: 'normal' }}>{boldMatch[2]}</span>}
        </h3>,
      );
    } else {
      elements.push(<p key={key++}>{trimmed}</p>);
    }
  }

  flushList();
  return elements;
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

      {summary && <div className="summary-text">{renderMarkdown(summary.summary)}</div>}
    </div>
  );
}
