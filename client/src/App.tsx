import { useState, useEffect } from 'react';
import Upload from './components/Upload.tsx';
import Transcription from './components/Transcription.tsx';
import Summary from './components/Summary.tsx';
import Export from './components/Export.tsx';
import Login from './components/Login.tsx';
import { useTranscription } from './hooks/useTranscription.ts';
import { useAuth } from './hooks/useAuth.ts';
import { UploadResult } from './types/index.ts';

function App() {
  const { user, isAuthenticated, isLoading: authLoading, login, handleCallback, logout } = useAuth();
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const { startTranscription, transcription, status, error } = useTranscription();

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      handleCallback(code).then(() => {
        // Clean the URL after handling callback
        window.history.replaceState({}, '', window.location.pathname);
      });
    }
  }, [handleCallback]);

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
        <p>Upload an MP3 file to transcribe, summarize, and export.</p>
        {isAuthenticated && user && (
          <div className="user-info">
            <span>Signed in as {user.name}</span>
            <button className="logout-btn" onClick={logout}>Sign out</button>
          </div>
        )}
      </header>

      <main className="app-main">
        {!isAuthenticated ? (
          <Login onLogin={login} isLoading={authLoading} />
        ) : !uploadResult ? (
          <Upload onUploadComplete={handleUploadComplete} />
        ) : (
          <div className="results">
            <button className="reset-btn" onClick={handleReset}>
              Upload New File
            </button>

            <Transcription transcription={transcription} status={status} error={error} />

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
