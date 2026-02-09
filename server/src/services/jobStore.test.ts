import {
  createTranscriptionJob,
  updateTranscriptionJob,
  getTranscriptionJob,
  createSummarizationJob,
  updateSummarizationJob,
  getSummarizationJob,
  clearAllJobs,
} from './jobStore';

beforeEach(() => {
  clearAllJobs();
});

describe('transcription jobs', () => {
  it('creates a job with pending status', () => {
    const job = createTranscriptionJob('upload-1');
    expect(job.id).toBeDefined();
    expect(job.uploadId).toBe('upload-1');
    expect(job.status).toBe('pending');
    expect(job.segments).toEqual([]);
    expect(job.fullText).toBe('');
  });

  it('retrieves a created job', () => {
    const job = createTranscriptionJob('upload-1');
    const retrieved = getTranscriptionJob(job.id);
    expect(retrieved).toBe(job);
  });

  it('returns undefined for nonexistent job', () => {
    expect(getTranscriptionJob('nonexistent')).toBeUndefined();
  });

  it('updates a job', () => {
    const job = createTranscriptionJob('upload-1');
    updateTranscriptionJob(job.id, { status: 'completed', fullText: 'Hello world.' });
    const updated = getTranscriptionJob(job.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.fullText).toBe('Hello world.');
  });
});

describe('summarization jobs', () => {
  it('creates a summarization job', () => {
    const job = createSummarizationJob('trans-1');
    expect(job.id).toBeDefined();
    expect(job.transcriptionId).toBe('trans-1');
    expect(job.summary).toBe('');
  });

  it('retrieves a created job', () => {
    const job = createSummarizationJob('trans-1');
    expect(getSummarizationJob(job.id)).toBe(job);
  });

  it('updates a job', () => {
    const job = createSummarizationJob('trans-1');
    updateSummarizationJob(job.id, { summary: 'A summary.' });
    expect(getSummarizationJob(job.id)?.summary).toBe('A summary.');
  });
});
