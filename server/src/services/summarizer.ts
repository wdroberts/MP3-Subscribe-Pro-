import { HfInference } from '@huggingface/inference';

const MODEL_ID = 'facebook/bart-large-cnn';

let _hf: HfInference | null = null;
let _checked = false;

function getHfClient(): HfInference | null {
  if (!_checked) {
    _checked = true;
    const key = process.env.HUGGINGFACE_API_KEY;
    if (key && key !== 'your-api-key') {
      _hf = new HfInference(key);
    }
  }
  return _hf;
}
const MAX_CHUNK_CHARS = 3500;
const OVERLAP_CHARS = 200;

function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + MAX_CHUNK_CHARS, text.length);

    if (end < text.length) {
      // Try to break at a sentence boundary
      const lastPeriod = text.lastIndexOf('.', end);
      if (lastPeriod > start + MAX_CHUNK_CHARS / 2) {
        end = lastPeriod + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());

    // Ensure start always advances
    const nextStart = end > OVERLAP_CHARS ? end - OVERLAP_CHARS : end;
    if (nextStart <= start) {
      start = end;
    } else {
      start = nextStart;
    }
  }

  return chunks;
}

async function summarizeChunk(text: string): Promise<string> {
  const result = await getHfClient()!.summarization({
    model: MODEL_ID,
    inputs: text,
    parameters: {
      max_length: 300,
      min_length: 50,
    },
  });
  return result.summary_text;
}

function mockSummarize(text: string): string {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const picked = sentences.slice(0, Math.min(3, sentences.length));
  return (
    picked.map((s) => s.trim()).join('. ') +
    '. (Demo summary — configure HUGGINGFACE_API_KEY in .env for real summarization.)'
  );
}

export async function summarize(text: string): Promise<string> {
  if (!getHfClient()) {
    console.warn('Hugging Face API key not configured — using mock summarization');
    return mockSummarize(text);
  }

  try {
    const chunks = chunkText(text);

    if (chunks.length === 1) {
      return await summarizeChunk(chunks[0]);
    }

    // Summarize each chunk
    const chunkSummaries = await Promise.all(chunks.map(summarizeChunk));
    const combined = chunkSummaries.join(' ');

    // If the combined summaries are still long, do a final pass
    if (combined.length > MAX_CHUNK_CHARS) {
      return await summarizeChunk(combined);
    }

    return combined;
  } catch (err) {
    console.warn('Hugging Face API call failed, falling back to mock:', (err as Error).message);
    return mockSummarize(text);
  }
}

// Exported for testing
export { chunkText };
