export interface UploadResult {
  id: string;
  filename: string;
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

export interface TranscriptionProgress {
  percent: number;
  currentStep: string;
  chunksTotal?: number;
  chunksCompleted?: number;
}

export interface TranscriptionResult {
  id: string;
  uploadId: string;
  segments: TranscriptionSegment[];
  fullText: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  progress?: TranscriptionProgress;
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
