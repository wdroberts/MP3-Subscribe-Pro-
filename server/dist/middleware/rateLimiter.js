"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRateLimiter = createRateLimiter;
exports.createUploadRateLimiter = createUploadRateLimiter;
exports.createStrictRateLimiter = createStrictRateLimiter;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
function createRateLimiter() {
    return (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later' },
        skip: (req) => req.path.startsWith('/api/process') || req.path.startsWith('/api/transcribe'),
        handler: (req, res) => {
            console.warn(`[RATE-LIMIT] Blocked: ${req.method} ${req.path}`);
            res.status(429).json({ error: 'Too many requests, please try again later' });
        },
    });
}
function createUploadRateLimiter() {
    return (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5000, // ~300 MB worth of 64KB chunks
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Upload rate limit exceeded, please try again later' },
    });
}
function createStrictRateLimiter() {
    return (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later' },
    });
}
//# sourceMappingURL=rateLimiter.js.map