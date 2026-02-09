import { HfInference } from '@huggingface/inference';

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

const MODEL_ID = 'facebook/bart-large-cnn';
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
  const result = await hf.summarization({
    model: MODEL_ID,
    inputs: text,
    parameters: {
      max_length: 300,
      min_length: 50,
    },
  });
  return result.summary_text;
}

export async function summarize(text: string): Promise<string> {
  const chunks = chunkText(text);

  if (chunks.length === 1) {
    return summarizeChunk(chunks[0]);
  }

  // Summarize each chunk
  const chunkSummaries = await Promise.all(chunks.map(summarizeChunk));
  const combined = chunkSummaries.join(' ');

  // If the combined summaries are still long, do a final pass
  if (combined.length > MAX_CHUNK_CHARS) {
    return summarizeChunk(combined);
  }

  return combined;
}

// Exported for testing
export { chunkText };
