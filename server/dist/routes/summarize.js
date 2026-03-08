"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeRouter = void 0;
const express_1 = require("express");
const jobStore_1 = require("../services/jobStore");
const summarizer_1 = require("../services/summarizer");
const rateLimiter_1 = require("../middleware/rateLimiter");
const fileManager_1 = require("../services/fileManager");
exports.summarizeRouter = (0, express_1.Router)();
exports.summarizeRouter.post('/', (0, rateLimiter_1.createStrictRateLimiter)(), async (req, res, next) => {
    try {
        const { transcriptionId } = req.body;
        if (!transcriptionId || typeof transcriptionId !== 'string') {
            res.status(400).json({ error: 'transcriptionId is required' });
            return;
        }
        if (!(0, fileManager_1.isValidUploadId)(transcriptionId)) {
            res.status(400).json({ error: 'Invalid transcriptionId format' });
            return;
        }
        const transcription = (0, jobStore_1.getTranscriptionJob)(transcriptionId);
        if (!transcription) {
            res.status(404).json({ error: 'Transcription not found' });
            return;
        }
        if (transcription.status !== 'completed') {
            res.status(400).json({ error: 'Transcription is not yet completed' });
            return;
        }
        const summary = await (0, summarizer_1.summarize)(transcription.fullText);
        res.json({
            id: transcriptionId,
            transcriptionId,
            summary,
            createdAt: new Date().toISOString(),
        });
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=summarize.js.map