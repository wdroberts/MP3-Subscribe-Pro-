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

function extractiveSummarize(text: string): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  if (sentences.length <= 5) {
    return sentences.join(' ');
  }

  // Score sentences by word frequency (simple extractive approach)
  const wordFreq = new Map<string, number>();
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  // Filter common stop words
  const stopWords = new Set([
    'the', 'and', 'that', 'this', 'with', 'for', 'are', 'but', 'not', 'you',
    'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have',
    'from', 'they', 'been', 'said', 'each', 'which', 'their', 'will', 'other',
    'about', 'many', 'then', 'them', 'these', 'some', 'would', 'into', 'more',
    'could', 'such', 'what', 'its', 'than', 'also', 'just', 'know', 'really',
  ]);
  for (const w of words) {
    if (!stopWords.has(w)) {
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
  }

  // Score each sentence
  const scored = sentences.map((sentence, index) => {
    const sWords = sentence.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const score = sWords.reduce((sum, w) => sum + (wordFreq.get(w) || 0), 0) / (sWords.length || 1);
    return { sentence, score, index };
  });

  // Pick top sentences, preserving original order
  const topCount = Math.max(3, Math.ceil(sentences.length * 0.2));
  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topCount)
    .sort((a, b) => a.index - b.index);

  return top.map((t) => t.sentence).join(' ');
}

export async function summarize(text: string): Promise<string> {
  if (!getApiKey()) {
    console.warn('Hugging Face API key not configured — using mock summarization');
    return extractiveSummarize(text);
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
    console.warn('[Summarizer] HF API failed, using extractive fallback:', e.message);
    return extractiveSummarize(text);
  }
}

// Exported for testing
export { chunkText };
