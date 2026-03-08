import { TranscriptionSegment } from '../types';
interface WordInfo {
    word: string;
    startTime: number;
    endTime: number;
}
declare function groupWordsIntoSentences(words: WordInfo[]): TranscriptionSegment[];
export interface ProgressReport {
    percent: number;
    currentStep: string;
    chunksTotal?: number;
    chunksCompleted?: number;
}
export type OnProgressCallback = (report: ProgressReport) => void;
export declare function transcribe(audioFilePath: string, sampleRateHertz: number, durationSeconds: number, originalMp3Path?: string, onProgress?: OnProgressCallback): Promise<TranscriptionSegment[]>;
export { groupWordsIntoSentences, WordInfo };
//# sourceMappingURL=speechToText.d.ts.map