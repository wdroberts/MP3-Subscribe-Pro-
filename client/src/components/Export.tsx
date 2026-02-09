import { useState } from 'react';
import { getExportUrl } from '../services/api.ts';

interface ExportProps {
  transcriptionId: string;
  fullText: string;
}

export default function Export({ transcriptionId, fullText }: ExportProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = fullText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="export-section">
      <h2>Export</h2>
      <div className="export-buttons">
        <a
          className="export-btn"
          href={getExportUrl(transcriptionId, 'txt')}
          download="transcription.txt"
        >
          Download TXT
        </a>
        <a
          className="export-btn"
          href={getExportUrl(transcriptionId, 'srt')}
          download="transcription.srt"
        >
          Download SRT
        </a>
        <a
          className="export-btn"
          href={getExportUrl(transcriptionId, 'json')}
          download="transcription.json"
        >
          Download JSON
        </a>
        <button className="export-btn" onClick={handleCopy}>
          Copy to Clipboard
          {copied && <span className="copied-toast">Copied!</span>}
        </button>
      </div>
    </div>
  );
}
