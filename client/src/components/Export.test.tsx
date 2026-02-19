import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Export from './Export';

describe('Export', () => {
  const defaultProps = {
    transcriptionId: 'job-1',
    fullText: 'Hello world. Second sentence.',
  };

  it('renders the Export heading', () => {
    render(<Export {...defaultProps} />);
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('renders download links for txt, srt, and json', () => {
    render(<Export {...defaultProps} />);
    expect(screen.getByText('Download TXT')).toBeInTheDocument();
    expect(screen.getByText('Download SRT')).toBeInTheDocument();
    expect(screen.getByText('Download JSON')).toBeInTheDocument();
  });

  it('renders correct href for download links', () => {
    render(<Export {...defaultProps} />);
    const txtLink = screen.getByText('Download TXT').closest('a');
    expect(txtLink).toHaveAttribute('href', '/api/export/job-1/txt');
    const srtLink = screen.getByText('Download SRT').closest('a');
    expect(srtLink).toHaveAttribute('href', '/api/export/job-1/srt');
    const jsonLink = screen.getByText('Download JSON').closest('a');
    expect(jsonLink).toHaveAttribute('href', '/api/export/job-1/json');
  });

  it('renders a Copy to Clipboard button', () => {
    render(<Export {...defaultProps} />);
    expect(screen.getByText('Copy to Clipboard')).toBeInTheDocument();
  });

  it('copies text to clipboard when button is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<Export {...defaultProps} />);
    await userEvent.click(screen.getByText('Copy to Clipboard'));
    expect(writeText).toHaveBeenCalledWith('Hello world. Second sentence.');
  });
});
