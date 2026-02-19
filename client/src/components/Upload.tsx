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
    setError(null);
    setProgress(0);

    // Client-side validation: accept any audio MIME type or common audio extensions
    const validExtensions = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.webm'];
    const hasAudioMime = file.type.startsWith('audio/');
    const hasValidExtension = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!hasAudioMime && !hasValidExtension) {
      setError(`File type "${file.type || 'unknown'}" is not supported. Please upload an audio file.`);
      return;
    }

    setIsUploading(true);

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
          accept=".mp3,.m4a,.aac,.wav,.ogg,.flac,.webm,audio/*"
          onChange={handleFileChange}
        />
        <p>Drag & drop an audio file here, or click to browse</p>
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
