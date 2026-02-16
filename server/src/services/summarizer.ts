const MODEL_ID = 'facebook/bart-large-cnn';
const HF_API_URL = `https://router.huggingface.co/hf-inference/models/${MODEL_ID}`;

let _apiKey: string | null = null;
let _checked = false;

function getApiKey(): string | null {
  if (!_checked) {
    _checked = true;
    const key = process.env.HUGGINGFACE_API_KEY;
    if (key && key !== 'your-api-key') {
      console.log(`[Summarizer] HF API key found (${key.slice(0, 6)}...)`);
      _apiKey = key;
    } else {
      console.warn(`[Summarizer] HUGGINGFACE_API_KEY is ${key ? `"${key}" (placeholder)` : 'not set'}`);
    }
  }
  return _apiKey;
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
  const response = await fetch(HF_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: text,
      parameters: {
        max_length: 300,
        min_length: 50,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`HF API ${response.status}: ${errorBody}`);
  }

  const result = (await response.json()) as Array<{ summary_text: string }>;
  return result[0].summary_text;
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
  if (!getApiKey()) {
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
    const e = err as Error;
    console.warn('Hugging Face API call failed, falling back to mock:', e.message);
    console.warn('[Summarizer] Full error:', e);
    return mockSummarize(text);
  }
}

// Exported for testing
export { chunkText };
