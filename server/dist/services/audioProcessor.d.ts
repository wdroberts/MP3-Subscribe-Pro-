export interface AudioMeta {
    sampleRateHertz: number;
    durationSeconds: number;
}
export declare function convertToLinear16(inputPath: string, outputDir: string): Promise<AudioMeta>;
export declare function validateMp3(filepath: string): Promise<boolean>;
export declare function getConvertedPath(uploadDir: string): string;
/** Fast metadata probe — gets duration without converting the file */
export declare function probeAudioMeta(inputPath: string): Promise<AudioMeta>;
//# sourceMappingURL=audioProcessor.d.ts.map