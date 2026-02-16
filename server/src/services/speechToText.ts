import speech from '@google-cloud/speech';
import fs from 'fs/promises';
import path from 'path';
import { TranscriptionSegment } from '../types';

let _client: InstanceType<typeof speech.SpeechClient> | null = null;
let _checked = false;

function getSpeechClient(): InstanceType<typeof speech.SpeechClient> | null {
  if (!_checked) {
    _checked = true;
    const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (creds && creds !== 'path/to/service-account.json') {
      try {
        // Resolve relative paths from the project root (where .env lives)
        const projectRoot = path.resolve(__dirname, '../../..');
        const resolvedPath = path.resolve(projectRoot, creds);
        require('fs').accessSync(resolvedPath);
        process.env.GOOGLE_APPLICATION_CREDENTIALS = resolvedPath;
        _client = new speech.SpeechClient();
      } catch {
        // credentials file doesn't exist
      }
    }
  }
  return _client;
}

interface WordInfo {
  word: string;
  startTime: number;
  endTime: number;
}

function parseSeconds(timeObj: { seconds?: string | number; nanos?: number } | null): number {
  if (!timeObj) return 0;
  const seconds = typeof timeObj.seconds === 'string' ? parseInt(timeObj.seconds, 10) : (timeObj.seconds || 0);
  const nanos = timeObj.nanos || 0;
  return seconds + nanos / 1e9;
}

function groupWordsIntoSentences(words: WordInfo[]): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];
  let currentWords: WordInfo[] = [];
  let index = 0;

  for (const word of words) {
    currentWords.push(word);
    const endsWithPunctuation = /[.!?]$/.test(word.word);

    if (endsWithPunctuation && currentWords.length > 0) {
      segments.push({
        index,
        startTime: currentWords[0].startTime,
        endTime: currentWords[currentWords.length - 1].endTime,
        text: currentWords.map((w) => w.word).join(' '),
      });
      index++;
      currentWords = [];
    }
  }

  // Remaining words that don't end with punctuation
  if (currentWords.length > 0) {
    segments.push({
      index,
      startTime: currentWords[0].startTime,
      endTime: currentWords[currentWords.length - 1].endTime,
      text: currentWords.map((w) => w.word).join(' '),
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

  const segmentDuration = durationSeconds / sentences.length;
  return sentences.map((text, i) => ({
    index: i,
    startTime: parseFloat((i * segmentDuration).toFixed(3)),
    endTime: parseFloat(((i + 1) * segmentDuration).toFixed(3)),
    text,
  }));
}

const INLINE_LIMIT = 7_500_000; // ~10MB after base64 encoding

async function transcribeChunk(
  client: InstanceType<typeof speech.SpeechClient>,
  audioFilePath: string,
  encoding: 'MP3' | 'LINEAR16',
  sampleRateHertz: number,
  durationSeconds: number,
): Promise<WordInfo[]> {
  const audioContent = await fs.readFile(audioFilePath);
  const audio = { content: audioContent.toString('base64') };
  const config = {
    encoding: encoding as unknown as number,
    sampleRateHertz,
    languageCode: 'en-US',
    enableWordTimeOffsets: true,
    enableAutomaticPunctuation: true,
  };

  let results;

  if (durationSeconds > 60) {
    const [operation] = await client.longRunningRecognize({ audio, config });
    const [response] = await operation.promise();
    results = response.results || [];
  } else {
    const [response] = await client.recognize({ audio, config });
    results = response.results || [];
  }

  const words: WordInfo[] = [];
  for (const result of results) {
    const alternative = result.alternatives?.[0];
    if (!alternative?.words) continue;
    for (const wordInfo of alternative.words) {
      words.push({
        word: wordInfo.word || '',
        startTime: parseSeconds(wordInfo.startTime as { seconds?: string | number; nanos?: number } | null),
        endTime: parseSeconds(wordInfo.endTime as { seconds?: string | number; nanos?: number } | null),
      });
    }
  }
  return words;
}

export async function transcribe(
  audioFilePath: string,
  sampleRateHertz: number,
  durationSeconds: number,
  originalMp3Path?: string,
): Promise<TranscriptionSegment[]> {
  const client = getSpeechClient();
  if (!client) {
    console.warn('Google Cloud credentials not configured — using mock transcription');
    return generateMockSegments(durationSeconds);
  }

  try {
    // Prefer original MP3 (much smaller than LINEAR16 WAV)
    const mp3Path = originalMp3Path || audioFilePath;
    const mp3Stat = await fs.stat(mp3Path);

    if (mp3Stat.size <= INLINE_LIMIT) {
      // MP3 fits inline — send directly
      const words = await transcribeChunk(client, mp3Path, 'MP3', sampleRateHertz, durationSeconds);
      return groupWordsIntoSentences(words);
    }

    // MP3 too large — fall back to LINEAR16 WAV (already converted), which may also be large
    const wavStat = await fs.stat(audioFilePath).catch(() => null);
    if (wavStat && wavStat.size <= INLINE_LIMIT) {
      const words = await transcribeChunk(client, audioFilePath, 'LINEAR16', sampleRateHertz, durationSeconds);
      return groupWordsIntoSentences(words);
    }

    // Both too large — chunk the MP3 using ffmpeg
    console.log(`Audio too large for inline (${(mp3Stat.size / 1e6).toFixed(1)}MB), splitting into chunks...`);
    const chunkDir = path.join(path.dirname(audioFilePath), 'chunks');
    await fs.mkdir(chunkDir, { recursive: true });

    const chunkDurationSec = 240; // 4-minute chunks
    const numChunks = Math.ceil(durationSeconds / chunkDurationSec);
    const allWords: WordInfo[] = [];

    for (let i = 0; i < numChunks; i++) {
      const startSec = i * chunkDurationSec;
      const chunkPath = path.join(chunkDir, `chunk_${i}.mp3`);

      await new Promise<void>((resolve, reject) => {
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg(mp3Path)
          .setStartTime(startSec)
          .duration(chunkDurationSec)
          .audioChannels(1)
          .audioBitrate('64k')
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .save(chunkPath);
      });

      const chunkStat = await fs.stat(chunkPath);
      if (chunkStat.size === 0) continue;

      const chunkDur = Math.min(chunkDurationSec, durationSeconds - startSec);
      const words = await transcribeChunk(client, chunkPath, 'MP3', 16000, chunkDur);

      // Offset timestamps by chunk start time
      for (const w of words) {
        w.startTime += startSec;
        w.endTime += startSec;
      }
      allWords.push(...words);
    }

    // Clean up chunks
    await fs.rm(chunkDir, { recursive: true, force: true });

    return groupWordsIntoSentences(allWords);
  } catch (err) {
    console.warn('Google Speech-to-Text API call failed, falling back to mock:', (err as Error).message);
    return generateMockSegments(durationSeconds);
  }
}

// Exported for testing
export { groupWordsIntoSentences, WordInfo };
