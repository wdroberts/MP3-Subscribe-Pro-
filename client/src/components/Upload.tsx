import { useState, useRef, DragEvent } from 'react';
import { uploadFile } from '../services/api.ts';
import { formatFileSize } from '../utils/formatTime.ts';
import { UploadResult } from '../types/index.ts';

interface UploadProps {
  onUploadComplete: (result: UploadResult) => void;
}

export default function Upload({ onUploadComplete }: UploadProps) {
  const [dragover, setDragover] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setSelectedFile(file);
    setIsUploading(true);
    setError(null);
    setProgress(0);

    try {
      const result = await uploadFile(file, setProgress);
      onUploadComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  return (
    <div>
      <div
        className={`upload-zone ${dragover ? 'dragover' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragover(true);
        }}
        onDragLeave={() => setDragover(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,audio/mpeg"
          onChange={handleFileChange}
        />
        <p>Drag & drop an MP3 file here, or click to browse</p>
        <button className="upload-btn" type="button" disabled={isUploading}>
          {isUploading ? 'Uploading...' : 'Choose File'}
        </button>
      </div>

      {selectedFile && (
        <div className="file-info">
          {selectedFile.name} ({formatFileSize(selectedFile.size)})
        </div>
      )}

      {isUploading && (
        <div className="progress-bar-container">
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-label">{progress}%</div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
