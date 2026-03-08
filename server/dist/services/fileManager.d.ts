export declare function isValidUploadId(id: string): boolean;
export declare function getUploadDir(): string;
export declare function ensureUploadDir(): Promise<void>;
export declare function uploadExists(uploadId: string): Promise<boolean>;
export declare function cleanupUpload(uploadId: string): Promise<void>;
export declare function cleanupStaleUploads(maxAgeMs: number): Promise<void>;
//# sourceMappingURL=fileManager.d.ts.map