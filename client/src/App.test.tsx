import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const mockStartTranscription = vi.fn();

// Module-level capture for Upload's onUploadComplete prop
let capturedOnUploadComplete: ((result: { id: string; filename: string; size: number; duration: number }) => void) | null = null;

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

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnUploadComplete = null;

    mockTranscriptionReturn = {
      startTranscription: mockStartTranscription,
      transcription: null,
      status: 'idle',
      error: null,
    };
  });

  it('renders the app header', () => {
    render(<App />);
    expect(screen.getByText('MP3 Transcribe Pro')).toBeInTheDocument();
  });

  it('shows Upload component by default', () => {
    render(<App />);
    expect(screen.getByTestId('mock-upload')).toBeInTheDocument();
  });

  describe('upload-complete flow', () => {
    it('calls startTranscription and shows results after upload completes', async () => {
      render(<App />);

      expect(screen.getByTestId('mock-upload')).toBeInTheDocument();

      await act(async () => {
        capturedOnUploadComplete!({ id: 'upload-1', filename: 'test.mp3', size: 1024, duration: 60 });
      });

      expect(mockStartTranscription).toHaveBeenCalledWith('upload-1');
      expect(screen.queryByTestId('mock-upload')).not.toBeInTheDocument();
      expect(screen.getByText('Upload New File')).toBeInTheDocument();
    });

    it('shows Transcription component in results view', async () => {
      mockTranscriptionReturn.status = 'processing';

      render(<App />);

      await act(async () => {
        capturedOnUploadComplete!({ id: 'upload-1', filename: 'test.mp3', size: 1024, duration: 60 });
      });

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

      expect(screen.queryByText('Summary')).not.toBeInTheDocument();
      expect(screen.queryByText('Export')).not.toBeInTheDocument();
    });

    it('resets to upload view when "Upload New File" is clicked', async () => {
      render(<App />);

      await act(async () => {
        capturedOnUploadComplete!({ id: 'upload-1', filename: 'test.mp3', size: 1024, duration: 60 });
      });

      expect(screen.getByText('Upload New File')).toBeInTheDocument();

      await userEvent.click(screen.getByText('Upload New File'));

      expect(screen.getByTestId('mock-upload')).toBeInTheDocument();
      expect(screen.queryByText('Upload New File')).not.toBeInTheDocument();
    });
  });
});
