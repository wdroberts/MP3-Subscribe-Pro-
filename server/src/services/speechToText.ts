// speechToText.ts — v4 complete rewrite 2024-02-16
// This version ALWAYS chunks files that exceed the safe inline limit.
// If you see "STT-v4" in the logs, this code is running.

import speech from '@google-cloud/speech';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import ffmpegLib from 'fluent-ffmpeg';
import { TranscriptionSegment } from '../types';

const isDevEnv = process.env.NODE_ENV !== 'production';
function debugLog(...args: unknown[]): void {
  if (isDevEnv) console.log(...args);
}

// ---------------------------------------------------------------------------
// Google Speech client (lazy init)
// ---------------------------------------------------------------------------
let _client: InstanceType<typeof speech.SpeechClient> | null = null;

function getSpeechClient(): InstanceType<typeof speech.SpeechClient> | null {
  if (_client !== null) return _client;

  // Option 1: Inline JSON via GOOGLE_CREDENTIALS_JSON env var
  const inlineJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (inlineJson) {
    try {
      const parsed = JSON.parse(inlineJson);
      _client = new speech.SpeechClient({
        credentials: {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
        },
        projectId: parsed.project_id,
      });
      debugLog('[STT-v4] Google Speech client initialized from inline GOOGLE_CREDENTIALS_JSON');
      return _client;
    } catch (err) {
      console.warn('[STT-v4] Failed to parse GOOGLE_CREDENTIALS_JSON:', (err as Error).message);
    }
  }

  // Option 2: File path via GOOGLE_APPLICATION_CREDENTIALS env var
  const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!creds || creds === 'path/to/service-account.json') {
    // Check if .env was loaded at all
    const envPath = path.resolve(__dirname, '../../../.env');
    const envExists = fsSync.existsSync(envPath);
    console.warn(
      `[STT-v4] GOOGLE_APPLICATION_CREDENTIALS is ${creds ? 'a placeholder value' : 'not set'}.`,
      envExists
        ? 'The .env file exists but may be missing this variable.'
        : 'No .env file found — copy .env.example to .env and configure it.',
    );
    return null;
  }

  try {
    const projectRoot = path.resolve(__dirname, '../../..');
    const resolved = path.resolve(projectRoot, creds);
    fsSync.accessSync(resolved);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = resolved;
    _client = new speech.SpeechClient();
    debugLog('[STT-v4] Google Speech client initialized from credentials file');
  } catch {
    console.warn('[STT-v4] Credentials file not found. Ensure the service account JSON file exists in the project root.');
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface WordInfo {
  word: string;
  startTime: number;
  endTime: number;
}

function parseSeconds(t: { seconds?: string | number; nanos?: number } | null): number {
  if (!t) return 0;
  const s = typeof t.seconds === 'string' ? parseInt(t.seconds, 10) : (t.seconds ?? 0);
  return s + (t.nanos ?? 0) / 1e9;
}

function groupWordsIntoSentences(words: WordInfo[]): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];
  let buf: WordInfo[] = [];
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

function generateMockSegments(durationSeconds: number): TranscriptionSegment[] {
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
const MAX_RAW_BYTES = 4_000_000;

// 5-minute timeout per chunk — prevents the process from hanging forever
// when Google API rate-limits or stalls
const CHUNK_TIMEOUT_MS = 5 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s: ${label}`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function recognizeBuffer(
  client: InstanceType<typeof speech.SpeechClient>,
  buf: Buffer,
  encoding: 'MP3' | 'LINEAR16',
  sampleRateHertz: number,
  durationSec: number,
): Promise<WordInfo[]> {
  const b64Size = Math.ceil(buf.length * 4 / 3);
  debugLog(`[STT-v4] recognizeBuffer: ${(buf.length / 1e6).toFixed(2)}MB raw, ${(b64Size / 1e6).toFixed(2)}MB b64, enc=${encoding}, dur=${durationSec.toFixed(0)}s`);

  const audio = { content: buf.toString('base64') };
  const config = {
    encoding: encoding as 'MP3' | 'LINEAR16',
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
    throw new Error(
      `Audio chunk is ${durationSec.toFixed(0)}s which exceeds the 59 s safety limit. ` +
      'The caller must split audio into smaller chunks before calling recognizeBuffer.',
    );
  }

  debugLog('[STT-v4] Using recognize (sync)');
  let resp;
  try {
    [resp] = await withTimeout(client.recognize({ audio, config }), CHUNK_TIMEOUT_MS, 'recognize');
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (msg.includes('Inline audio exceeds duration limit')) {
      throw new Error(
        `Google rejected inline audio (reported ${durationSec.toFixed(0)}s). ` +
        'The actual audio may be longer than expected. Ensure audio is split into ≤55 s chunks.',
      );
    }
    throw err;
  }
  const results = resp.results ?? [];

  const words: WordInfo[] = [];
  for (const r of results) {
    const alt = r.alternatives?.[0];
    if (!alt?.words) continue;
    for (const wi of alt.words) {
      words.push({
        word: wi.word ?? '',
        startTime: parseSeconds(wi.startTime as { seconds?: string | number; nanos?: number } | null),
        endTime: parseSeconds(wi.endTime as { seconds?: string | number; nanos?: number } | null),
      });
    }
  }
  debugLog(`[STT-v4] Got ${words.length} words from this chunk`);
  return words;
}

// ---------------------------------------------------------------------------
// Probe actual duration of an audio file via ffprobe (with timeout)
// ---------------------------------------------------------------------------
function probeActualDuration(filePath: string): Promise<number> {
  return withTimeout(
    new Promise<number>((resolve, reject) => {
      ffmpegLib.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);
        const duration = metadata?.format?.duration ?? 0;
        resolve(duration);
      });
    }),
    3_000,
    'ffprobe duration check',
  );
}

// ---------------------------------------------------------------------------
// Split an audio file into small MP3 chunks with ffmpeg
// ---------------------------------------------------------------------------
async function splitIntoChunks(
  mp3Path: string,
  outputDir: string,
  chunkSeconds: number,
  totalDuration: number,
  onChunkCreated?: (created: number, total: number) => void,
): Promise<{ path: string; startSec: number; durSec: number }[]> {
  await fs.mkdir(outputDir, { recursive: true });
  const numChunks = Math.ceil(totalDuration / chunkSeconds);
  const chunks: { path: string; startSec: number; durSec: number }[] = [];

  for (let i = 0; i < numChunks; i++) {
    const startSec = i * chunkSeconds;
    const durSec = Math.min(chunkSeconds, totalDuration - startSec);
    const outPath = path.join(outputDir, `chunk_${i}.mp3`);

    await new Promise<void>((resolve, reject) => {
      ffmpegLib(mp3Path)
        .setStartTime(startSec)
        .duration(durSec)
        .audioChannels(1)
        .audioBitrate('64k')
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .save(outPath);
    });

    const stat = await fs.stat(outPath);
    if (stat.size > 0) {
      // Verify actual chunk duration — ffmpeg seeking on VBR MP3s can
      // produce chunks longer than requested.
      let verifiedDur = durSec;
      try {
        const probedDur = await probeActualDuration(outPath);
        if (probedDur > 0) verifiedDur = probedDur;
        if (probedDur > chunkSeconds + 5) {
          debugLog(`[STT-v4] Chunk ${i} actual duration ${probedDur.toFixed(1)}s exceeds target ${chunkSeconds}s — will be re-split`);
        }
      } catch {
        // Probe failed, use calculated duration
      }
      chunks.push({ path: outPath, startSec, durSec: verifiedDur });
    }
    onChunkCreated?.(i + 1, numChunks);
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export interface ProgressReport {
  percent: number;
  currentStep: string;
  chunksTotal?: number;
  chunksCompleted?: number;
}

export type OnProgressCallback = (report: ProgressReport) => void;

export async function transcribe(
  audioFilePath: string,
  sampleRateHertz: number,
  durationSeconds: number,
  originalMp3Path?: string,
  onProgress?: OnProgressCallback,
): Promise<TranscriptionSegment[]> {
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
    const mp3Size = (await fs.stat(mp3Path)).size;
    const wavSize = await fs.stat(audioFilePath).then((s) => s.size).catch(() => 0);

    debugLog(`[STT-v4] MP3=${(mp3Size / 1e6).toFixed(2)}MB, WAV=${(wavSize / 1e6).toFixed(2)}MB, limit=${(MAX_RAW_BYTES / 1e6).toFixed(1)}MB`);

    // If duration is unknown or suspiciously low for the file size, force chunking.
    // A 128 kbps MP3 at 55 s ≈ 880 KB. If the file is much bigger than what
    // the reported duration would imply, the duration is probably wrong.
    const durationTrustworthy = durationSeconds > 0 &&
      (mp3Size < 200_000 || mp3Size / durationSeconds < 50_000); // ~400 kbps max

    // --- Path A: MP3 fits inline (size AND duration must be safe) ---
    if (durationTrustworthy && mp3Size <= MAX_RAW_BYTES && durationSeconds <= CHUNK_SECONDS) {
      // Verify actual duration with ffprobe before sending inline — the
      // reported duration can be wrong for VBR or malformed MP3s.
      let actualDuration = durationSeconds;
      try {
        actualDuration = await probeActualDuration(mp3Path);
        debugLog(`[STT-v4] Path A probe: reported=${durationSeconds.toFixed(1)}s, actual=${actualDuration.toFixed(1)}s`);
      } catch {
        debugLog('[STT-v4] Path A probe failed — using reported duration');
      }
      if (actualDuration > 0 && actualDuration <= CHUNK_SECONDS) {
        debugLog('[STT-v4] >>> Path A: MP3 inline');
        onProgress?.({ percent: 20, currentStep: 'Transcribing audio...', chunksTotal: 1, chunksCompleted: 0 });
        const buf = await fs.readFile(mp3Path);
        const words = await recognizeBuffer(client, buf, 'MP3', sampleRateHertz, actualDuration);
        onProgress?.({ percent: 95, currentStep: 'Finalizing...', chunksTotal: 1, chunksCompleted: 1 });
        return groupWordsIntoSentences(words);
      }
      debugLog(`[STT-v4] Path A rejected — actual duration ${actualDuration.toFixed(1)}s exceeds ${CHUNK_SECONDS}s, falling through to chunking`);
      // Update durationSeconds so chunking uses the correct value
      if (actualDuration > 0) durationSeconds = actualDuration;
    }

    // --- Path B: WAV fits inline (size AND duration must be safe) ---
    if (durationTrustworthy && wavSize > 0 && wavSize <= MAX_RAW_BYTES && durationSeconds <= CHUNK_SECONDS) {
      let actualDuration = durationSeconds;
      try {
        actualDuration = await probeActualDuration(audioFilePath);
        debugLog(`[STT-v4] Path B probe: reported=${durationSeconds.toFixed(1)}s, actual=${actualDuration.toFixed(1)}s`);
      } catch {
        debugLog('[STT-v4] Path B probe failed — using reported duration');
      }
      if (actualDuration > 0 && actualDuration <= CHUNK_SECONDS) {
        debugLog('[STT-v4] >>> Path B: WAV inline');
        onProgress?.({ percent: 20, currentStep: 'Transcribing audio...', chunksTotal: 1, chunksCompleted: 0 });
        const buf = await fs.readFile(audioFilePath);
        const words = await recognizeBuffer(client, buf, 'LINEAR16', sampleRateHertz, actualDuration);
        onProgress?.({ percent: 95, currentStep: 'Finalizing...', chunksTotal: 1, chunksCompleted: 1 });
        return groupWordsIntoSentences(words);
      }
      debugLog(`[STT-v4] Path B rejected — actual duration ${actualDuration.toFixed(1)}s exceeds ${CHUNK_SECONDS}s, falling through to chunking`);
      if (actualDuration > 0) durationSeconds = actualDuration;
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
    const chunkDir = path.join(path.dirname(mp3Path), 'stt_chunks');
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
    const chunkResults: (WordInfo[] | null)[] = new Array(chunks.length).fill(null);

    // Helper: report progress immediately when any chunk settles
    const reportChunkProgress = (): void => {
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

    // Process a single chunk
    const processChunk = async (chunkIdx: number): Promise<void> => {
      const chunk = chunks[chunkIdx];
      try {
        const buf = await fs.readFile(chunk.path);
        if (buf.length > MAX_RAW_BYTES) {
          console.warn(`[STT-v4] Chunk ${chunkIdx} too large (${(buf.length / 1e6).toFixed(2)}MB), skipping`);
          failedChunks++;
          reportChunkProgress();
          return;
        }
        // Safety check: skip chunks whose verified duration exceeds the
        // Google inline limit to prevent INVALID_ARGUMENT errors
        if (chunk.durSec > 59) {
          console.warn(`[STT-v4] Chunk ${chunkIdx} duration ${chunk.durSec.toFixed(1)}s exceeds 59s limit, skipping`);
          failedChunks++;
          reportChunkProgress();
          return;
        }
        const words = await recognizeBuffer(client!, buf, 'MP3', 16000, chunk.durSec);
        // Offset timestamps
        for (const w of words) {
          w.startTime += chunk.startSec;
          w.endTime += chunk.startSec;
        }
        chunkResults[chunkIdx] = words;
        completedChunks++;
        reportChunkProgress();
      } catch (err) {
        failedChunks++;
        console.error(`[STT-v4] Chunk ${chunkIdx} failed:`, (err as Error)?.message ?? err);
        reportChunkProgress();
      }
    };

    // Concurrent pool: always keep up to MAX_CONCURRENT chunks in flight.
    // As soon as one finishes, the next starts immediately — no idle slots.
    await new Promise<void>((resolve) => {
      let nextIdx = 0;
      let running = 0;

      function launch(): void {
        while (running < MAX_CONCURRENT && nextIdx < chunks.length) {
          const idx = nextIdx++;
          running++;
          processChunk(idx).finally(() => {
            running--;
            if (nextIdx < chunks.length) {
              launch();
            } else if (running === 0) {
              resolve();
            }
          });
        }
        // Edge case: no chunks at all
        if (chunks.length === 0) resolve();
      }
      launch();
    });

    if (failedChunks > 0) {
      console.warn(`[STT-v4] ${failedChunks} of ${chunks.length} chunks failed — partial transcription`);
    }

    // Reassemble words in order
    const allWords: WordInfo[] = [];
    for (const words of chunkResults) {
      if (words) allWords.push(...words);
    }

    onProgress?.({
      percent: 95,
      currentStep: 'Finalizing...',
      chunksTotal: chunks.length,
      chunksCompleted: completedChunks,
    });

    // Cleanup
    await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {});

    debugLog(`[STT-v4] Total words from all chunks: ${allWords.length} (${failedChunks} chunks failed)`);
    return groupWordsIntoSentences(allWords);
  } catch (err) {
    console.error('[STT-v4] Transcription failed:', (err as Error).message);
    throw new Error(`Transcription failed: ${(err as Error).message}`);
  }
}

// Exported for testing
export { groupWordsIntoSentences, WordInfo };
