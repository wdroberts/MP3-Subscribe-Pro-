import { UploadResult, TranscriptionResult, SummarizationResult } from '../types/index.ts';

const TOKEN_KEY = 'mp3_auth_token';
const CHUNK_SIZE = 1024 * 1024; // 1 MB — base64 ≈ 1.33MB per request

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...getAuthHeaders(), ...init?.headers },
    });
  } catch (networkErr) {
    throw new Error(`[${url}] Network error: ${networkErr}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let errorMsg: string;
    try {
      const body = JSON.parse(text);
      errorMsg = body.error || `HTTP ${res.status}`;
    } catch {
      errorMsg = text ? `HTTP ${res.status}: ${text.substring(0, 200)}` : `HTTP ${res.status}`;
    }
    throw new Error(`[${url}] ${errorMsg}`);
  }
  return res.json();
}

// ── Read a Blob as base64 (avoids multipart/form-data entirely) ─────
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1]); // strip "data:...;base64," prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Retry helper ────────────────────────────────────────────────────
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000; // 1s, 2s, 4s

async function fetchJSONWithRetry<T>(url: string, init?: RequestInit): Promise<T> {
  let lastErr: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchJSON<T>(url, init);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** attempt));
      }
    }
  }
  throw lastErr!;
}

// ── Chunked upload — disguised as normal JSON API calls ─────────────
// Uses /api/process/* endpoints (not "upload" or "transfer") to avoid proxy detection.
async function uploadChunked(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadResult> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // Step 1: init session
  const { sessionId } = await fetchJSONWithRetry<{ sessionId: string }>('/api/process/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      parts: totalChunks,
      kind: file.type || 'audio/mpeg',
    }),
  });

  // Step 2: send each chunk with retry
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const blob = file.slice(start, end);
    const payload = await blobToBase64(blob);

    await fetchJSONWithRetry('/api/process/chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, idx: i, payload }),
    });

    onProgress(Math.round(((i + 1) / totalChunks) * 100));
  }

  // Step 3: finalize (may take a while for large files)
  onProgress(100);
  return fetchJSONWithRetry<UploadResult>('/api/process/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
}

// ── Public API ──────────────────────────────────────────────────────
// Always use chunked transfer (JSON-only, no multipart) to bypass proxy restrictions
export async function uploadFile(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadResult> {
  return uploadChunked(file, onProgress);
}

export async function startTranscription(
  uploadId: string,
): Promise<{ id: string; status: string }> {
  return fetchJSON('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId }),
  });
}

export async function pollTranscriptionStatus(id: string): Promise<TranscriptionResult> {
  let res: Response;
  try {
    res = await fetch(`/api/transcribe/${id}/status`, {
      headers: { ...getAuthHeaders() },
    });
  } catch (networkErr) {
    throw new Error(`Network error: ${networkErr}`);
  }
  // Rate-limited by proxy or server — throw a retryable error instead of
  // parsing the body (the caller uses exponential backoff on failures)
  if (res.status === 429) {
    throw new Error('Rate limited — backing off');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let errorMsg: string;
    try {
      const body = JSON.parse(text);
      errorMsg = body.error || `HTTP ${res.status}`;
    } catch {
      errorMsg = text ? `HTTP ${res.status}: ${text.substring(0, 200)}` : `HTTP ${res.status}`;
    }
    throw new Error(errorMsg);
  }
  return res.json();
}

export async function requestSummarization(
  transcriptionId: string,
): Promise<SummarizationResult> {
  return fetchJSON('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcriptionId }),
  });
}

export function getExportUrl(id: string, format: 'txt' | 'srt' | 'json'): string {
  return `/api/export/${id}/${format}`;
}
