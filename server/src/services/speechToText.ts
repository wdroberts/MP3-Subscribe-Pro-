import speech from '@google-cloud/speech';
import fs from 'fs/promises';
import { TranscriptionSegment } from '../types';

let _client: InstanceType<typeof speech.SpeechClient> | null = null;
let _checked = false;

function getSpeechClient(): InstanceType<typeof speech.SpeechClient> | null {
  if (!_checked) {
    _checked = true;
    const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (creds && creds !== 'path/to/service-account.json') {
      try {
        require('fs').accessSync(creds);
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

export async function transcribe(
  audioFilePath: string,
  sampleRateHertz: number,
  durationSeconds: number,
): Promise<TranscriptionSegment[]> {
  const client = getSpeechClient();
  if (!client) {
    console.warn('Google Cloud credentials not configured — using mock transcription');
    return generateMockSegments(durationSeconds);
  }

  try {
    const audioContent = await fs.readFile(audioFilePath);
    const audio = { content: audioContent.toString('base64') };
    const config = {
      encoding: 'LINEAR16' as const,
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

    return groupWordsIntoSentences(words);
  } catch (err) {
    console.warn('Google Speech-to-Text API call failed, falling back to mock:', (err as Error).message);
    return generateMockSegments(durationSeconds);
  }
}

// Exported for testing
export { groupWordsIntoSentences, WordInfo };
