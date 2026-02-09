import { useState, useCallback } from 'react';
import { uploadFile } from '../services/api.ts';
import { UploadResult } from '../types/index.ts';

interface UseUploadReturn {
  upload: (file: File) => Promise<void>;
  progress: number;
  result: UploadResult | null;
  error: string | null;
  isUploading: boolean;
  reset: () => void;
}

export function useUpload(): UseUploadReturn {
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const upload = useCallback(async (file: File) => {
    setIsUploading(true);
    setError(null);
    setProgress(0);
    setResult(null);

    try {
      const uploadResult = await uploadFile(file, setProgress);
      setResult(uploadResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setProgress(0);
    setResult(null);
    setError(null);
    setIsUploading(false);
  }, []);

  return { upload, progress, result, error, isUploading, reset };
}
