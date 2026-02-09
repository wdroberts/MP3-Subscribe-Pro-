import speech from '@google-cloud/speech';
import fs from 'fs/promises';
import { TranscriptionSegment } from '../types';

const client = new speech.SpeechClient();

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

export async function transcribe(
  audioFilePath: string,
  sampleRateHertz: number,
  durationSeconds: number,
): Promise<TranscriptionSegment[]> {
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
    // Long-running recognition for files > 1 minute
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
}

// Exported for testing
export { groupWordsIntoSentences, WordInfo };
