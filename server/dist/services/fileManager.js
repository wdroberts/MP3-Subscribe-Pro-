"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidUploadId = isValidUploadId;
exports.getUploadDir = getUploadDir;
exports.ensureUploadDir = ensureUploadDir;
exports.uploadExists = uploadExists;
exports.cleanupUpload = cleanupUpload;
exports.cleanupStaleUploads = cleanupStaleUploads;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const UPLOAD_DIR = process.env.UPLOAD_DIR || './tmp/uploads';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUploadId(id) {
    return UUID_RE.test(id);
}
function getUploadDir() {
    return UPLOAD_DIR;
}
async function ensureUploadDir() {
    await promises_1.default.mkdir(UPLOAD_DIR, { recursive: true });
}
async function uploadExists(uploadId) {
    if (!isValidUploadId(uploadId))
        return false;
    try {
        await promises_1.default.access(path_1.default.join(UPLOAD_DIR, uploadId, 'original.mp3'));
        return true;
    }
    catch {
        return false;
    }
}
async function cleanupUpload(uploadId) {
    if (!isValidUploadId(uploadId)) {
        throw new Error('Invalid upload ID');
    }
    const uploadPath = path_1.default.join(UPLOAD_DIR, uploadId);
    await promises_1.default.rm(uploadPath, { recursive: true, force: true });
}
async function cleanupStaleUploads(maxAgeMs) {
    try {
        const entries = await promises_1.default.readdir(UPLOAD_DIR, { withFileTypes: true });
        const now = Date.now();
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const dirPath = path_1.default.join(UPLOAD_DIR, entry.name);
            const stat = await promises_1.default.stat(dirPath);
            if (now - stat.mtimeMs > maxAgeMs) {
                await promises_1.default.rm(dirPath, { recursive: true, force: true });
            }
        }
    }
    catch (err) {
        // Upload dir may not exist yet
        if (err.code !== 'ENOENT') {
            throw err;
        }
    }
}
//# sourceMappingURL=fileManager.js.map