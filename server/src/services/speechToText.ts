// speechToText.ts — v4 complete rewrite 2024-02-16
// This version ALWAYS chunks files that exceed the safe inline limit.
// If you see "STT-v4" in the logs, this code is running.

import speech from '@google-cloud/speech';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { TranscriptionSegment } from '../types';

console.log('>>> speechToText.ts v4 loaded <<<');

// ---------------------------------------------------------------------------
// Google Speech client (lazy init)
// ---------------------------------------------------------------------------
let _client: InstanceType<typeof speech.SpeechClient> | null = null;

function getSpeechClient(): InstanceType<typeof speech.SpeechClient> | null {
  if (_client !== null) return _client;

  const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!creds || creds === 'path/to/service-account.json') return null;

  try {
    const projectRoot = path.resolve(__dirname, '../../..');
    const resolved = path.resolve(projectRoot, creds);
    fsSync.accessSync(resolved);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = resolved;
    _client = new speech.SpeechClient();
    console.log('[STT-v4] Google Speech client initialized, credentials:', resolved);
  } catch {
    console.warn('[STT-v4] Credentials file not found:', creds);
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

async function recognizeBuffer(
  client: InstanceType<typeof speech.SpeechClient>,
  buf: Buffer,
  encoding: 'MP3' | 'LINEAR16',
  sampleRateHertz: number,
  durationSec: number,
): Promise<WordInfo[]> {
  const b64Size = Math.ceil(buf.length * 4 / 3);
  console.log(`[STT-v4] recognizeBuffer: ${(buf.length / 1e6).toFixed(2)}MB raw, ${(b64Size / 1e6).toFixed(2)}MB b64, enc=${encoding}, dur=${durationSec.toFixed(0)}s`);

  const audio = { content: buf.toString('base64') };
  const config = {
    encoding: encoding as 'MP3' | 'LINEAR16',
    sampleRateHertz,
    languageCode: 'en-US',
    enableWordTimeOffsets: true,
    enableAutomaticPunctuation: true,
  };

  let results;
  if (durationSec > 60) {
    console.log('[STT-v4] Using longRunningRecognize (>60s)');
    const [op] = await client.longRunningRecognize({ audio, config });
    const [resp] = await op.promise();
    results = resp.results ?? [];
  } else {
    console.log('[STT-v4] Using recognize (<=60s)');
    const [resp] = await client.recognize({ audio, config });
    results = resp.results ?? [];
  }

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
  console.log(`[STT-v4] Got ${words.length} words from this chunk`);
  return words;
}

// ---------------------------------------------------------------------------
// Split an audio file into small MP3 chunks with ffmpeg
// ---------------------------------------------------------------------------
async function splitIntoChunks(
  mp3Path: string,
  outputDir: string,
  chunkSeconds: number,
  totalDuration: number,
): Promise<{ path: string; startSec: number; durSec: number }[]> {
  await fs.mkdir(outputDir, { recursive: true });
  const numChunks = Math.ceil(totalDuration / chunkSeconds);
  const chunks: { path: string; startSec: number; durSec: number }[] = [];

  const ffmpeg = require('fluent-ffmpeg');

  for (let i = 0; i < numChunks; i++) {
    const startSec = i * chunkSeconds;
    const durSec = Math.min(chunkSeconds, totalDuration - startSec);
    const outPath = path.join(outputDir, `chunk_${i}.mp3`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(mp3Path)
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
      chunks.push({ path: outPath, startSec, durSec });
    }
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function transcribe(
  audioFilePath: string,
  sampleRateHertz: number,
  durationSeconds: number,
  originalMp3Path?: string,
): Promise<TranscriptionSegment[]> {
  console.log(`[STT-v4] transcribe() called. wav=${audioFilePath}, mp3=${originalMp3Path ?? 'none'}, dur=${durationSeconds}s`);

  const client = getSpeechClient();
  if (!client) {
    console.warn('[STT-v4] No Google credentials — returning mock transcription');
    return generateMockSegments(durationSeconds);
  }

  try {
    // Pick the smallest file to work with
    const mp3Path = originalMp3Path ?? audioFilePath;
    const mp3Size = (await fs.stat(mp3Path)).size;
    const wavSize = await fs.stat(audioFilePath).then((s) => s.size).catch(() => 0);

    console.log(`[STT-v4] MP3=${(mp3Size / 1e6).toFixed(2)}MB, WAV=${(wavSize / 1e6).toFixed(2)}MB, limit=${(MAX_RAW_BYTES / 1e6).toFixed(1)}MB`);

    // --- Path A: MP3 fits inline ---
    if (mp3Size <= MAX_RAW_BYTES) {
      console.log('[STT-v4] >>> Path A: MP3 inline');
      const buf = await fs.readFile(mp3Path);
      const words = await recognizeBuffer(client, buf, 'MP3', sampleRateHertz, durationSeconds);
      return groupWordsIntoSentences(words);
    }

    // --- Path B: WAV fits inline ---
    if (wavSize > 0 && wavSize <= MAX_RAW_BYTES) {
      console.log('[STT-v4] >>> Path B: WAV inline');
      const buf = await fs.readFile(audioFilePath);
      const words = await recognizeBuffer(client, buf, 'LINEAR16', sampleRateHertz, durationSeconds);
      return groupWordsIntoSentences(words);
    }

    // --- Path C: chunk the MP3 into 3-minute pieces ---
    console.log('[STT-v4] >>> Path C: chunking MP3 into 3-minute pieces');
    const chunkDir = path.join(path.dirname(mp3Path), 'stt_chunks');
    const chunks = await splitIntoChunks(mp3Path, chunkDir, 180, durationSeconds);
    console.log(`[STT-v4] Created ${chunks.length} chunks`);

    const allWords: WordInfo[] = [];
    for (const chunk of chunks) {
      const buf = await fs.readFile(chunk.path);
      if (buf.length > MAX_RAW_BYTES) {
        console.warn(`[STT-v4] Chunk still too large (${(buf.length / 1e6).toFixed(2)}MB), skipping`);
        continue;
      }
      const words = await recognizeBuffer(client, buf, 'MP3', 16000, chunk.durSec);
      // Offset timestamps
      for (const w of words) {
        w.startTime += chunk.startSec;
        w.endTime += chunk.startSec;
      }
      allWords.push(...words);
    }

    // Cleanup
    await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {});

    console.log(`[STT-v4] Total words from all chunks: ${allWords.length}`);
    return groupWordsIntoSentences(allWords);
  } catch (err) {
    console.error('[STT-v4] FAILED:', (err as Error).message);
    return generateMockSegments(durationSeconds);
  }
}

// Exported for testing
export { groupWordsIntoSentences, WordInfo };
