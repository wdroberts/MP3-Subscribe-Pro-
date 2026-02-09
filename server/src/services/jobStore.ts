import { v4 as uuidv4 } from 'uuid';
import { TranscriptionResult, SummarizationResult } from '../types';

const transcriptionJobs = new Map<string, TranscriptionResult>();
const summarizationJobs = new Map<string, SummarizationResult>();

export function createTranscriptionJob(uploadId: string): TranscriptionResult {
  const job: TranscriptionResult = {
    id: uuidv4(),
    uploadId,
    segments: [],
    fullText: '',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  transcriptionJobs.set(job.id, job);
  return job;
}

export function updateTranscriptionJob(id: string, update: Partial<TranscriptionResult>): void {
  const job = transcriptionJobs.get(id);
  if (job) {
    Object.assign(job, update);
  }
}

export function getTranscriptionJob(id: string): TranscriptionResult | undefined {
  return transcriptionJobs.get(id);
}

export function createSummarizationJob(transcriptionId: string): SummarizationResult {
  const job: SummarizationResult = {
    id: uuidv4(),
    transcriptionId,
    summary: '',
    createdAt: new Date().toISOString(),
  };
  summarizationJobs.set(job.id, job);
  return job;
}

export function updateSummarizationJob(id: string, update: Partial<SummarizationResult>): void {
  const job = summarizationJobs.get(id);
  if (job) {
    Object.assign(job, update);
  }
}

export function getSummarizationJob(id: string): SummarizationResult | undefined {
  return summarizationJobs.get(id);
}

// For testing
export function clearAllJobs(): void {
  transcriptionJobs.clear();
  summarizationJobs.clear();
}
