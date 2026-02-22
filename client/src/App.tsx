import { useState } from 'react';
import Upload from './components/Upload.tsx';
import Transcription from './components/Transcription.tsx';
import Summary from './components/Summary.tsx';
import Export from './components/Export.tsx';
import { useTranscription } from './hooks/useTranscription.ts';
import { UploadResult } from './types/index.ts';

function App() {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const { startTranscription, transcription, status, error, progress, elapsedSeconds } = useTranscription();

  const handleUploadComplete = async (result: UploadResult) => {
    setUploadResult(result);
    await startTranscription(result.id);
  };

  const handleReset = () => {
    setUploadResult(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>MP3 Transcribe Pro</h1>
        <p>Upload an MP3 file to transcribe, summarize, and export. <span style={{fontSize: '0.7em', opacity: 0.5}}>v5</span></p>
      </header>

      <main className="app-main">
        {!uploadResult ? (
          <Upload onUploadComplete={handleUploadComplete} />
        ) : (
          <div className="results">
            <button className="reset-btn" onClick={handleReset}>
              Upload New File
            </button>

            <Transcription transcription={transcription} status={status} error={error} progress={progress} elapsedSeconds={elapsedSeconds} />

            {status === 'completed' && transcription && (
              <>
                <Summary transcriptionId={transcription.id} />
                <Export transcriptionId={transcription.id} fullText={transcription.fullText} />
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
