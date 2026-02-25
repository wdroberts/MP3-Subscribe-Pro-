const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `You are an assistant that extracts key points from transcriptions. From the transcript below, output three sections.

**Key Points:** List exactly five to ten bullet points. Each must capture a major idea, decision, or takeaway — not minor details. Each bullet must be self-contained and understandable without the full transcript. Use one to two sentences per bullet.

**Action Items:** List any tasks, commitments, or next steps mentioned. Include the owner and deadline if stated. If none are found, write "None identified."

**People Mentioned:** List the names of individuals referenced in the transcript along with their role or context if apparent. If none are found, write "None identified."`;

let _apiKey: string | null = null;
let _checked = false;

function getApiKey(): string | null {
  if (!_checked) {
    _checked = true;
    const key = process.env.OPENAI_API_KEY;
    if (key && key !== 'your-api-key') {
      console.log('[Summarizer] OpenAI API key configured');
      _apiKey = key;
    } else {
      console.warn('[Summarizer] OPENAI_API_KEY is not set or is a placeholder');
    }
  }
  return _apiKey;
}

async function extractKeyPoints(text: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API ${response.status}: ${errorBody}`);
  }

  const result = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty or malformed response');
  }
  return content;
}

function extractiveFallback(text: string): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  if (sentences.length <= 5) {
    return '**Key Points:**\n\n' + sentences.map((s) => `- ${s}`).join('\n')
      + '\n\n**Action Items:** None identified.\n\n**People Mentioned:** None identified.';
  }

  const wordFreq = new Map<string, number>();
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
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

  const scored = sentences.map((sentence, index) => {
    const sWords = sentence.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const score = sWords.reduce((sum, w) => sum + (wordFreq.get(w) || 0), 0) / (sWords.length || 1);
    return { sentence, score, index };
  });

  const topCount = Math.min(10, Math.max(5, Math.ceil(sentences.length * 0.2)));
  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topCount)
    .sort((a, b) => a.index - b.index);

  return '**Key Points:**\n\n' + top.map((t) => `- ${t.sentence}`).join('\n')
    + '\n\n**Action Items:** None identified.\n\n**People Mentioned:** None identified.';
}

export async function summarize(text: string): Promise<string> {
  if (!getApiKey()) {
    console.warn('OpenAI API key not configured — using extractive fallback');
    return extractiveFallback(text);
  }

  try {
    return await extractKeyPoints(text);
  } catch (err) {
    const e = err as Error;
    console.warn('[Summarizer] OpenAI API failed, using extractive fallback:', e.message);
    return extractiveFallback(text);
  }
}
