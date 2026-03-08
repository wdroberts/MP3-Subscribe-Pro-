"use strict";
// speechToText.ts — v4 complete rewrite 2024-02-16
// This version ALWAYS chunks files that exceed the safe inline limit.
// If you see "STT-v4" in the logs, this code is running.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribe = transcribe;
exports.groupWordsIntoSentences = groupWordsIntoSentences;
const speech_1 = __importDefault(require("@google-cloud/speech"));
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const isDevEnv = process.env.NODE_ENV !== 'production';
function debugLog(...args) {
    if (isDevEnv)
        console.log(...args);
}
// ---------------------------------------------------------------------------
// Google Speech client (lazy init)
// ---------------------------------------------------------------------------
let _client = null;
function getSpeechClient() {
    if (_client !== null)
        return _client;
    // Option 1: Inline JSON via GOOGLE_CREDENTIALS_JSON env var
    const inlineJson = process.env.GOOGLE_CREDENTIALS_JSON;
    if (inlineJson) {
        try {
            const parsed = JSON.parse(inlineJson);
            _client = new speech_1.default.SpeechClient({
                credentials: {
                    client_email: parsed.client_email,
                    private_key: parsed.private_key,
                },
                projectId: parsed.project_id,
            });
            debugLog('[STT-v4] Google Speech client initialized from inline GOOGLE_CREDENTIALS_JSON');
            return _client;
        }
        catch (err) {
            console.warn('[STT-v4] Failed to parse GOOGLE_CREDENTIALS_JSON:', err.message);
        }
    }
    // Option 2: File path via GOOGLE_APPLICATION_CREDENTIALS env var
    const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!creds || creds === 'path/to/service-account.json') {
        // Check if .env was loaded at all
        const envPath = path_1.default.resolve(__dirname, '../../../.env');
        const envExists = fs_1.default.existsSync(envPath);
        console.warn(`[STT-v4] GOOGLE_APPLICATION_CREDENTIALS is ${creds ? 'a placeholder value' : 'not set'}.`, envExists
            ? 'The .env file exists but may be missing this variable.'
            : 'No .env file found — copy .env.example to .env and configure it.');
        return null;
    }
    try {
        const projectRoot = path_1.default.resolve(__dirname, '../../..');
        const resolved = path_1.default.resolve(projectRoot, creds);
        fs_1.default.accessSync(resolved);
        process.env.GOOGLE_APPLICATION_CREDENTIALS = resolved;
        _client = new speech_1.default.SpeechClient();
        debugLog('[STT-v4] Google Speech client initialized from credentials file');
    }
    catch {
        console.warn('[STT-v4] Credentials file not found. Ensure the service account JSON file exists in the project root.');
    }
    return _client;
}
function parseSeconds(t) {
    if (!t)
        return 0;
    const s = typeof t.seconds === 'string' ? parseInt(t.seconds, 10) : (t.seconds ?? 0);
    return s + (t.nanos ?? 0) / 1e9;
}
function groupWordsIntoSentences(words) {
    const segments = [];
    let buf = [];
    let idx = 0;
    for (const w of words) {
        buf.push(w);
        if (/[.!?]$/.test(w.word) && buf.length > 0) {
            segments.push({
                index: idx++,
                startTime: buf[0].startTime,
                endTime: buf[buf.length - 1].endTime,
                text: buf.map((x) => x.word).join(' '),
            });
            buf = [];
        }
    }
    if (buf.length > 0) {
        segments.push({
            index: idx,
            startTime: buf[0].startTime,
            endTime: buf[buf.length - 1].endTime,
            text: buf.map((x) => x.word).join(' '),
        });
    }
    return segments;
}
function generateMockSegments(durationSeconds) {
    const sentences = [
        'Welcome to MP3 Transcribe Pro.',
        'This is a demo transcription generated because Google Cloud credentials are not configured.',
        'To enable real transcription, add a valid service account JSON path to GOOGLE_APPLICATION_CREDENTIALS in your .env file.',
        'The audio file was processed successfully and is ready for transcription.',
        'Once credentials are configured, this text will be replaced with the actual speech content.',
        'You can still test the export and summarization features with this demo text.',
        'The timestamp markers shown here are spaced evenly across the audio duration.',
        'Thank you for trying MP3 Transcribe Pro!',
    ];
    const gap = durationSeconds / sentences.length;
    return sentences.map((text, i) => ({
        index: i,
        startTime: +(i * gap).toFixed(3),
        endTime: +((i + 1) * gap).toFixed(3),
        text,
    }));
}
// ---------------------------------------------------------------------------
// Core: send one chunk to Google STT
// ---------------------------------------------------------------------------
// 4 MB raw ≈ 5.3 MB base64 — well under Google's 10 MB request limit
const MAX_RAW_BYTES = 4000000;
// 5-minute timeout per chunk — prevents the process from hanging forever
// when Google API rate-limits or stalls
const CHUNK_TIMEOUT_MS = 5 * 60 * 1000;
function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s: ${label}`)), ms);
        promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });
}
async function recognizeBuffer(client, buf, encoding, sampleRateHertz, durationSec) {
    const b64Size = Math.ceil(buf.length * 4 / 3);
    debugLog(`[STT-v4] recognizeBuffer: ${(buf.length / 1e6).toFixed(2)}MB raw, ${(b64Size / 1e6).toFixed(2)}MB b64, enc=${encoding}, dur=${durationSec.toFixed(0)}s`);
    const audio = { content: buf.toString('base64') };
    const config = {
        encoding: encoding,
        sampleRateHertz,
        languageCode: 'en-US',
        enableWordTimeOffsets: true,
        enableAutomaticPunctuation: true,
    };
    // Always use synchronous recognize() for inline audio.  Google's
    // longRunningRecognize() rejects inline content that exceeds ~60 s with
    // "INVALID_ARGUMENT: Inline audio exceeds duration limit.  Please use a
    // GCS URI."  Since we chunk all audio to ≤55 s, recognize() is sufficient
    // and avoids this class of errors entirely.
    if (durationSec > 59) {
        throw new Error(`Audio chunk is ${durationSec.toFixed(0)}s which exceeds the 59 s safety limit. ` +
            'The caller must split audio into smaller chunks before calling recognizeBuffer.');
    }
    debugLog('[STT-v4] Using recognize (sync)');
    let resp;
    try {
        [resp] = await withTimeout(client.recognize({ audio, config }), CHUNK_TIMEOUT_MS, 'recognize');
    }
    catch (err) {
        const msg = err?.message ?? '';
        if (msg.includes('Inline audio exceeds duration limit')) {
            throw new Error(`Google rejected inline audio (reported ${durationSec.toFixed(0)}s). ` +
                'The actual audio may be longer than expected. Ensure audio is split into ≤55 s chunks.');
        }
        throw err;
    }
    const results = resp.results ?? [];
    const words = [];
    for (const r of results) {
        const alt = r.alternatives?.[0];
        if (!alt?.words)
            continue;
        for (const wi of alt.words) {
            words.push({
                word: wi.word ?? '',
                startTime: parseSeconds(wi.startTime),
                endTime: parseSeconds(wi.endTime),
            });
        }
    }
    debugLog(`[STT-v4] Got ${words.length} words from this chunk`);
    return words;
}
// ---------------------------------------------------------------------------
// Probe actual duration of an audio file via ffprobe (with timeout)
// ---------------------------------------------------------------------------
function probeActualDuration(filePath) {
    return withTimeout(new Promise((resolve, reject) => {
        fluent_ffmpeg_1.default.ffprobe(filePath, (err, metadata) => {
            if (err)
                return reject(err);
            const duration = metadata?.format?.duration ?? 0;
            resolve(duration);
        });
    }), 3000, 'ffprobe duration check');
}
// ---------------------------------------------------------------------------
// Split an audio file into small MP3 chunks with ffmpeg
// ---------------------------------------------------------------------------
async function splitIntoChunks(mp3Path, outputDir, chunkSeconds, totalDuration, onChunkCreated) {
    await promises_1.default.mkdir(outputDir, { recursive: true });
    const numChunks = Math.ceil(totalDuration / chunkSeconds);
    const chunks = [];
    for (let i = 0; i < numChunks; i++) {
        const startSec = i * chunkSeconds;
        const durSec = Math.min(chunkSeconds, totalDuration - startSec);
        const outPath = path_1.default.join(outputDir, `chunk_${i}.mp3`);
        await new Promise((resolve, reject) => {
            (0, fluent_ffmpeg_1.default)(mp3Path)
                .setStartTime(startSec)
                .duration(durSec)
                .audioChannels(1)
                .audioBitrate('64k')
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .save(outPath);
        });
        const stat = await promises_1.default.stat(outPath);
        if (stat.size > 0) {
            // Verify actual chunk duration — ffmpeg seeking on VBR MP3s can
            // produce chunks longer than requested.
            let verifiedDur = durSec;
            try {
                const probedDur = await probeActualDuration(outPath);
                if (probedDur > 0)
                    verifiedDur = probedDur;
            }
            catch {
                // Probe failed, use calculated duration
            }
            // Re-split oversized chunks so every piece stays under the Google
            // inline limit (59 s).  VBR MP3 seeking often overshoots.
            const SAFE_LIMIT = 55;
            if (verifiedDur > SAFE_LIMIT) {
                debugLog(`[STT-v4] Chunk ${i} actual duration ${verifiedDur.toFixed(1)}s exceeds ${SAFE_LIMIT}s — re-splitting`);
                const subChunkSec = 40; // shorter target to guarantee safety
                const numSubs = Math.ceil(verifiedDur / subChunkSec);
                for (let s = 0; s < numSubs; s++) {
                    const subStart = s * subChunkSec;
                    const subDur = Math.min(subChunkSec, verifiedDur - subStart);
                    const subPath = path_1.default.join(outputDir, `chunk_${i}_sub${s}.mp3`);
                    await new Promise((resolve2, reject2) => {
                        (0, fluent_ffmpeg_1.default)(outPath)
                            .setStartTime(subStart)
                            .duration(subDur)
                            .audioChannels(1)
                            .audioBitrate('64k')
                            .on('end', () => resolve2())
                            .on('error', (err2) => reject2(err2))
                            .save(subPath);
                    });
                    const subStat = await promises_1.default.stat(subPath);
                    if (subStat.size > 0) {
                        let subVerified = subDur;
                        try {
                            const p = await probeActualDuration(subPath);
                            if (p > 0)
                                subVerified = p;
                        }
                        catch { /* use calculated */ }
                        chunks.push({ path: subPath, startSec: startSec + subStart, durSec: subVerified });
                    }
                }
                // Remove the oversized original chunk file
                await promises_1.default.unlink(outPath).catch(() => { });
            }
            else {
                chunks.push({ path: outPath, startSec, durSec: verifiedDur });
            }
        }
        onChunkCreated?.(i + 1, numChunks);
    }
    return chunks;
}
async function transcribe(audioFilePath, sampleRateHertz, durationSeconds, originalMp3Path, onProgress) {
    debugLog(`[STT-v4] transcribe() called. dur=${durationSeconds}s`);
    // Google's inline audio limit for longRunningRecognize rejects audio that
    // exceeds a duration threshold (even when the payload fits within 10 MB).
    // Keeping chunks under 60 s lets us always use the synchronous `recognize`
    // method, which has no such restriction for inline content.
    // Use 45 s chunks to leave a safety margin for VBR MP3s where ffmpeg
    // seeking may produce chunks slightly longer than requested.
    const CHUNK_SECONDS = 45;
    const client = getSpeechClient();
    if (!client) {
        console.warn('[STT-v4] No Google credentials — returning mock transcription');
        // Simulate chunk-by-chunk progress so the bar reflects realistic transcription
        if (onProgress) {
            const estimatedChunks = Math.max(1, Math.ceil(durationSeconds / CHUNK_SECONDS));
            const delayPerChunk = Math.max(400, Math.min(1500, Math.round(6000 / estimatedChunks)));
            onProgress({ percent: 5, currentStep: 'Splitting audio into chunks...', chunksTotal: estimatedChunks, chunksCompleted: 0 });
            await new Promise((resolve) => setTimeout(resolve, delayPerChunk));
            for (let i = 1; i <= estimatedChunks; i++) {
                const percent = 10 + Math.round((i / estimatedChunks) * 85);
                onProgress({
                    percent,
                    currentStep: 'Transcribing audio...',
                    chunksTotal: estimatedChunks,
                    chunksCompleted: i,
                });
                if (i < estimatedChunks) {
                    await new Promise((resolve) => setTimeout(resolve, delayPerChunk));
                }
            }
        }
        return generateMockSegments(durationSeconds);
    }
    try {
        // Pick the smallest file to work with
        const mp3Path = originalMp3Path ?? audioFilePath;
        const mp3Size = (await promises_1.default.stat(mp3Path)).size;
        const wavSize = await promises_1.default.stat(audioFilePath).then((s) => s.size).catch(() => 0);
        debugLog(`[STT-v4] MP3=${(mp3Size / 1e6).toFixed(2)}MB, WAV=${(wavSize / 1e6).toFixed(2)}MB, limit=${(MAX_RAW_BYTES / 1e6).toFixed(1)}MB`);
        // If duration is unknown or suspiciously low for the file size, force chunking.
        // A 128 kbps MP3 at 55 s ≈ 880 KB. If the file is much bigger than what
        // the reported duration would imply, the duration is probably wrong.
        const durationTrustworthy = durationSeconds > 0 &&
            (mp3Size < 200000 || mp3Size / durationSeconds < 50000); // ~400 kbps max
        // --- Path A: MP3 fits inline (size AND duration must be safe) ---
        if (durationTrustworthy && mp3Size <= MAX_RAW_BYTES && durationSeconds <= CHUNK_SECONDS) {
            // Verify actual duration with ffprobe before sending inline — the
            // reported duration can be wrong for VBR or malformed MP3s.
            let actualDuration = durationSeconds;
            try {
                actualDuration = await probeActualDuration(mp3Path);
                debugLog(`[STT-v4] Path A probe: reported=${durationSeconds.toFixed(1)}s, actual=${actualDuration.toFixed(1)}s`);
            }
            catch {
                debugLog('[STT-v4] Path A probe failed — using reported duration');
            }
            if (actualDuration > 0 && actualDuration <= CHUNK_SECONDS) {
                debugLog('[STT-v4] >>> Path A: MP3 inline');
                onProgress?.({ percent: 20, currentStep: 'Transcribing audio...', chunksTotal: 1, chunksCompleted: 0 });
                const buf = await promises_1.default.readFile(mp3Path);
                const words = await recognizeBuffer(client, buf, 'MP3', sampleRateHertz, actualDuration);
                onProgress?.({ percent: 95, currentStep: 'Finalizing...', chunksTotal: 1, chunksCompleted: 1 });
                return groupWordsIntoSentences(words);
            }
            debugLog(`[STT-v4] Path A rejected — actual duration ${actualDuration.toFixed(1)}s exceeds ${CHUNK_SECONDS}s, falling through to chunking`);
            // Update durationSeconds so chunking uses the correct value
            if (actualDuration > 0)
                durationSeconds = actualDuration;
        }
        // --- Path B: WAV fits inline (size AND duration must be safe) ---
        if (durationTrustworthy && wavSize > 0 && wavSize <= MAX_RAW_BYTES && durationSeconds <= CHUNK_SECONDS) {
            let actualDuration = durationSeconds;
            try {
                actualDuration = await probeActualDuration(audioFilePath);
                debugLog(`[STT-v4] Path B probe: reported=${durationSeconds.toFixed(1)}s, actual=${actualDuration.toFixed(1)}s`);
            }
            catch {
                debugLog('[STT-v4] Path B probe failed — using reported duration');
            }
            if (actualDuration > 0 && actualDuration <= CHUNK_SECONDS) {
                debugLog('[STT-v4] >>> Path B: WAV inline');
                onProgress?.({ percent: 20, currentStep: 'Transcribing audio...', chunksTotal: 1, chunksCompleted: 0 });
                const buf = await promises_1.default.readFile(audioFilePath);
                const words = await recognizeBuffer(client, buf, 'LINEAR16', sampleRateHertz, actualDuration);
                onProgress?.({ percent: 95, currentStep: 'Finalizing...', chunksTotal: 1, chunksCompleted: 1 });
                return groupWordsIntoSentences(words);
            }
            debugLog(`[STT-v4] Path B rejected — actual duration ${actualDuration.toFixed(1)}s exceeds ${CHUNK_SECONDS}s, falling through to chunking`);
            if (actualDuration > 0)
                durationSeconds = actualDuration;
        }
        // --- Path C: chunk the MP3 into ≤55-second pieces ---
        // If duration is still unknown, estimate from file size assuming 128 kbps
        let effectiveDuration = durationSeconds;
        if (effectiveDuration <= 0) {
            effectiveDuration = (mp3Size * 8) / 128000;
            debugLog(`[STT-v4] Duration unknown — estimating ${effectiveDuration.toFixed(0)}s from file size`);
        }
        debugLog(`[STT-v4] >>> Path C: chunking MP3 into ≤${CHUNK_SECONDS}s pieces (duration=${effectiveDuration.toFixed(0)}s)`);
        const estimatedChunks = Math.ceil(effectiveDuration / CHUNK_SECONDS);
        onProgress?.({ percent: 2, currentStep: 'Splitting audio into chunks...', chunksTotal: estimatedChunks, chunksCompleted: 0 });
        const chunkDir = path_1.default.join(path_1.default.dirname(mp3Path), 'stt_chunks');
        const chunks = await splitIntoChunks(mp3Path, chunkDir, CHUNK_SECONDS, effectiveDuration, (created, total) => {
            const splitPercent = 2 + Math.round((created / total) * 8); // 2-10%
            onProgress?.({
                percent: splitPercent,
                currentStep: `Splitting audio: chunk ${created} / ${total}`,
                chunksTotal: total,
                chunksCompleted: 0,
            });
        });
        debugLog(`[STT-v4] Created ${chunks.length} chunks`);
        // Process chunks through a concurrent pool — always keep MAX_CONCURRENT
        // in flight so there are no idle slots between completions.
        const MAX_CONCURRENT = 5;
        let completedChunks = 0;
        let failedChunks = 0;
        const chunkResults = new Array(chunks.length).fill(null);
        // Helper: report progress immediately when any chunk settles
        const reportChunkProgress = () => {
            const processed = completedChunks + failedChunks;
            const chunkPercent = 10 + Math.round((processed / chunks.length) * 85);
            debugLog(`[STT-v4] Progress: ${chunkPercent}% — ${completedChunks} done, ${failedChunks} failed, ${chunks.length - processed} remaining`);
            onProgress?.({
                percent: chunkPercent,
                currentStep: failedChunks > 0
                    ? `Transcribing audio... (${failedChunks} chunk${failedChunks > 1 ? 's' : ''} failed)`
                    : 'Transcribing audio...',
                chunksTotal: chunks.length,
                chunksCompleted: completedChunks,
            });
        };
        // Convert an MP3 chunk to WAV (LINEAR16 mono 16 kHz) so we get a
        // deterministic duration.  VBR MP3 durations are unreliable — ffprobe
        // and Google often disagree, causing INVALID_ARGUMENT errors.
        const chunkToWav = (mp3ChunkPath) => {
            const wavPath = mp3ChunkPath.replace(/\.mp3$/, '.wav');
            return new Promise((resolve, reject) => {
                (0, fluent_ffmpeg_1.default)(mp3ChunkPath)
                    .audioChannels(1)
                    .audioFrequency(16000)
                    .audioCodec('pcm_s16le')
                    .format('wav')
                    .on('end', async () => {
                    try {
                        const wavStat = await promises_1.default.stat(wavPath);
                        // WAV LINEAR16 mono 16 kHz = 32 000 bytes/sec + 44-byte header
                        const durationSec = Math.max(0, wavStat.size - 44) / (16000 * 2);
                        resolve({ wavPath, durationSec });
                    }
                    catch (e) {
                        reject(e);
                    }
                })
                    .on('error', reject)
                    .save(wavPath);
            });
        };
        // Process a single chunk
        const processChunk = async (chunkIdx) => {
            const chunk = chunks[chunkIdx];
            try {
                // Convert MP3 chunk → WAV for reliable duration and encoding
                const { wavPath, durationSec } = await chunkToWav(chunk.path);
                const buf = await promises_1.default.readFile(wavPath);
                if (buf.length > MAX_RAW_BYTES) {
                    console.warn(`[STT-v4] Chunk ${chunkIdx} WAV too large (${(buf.length / 1e6).toFixed(2)}MB), skipping`);
                    failedChunks++;
                    reportChunkProgress();
                    return;
                }
                if (durationSec > 59) {
                    console.warn(`[STT-v4] Chunk ${chunkIdx} WAV duration ${durationSec.toFixed(1)}s exceeds 59s limit, skipping`);
                    failedChunks++;
                    reportChunkProgress();
                    return;
                }
                debugLog(`[STT-v4] Chunk ${chunkIdx}: MP3 probed ${chunk.durSec.toFixed(1)}s → WAV exact ${durationSec.toFixed(1)}s`);
                const words = await recognizeBuffer(client, buf, 'LINEAR16', 16000, durationSec);
                // Offset timestamps
                for (const w of words) {
                    w.startTime += chunk.startSec;
                    w.endTime += chunk.startSec;
                }
                chunkResults[chunkIdx] = words;
                completedChunks++;
                reportChunkProgress();
                // Clean up WAV file
                await promises_1.default.unlink(wavPath).catch(() => { });
            }
            catch (err) {
                failedChunks++;
                console.error(`[STT-v4] Chunk ${chunkIdx} failed:`, err?.message ?? err);
                reportChunkProgress();
            }
        };
        // Concurrent pool: always keep up to MAX_CONCURRENT chunks in flight.
        // As soon as one finishes, the next starts immediately — no idle slots.
        await new Promise((resolve) => {
            let nextIdx = 0;
            let running = 0;
            function launch() {
                while (running < MAX_CONCURRENT && nextIdx < chunks.length) {
                    const idx = nextIdx++;
                    running++;
                    processChunk(idx).finally(() => {
                        running--;
                        if (nextIdx < chunks.length) {
                            launch();
                        }
                        else if (running === 0) {
                            resolve();
                        }
                    });
                }
                // Edge case: no chunks at all
                if (chunks.length === 0)
                    resolve();
            }
            launch();
        });
        if (failedChunks > 0) {
            console.warn(`[STT-v4] ${failedChunks} of ${chunks.length} chunks failed — partial transcription`);
        }
        // Reassemble words in order
        const allWords = [];
        for (const words of chunkResults) {
            if (words)
                allWords.push(...words);
        }
        onProgress?.({
            percent: 95,
            currentStep: 'Finalizing...',
            chunksTotal: chunks.length,
            chunksCompleted: completedChunks,
        });
        // Cleanup
        await promises_1.default.rm(chunkDir, { recursive: true, force: true }).catch(() => { });
        debugLog(`[STT-v4] Total words from all chunks: ${allWords.length} (${failedChunks} chunks failed)`);
        return groupWordsIntoSentences(allWords);
    }
    catch (err) {
        console.error('[STT-v4] Transcription failed:', err.message);
        throw new Error(`Transcription failed: ${err.message}`);
    }
}
//# sourceMappingURL=speechToText.js.map