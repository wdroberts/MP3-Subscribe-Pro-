import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Mock all hooks and child components to isolate App logic
const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockHandleCallback = vi.fn();
const mockStartTranscription = vi.fn();

// Module-level capture for Upload's onUploadComplete prop
let capturedOnUploadComplete: ((result: { id: string; filename: string; size: number; duration: number }) => void) | null = null;

let mockAuthReturn: {
  user: { id: string; email: string; name: string; picture: string } | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: typeof mockLogin;
  handleCallback: typeof mockHandleCallback;
  logout: typeof mockLogout;
  getToken: () => string | null;
};

let mockTranscriptionReturn: {
  startTranscription: typeof mockStartTranscription;
  transcription: {
    id: string;
    uploadId: string;
    segments: { index: number; startTime: number; endTime: number; text: string }[];
    fullText: string;
    status: string;
    createdAt: string;
  } | null;
  status: string;
  error: string | null;
};

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => mockAuthReturn,
}));

vi.mock('./hooks/useTranscription', () => ({
  useTranscription: () => mockTranscriptionReturn,
}));

// Mock Upload to capture the onUploadComplete callback
vi.mock('./components/Upload', () => ({
  default: ({ onUploadComplete }: { onUploadComplete: (result: { id: string; filename: string; size: number; duration: number }) => void }) => {
    capturedOnUploadComplete = onUploadComplete;
    return <div data-testid="mock-upload">Upload Component</div>;
  },
}));

// Mock window.location.search for OAuth callback test
const originalLocation = window.location;

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnUploadComplete = null;

    mockAuthReturn = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
      handleCallback: mockHandleCallback.mockResolvedValue(undefined),
      logout: mockLogout,
      getToken: () => null,
    };

    mockTranscriptionReturn = {
      startTranscription: mockStartTranscription,
      transcription: null,
      status: 'idle',
      error: null,
    };

    // Reset location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, search: '', pathname: '/', href: '' },
    });
    window.history.replaceState = vi.fn();
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  it('renders the app header', () => {
    render(<App />);
    expect(screen.getByText('MP3 Transcribe Pro')).toBeInTheDocument();
  });

  it('shows Login when not authenticated', () => {
    render(<App />);
    expect(screen.getByText('Sign in to get started')).toBeInTheDocument();
  });

  it('shows Upload when authenticated and no upload yet', () => {
    mockAuthReturn.isAuthenticated = true;
    mockAuthReturn.user = { id: '1', email: 'a@b.com', name: 'Test User', picture: '' };

    render(<App />);
    expect(screen.getByTestId('mock-upload')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to get started')).not.toBeInTheDocument();
  });

  it('shows user info and sign-out button when authenticated', () => {
    mockAuthReturn.isAuthenticated = true;
    mockAuthReturn.user = { id: '1', email: 'a@b.com', name: 'Test User', picture: '' };

    render(<App />);
    expect(screen.getByText('Signed in as Test User')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('calls logout when Sign out is clicked', async () => {
    mockAuthReturn.isAuthenticated = true;
    mockAuthReturn.user = { id: '1', email: 'a@b.com', name: 'Test User', picture: '' };

    render(<App />);
    await userEvent.click(screen.getByText('Sign out'));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('handles OAuth callback code from URL', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, search: '?code=auth-code-123', pathname: '/', href: '' },
    });

    render(<App />);
    expect(mockHandleCallback).toHaveBeenCalledWith('auth-code-123');
  });

  it('does not call handleCallback when no code in URL', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, search: '', pathname: '/', href: '' },
    });

    render(<App />);
    expect(mockHandleCallback).not.toHaveBeenCalled();
  });

  describe('upload-complete flow', () => {
    beforeEach(() => {
      mockAuthReturn.isAuthenticated = true;
      mockAuthReturn.user = { id: '1', email: 'a@b.com', name: 'Test User', picture: '' };
    });

    it('calls startTranscription and shows results after upload completes', async () => {
      render(<App />);

      // Upload component should be shown initially
      expect(screen.getByTestId('mock-upload')).toBeInTheDocument();

      // Simulate upload completion
      await act(async () => {
        capturedOnUploadComplete!({ id: 'upload-1', filename: 'test.mp3', size: 1024, duration: 60 });
      });

      // startTranscription should be called with the upload id
      expect(mockStartTranscription).toHaveBeenCalledWith('upload-1');

      // Upload should be hidden, results view should show
      expect(screen.queryByTestId('mock-upload')).not.toBeInTheDocument();
      expect(screen.getByText('Upload New File')).toBeInTheDocument();
    });

    it('shows Transcription component in results view', async () => {
      mockTranscriptionReturn.status = 'processing';

      render(<App />);

      await act(async () => {
        capturedOnUploadComplete!({ id: 'upload-1', filename: 'test.mp3', size: 1024, duration: 60 });
      });

      // Transcription component renders with processing status
      expect(screen.getByText(/Transcribing audio/i)).toBeInTheDocument();
    });

    it('shows Summary and Export when transcription is completed', async () => {
      mockTranscriptionReturn.status = 'completed';
      mockTranscriptionReturn.transcription = {
        id: 'job-1',
        uploadId: 'upload-1',
        segments: [{ index: 0, startTime: 0, endTime: 1, text: 'Hello world.' }],
        fullText: 'Hello world.',
        status: 'completed',
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      render(<App />);

      await act(async () => {
        capturedOnUploadComplete!({ id: 'upload-1', filename: 'test.mp3', size: 1024, duration: 60 });
      });

      // Summary and Export components should render
      expect(screen.getByText('Summary')).toBeInTheDocument();
      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    it('does not show Summary and Export when transcription is not completed', async () => {
      mockTranscriptionReturn.status = 'processing';
      mockTranscriptionReturn.transcription = null;

      render(<App />);

      await act(async () => {
        capturedOnUploadComplete!({ id: 'upload-1', filename: 'test.mp3', size: 1024, duration: 60 });
      });

      // Summary and Export should not render
      expect(screen.queryByText('Summary')).not.toBeInTheDocument();
      expect(screen.queryByText('Export')).not.toBeInTheDocument();
    });

    it('resets to upload view when "Upload New File" is clicked', async () => {
      render(<App />);

      // Trigger upload complete
      await act(async () => {
        capturedOnUploadComplete!({ id: 'upload-1', filename: 'test.mp3', size: 1024, duration: 60 });
      });

      // Should show results view with reset button
      expect(screen.getByText('Upload New File')).toBeInTheDocument();

      // Click reset
      await userEvent.click(screen.getByText('Upload New File'));

      // Should go back to upload view
      expect(screen.getByTestId('mock-upload')).toBeInTheDocument();
      expect(screen.queryByText('Upload New File')).not.toBeInTheDocument();
    });
  });
});
