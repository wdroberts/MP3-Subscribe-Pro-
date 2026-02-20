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

  it('renders the Analysis heading', () => {
    render(<Summary transcriptionId="job-1" />);
    expect(screen.getByText('Analysis')).toBeInTheDocument();
  });

  it('renders Extract Key Points button when no summary', () => {
    render(<Summary transcriptionId="job-1" />);
    expect(screen.getByRole('button', { name: 'Extract Key Points' })).toBeInTheDocument();
  });

  it('calls summarize when button is clicked', async () => {
    render(<Summary transcriptionId="job-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Extract Key Points' }));
    expect(mockSummarize).toHaveBeenCalledWith('job-1');
  });

  it('shows loading state', () => {
    mockHookReturn.isLoading = true;
    render(<Summary transcriptionId="job-1" />);
    expect(screen.getByText('Extracting key points...')).toBeInTheDocument();
  });

  it('shows error message', () => {
    mockHookReturn.error = 'Summarization failed';
    render(<Summary transcriptionId="job-1" />);
    expect(screen.getByText('Summarization failed')).toBeInTheDocument();
  });

  it('displays summary text when available', () => {
    mockHookReturn.summary = { summary: '**Key Points:**\n\n- First point.\n- Second point.' };
    render(<Summary transcriptionId="job-1" />);
    expect(screen.getByText('Key Points:')).toBeInTheDocument();
    expect(screen.getByText('First point.')).toBeInTheDocument();
    expect(screen.getByText('Second point.')).toBeInTheDocument();
  });

  it('renders bullet points as list items', () => {
    mockHookReturn.summary = { summary: '**Key Points:**\n\n- Item one.\n- Item two.' };
    const { container } = render(<Summary transcriptionId="job-1" />);
    const listItems = container.querySelectorAll('li');
    expect(listItems).toHaveLength(2);
    expect(listItems[0].textContent).toBe('Item one.');
    expect(listItems[1].textContent).toBe('Item two.');
  });

  it('hides Extract Key Points button when summary is available', () => {
    mockHookReturn.summary = { summary: 'Analysis result.' };
    render(<Summary transcriptionId="job-1" />);
    expect(screen.queryByRole('button', { name: 'Extract Key Points' })).not.toBeInTheDocument();
  });
});
