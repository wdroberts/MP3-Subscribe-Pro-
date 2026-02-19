import { v4 as uuidv4 } from 'uuid';
import { TranscriptionResult, SummarizationResult } from '../types';

const MAX_JOBS = 500;
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

const transcriptionJobs = new Map<string, TranscriptionResult>();
const summarizationJobs = new Map<string, SummarizationResult>();

function evictOldJobs(): void {
  const now = Date.now();
  for (const [id, job] of transcriptionJobs) {
    if (now - new Date(job.createdAt).getTime() > MAX_AGE_MS) {
      transcriptionJobs.delete(id);
    }
  }
  for (const [id, job] of summarizationJobs) {
    if (now - new Date(job.createdAt).getTime() > MAX_AGE_MS) {
      summarizationJobs.delete(id);
    }
  }
}

// Run eviction every 10 minutes
setInterval(evictOldJobs, 10 * 60 * 1000).unref();

export function createTranscriptionJob(uploadId: string): TranscriptionResult {
  if (transcriptionJobs.size >= MAX_JOBS) {
    evictOldJobs();
  }
  if (transcriptionJobs.size >= MAX_JOBS) {
    // Still full after eviction — remove the oldest entry
    const oldestKey = transcriptionJobs.keys().next().value;
    if (oldestKey) transcriptionJobs.delete(oldestKey);
  }

  const job: TranscriptionResult = {
    id: uuidv4(),
    uploadId,
    segments: [],
    fullText: '',
    status: 'pending',
    progress: { percent: 0, currentStep: 'Preparing transcription...' },
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
  if (summarizationJobs.size >= MAX_JOBS) {
    evictOldJobs();
  }
  if (summarizationJobs.size >= MAX_JOBS) {
    const oldestKey = summarizationJobs.keys().next().value;
    if (oldestKey) summarizationJobs.delete(oldestKey);
  }

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
