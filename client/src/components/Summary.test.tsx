import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Summary from './Summary';

// Mock the useSummarization hook
const mockSummarize = vi.fn();
vi.mock('../hooks/useSummarization', () => ({
  useSummarization: () => mockHookReturn,
}));

let mockHookReturn: {
  summarize: typeof mockSummarize;
  summary: { summary: string } | null;
  isLoading: boolean;
  error: string | null;
};

describe('Summary', () => {
  beforeEach(() => {
    mockSummarize.mockClear();
    mockHookReturn = {
      summarize: mockSummarize,
      summary: null,
      isLoading: false,
      error: null,
    };
  });

  it('renders the Summary heading', () => {
    render(<Summary transcriptionId="job-1" />);
    expect(screen.getByText('Summary')).toBeInTheDocument();
  });

  it('renders Generate Summary button when no summary', () => {
    render(<Summary transcriptionId="job-1" />);
    expect(screen.getByRole('button', { name: 'Generate Summary' })).toBeInTheDocument();
  });

  it('calls summarize when button is clicked', async () => {
    render(<Summary transcriptionId="job-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Generate Summary' }));
    expect(mockSummarize).toHaveBeenCalledWith('job-1');
  });

  it('shows loading state', () => {
    mockHookReturn.isLoading = true;
    render(<Summary transcriptionId="job-1" />);
    expect(screen.getByText('Generating summary...')).toBeInTheDocument();
  });

  it('shows error message', () => {
    mockHookReturn.error = 'Summarization failed';
    render(<Summary transcriptionId="job-1" />);
    expect(screen.getByText('Summarization failed')).toBeInTheDocument();
  });

  it('displays summary text when available', () => {
    mockHookReturn.summary = { summary: 'This is a summary of the transcription.' };
    render(<Summary transcriptionId="job-1" />);
    expect(screen.getByText('This is a summary of the transcription.')).toBeInTheDocument();
  });

  it('hides Generate Summary button when summary is available', () => {
    mockHookReturn.summary = { summary: 'A summary.' };
    render(<Summary transcriptionId="job-1" />);
    expect(screen.queryByRole('button', { name: 'Generate Summary' })).not.toBeInTheDocument();
  });
});
