import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Upload from './Upload';

// Mock the api module
vi.mock('../services/api', () => ({
  uploadFile: vi.fn(),
}));

import { uploadFile } from '../services/api';

const mockUploadFile = vi.mocked(uploadFile);

describe('Upload', () => {
  const onUploadComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the upload zone with instructions', () => {
    render(<Upload onUploadComplete={onUploadComplete} />);
    expect(screen.getByText(/Drag & drop an audio file/)).toBeInTheDocument();
  });

  it('renders a Choose File button', () => {
    render(<Upload onUploadComplete={onUploadComplete} />);
    expect(screen.getByRole('button', { name: 'Choose File' })).toBeInTheDocument();
  });

  it('renders a file input that accepts MP3 files', () => {
    render(<Upload onUploadComplete={onUploadComplete} />);
    const input = document.querySelector('input[type="file"]');
    expect(input).toHaveAttribute('accept', '.mp3,.m4a,.aac,.wav,.ogg,.flac,.webm,audio/*');
  });

  it('shows Upload button after selecting a file', async () => {
    render(<Upload onUploadComplete={onUploadComplete} />);

    const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  it('calls uploadFile and onUploadComplete on successful upload', async () => {
    const mockResult = {
      id: 'upload-1',
      filename: 'test.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 1024,
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    mockUploadFile.mockResolvedValue(mockResult);

    render(<Upload onUploadComplete={onUploadComplete} />);

    const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    const uploadBtn = screen.getByRole('button', { name: 'Upload' });
    await userEvent.click(uploadBtn);

    expect(mockUploadFile).toHaveBeenCalledWith(file, expect.any(Function));
    expect(onUploadComplete).toHaveBeenCalledWith(mockResult);
  });

  it('shows error when upload fails', async () => {
    mockUploadFile.mockRejectedValue(new Error('Upload failed'));

    render(<Upload onUploadComplete={onUploadComplete} />);

    const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    const uploadBtn = screen.getByRole('button', { name: 'Upload' });
    await userEvent.click(uploadBtn);

    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
    expect(onUploadComplete).not.toHaveBeenCalled();
  });
});
