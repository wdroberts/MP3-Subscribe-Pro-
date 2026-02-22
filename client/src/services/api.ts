import { UploadResult, TranscriptionResult, SummarizationResult } from '../types/index.ts';

const TOKEN_KEY = 'mp3_auth_token';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk — small enough for restrictive platform proxies

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...getAuthHeaders(), ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `Request failed (HTTP ${res.status})`);
  }
  return res.json();
}

// ── Single-request upload (files ≤ CHUNK_SIZE) ──────────────────────
function uploadSmallFile(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new Error(body.error || `Upload failed (HTTP ${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (HTTP ${xhr.status}): ${xhr.responseText.substring(0, 200)}`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.open('POST', '/api/upload');

    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.send(formData);
  });
}

// ── Chunked upload (files > CHUNK_SIZE) ─────────────────────────────
async function uploadChunked(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadResult> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // 1. Initialize the upload session
  const { uploadId } = await fetchJSON<{ uploadId: string }>('/api/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      totalChunks,
      totalSize: file.size,
      mimeType: file.type || 'audio/mpeg',
    }),
  });

  // 2. Upload each chunk sequentially
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const blob = file.slice(start, end);

    const formData = new FormData();
    formData.append('chunk', blob, `chunk-${i}`);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', String(i));

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const chunkProgress = (e.loaded / e.total);
          const overallProgress = ((i + chunkProgress) / totalChunks) * 100;
          onProgress(Math.round(overallProgress));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          try {
            const body = JSON.parse(xhr.responseText);
            reject(new Error(body.error || `Chunk upload failed (HTTP ${xhr.status})`));
          } catch {
            reject(new Error(`Chunk upload failed (HTTP ${xhr.status})`));
          }
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error during chunk upload')));
      xhr.open('POST', '/api/upload/chunk');

      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.send(formData);
    });
  }

  // 3. Complete the upload — server reassembles and validates
  onProgress(100);
  return fetchJSON<UploadResult>('/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId }),
  });
}

// ── Public API ──────────────────────────────────────────────────────
export async function uploadFile(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadResult> {
  if (file.size <= CHUNK_SIZE) {
    return uploadSmallFile(file, onProgress);
  }
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
  return fetchJSON(`/api/transcribe/${id}/status`);
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
