"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTranscriptionJob = createTranscriptionJob;
exports.updateTranscriptionJob = updateTranscriptionJob;
exports.getTranscriptionJob = getTranscriptionJob;
exports.createSummarizationJob = createSummarizationJob;
exports.updateSummarizationJob = updateSummarizationJob;
exports.getSummarizationJob = getSummarizationJob;
exports.clearAllJobs = clearAllJobs;
const uuid_1 = require("uuid");
const MAX_JOBS = 500;
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const transcriptionJobs = new Map();
const summarizationJobs = new Map();
function evictOldJobs() {
    const now = Date.now();
    for (const [id, job] of transcriptionJobs) {
        if (now - new Date(job.createdAt).getTime() > MAX_AGE_MS) {
            transcriptionJobs.delete(id);
        }
    }
    for (const [id, job] of summarizationJobs) {
        if (now - new Date(job.createdAt).getTime() > MAX_AGE_MS) {
            summarizationJobs.delete(id);
        }
    }
}
// Run eviction every 10 minutes
setInterval(evictOldJobs, 10 * 60 * 1000).unref();
function createTranscriptionJob(uploadId) {
    if (transcriptionJobs.size >= MAX_JOBS) {
        evictOldJobs();
    }
    if (transcriptionJobs.size >= MAX_JOBS) {
        // Still full after eviction — remove the oldest entry
        const oldestKey = transcriptionJobs.keys().next().value;
        if (oldestKey)
            transcriptionJobs.delete(oldestKey);
    }
    const job = {
        id: (0, uuid_1.v4)(),
        uploadId,
        segments: [],
        fullText: '',
        status: 'pending',
        progress: { percent: 0, currentStep: 'Preparing transcription...' },
        createdAt: new Date().toISOString(),
    };
    transcriptionJobs.set(job.id, job);
    return job;
}
function updateTranscriptionJob(id, update) {
    const job = transcriptionJobs.get(id);
    if (job) {
        Object.assign(job, update);
    }
}
function getTranscriptionJob(id) {
    return transcriptionJobs.get(id);
}
function createSummarizationJob(transcriptionId) {
    if (summarizationJobs.size >= MAX_JOBS) {
        evictOldJobs();
    }
    if (summarizationJobs.size >= MAX_JOBS) {
        const oldestKey = summarizationJobs.keys().next().value;
        if (oldestKey)
            summarizationJobs.delete(oldestKey);
    }
    const job = {
        id: (0, uuid_1.v4)(),
        transcriptionId,
        summary: '',
        createdAt: new Date().toISOString(),
    };
    summarizationJobs.set(job.id, job);
    return job;
}
function updateSummarizationJob(id, update) {
    const job = summarizationJobs.get(id);
    if (job) {
        Object.assign(job, update);
    }
}
function getSummarizationJob(id) {
    return summarizationJobs.get(id);
}
// For testing
function clearAllJobs() {
    transcriptionJobs.clear();
    summarizationJobs.clear();
}
//# sourceMappingURL=jobStore.js.map