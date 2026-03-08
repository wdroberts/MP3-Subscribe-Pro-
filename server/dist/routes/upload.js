"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processRouter = void 0;
const express_1 = require("express");
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const audioProcessor_1 = require("../services/audioProcessor");
const fileManager_1 = require("../services/fileManager");
const sessions = new Map();
// ── Session cleanup — evict abandoned sessions after 30 minutes ──────
const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const SESSION_MAX_PARTS = 500; // ~500 MB at 1 MB per chunk
setInterval(() => {
    const now = Date.now();
    for (const [id, state] of sessions) {
        if (now - state.createdAt > SESSION_MAX_AGE_MS) {
            promises_1.default.rm(state.dir, { recursive: true, force: true }).catch(() => { });
            sessions.delete(id);
        }
    }
}, 5 * 60 * 1000).unref();
// Sanitize a filename — strip path separators and control characters
function sanitizeFilename(name) {
    // eslint-disable-next-line no-control-regex
    const UNSAFE_CHARS = /[/\\:*?"<>|\x00-\x1f\s]/g;
    return name
        .replace(UNSAFE_CHARS, '_')
        .replace(/^\.+/, '_')
        .slice(0, 255);
}
exports.processRouter = (0, express_1.Router)();
// ── Init session ────────────────────────────────────────────────────
exports.processRouter.post('/init', async (req, res, next) => {
    try {
        const { name, parts, kind } = req.body;
        if (!name || typeof name !== 'string') {
            res.status(400).json({ error: 'Missing or invalid field: name' });
            return;
        }
        const partCount = typeof parts === 'number' ? parts : parseInt(parts, 10);
        if (!partCount || isNaN(partCount) || partCount < 1 || partCount > SESSION_MAX_PARTS) {
            res.status(400).json({ error: `parts must be between 1 and ${SESSION_MAX_PARTS}` });
            return;
        }
        const sessionId = (0, uuid_1.v4)();
        const dir = path_1.default.join((0, fileManager_1.getUploadDir)(), `sess-${sessionId}`);
        await promises_1.default.mkdir(dir, { recursive: true });
        sessions.set(sessionId, {
            totalParts: partCount,
            received: new Set(),
            name: sanitizeFilename(name),
            kind: kind || 'audio/mpeg',
            dir,
            createdAt: Date.now(),
        });
        res.status(200).json({ sessionId });
    }
    catch (err) {
        next(err);
    }
});
// ── Receive a chunk ─────────────────────────────────────────────────
exports.processRouter.post('/chunk', async (req, res, next) => {
    try {
        const { sessionId, idx, payload } = req.body;
        const index = typeof idx === 'number' ? idx : parseInt(idx, 10);
        if (!sessionId || typeof sessionId !== 'string') {
            res.status(400).json({ error: 'Missing or invalid sessionId' });
            return;
        }
        if (isNaN(index) || !payload || typeof payload !== 'string') {
            res.status(400).json({ error: 'Missing or invalid idx or payload' });
            return;
        }
        const state = sessions.get(sessionId);
        if (!state) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        // Validate chunk index is within the declared range
        if (index < 0 || index >= state.totalParts) {
            res.status(400).json({ error: `idx must be between 0 and ${state.totalParts - 1}` });
            return;
        }
        const buffer = Buffer.from(payload, 'base64');
        const chunkPath = path_1.default.join(state.dir, `p-${String(index).padStart(5, '0')}`);
        await promises_1.default.writeFile(chunkPath, buffer);
        state.received.add(index);
        res.status(200).json({
            idx: index,
            done: state.received.size,
            total: state.totalParts,
        });
    }
    catch (err) {
        next(err);
    }
});
// ── Finalize (reassemble) ───────────────────────────────────────────
exports.processRouter.post('/finalize', async (req, res, next) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId || typeof sessionId !== 'string') {
            res.status(400).json({ error: 'Missing or invalid sessionId' });
            return;
        }
        const state = sessions.get(sessionId);
        if (!state) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        if (state.received.size !== state.totalParts) {
            res.status(400).json({
                error: `Incomplete: received ${state.received.size} of ${state.totalParts}`,
            });
            return;
        }
        const uploadDir = (0, fileManager_1.getUploadDir)();
        const assembledId = (0, uuid_1.v4)();
        const assembledDir = path_1.default.join(uploadDir, assembledId);
        await promises_1.default.mkdir(assembledDir, { recursive: true });
        const assembledPath = path_1.default.join(assembledDir, 'original.mp3');
        // Assemble chunks into final file with backpressure handling
        const writeStream = (0, fs_1.createWriteStream)(assembledPath);
        // Attach error handler immediately to prevent unhandled stream errors
        let streamError = null;
        writeStream.on('error', (err) => { streamError = err; });
        for (let i = 0; i < state.totalParts; i++) {
            if (streamError)
                break;
            const chunkPath = path_1.default.join(state.dir, `p-${String(i).padStart(5, '0')}`);
            const chunkData = await promises_1.default.readFile(chunkPath);
            if (!writeStream.write(chunkData)) {
                // Wait for the stream to drain before reading the next chunk,
                // otherwise all chunks accumulate in memory (OOM for large files).
                await new Promise((resolve) => writeStream.once('drain', resolve));
            }
        }
        await new Promise((resolve, reject) => {
            if (streamError)
                return reject(streamError);
            writeStream.end(() => resolve());
        });
        // Clean up session temp dir
        await promises_1.default.rm(state.dir, { recursive: true, force: true });
        sessions.delete(sessionId);
        const maxMb = parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10);
        const stat = await promises_1.default.stat(assembledPath);
        if (stat.size > maxMb * 1024 * 1024) {
            await promises_1.default.rm(assembledDir, { recursive: true, force: true });
            res.status(413).json({
                error: `File too large (${(stat.size / 1e6).toFixed(1)} MB). Maximum is ${maxMb} MB.`,
            });
            return;
        }
        const isValid = await (0, audioProcessor_1.validateMp3)(assembledPath);
        if (!isValid) {
            await promises_1.default.rm(assembledDir, { recursive: true, force: true });
            res.status(400).json({ error: 'File does not contain a valid audio stream' });
            return;
        }
        res.status(201).json({
            id: assembledId,
            filename: state.name,
            mimeType: state.kind,
            sizeBytes: stat.size,
            createdAt: new Date().toISOString(),
        });
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=upload.js.map