export interface UploadResult {
  id: string;
  filename: string;
  filepath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TranscriptionSegment {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

export interface TranscriptionResult {
  id: string;
  uploadId: string;
  segments: TranscriptionSegment[];
  fullText: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: string;
}

export interface SummarizationResult {
  id: string;
  transcriptionId: string;
  summary: string;
  createdAt: string;
}

export interface ApiErrorResponse {
  error: string;
  details?: string;
}
