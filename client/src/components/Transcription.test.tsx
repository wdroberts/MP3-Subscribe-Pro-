import { render, screen } from '@testing-library/react';
import Transcription from './Transcription';
import { TranscriptionResult } from '../types/index';

const mockTranscription: TranscriptionResult = {
  id: 'job-1',
  uploadId: 'up-1',
  segments: [
    { index: 0, startTime: 0, endTime: 2.5, text: 'Hello world.' },
    { index: 1, startTime: 2.5, endTime: 5.0, text: 'Second sentence.' },
  ],
  fullText: 'Hello world. Second sentence.',
  status: 'completed',
  createdAt: '2025-01-01T00:00:00.000Z',
};

describe('Transcription', () => {
  it('renders nothing when status is idle', () => {
    const { container } = render(
      <Transcription transcription={null} status="idle" error={null} progress={null} elapsedSeconds={0} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows loading indicator when status is pending', () => {
    render(<Transcription transcription={null} status="pending" error={null} progress={null} elapsedSeconds={0} />);
    expect(screen.getByText('Starting transcription...')).toBeInTheDocument();
  });

  it('shows loading indicator when status is processing', () => {
    render(<Transcription transcription={null} status="processing" error={null} progress={null} elapsedSeconds={0} />);
    expect(screen.getByText('Transcribing audio...')).toBeInTheDocument();
  });

  it('shows error message when status is failed', () => {
    render(
      <Transcription transcription={null} status="failed" error="Something broke" progress={null} elapsedSeconds={0} />,
    );
    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });

  it('renders segments when status is completed', () => {
    render(
      <Transcription transcription={mockTranscription} status="completed" error={null} progress={null} elapsedSeconds={0} />,
    );
    expect(screen.getByText('Hello world.')).toBeInTheDocument();
    expect(screen.getByText('Second sentence.')).toBeInTheDocument();
  });

  it('renders clickable timestamps for each segment', () => {
    render(
      <Transcription transcription={mockTranscription} status="completed" error={null} progress={null} elapsedSeconds={0} />,
    );
    const timestamps = screen.getAllByRole('button');
    expect(timestamps).toHaveLength(2);
    expect(timestamps[0]).toHaveTextContent('[00:00]');
  });

  it('renders the Transcription heading', () => {
    render(
      <Transcription transcription={mockTranscription} status="completed" error={null} progress={null} elapsedSeconds={0} />,
    );
    expect(screen.getByText('Transcription')).toBeInTheDocument();
  });

  it('shows progress bar when progress object is provided', () => {
    const mockProgress = {
      percent: 50,
      currentStep: 'Transcribed 2 of 4 chunks...',
      chunksTotal: 4,
      chunksCompleted: 2,
    };
    render(
      <Transcription transcription={null} status="processing" error={null} progress={mockProgress} elapsedSeconds={30} />,
    );
    expect(screen.getByText('Transcribed 2 of 4 chunks...')).toBeInTheDocument();
    expect(screen.getByText('Chunk 2 / 4 · 50%')).toBeInTheDocument();
  });
});
