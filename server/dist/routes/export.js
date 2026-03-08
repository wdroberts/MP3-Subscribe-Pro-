"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportRouter = void 0;
const express_1 = require("express");
const jobStore_1 = require("../services/jobStore");
const formatters_1 = require("../utils/formatters");
const rateLimiter_1 = require("../middleware/rateLimiter");
const fileManager_1 = require("../services/fileManager");
const VALID_FORMATS = new Set(['txt', 'srt', 'json']);
exports.exportRouter = (0, express_1.Router)();
exports.exportRouter.get('/:id/:format', (0, rateLimiter_1.createRateLimiter)(), async (req, res, next) => {
    try {
        const { id, format } = req.params;
        if (!(0, fileManager_1.isValidUploadId)(id)) {
            res.status(400).json({ error: 'Invalid id format' });
            return;
        }
        if (!VALID_FORMATS.has(format)) {
            res.status(400).json({ error: 'Invalid format. Use txt, srt, or json.' });
            return;
        }
        const transcription = (0, jobStore_1.getTranscriptionJob)(id);
        if (!transcription) {
            res.status(404).json({ error: 'Transcription not found' });
            return;
        }
        if (transcription.status !== 'completed') {
            res.status(400).json({ error: 'Transcription is not yet completed' });
            return;
        }
        switch (format) {
            case 'txt': {
                const text = (0, formatters_1.toTimestampedText)(transcription.segments);
                res.setHeader('Content-Type', 'text/plain');
                res.setHeader('Content-Disposition', 'attachment; filename="transcription.txt"');
                res.send(text);
                break;
            }
            case 'srt': {
                const srt = (0, formatters_1.toSrt)(transcription.segments);
                res.setHeader('Content-Type', 'application/x-subrip');
                res.setHeader('Content-Disposition', 'attachment; filename="transcription.srt"');
                res.send(srt);
                break;
            }
            case 'json': {
                res.setHeader('Content-Disposition', 'attachment; filename="transcription.json"');
                res.json(transcription);
                break;
            }
            default:
                res.status(400).json({ error: 'Invalid format. Use txt, srt, or json.' });
        }
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=export.js.map