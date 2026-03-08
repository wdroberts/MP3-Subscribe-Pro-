import { TranscriptionResult, SummarizationResult } from '../types';
export declare function createTranscriptionJob(uploadId: string): TranscriptionResult;
export declare function updateTranscriptionJob(id: string, update: Partial<TranscriptionResult>): void;
export declare function getTranscriptionJob(id: string): TranscriptionResult | undefined;
export declare function createSummarizationJob(transcriptionId: string): SummarizationResult;
export declare function updateSummarizationJob(id: string, update: Partial<SummarizationResult>): void;
export declare function getSummarizationJob(id: string): SummarizationResult | undefined;
export declare function clearAllJobs(): void;
//# sourceMappingURL=jobStore.d.ts.map