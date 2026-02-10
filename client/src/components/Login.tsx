interface LoginProps {
  onLogin: () => void;
  isLoading: boolean;
}

export default function Login({ onLogin, isLoading }: LoginProps) {
  return (
    <div className="login-section">
      <h2>Sign in to get started</h2>
      <p>Sign in with your Google account to upload and transcribe MP3 files.</p>
      <button className="google-btn" onClick={onLogin} disabled={isLoading}>
        {isLoading ? 'Redirecting...' : 'Sign in with Google'}
      </button>
    </div>
  );
}
