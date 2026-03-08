"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeRouter = void 0;
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const fileManager_1 = require("../services/fileManager");
const audioProcessor_1 = require("../services/audioProcessor");
const speechToText_1 = require("../services/speechToText");
const jobStore_1 = require("../services/jobStore");
const rateLimiter_1 = require("../middleware/rateLimiter");
exports.transcribeRouter = (0, express_1.Router)();
// ── Diagnostic endpoint — probe an uploaded file ─────────────────────
exports.transcribeRouter.post('/diagnose', async (req, res, next) => {
    try {
        const { uploadId } = req.body;
        if (!uploadId || typeof uploadId !== 'string' || !(0, fileManager_1.isValidUploadId)(uploadId)) {
            res.status(400).json({ error: 'Valid uploadId is required' });
            return;
        }
        const exists = await (0, fileManager_1.uploadExists)(uploadId);
        if (!exists) {
            res.status(404).json({ error: 'Upload not found' });
            return;
        }
        const uploadDir = path_1.default.join((0, fileManager_1.getUploadDir)(), uploadId);
        const inputPath = path_1.default.join(uploadDir, 'original.mp3');
        const stat = await promises_1.default.stat(inputPath);
        // Run ffprobe for full metadata
        const probeData = await new Promise((resolve, reject) => {
            fluent_ffmpeg_1.default.ffprobe(inputPath, (err, metadata) => {
                if (err)
                    return reject(err);
                resolve(metadata);
            });
        });
        // Also run our probeAudioMeta helper
        const ourMeta = await (0, audioProcessor_1.probeAudioMeta)(inputPath);
        const fmt = probeData.format;
        const streams = probeData.streams;
        res.json({
            file: {
                path: inputPath,
                sizeBytes: stat.size,
                sizeMB: +(stat.size / 1e6).toFixed(2),
            },
            ffprobe: {
                duration: fmt?.duration ?? null,
                bitRate: fmt?.bit_rate ?? null,
                formatName: fmt?.format_name ?? null,
                formatLongName: fmt?.format_long_name ?? null,
                nbStreams: fmt?.nb_streams ?? null,
                tags: fmt?.tags ?? null,
            },
            streams: (streams ?? []).map((s) => ({
                codecType: s.codec_type,
                codecName: s.codec_name,
                sampleRate: s.sample_rate,
                channels: s.channels,
                bitRate: s.bit_rate,
                duration: s.duration,
                durationTs: s.duration_ts,
            })),
            ourProbe: ourMeta,
            analysis: {
                wouldChunk: stat.size > 4000000 || ourMeta.durationSeconds > 45,
                estimatedChunks: Math.ceil(Math.max(ourMeta.durationSeconds, 1) / 45),
                estimatedWavSizePerChunkMB: +((45 * 16000 * 2 + 44) / 1e6).toFixed(2),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
exports.transcribeRouter.post('/', (0, rateLimiter_1.createStrictRateLimiter)(), async (req, res, next) => {
    try {
        const { uploadId } = req.body;
        if (!uploadId || typeof uploadId !== 'string') {
            res.status(400).json({ error: 'uploadId is required' });
            return;
        }
        if (!(0, fileManager_1.isValidUploadId)(uploadId)) {
            res.status(400).json({ error: 'Invalid uploadId format' });
            return;
        }
        const exists = await (0, fileManager_1.uploadExists)(uploadId);
        if (!exists) {
            res.status(404).json({ error: 'Upload not found' });
            return;
        }
        const job = (0, jobStore_1.createTranscriptionJob)(uploadId);
        // Kick off async processing
        processTranscription(job.id, uploadId).catch((err) => {
            console.error('Transcription processing error:', err);
            (0, jobStore_1.updateTranscriptionJob)(job.id, {
                status: 'failed',
                error: err instanceof Error ? err.message : 'Unknown error',
            });
        });
        res.status(202).json({ id: job.id, status: job.status });
    }
    catch (err) {
        next(err);
    }
});
// Shared status handler — used by both GET and POST
async function handleStatusRequest(req, res, next) {
    try {
        const job = (0, jobStore_1.getTranscriptionJob)(req.params.id);
        const method = req.method;
        console.log(`[STATUS] ${method} /${req.params.id}/status → ${job ? job.status : '404'} (progress: ${job?.progress?.percent ?? '-'}%)`);
        if (!job) {
            res.status(404).json({ error: 'Transcription job not found' });
            return;
        }
        if (job.status === 'completed') {
            res.json(job);
        }
        else {
            res.json({ id: job.id, status: job.status, error: job.error, progress: job.progress });
        }
    }
    catch (err) {
        next(err);
    }
}
// GET for backward compat (old client code), POST for new code (proxy-safe)
exports.transcribeRouter.get('/:id/status', handleStatusRequest);
exports.transcribeRouter.post('/:id/status', handleStatusRequest);
// 4 MB threshold — files larger than this go to Path C (MP3 chunking)
// and don't need WAV conversion at all
const LARGE_FILE_THRESHOLD = 4000000;
async function processTranscription(jobId, uploadId) {
    (0, jobStore_1.updateTranscriptionJob)(jobId, {
        status: 'processing',
        progress: { percent: 0, currentStep: 'Analyzing audio...' },
    });
    const uploadDir = path_1.default.join((0, fileManager_1.getUploadDir)(), uploadId);
    const inputPath = path_1.default.join(uploadDir, 'original.mp3');
    // Progress callback — updates the job store so the polling endpoint returns live progress
    const onProgress = (report) => {
        (0, jobStore_1.updateTranscriptionJob)(jobId, { progress: report });
    };
    const CHUNK_SECONDS = 45;
    const mp3Size = (await promises_1.default.stat(inputPath)).size;
    // Always probe the MP3 for duration first — needed for both paths
    const probedMeta = await (0, audioProcessor_1.probeAudioMeta)(inputPath);
    let durationSeconds = probedMeta.durationSeconds;
    // If duration is unknown, estimate from file size (128 kbps assumption)
    if (durationSeconds <= 0) {
        durationSeconds = (mp3Size * 8) / 128000;
        console.warn(`[transcribe] Duration unknown from probe — estimating ${durationSeconds.toFixed(0)}s from file size`);
    }
    let segments;
    if (mp3Size > LARGE_FILE_THRESHOLD || durationSeconds > CHUNK_SECONDS) {
        // Large or long file — skip WAV conversion, send MP3 chunks directly
        const estimatedChunks = Math.ceil(durationSeconds / CHUNK_SECONDS);
        (0, jobStore_1.updateTranscriptionJob)(jobId, {
            progress: { percent: 5, currentStep: 'Starting transcription...', chunksTotal: estimatedChunks, chunksCompleted: 0 },
        });
        segments = await (0, speechToText_1.transcribe)(inputPath, probedMeta.sampleRateHertz, durationSeconds, inputPath, onProgress);
    }
    else {
        // Small + short file — convert to WAV (might fit inline as Path A or B)
        (0, jobStore_1.updateTranscriptionJob)(jobId, {
            progress: { percent: 0, currentStep: 'Converting audio...' },
        });
        const audioMeta = await (0, audioProcessor_1.convertToLinear16)(inputPath, uploadDir);
        // Prefer the WAV-probed duration if it's valid; otherwise keep the MP3 probe
        const wavDuration = audioMeta.durationSeconds > 0 ? audioMeta.durationSeconds : durationSeconds;
        (0, jobStore_1.updateTranscriptionJob)(jobId, {
            progress: { percent: 10, currentStep: 'Starting transcription...', chunksTotal: 1, chunksCompleted: 0 },
        });
        const convertedPath = (0, audioProcessor_1.getConvertedPath)(uploadDir);
        segments = await (0, speechToText_1.transcribe)(convertedPath, audioMeta.sampleRateHertz, wavDuration, inputPath, onProgress);
    }
    const fullText = segments.map((s) => s.text).join(' ');
    (0, jobStore_1.updateTranscriptionJob)(jobId, {
        status: 'completed',
        progress: { percent: 100, currentStep: 'Complete' },
        segments,
        fullText,
    });
}
//# sourceMappingURL=transcribe.js.map